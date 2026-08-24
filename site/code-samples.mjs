// Snippets shown on the site, highlighted at build time by the plugin in
// vite.config.ts. They live in plain JS rather than in a route so that Shiki
// runs in Node during the build and never reaches the client or the Worker.
export const samples = {
  config: {
    lang: 'json',
    code: `{
  "git": {
    "zod": "github:colinhacks/zod"
  },
  "folders": {
    "notes": "./references/notes"
  },
  "packages": {
    "semver": "7.8.4"
  }
}`,
  },
}
