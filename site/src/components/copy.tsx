import { useState } from 'react';

export function CopyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
      <path d="M10.5 3.2V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 8.6 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function useCopy(text: string) {
  const [copied, setCopied] = useState(false);

  // Not async: this is handed straight to `onClick`, and a handler that hands
  // back a promise is a rejection nothing is waiting to catch.
  function copy() {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1600);
      },
      () => {
        // A denied clipboard is not worth an error state. The text is on screen
        // and selectable, which is the fallback either way.
      },
    );
  }

  return { copied, copy };
}

/**
 * Icon-only copy. Optionally hides until the block it sits in is hovered,
 * which keeps a page full of code blocks from looking like a page full of
 * buttons; focus reveals it too, so it is still reachable from the keyboard.
 */
export function IconCopy({ text, reveal = false }: { text: string; reveal?: boolean }) {
  const { copied, copy } = useCopy(text);

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      className={`shrink-0 cursor-pointer transition-all ${
        copied ? 'text-ok' : 'text-muted hover:text-accent'
      } ${reveal ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : ''}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
