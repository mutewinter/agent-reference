import { CheckIcon, CopyIcon, useCopy } from './copy';

/**
 * Not a panel and not a terminal: the one thing on the page you click. The
 * text is set as the plain text it is, backticks and all, because that is
 * what the clipboard gets; the button sits in its own cell beside it, so what
 * it copies is the thing it is next to; and the whole block is the button,
 * on a hard offset shadow that presses in under the cursor. The pill is the
 * only thing that changes on a click.
 */
export function ForYourAgent({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy this prompt'}
      className="flex w-full max-w-2xl cursor-pointer flex-col items-stretch border border-line bg-term text-left shadow-offset transition-all hover:translate-0.5 hover:border-accent/60 hover:shadow-offset-sm active:translate-1 active:shadow-none sm:flex-row"
    >
      {/* Mono, because that is what pasted text looks like: the block reads as
          something to copy before it reads as something to read. */}
      <span className="flex-1 p-4 font-mono text-sm leading-relaxed text-fg">{text}</span>
      <span className="flex shrink-0 items-center border-t border-line p-3 sm:border-t-0 sm:border-l">
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs text-bg ${
            copied ? 'bg-ok' : 'bg-accent'
          }`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {/* Fixed width so the pill does not resize on click and reflow the
              prompt beside it, and centered inside that width so the two words
              sit under each other rather than drifting left. */}
          <span className="inline-block w-11 text-center">{copied ? 'Copied' : 'Copy'}</span>
        </span>
      </span>
    </button>
  );
}
