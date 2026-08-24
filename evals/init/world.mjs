/**
 * Builds a self-contained world for the `init` eval: a fake home holding a project, the
 * sibling checkouts and reference clones that project has been pointed at, and a history
 * of prior agent sessions in Claude Code's transcript format.
 *
 * Every name here is invented. The history is the point: `init` tells an agent to mine it,
 * and the sessions are seeded so that a correct ranking is knowable in advance.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** What a correct run should surface, in this order, and what it should leave alone. */
export const EXPECTED = {
  strong: [
    { name: 'design-system', sessions: 5, kind: 'folder', where: 'code/acme/design-system' },
    { name: 'platform-api', sessions: 4, kind: 'folder', where: 'code/acme/platform-api' },
    { name: 'chess-engine', sessions: 3, kind: 'folder', where: 'code/reference/chess-engine' },
    { name: 'wire-format', sessions: 3, kind: 'git', where: 'github.com/acme/wire-format' },
    { name: 'docs/adr', sessions: 3, kind: 'in-repo folder', where: 'docs/adr' },
    { name: 'tiny-router', sessions: 2, kind: 'folder', where: 'code/reference/tiny-router' }
  ],
  noise: [
    { name: 'legacy-parser', sessions: 1, why: 'mentioned once, in passing' },
    { name: 'Downloads', sessions: 1, why: 'a screenshot, not a source of truth' },
    { name: 'src/components', sessions: 6, why: 'ordinary work in this repo, never "go read this"' }
  ]
};

