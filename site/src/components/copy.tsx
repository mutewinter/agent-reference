import { useState } from 'react'

function useCopy(text: string) {
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

  return { copied, copy }
}

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const { copied, copy } = useCopy(text)

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      className="shrink-0 cursor-pointer border border-line px-2 py-0.5 text-[11px] tracking-wider text-muted uppercase transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? 'copied' : label}
    </button>
  )
}

/** Shell commands, with the trailing comment column the README uses. */
export function Command({ lines }: { lines: Array<[string, string?]> }) {
  const text = lines.map(([command]) => command).join('\n')

  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[11px] tracking-wider text-faint uppercase">shell</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-relaxed">
        {lines.map(([command, comment]) => (
          <div key={command}>
            <span className="text-faint select-none">$ </span>
            <span>{command}</span>
            {comment ? <span className="text-faint">{`  # ${comment}`}</span> : null}
          </div>
        ))}
      </pre>
    </div>
  )
}

/**
 * A block meant to be handed to an agent rather than run. It is deliberately
 * not styled as terminal output: what the reader copies here is a sentence they
 * say to their agent, and the authority to act on it has to come from them.
 */
export function ForYourAgent({ text, note }: { text: string; note?: string }) {
  return (
    <div className="border border-accent/40 bg-accent/[0.04]">
      <div className="flex items-center justify-between border-b border-accent/25 px-3 py-1.5">
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

/** Any other code the reader might want on their clipboard. */
export function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[11px] tracking-wider text-faint uppercase">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-relaxed">{code}</pre>
    </div>
  )
}
