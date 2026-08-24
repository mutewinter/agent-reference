// The fixture the CLI reference is generated against. It is built in a temp
// directory at build time, the real CLI is run inside it, and the output is
// pasted onto the page verbatim apart from path normalisation. Nothing here
// touches the network or the real store, so a deploy cannot hang on a clone.
export const fixture = {
  'agent-reference.json': `{
  "git": {
    "opencode": {
      "repository": "github:anomalyco/opencode",
      "description": "A coding agent for terminal dwellers"
    }
  },
  "paths": {
    "brief": "./notes/brief.md",
    "notes": "./notes"
  },
  "packages": {
    "semver": "7.8.4"
  }
}
`,
  'package.json': `{ "name": "my-app", "dependencies": { "semver": "^7.8.4" } }\n`,
  'pnpm-lock.yaml': `lockfileVersion: "9.0"

importers:

  .:
    dependencies:
      semver:
        specifier: ^7.8.4
        version: 7.8.4
`,
  'notes/brief.md': '# Project brief\n',
}

/**
 * Run in this order; it reads as somebody finding their way around. The note
 * becomes a shell comment above the command, because the output on its own is
 * too terse to explain what you were asking for.
 */
export const commands = [
  { argv: ['help'], note: 'every command, from the version you have installed' },
  { argv: ['status'], note: 'what this project declares, and whether it is on disk yet' },
  { argv: ['get', 'brief'], note: 'a name in, a path out. This is the one agents live in' },
  { argv: ['versions', 'semver'], note: 'which versions this project installs, and where. Never fetches' },
  { argv: ['validate'], note: 'check the config, including that no machine path reached the committed file' },
]
