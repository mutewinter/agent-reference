import type { ReactNode } from 'react'

/**
 * A frame for real CLI output. The colors are the ones the tool prints, not
 * decoration: green means the reference is on disk, and everything else is the
 * ordinary resting state rather than a warning.
 */
export function Output({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-line bg-panel">
      <div className="border-b border-line px-3 py-1.5 text-[11px] tracking-wider text-faint uppercase">
        {title}
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-relaxed">{children}</pre>
    </div>
  )
}

export function Ready() {
  return <span className="text-ready">ready</span>
}

export function Declared() {
  return <span className="text-faint">declared</span>
}

export function Dim({ children }: { children: ReactNode }) {
  return <span className="text-faint">{children}</span>
}
