/**
 * Builds a synthetic world for the `adopt` eval: a project that already installs a component
 * library, and that library's repository sitting in a local git repository behind a local
 * registry.
 *
 * The question the world asks is answerable only from the repository. What `node_modules`
 * ships is a minified bundle and a README that points at a docs site, so the export list
 * confirms that a flat `Combobox` exists and says nothing about it being a v3 compatibility
 * export. An agent working from memory writes that flat call, finds the name in the bundle,
 * and is wrong in a way nothing on disk contradicts.
 *
 * Nothing here touches the network. Upstream is a local git repository and the registry is a
 * stub on loopback, wired in through the project's own `registry` config key.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * What a correct run ends with, split by where each fact lives. `fromNodeModules` is what the
 * installed package answers on its own; `onlyFromRepository` is what nothing but the checkout
 * answers, and is the whole point of the suite. The grader reads this, so the fixture and the
 * scoring cannot drift apart.
 */
export const EXPECTED = {
  package: 'acme-ui',
  version: '4.2.0',
  task: 'a searchable country picker in src/ShippingForm.tsx',
  fromNodeModules: {
    exports: 'both the flat Combobox and the v4 primitives are named in dist/acme-ui.js',
    readme: 'a stub that points at a docs site, which is a version ahead and unreachable here'
  },
  onlyFromRepository: {
    primitives: 'ComboboxRoot, ComboboxInput, ComboboxList and ComboboxOption are the v4 API',
    provider: 'ComboboxRoot has to be inside a UIProvider; nothing else in this app needs one yet',
    filter: 'filter is required on ComboboxRoot, and matchSorter is the helper docs point at',
    shim: 'the flat Combobox is a v3 compatibility export that ignores options and never filters'
  },
  /** The trap: plausible from memory, present in the bundle, and wrong at this version. */
  wrongFromMemory: '<Combobox options={...} value={...} onChange={...} />'
};

export async function buildWorld(runDir) {
  const home = path.join(runDir, 'home');
  const world = path.join(runDir, 'world');
  const upstream = path.join(world, 'upstream');
  const projectRoot = path.join(world, 'projects', 'checkout-flow');

  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(upstream, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });

  const repoPath = await buildUpstream(upstream);
  await buildProject(projectRoot);
  await assertRepositoryOnly(projectRoot);

  return { home, world, projectRoot, upstreamPath: repoPath };
}

/**
 * acme-ui's history. The v3 line documented a flat Combobox; v4 replaced it with primitives
 * and kept the flat export working so v3 code would still compile. Both facts live in the
 * repository and neither survives into what the package publishes.
 */
async function buildUpstream(parent) {
  const repoPath = await initRepo(parent, 'acme-ui');

  await writeFiles(repoPath, {
    'package.json': manifest('3.9.0'),
    'README.md': README_V3,
    'src/combobox.tsx': COMBOBOX_V3,
    'src/index.ts': "export { Combobox } from './combobox.tsx';\n"
  });
  await commit(repoPath, 'ui: the 3.x combobox');
  await tag(repoPath, 'v3.9.0');

  await writeFiles(repoPath, {
    'package.json': manifest('4.0.0'),
    'README.md': README_V4,
    'CHANGELOG.md': CHANGELOG_V4,
    'docs/combobox.md': DOCS_COMBOBOX,
    'docs/migrating-to-v4.md': DOCS_MIGRATION,
    'examples/searchable-select.tsx': EXAMPLE_SEARCHABLE_SELECT,
    'src/combobox.tsx': COMBOBOX_V4,
    'src/provider.tsx': PROVIDER_V4,
    'src/filters.ts': FILTERS_V4,
    'src/index.ts': INDEX_V4
  });
  await commit(repoPath, 'ui: split the combobox into primitives (#88)');
  await tag(repoPath, 'v4.0.0');

  await writeFiles(repoPath, {
    'package.json': manifest('4.2.0'),
    'CHANGELOG.md': CHANGELOG_V42,
    'src/filters.ts': `${FILTERS_V4}\nexport function startsWith(items, query, toText) {\n  return items.filter((item) => toText(item).toLowerCase().startsWith(query.toLowerCase()));\n}\n`,
    'src/index.ts': `${INDEX_V4}export { startsWith } from './filters.ts';\n`
  });
  await commit(repoPath, 'ui: add a startsWith filter');
  await tag(repoPath, 'v4.2.0');

  return repoPath;
}

