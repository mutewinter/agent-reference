import type { ReactNode } from 'react'

import highlighted from 'virtual:highlighted'

/** A framed block with a label in its chrome, the shape the CLI's own output has. */
export function Panel({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col border border-line bg-panel">
        <div className="border-b border-line px-3 py-1.5 text-[11px] tracking-wider text-faint uppercase">
          {title}
        </div>
        <div className="flex-1 overflow-x-auto px-3 py-3 text-[13px] leading-relaxed">
          {children}
        </div>
      </div>
      {caption ? <p className="mt-2 text-[12px] text-faint">{caption}</p> : null}
    </div>
  )
}

/** Shiki output, rendered in Node at build time. */
export function Highlighted({ name }: { name: string }) {
  return <div className="shiki-block" dangerouslySetInnerHTML={{ __html: highlighted[name] }} />
}

/**
 * Commands, shown without a copy affordance on purpose. Installing is the
 * agent's job, and it is the one that knows which package manager this machine
 * uses; the only thing on this page worth putting on a clipboard is the prompt.
 */
export function Shell({ lines }: { lines: Array<[string, string?]> }) {
  return (
    <pre className="overflow-x-auto text-[13px] leading-relaxed">
      {lines.map(([command, comment]) => (
        <div key={command}>
          <span className="text-faint select-none">$ </span>
          <span>{command}</span>
          {comment ? <span className="text-faint">{`  # ${comment}`}</span> : null}
        </div>
      ))}
    </pre>
  )
}

export function Dim({ children }: { children: ReactNode }) {
  return <span className="text-faint">{children}</span>
}
