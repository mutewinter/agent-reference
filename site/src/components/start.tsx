import { CheckIcon, CopyIcon, useCopy } from './copy';

/** Selectable prompt text and an explicit copy action share one setup card. */
export function ForYourAgent({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);

  return (
    <div className="setup-prompt border border-accent/30 bg-term p-5 text-left sm:p-7">
      <p id="setup-prompt-text" className="font-mono text-base leading-relaxed text-fg select-text">
        {text}
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Prompt copied' : 'Copy setup prompt'}
          aria-describedby="setup-prompt-text"
          className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-sm px-5 py-3 text-sm font-medium text-bg transition-colors sm:w-auto ${copied ? 'bg-ok' : 'bg-accent hover:bg-accent/90'}`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span aria-live="polite">{copied ? 'Prompt copied' : 'Copy setup prompt'}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * The second thing to do, for a reader who does not believe the first screen
 * happens to them. Quieter than the prompt above it in every way that matters:
 * one line, the page's own line color rather than the accent, and a copy action
 * that sits inside the box instead of under it.
 */
export function CopyCommand({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy(text);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="flex w-full cursor-pointer items-center justify-between gap-4 border border-line bg-term px-4 py-3 text-left transition-colors hover:border-accent/40"
    >
      <code className="font-mono text-sm text-fg">{text}</code>
      <span className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}
