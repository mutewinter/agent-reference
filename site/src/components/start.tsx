import { useEffect, useState } from 'react'

import { copy as pageCopy } from '../../code-samples.mjs'
import { CheckIcon, CopyIcon, IconCopy, useCopy } from './copy'

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-fg">{children}</h2>
}

/** Renders `backticked` spans as inline code, while the clipboard gets the raw text. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="border border-accent/25 bg-accent/10 px-1 text-accent">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}

/**
 * Not a panel and not a terminal: the one thing on the page you click. The
 * whole block is the button, so there is no aiming, and it sits on a hard
 * offset shadow that presses in under the cursor. Nothing else here casts a
 * shadow, and a thick left border, the usual way to mark a block like this,
 * has been a trope for years.
 */
export function ForYourAgent({ text }: { text: string }) {
  const { copied, copy } = useCopy(text)

  return (
    <div>
      <Heading>{pageCopy.agent.heading}</Heading>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy this prompt'}
        className="flex w-full cursor-pointer items-start gap-4 border border-accent/60 bg-accent/10 p-4 text-left shadow-[4px_4px_0_0_rgba(255,185,100,0.28)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-accent/20 hover:shadow-[2px_2px_0_0_rgba(255,185,100,0.28)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none">
        <span className="flex-1 text-[13px] leading-relaxed text-fg">
          <WithCode text={text} />
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[12px] text-bg ${
            copied ? 'bg-ok' : 'bg-accent'
          }`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {/* Fixed width: "Copied" is longer than "Copy", and letting the pill
              resize reflowed the prompt beside it on every click. */}
          <span className="inline-block w-11">{copied ? 'Copied' : 'Copy'}</span>
        </span>
      </button>
      <p className="mt-3 text-[13px] text-muted">{pageCopy.agent.note}</p>
    </div>
  )
}

/**
 * Swaps the agent name every few seconds to say that none of them is special.
 * The whole line dips rather than the name typing itself: a name that grows a
 * character at a time reflows everything after it, and reserving a fixed width
 * to stop that left an obvious gap. It dips to a readable dim rather than to
 * nothing, because a line blinking out of existence draws the eye far harder
 * than a line that merely softens, and this is the secondary path.
 */
function CyclingCommand({ names, prompt }: { names: Array<string>; prompt: string }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const cycle = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((current) => (current + 1) % names.length)
        setVisible(true)
      }, 300)
    }, 5000)

    return () => clearInterval(cycle)
  }, [names])

  return (
    <div className={`transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-40'}`}>
      <span className="text-muted select-none">$ </span>
      <span className="text-accent">{names[index]}</span>
      {` "${prompt}"`}
    </div>
  )
}

/** Install it, go where the code is, then ask an agent to do the rest. */
export function ForYou({
  cd,
  install,
  prompt,
  agents,
}: {
  cd: string
  install: string
  prompt: string
  agents: Array<string>
}) {
  return (
    <div>
      <Heading>{pageCopy.install.heading}</Heading>
      <div className="group border border-line bg-term p-4 text-[13px]">
        <pre className="leading-[1.75]">
          {/* The button sits on the line it copies. In the corner it was
              ambiguous which of three commands it would take. */}
          <div className="flex items-center gap-3">
            <span>
              <span className="text-muted select-none">$ </span>
              <span className="text-accent">npm</span>
              {install.replace(/^npm/, '')}
            </span>
            <IconCopy text={install} reveal />
          </div>
          <div>
            <span className="text-muted select-none">$ </span>
            <span className="text-accent">cd</span>
            {cd.replace(/^cd/, '')}
          </div>
          <CyclingCommand names={agents} prompt={prompt} />
        </pre>
      </div>
    </div>
  )
}

/** Between the two cards, so nobody reads them as steps one and two. */
export function Or() {
  return (
    <div className="flex items-center justify-center py-2 text-muted md:py-0">
      <span className="md:hidden">or</span>
      <span className="hidden md:flex md:h-full md:flex-col md:items-center md:gap-3">
        <span className="w-px flex-1 bg-line" />
        or
        <span className="w-px flex-1 bg-line" />
      </span>
    </div>
  )
}
