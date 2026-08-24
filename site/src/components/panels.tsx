import type { ReactNode } from 'react'

import highlighted from 'virtual:highlighted'

import { IconCopy } from './copy'

/** A framed block. The label is a filename or a command, never a description. */
export function Panel({
  label,
  note,
  dim = false,
  tone = 'panel',
  copy,
  children,
}: {
  label?: string
  note?: string
  dim?: boolean
  tone?: 'panel' | 'term'
  copy?: string
  children: ReactNode
}) {
  return (
    <div
      className={`group flex flex-col border border-line ${
        tone === 'term' ? 'bg-term' : 'bg-panel'
      }`}
    >
      {label ? (
        <div
          className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-sm ${
            dim ? 'text-dim' : 'text-muted'
          }`}
        >
          <span>
            {label}
            {note ? <span className="text-dim"> {note}</span> : null}
          </span>
          {copy ? <IconCopy text={copy} reveal /> : null}
        </div>
      ) : null}
      <div className="flex-1 overflow-x-auto p-4 text-sm leading-code">{children}</div>
    </div>
  )
}

/**
 * A folder layout. The box-drawing sits back so the names carry, and the
 * config file is picked out, since where it lives is the whole point of
 * showing a tree at all.
 */
export function Tree({ text }: { text: string }) {
  return (
    <pre className="leading-code">
      {text.split('\n').map((line, i) => {
        const match = line.match(/^([\u2500-\u257F ]*)(.*)$/u)
        const branch = match ? match[1] : ''
        const name = match ? match[2] : line
        return (
          <div key={i}>
            <span className="text-dim select-none">{branch}</span>
            <span className="text-fg">{name}</span>
          </div>
        )
      })}
    </pre>
  )
}

/** Shiki output for JSON, rendered in Node at build time. */
export function Highlighted({ name }: { name: string }) {
  return (
    <div className="shiki-block" dangerouslySetInnerHTML={{ __html: highlighted[name].html }} />
  )
}

/** The source behind a snippet, for the clipboard. */
export function source(name: string) {
  return highlighted[name].code
}

const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'dlx'])

const STATE_TONE: Record<string, string> = {
  ready: 'text-ok',
  declared: 'text-muted',
  unresolvable: 'text-accent',
}

/**
 * Terminal output painted the way the CLI paints it, rather than the way a
 * shell grammar would guess. A highlighter has no idea that green means a
 * reference is on disk, and it colors output it cannot parse, which is how the
 * blue got in.
 */
function Line({ text, inline = false }: { text: string; inline?: boolean }) {
  const Wrap = inline ? 'span' : 'div'
  if (text === '') return <div>&nbsp;</div>

  if (text.startsWith('# ')) return <div className="text-dim">{text}</div>

  // A command with no prompt in front of it: the agent ran this, not a person,
  // so there is no shell for the dollar sign to belong to.
  if (text.startsWith('agent-reference ')) {
    return (
      <div>
        <span className="text-accent">agent-reference</span>
        {text.slice('agent-reference'.length)}
      </div>
    )
  }

  if (text.startsWith('$ ')) {
    const words = text.slice(2).split(' ')
    // A runner is not the command. `npx agent-reference init` should put the
    // emphasis on the tool being run, the way reading it aloud would.
    const at = RUNNERS.has(words[0]) ? 1 : 0
    return (
      <div>
        <span className="text-muted select-none">$ </span>
        {at > 0 ? <span className="text-muted">{words[0]} </span> : null}
        <span className="text-accent">{words[at]}</span>
        {words.length > at + 1 ? ` ${words.slice(at + 1).join(' ')}` : null}
      </div>
    )
  }

  const scope = text.match(/^(\S+) (\(.+\))$/u)
  if (scope) {
    return (
      <div>
        {scope[1]} <span className="text-muted">{scope[2]}</span>
      </div>
    )
  }

  const row = text.match(/^(\s*)(\S+)(\s+)(.*·.*)$/u)
  if (row) {
    const [, indent, name, gap, facts] = row
    return (
      <Wrap>
        {indent}
        {name}
        {gap}
        {facts.split(' · ').map((fact, i) => (
          <span key={fact}>
            {i > 0 ? <span className="text-line"> · </span> : null}
            <span className={STATE_TONE[fact] ?? 'text-muted'}>{fact}</span>
          </span>
        ))}
      </Wrap>
    )
  }

  return <Wrap>{text}</Wrap>
}

/**
 * A coding-agent session rather than a shell. The point of showing it this way
 * is that nobody types these commands: the agent does, which is the whole
 * reason the tool prints paths instead of file contents.
 */
export function Session({ text }: { text: string }) {
  return (
    <pre className="leading-code">
      {text.split('\n').map((line, i) => {
        if (line === '') return <div key={i}>&nbsp;</div>

        if (line.startsWith('> ')) {
          return (
            <div key={i} className="text-muted">
              <span className="select-none">{'> '}</span>
              {line.slice(2)}
            </div>
          )
        }

        if (line.startsWith('* ')) {
          const call = line.slice(2)
          const open = call.indexOf('(')
          return (
            <div key={i}>
              <span className="text-ok select-none">{'\u23FA '}</span>
              {open === -1 ? (
                call
              ) : (
                <>
                  {call.slice(0, open)}
                  <span className="text-muted">{call.slice(open)}</span>
                </>
              )}
            </div>
          )
        }

        const result = line.match(/^(\s+)(\u23BF )?(.*)$/u)
        if (result) {
          const [, indent, elbow, rest] = result
          return (
            <div key={i}>
              {indent}
              <span className="text-line select-none">{elbow ? '\u23BF ' : ''}</span>
              <Line text={rest} inline />
            </div>
          )
        }

        return <Line key={i} text={line} />
      })}
    </pre>
  )
}

export function Term({ text }: { text: string }) {
  return (
    <pre className="leading-code">
      {text.split('\n').map((line, i) => (
        <Line key={`${i}-${line}`} text={line} />
      ))}
    </pre>
  )
}
