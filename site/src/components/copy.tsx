import { useState } from 'react'

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
      <path d="M10.5 3.2V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 8.6 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // A denied clipboard is not worth an error state. The text is on screen
      // and selectable, which is the fallback either way.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      className={`shrink-0 cursor-pointer border p-1.5 transition-colors ${
        copied
          ? 'border-ready/50 text-ready'
          : 'border-line text-muted hover:border-accent hover:text-accent'
      }`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

/**
 * The one thing on the page meant to be copied. It is deliberately not styled
 * as terminal output: what the reader takes is a sentence they say to their
 * agent, and the authority to act on a brief has to come from the person, not
 * from something that looks like the tool talking.
 */
export function ForYourAgent({ text, note }: { text: string; note?: string }) {
  return (
    <div className="border border-accent/40 bg-accent/[0.05]">
      <div className="flex items-center justify-between gap-3 border-b border-accent/25 px-3 py-1.5">
        <span className="text-[11px] tracking-wider text-accent uppercase">
          say this to your agent
        </span>
        <CopyButton text={text} />
      </div>
      <p className="px-3 py-3 text-[13px] leading-relaxed text-fg">{text}</p>
      {note ? (
        <p className="border-t border-accent/15 px-3 py-2 text-[12px] leading-relaxed text-muted">
          {note}
        </p>
      ) : null}
    </div>
  )
}