const SESSIONS = [
  {
    days: 34,
    turns: [
      user('Can you make the product card match what is in the design system? It is at {HOME}/code/acme/design-system, look at packages/tokens for the spacing scale.'),
      bash('ls {HOME}/code/acme/design-system/packages/tokens', 'scale.ts\nspacing.ts\ncolors.ts'),
      say('The scale is a 4px base. I updated src/components/ProductCard.tsx to use it.')
    ]
  },
  {
    days: 31,
    turns: [
      user('The checkout total is off by a cent. Compare our rounding with how platform-api does it, that is in ../platform-api under src/billing.'),
      bash('sed -n "1,40p" ../platform-api/src/billing/round.ts', 'export function roundMinor(value: number): number {'),
      say('platform-api rounds in minor units before summing. We sum floats first. That is the cent.')
    ]
  },
  {
    days: 29,
    turns: [
      user('I want the router here to behave like tiny-router does with nested layouts. {HOME}/code/reference/tiny-router'),
      bash('ls {HOME}/code/reference/tiny-router/src', 'match.ts\nlayout.ts\nresolve.ts'),
      say('layout.ts resolves the tree bottom up, which is the part we are missing.')
    ]
  },
  {
    days: 27,
    turns: [
      user('Pull up the design system again, I need the button variants.'),
      // The ambiguity signal: the agent does not know where it lives and guesses twice.
      bash('ls ../design-system', 'ls: ../design-system: No such file or directory'),
      bash('ls ../../acme/design-system 2>/dev/null || ls {HOME}/code/acme/design-system', 'packages\nREADME.md'),
      say('Found it at {HOME}/code/acme/design-system. The variants are in packages/ui/Button.tsx.')
    ]
  },
  {
    days: 26,
    turns: [
      user('Before you change the persistence layer read the ADRs in docs/adr, especially 0004.'),
      bash('cat docs/adr/0004-persistence.md', '# 0004 Persistence\n\nStatus: accepted'),
      say('0004 rules out an ORM for this service. I will keep the hand written queries.')
    ]
  },
  {
    days: 24,
    turns: [
      user('How does chess-engine handle the transposition table? {HOME}/code/reference/chess-engine'),
      bash('rg -n "transposition" {HOME}/code/reference/chess-engine/src', 'src/tt.rs:12:pub struct Transposition'),
      say('It keys on a Zobrist hash and stores depth alongside the score.')
    ]
  },
  {
    days: 22,
    turns: [
      user('Add a loading state to the cart. Follow the patterns in src/components/Cart.'),
      bash('ls src/components/Cart', 'Cart.tsx\nCartRow.tsx\nindex.ts'),
      say('Added a skeleton row that matches CartRow.')
    ]
  },
  {
    days: 20,
    turns: [
      user('Check https://github.com/acme/wire-format for how they version the envelope before you touch our serializer.'),
      say('Their envelope carries a version byte first, so old readers can reject cleanly.')
    ]
  },
  {
    days: 18,
    turns: [
      user('The design tokens changed again, resync from {HOME}/code/acme/design-system/packages/tokens.'),
      bash('diff -r {HOME}/code/acme/design-system/packages/tokens src/tokens', 'Only in src/tokens: legacy.ts'),
      say('Two tokens were renamed and legacy.ts is ours alone. Updated src/components accordingly.')
    ]
  },
  {
    days: 16,
    turns: [
      user('platform-api added a new error shape, mirror it. ../platform-api/src/errors.ts'),
      bash('cat ../platform-api/src/errors.ts', 'export interface WireError { code: string; retryable: boolean }'),
      say('Mirrored WireError. Ours was missing retryable.')
    ]
  },
  {
    days: 15,
    turns: [
      user('I dropped a screenshot at {HOME}/Downloads/cart-bug.png, look at it and tell me what is wrong.'),
      say('The quantity stepper overlaps the price at narrow widths.')
    ]
  },
  {
    days: 13,
    turns: [
      user('Look at how chess-engine sets up its tests, {HOME}/code/reference/chess-engine/tests. I want that shape here.'),
      bash('ls {HOME}/code/reference/chess-engine/tests', 'perft.rs\nsearch.rs\ncommon/mod.rs'),
      say('They keep fixtures in tests/common and assert against a known node count.')
    ]
  },
  {
    days: 11,
    turns: [
      user('Read docs/adr/0007 before touching the queue, and then tell me if the retry change is allowed.'),
      bash('cat docs/adr/0007-queue.md', '# 0007 Queue\n\nStatus: accepted'),
      say('0007 caps retries at three with jitter. Your change keeps that, so it is allowed.')
    ]
  },
  {
    days: 9,
    turns: [
      user('wire-format again, github.com/acme/wire-format, read the changelog and tell me if v3 breaks us.'),
      say('v3 moves the version byte to the end of the header. It breaks our reader.')
    ]
  },
  {
    days: 7,
    turns: [
      user('There is an idea I want to steal in {HOME}/code/reference/legacy-parser, the error recovery bit.'),
      bash('ls {HOME}/code/reference/legacy-parser', 'parser.js\nrecover.js'),
      say('recover.js resynchronizes on statement boundaries. We could do the same.')
    ]
  },
  {
    days: 5,
    turns: [
      user('The design system bumped its tokens package. Diff {HOME}/code/acme/design-system against what we vendored and tell me what moved.'),
      bash('git -C {HOME}/code/acme/design-system log --oneline -5', 'a1b2c3d tokens: rename surface scale'),
      say('One rename, one addition. Nothing removed.')
    ]
  },
  {
    days: 4,
    turns: [
      user('Does platform-api still return the old pagination envelope? Check ../platform-api.'),
      bash('rg -n "nextCursor" ../platform-api/src', 'src/http/page.ts:9:  nextCursor?: string'),
      say('It returns nextCursor now, not offset. Our client still sends offset.')
    ]
  },
  {
    days: 3,
    turns: [
      user('One more from the design system: the elevation tokens. {HOME}/code/acme/design-system/packages/tokens/elevation.ts'),
      bash('cat {HOME}/code/acme/design-system/packages/tokens/elevation.ts', 'export const elevation = { flat: 0, raised: 1 }'),
      say('Two levels only. I mapped our three onto them.')
    ]
  },
  {
    days: 2,
    turns: [
      user('Check the ADRs again, docs/adr, before we add a second queue consumer.'),
      bash('ls docs/adr', '0001-service-split.md\n0004-persistence.md\n0007-queue.md'),
      say('0007 assumes a single consumer. A second one needs a new ADR first.')
    ]
  },
  {
    days: 1,
    turns: [
      user('tiny-router has a nicer error when a route is missing. {HOME}/code/reference/tiny-router/src/resolve.ts'),
      bash('sed -n "1,30p" {HOME}/code/reference/tiny-router/src/resolve.ts', 'throw new RouteNotFound(pathname, candidates)'),
      say('It lists the candidates it tried. Ours just says 404.')
    ]
  }
];

/** Sibling checkouts and reference clones, each real enough to open. */
const CHECKOUTS = [
  ['code/acme/design-system', 'Design system: tokens, primitives, and the component library.'],
  ['code/acme/design-system/packages/tokens', 'Design tokens.'],
  ['code/acme/design-system/packages/ui', 'Component library.'],
  ['code/acme/platform-api', 'Platform API service: billing, errors, pagination.'],
  ['code/acme/platform-api/src/billing', 'Billing.'],
  ['code/reference/chess-engine', 'Read-only clone kept for reference.'],
  ['code/reference/chess-engine/tests', 'Its test layout.'],
  ['code/reference/tiny-router/src', 'Read-only clone kept for reference.'],
  ['code/reference/legacy-parser', 'Read-only clone kept for reference.'],
  ['Downloads', 'Downloads.']
];

