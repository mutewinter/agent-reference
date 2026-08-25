declare module 'virtual:highlighted' {
  /** Snippet name to its Shiki-rendered HTML and the source behind it. */
  const highlighted: Record<string, { html: string; code: string }>;
  export default highlighted;
}

/** Version of the CLI in this repository, injected by vite.config.ts. */
declare const __CLI_VERSION__: string;

declare module 'virtual:cli-reference' {
  /** One real transcript per command, generated at build time. */
  const entries: Array<{ note: string; command: string; transcript: string }>;
  export default entries;
}