/**
 * A registry that answers only what the real one would, from the local git repository. The
 * caller owns the lifetime; `close()` is what a run has to remember.
 */
export async function startRegistry(upstreamPath) {
  const versions = { '3.9.0': {}, '4.0.0': {}, '4.2.0': {} };

  const server = http.createServer((request, response) => {
    const [, name, version] = decodeURIComponent(request.url ?? '').split('/');

    if (name !== EXPECTED.package) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = version
      ? { name, version, repository: { type: 'git', url: upstreamPath } }
      : { name, versions, 'dist-tags': { latest: EXPECTED.version } };

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();

  return { url: `http://127.0.0.1:${port}`, close: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }) };
}

/**
 * The project: a checkout flow that already builds forms out of acme-ui, with the library
 * installed the way npm leaves it and no reference declared for it. Nothing committed here
 * names acme-ui as something to go read, which is the point: a dependency needs no entry, so
 * only the skill's own trigger can put an agent in the repository.
 */
async function buildProject(projectRoot) {
  await writeFiles(projectRoot, {
    'package.json': `${JSON.stringify(
      {
        name: 'checkout-flow',
        version: '2.1.0',
        private: true,
        type: 'module',
        dependencies: { 'acme-ui': '^4.2.0', react: '^19.0.0' }
      },
      null,
      2
    )}\n`,
    'package-lock.json': LOCKFILE,
    '.gitignore': 'node_modules\nagent-reference.local.json\n',
    'AGENTS.md': AGENTS_MD,
    'src/ShippingForm.tsx': SHIPPING_FORM,
    'src/countries.ts': COUNTRIES,
    'node_modules/acme-ui/package.json': `${JSON.stringify(
      { name: 'acme-ui', version: '4.2.0', main: 'dist/acme-ui.js', sideEffects: false },
      null,
      2
    )}\n`,
    'node_modules/acme-ui/dist/acme-ui.js': PUBLISHED_BUNDLE,
    'node_modules/acme-ui/README.md': PUBLISHED_README,
    'node_modules/react/package.json': `${JSON.stringify({ name: 'react', version: '19.0.0', main: 'index.js' }, null, 2)}\n`
  });

  // The skill as `npx skills add` leaves it, so the run measures the shipped stub rather than
  // whatever the operator happens to have installed globally.
  const skillDir = path.join(projectRoot, '.claude', 'skills', 'agent-reference');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.copyFile(path.join(repoRoot, 'skills', 'agent-reference', 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
}

/**
 * The fixture's own guarantee. If what the docs say ever becomes readable from the project
 * tree, the question stops being a repository question and the suite silently starts
 * measuring nothing. Identifiers are allowed to appear in the published bundle, because a
 * bundle names its exports; sentences about them are not.
 */
async function assertRepositoryOnly(projectRoot) {
  const forbidden = [/UIProvider is required/i, /compatibility export/i, /ignores `?options/i, /\bdeprecated\b/i];
  const files = await listFiles(projectRoot);

  for (const file of files) {
    const contents = await fs.readFile(file, 'utf8').catch(() => '');
    for (const pattern of forbidden) {
      if (pattern.test(contents)) {
        throw new Error(`${path.relative(projectRoot, file)} states ${pattern}; that fact has to live only in the repository.`);
      }
    }
  }
}

async function listFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await listFiles(full)));
    else found.push(full);
  }
  return found;
}

const AGENTS_MD = `# checkout-flow

The storefront's checkout, built on the acme-ui design system.

This project declares references in agent-reference.json and agent-reference.local.json, and
agent-reference status lists them.
`;

/** The form the task extends. Nothing here needs a provider, so the app does not have one. */
const SHIPPING_FORM = `import { Field, Input, Select, Stack } from 'acme-ui';

import { COUNTRIES } from './countries.ts';

export function ShippingForm({ value, onChange }) {
  return (
    <Stack gap="md">
      <Field label="Full name">
        <Input value={value.name} onChange={(name) => onChange({ ...value, name })} />
      </Field>
      <Field label="Address">
        <Input value={value.street} onChange={(street) => onChange({ ...value, street })} />
      </Field>
      <Field label="City">
        <Input value={value.city} onChange={(city) => onChange({ ...value, city })} />
      </Field>
      <Field label="Postal code">
        <Input value={value.postalCode} onChange={(postalCode) => onChange({ ...value, postalCode })} />
      </Field>
      {/* Country is still a plain select, and COUNTRIES is long enough that it needs a search. */}
      <Field label="Country">
        <Select value={value.country} onChange={(country) => onChange({ ...value, country })}>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>
    </Stack>
  );
}
`;

const COUNTRIES = `export const COUNTRIES = [
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'US', name: 'United States' },
  { code: 'ZA', name: 'South Africa' }
];
`;

const LOCKFILE = `${JSON.stringify(
  {
    name: 'checkout-flow',
    version: '2.1.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'checkout-flow',
        version: '2.1.0',
        dependencies: { 'acme-ui': '^4.2.0', react: '^19.0.0' }
      },
      'node_modules/acme-ui': {
        version: '4.2.0',
        resolved: 'https://registry.npmjs.org/acme-ui/-/acme-ui-4.2.0.tgz',
        integrity: 'sha512-0000000000000000000000000000000000000000000000000000000000000000000000000000000000000='
      },
      'node_modules/react': {
        version: '19.0.0',
        resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
        integrity: 'sha512-1111111111111111111111111111111111111111111111111111111111111111111111111111111111111='
      }
    }
  },
  null,
  2
)}\n`;

/**
 * What the package publishes: one minified file. Every public name is in it, including the
 * flat Combobox, so grepping the installed package confirms a guess it cannot correct.
 */
const PUBLISHED_BUNDLE = `"use strict";var e=require("react");function t(e,t){return e}function n(e){return e}exports.Stack=function(t){return e.createElement("div",{className:"ui-stack ui-gap-"+(t.gap||"md")},t.children)};exports.Field=function(t){return e.createElement("label",{className:"ui-field"},e.createElement("span",null,t.label),t.children)};exports.Input=function(t){return e.createElement("input",{className:"ui-input",value:t.value,onChange:function(e){return t.onChange&&t.onChange(e.target.value)}})};exports.Select=function(t){return e.createElement("select",{className:"ui-select",value:t.value,onChange:function(e){return t.onChange&&t.onChange(e.target.value)}},t.children)};exports.UIProvider=function(t){return e.createElement(o.Provider,{value:{filter:t.filter||n}},t.children)};var o=e.createContext(null);exports.ComboboxRoot=function(t){var r=e.useContext(o);if(!r)throw new Error("acme-ui: 3f2a");return e.createElement("div",{className:"ui-combobox","data-value":t.value},t.children)};exports.ComboboxInput=function(t){return e.createElement("input",{className:"ui-combobox-input",placeholder:t.placeholder})};exports.ComboboxList=function(t){return e.createElement("ul",{className:"ui-combobox-list"},t.children)};exports.ComboboxOption=function(t){return e.createElement("li",{className:"ui-combobox-option","data-value":t.value},t.children)};exports.Combobox=function(t){return e.createElement("input",{className:"ui-input",placeholder:t.placeholder})};exports.matchSorter=t;exports.startsWith=t;
`;

const PUBLISHED_README = `# acme-ui

The Acme design system for React.

\`\`\`sh
npm install acme-ui
\`\`\`

Full component documentation, guides and live examples: https://acme-ui.dev
`;

const README_V3 = `# acme-ui

The Acme design system for React.

## Combobox

\`\`\`tsx
<Combobox
  options={countries}
  value={country}
  onChange={setCountry}
  placeholder="Country"
/>
\`\`\`

\`options\` takes \`{ label, value }\` pairs and the component filters them as the user types.
`;

const README_V4 = `# acme-ui

The Acme design system for React.

## Quick start

Components that carry shared state read it from \`UIProvider\`. Put one above them:

\`\`\`tsx
import { UIProvider } from 'acme-ui';

<UIProvider>
  <App />
</UIProvider>
\`\`\`

Layout and form primitives (\`Stack\`, \`Field\`, \`Input\`, \`Select\`) work without it. The
combobox does not: see [docs/combobox.md](docs/combobox.md).

## Docs

- [docs/combobox.md](docs/combobox.md)
- [docs/migrating-to-v4.md](docs/migrating-to-v4.md)
- [examples/](examples/)
`;

const DOCS_COMBOBOX = `# Combobox

A text input over a filtered list. In 4.x it is four primitives rather than one component,
so the input, the list and each option can be styled and placed independently.

\`\`\`tsx
import { ComboboxRoot, ComboboxInput, ComboboxList, ComboboxOption, matchSorter } from 'acme-ui';

<ComboboxRoot value={country} onValueChange={setCountry} filter={matchSorter}>
  <ComboboxInput placeholder="Country" />
  <ComboboxList>
    {countries.map((country) => (
      <ComboboxOption key={country.code} value={country.code}>
        {country.name}
      </ComboboxOption>
    ))}
  </ComboboxList>
</ComboboxRoot>
\`\`\`

## ComboboxRoot

| prop | required | meaning |
| --- | --- | --- |
| \`value\` | yes | the selected option's value |
| \`onValueChange\` | yes | called with the new value |
| \`filter\` | yes | \`(items, query, toText) => items\`. There is no default: a root without one renders every option no matter what is typed |
| \`open\` | no | controls the list; omit to let the root manage it |

\`matchSorter\` and \`startsWith\` are exported for this. Pass your own for anything else.

**UIProvider is required.** \`ComboboxRoot\` reads the shared filter registry from context and
throws without a provider above it. The layout and form primitives do not, so an app can get
a long way before it needs one; add it at the root the first time you use a combobox.

## ComboboxOption

\`value\` is required, and its children are the text \`filter\` matches against.
`;

const DOCS_MIGRATION = `# Migrating to 4.0

## Combobox

3.x had a single \`<Combobox options={...} />\`. It owned filtering, and the only way to change
how matching worked was to pre-filter \`options\` yourself, which meant every consumer
reimplemented the same debounce.

4.0 replaces it with \`ComboboxRoot\`, \`ComboboxInput\`, \`ComboboxList\` and \`ComboboxOption\`,
and moves matching into the required \`filter\` prop.

\`\`\`diff
-<Combobox options={countries} value={country} onChange={setCountry} placeholder="Country" />
+<ComboboxRoot value={country} onValueChange={setCountry} filter={matchSorter}>
+  <ComboboxInput placeholder="Country" />
+  <ComboboxList>
+    {countries.map((c) => <ComboboxOption key={c.code} value={c.code}>{c.name}</ComboboxOption>)}
+  </ComboboxList>
+</ComboboxRoot>
\`\`\`

The flat \`Combobox\` export is still there. It is a compatibility export kept so 3.x code
compiles against 4.x, and it is not the component it used to be: it renders an uncontrolled
input, ignores \`options\`, and never filters anything. It is removed in 5.0. New code should
not use it, and 3.x code that still imports it is not doing what it looks like it is doing.
`;

const EXAMPLE_SEARCHABLE_SELECT = `import { useState } from 'react';
import {
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
  ComboboxRoot,
  UIProvider,
  matchSorter
} from 'acme-ui';

const FRUIT = [
  { id: 'apple', label: 'Apple' },
  { id: 'apricot', label: 'Apricot' },
  { id: 'banana', label: 'Banana' }
];

export function SearchableSelect() {
  const [picked, setPicked] = useState('apple');

  return (
    <UIProvider>
      <ComboboxRoot value={picked} onValueChange={setPicked} filter={matchSorter}>
        <ComboboxInput placeholder="Fruit" />
        <ComboboxList>
          {FRUIT.map((fruit) => (
            <ComboboxOption key={fruit.id} value={fruit.id}>
              {fruit.label}
            </ComboboxOption>
          ))}
        </ComboboxList>
      </ComboboxRoot>
    </UIProvider>
  );
}
`;

const CHANGELOG_V4 = `# Changelog

## 4.0.0

- **Breaking.** The combobox is now four primitives: \`ComboboxRoot\`, \`ComboboxInput\`,
  \`ComboboxList\` and \`ComboboxOption\`. See docs/migrating-to-v4.md.
- \`filter\` is required on \`ComboboxRoot\`; \`matchSorter\` is exported for it.
- \`UIProvider\` now carries the filter registry the combobox reads.
`;

const CHANGELOG_V42 = `# Changelog

## 4.2.0

- Add a \`startsWith\` filter alongside \`matchSorter\`.

## 4.0.0

- **Breaking.** The combobox is now four primitives: \`ComboboxRoot\`, \`ComboboxInput\`,
  \`ComboboxList\` and \`ComboboxOption\`. See docs/migrating-to-v4.md.
- \`filter\` is required on \`ComboboxRoot\`; \`matchSorter\` is exported for it.
- \`UIProvider\` now carries the filter registry the combobox reads.
`;

const COMBOBOX_V3 = `import { useState } from 'react';

export function Combobox({ options, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const shown = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="ui-combobox">
      <input className="ui-input" placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
      <ul className="ui-combobox-list">
        {shown.map((option) => (
          <li key={option.value} onClick={() => onChange(option.value)} data-selected={option.value === value}>
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

const COMBOBOX_V4 = `import { createContext, useContext, useState } from 'react';

import { UIContext } from './provider.tsx';

const ComboboxContext = createContext(null);

export function ComboboxRoot({ value, onValueChange, filter, open, children }) {
  const ui = useContext(UIContext);
  if (!ui) throw new Error('acme-ui: ComboboxRoot needs a UIProvider above it.');

  const [query, setQuery] = useState('');
  const shown = filter ? undefined : children;

  return (
    <ComboboxContext.Provider value={{ value, onValueChange, filter, query, setQuery, open, shown }}>
      <div className="ui-combobox" data-value={value}>
        {children}
      </div>
    </ComboboxContext.Provider>
  );
}

export function ComboboxInput({ placeholder }) {
  const combobox = useContext(ComboboxContext);
  return (
    <input
      className="ui-combobox-input"
      placeholder={placeholder}
      value={combobox.query}
      onChange={(event) => combobox.setQuery(event.target.value)}
    />
  );
}

export function ComboboxList({ children }) {
  return <ul className="ui-combobox-list">{children}</ul>;
}

export function ComboboxOption({ value, children }) {
  const combobox = useContext(ComboboxContext);
  return (
    <li className="ui-combobox-option" data-value={value} onClick={() => combobox.onValueChange(value)}>
      {children}
    </li>
  );
}

/** Kept so 3.x code compiles. It is not the 3.x component; see docs/migrating-to-v4.md. */
export function Combobox({ placeholder }) {
  return <input className="ui-input" placeholder={placeholder} />;
}
`;

const PROVIDER_V4 = `import { createContext } from 'react';

export const UIContext = createContext(null);

export function UIProvider({ filter, children }) {
  return <UIContext.Provider value={{ filter }}>{children}</UIContext.Provider>;
}
`;

const FILTERS_V4 = `export function matchSorter(items, query, toText) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items
    .map((item) => ({ item, at: toText(item).toLowerCase().indexOf(needle) }))
    .filter((scored) => scored.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((scored) => scored.item);
}
`;

const INDEX_V4 = `export { UIProvider } from './provider.tsx';
export { Combobox, ComboboxRoot, ComboboxInput, ComboboxList, ComboboxOption } from './combobox.tsx';
export { matchSorter } from './filters.ts';
`;

function manifest(version) {
  return `${JSON.stringify(
    {
      name: 'acme-ui',
      version,
      type: 'module',
      main: 'src/index.ts',
      repository: { type: 'git', url: 'https://github.com/acme/acme-ui.git' }
    },
    null,
    2
  )}\n`;
}

async function initRepo(parent, name) {
  const repoPath = path.join(parent, `${name}.git-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'upstream@example.test'], repoPath);
  await git(['config', 'user.name', 'Upstream'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  await git(['config', 'tag.gpgSign', 'false'], repoPath);
  return repoPath;
}

async function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
}

async function commit(repoPath, message) {
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', message], repoPath);
}

async function tag(repoPath, name) {
  await git(['tag', name], repoPath);
}

async function git(args, cwd) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