const PROJECT_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'storefront',
      private: true,
      type: 'module',
      dependencies: { 'tiny-router': '^2.1.0', zod: '^3.25.76' }
    },
    null,
    2
  ),
  'pnpm-lock.yaml': [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '  excludeLinksFromLockfile: false',
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    "      tiny-router:",
    "        specifier: ^2.1.0",
    "        version: 2.1.0",
    '      zod:',
    "        specifier: ^3.25.76",
    "        version: 3.25.76",
    '',
    'packages:',
    '',
    "  tiny-router@2.1.0:",
    "    resolution: {integrity: sha512-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa==}",
    '',
    '  zod@3.25.76:',
    "    resolution: {integrity: sha512-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb==}",
    '',
    'snapshots:',
    '',
    "  tiny-router@2.1.0: {}",
    '',
    '  zod@3.25.76: {}',
    ''
  ].join('\n'),
  'AGENTS.md': [
    '# storefront',
    '',
    'The customer facing storefront. Vite, React, and a Cloudflare Worker for the cart API.',
    '',
    '## Conventions',
    '',
    '- Components live in `src/components`, one directory per component.',
    '- Run `npm test` before handing work back.',
    ''
  ].join('\n'),
  '.gitignore': ['node_modules/', 'dist/', '.DS_Store', ''].join('\n'),
  'src/components/Cart/Cart.tsx': 'export function Cart() {\n  return null;\n}\n',
  'src/components/ProductCard.tsx': 'export function ProductCard() {\n  return null;\n}\n',
  'src/tokens/legacy.ts': 'export const legacy = {};\n',
  'docs/adr/0001-service-split.md': '# 0001 Service split\n\nStatus: accepted\n',
  'docs/adr/0004-persistence.md': '# 0004 Persistence\n\nStatus: accepted\n\nNo ORM in this service.\n',
  'docs/adr/0007-queue.md': '# 0007 Queue\n\nStatus: accepted\n\nRetries cap at three, with jitter. One consumer.\n'
};

export async function buildWorld(root) {
  const home = path.join(root, 'home');
  const projectRoot = path.join(home, 'code', 'acme', 'storefront');

  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(projectRoot, { recursive: true });

  for (const [relative, readme] of CHECKOUTS) {
    const dir = path.join(home, relative);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'README.md'), `# ${path.basename(relative)}\n\n${readme}\n`);
  }

  for (const [relative, contents] of Object.entries(PROJECT_FILES)) {
    const file = path.join(projectRoot, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }

  await writeTranscripts(home, projectRoot);

  return { home, projectRoot };
}

async function writeTranscripts(home, projectRoot) {
  const resolve = (value) =>
    typeof value === 'string' ? value.replaceAll('{HOME}', home) : value;
  const dir = path.join(home, '.claude', 'projects', escapeProjectPath(projectRoot));
  await fs.mkdir(dir, { recursive: true });

  for (const [index, session] of SESSIONS.entries()) {
    const sessionId = uuid(index);
    const started = Date.now() - session.days * 24 * 60 * 60 * 1000;
    const records = [];
    let uuidCounter = 0;
    let parent = null;

    for (const turn of session.turns) {
      for (const record of turn) {
        const id = uuid(index * 100 + (uuidCounter += 1));
        records.push({
          parentUuid: parent,
          isSidechain: false,
          userType: 'external',
          cwd: projectRoot,
          sessionId,
          version: '2.1.234',
          gitBranch: 'main',
          type: record.type,
          message: JSON.parse(resolve(JSON.stringify(record.message))),
          uuid: id,
          timestamp: new Date(started + uuidCounter * 20_000).toISOString()
        });
        parent = id;
      }
    }

    await fs.writeFile(
      path.join(dir, `${sessionId}.jsonl`),
      `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
    );
  }
}

function user(text) {
  return [{ type: 'user', message: { role: 'user', content: text } }];
}

function say(text) {
  return [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }];
}

function bash(command, output) {
  return [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_x', name: 'Bash', input: { command, description: 'Inspect' } }]
      }
    },
    {
      type: 'user',
      message: { role: 'user', content: [{ tool_use_id: 'toolu_x', type: 'tool_result', content: output }] }
    }
  ];
}

/** Claude Code names a transcript directory after the project path, punctuation flattened. */
function escapeProjectPath(projectRoot) {
  return projectRoot.replaceAll(/[^A-Za-z0-9]/g, '-');
}

/** Stable per index, so a rerun of the same world produces the same session ids. */
function uuid(seed) {
  const hex = (offset, length) =>
    Math.abs(Math.sin(seed + offset) * 0xffffffff)
      .toString(16)
      .replace('.', '')
      .padEnd(length, '0')
      .slice(0, length);
  return `${hex(1, 8)}-${hex(2, 4)}-4${hex(3, 3)}-a${hex(4, 3)}-${hex(5, 12)}`;
}
