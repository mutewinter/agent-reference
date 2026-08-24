declare module 'virtual:highlighted' {
  /** Snippet name to Shiki-rendered HTML, generated at build time. */
  const highlighted: Record<string, string>
  export default highlighted
}

/** Version of the CLI in this repository, injected by vite.config.ts. */
declare const __CLI_VERSION__: string
