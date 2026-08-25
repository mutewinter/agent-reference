/**
 * What renders when a URL matches no route. It sits inside the root shell, so
 * the header and the footer come with it and only the middle is new.
 */
export function NotFound() {
  return (
    <section className="py-24">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-3 text-2xl text-fg">That page is not here</h1>
      <p className="mt-3 max-w-xl text-muted">
        Nothing at this address. The links below are everything this site has.
      </p>
      <nav className="mt-8 flex flex-wrap items-center gap-5 text-sm">
        <a href="/" className="text-fg hover:text-accent">
          agent-reference
        </a>
        <a href="/talk" className="text-fg hover:text-accent">
          the talk
        </a>
        <a
          href="https://github.com/mutewinter/agent-reference"
          className="text-fg hover:text-accent"
        >
          github
        </a>
        <a
          href="https://www.npmjs.com/package/agent-reference"
          className="text-fg hover:text-accent"
        >
          npm
        </a>
      </nav>
    </section>
  );
}
