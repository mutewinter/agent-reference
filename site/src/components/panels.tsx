import { cloneElement, type ReactElement, type ReactNode } from 'react';

import highlighted from 'virtual:highlighted';

import { IconCopy } from './copy';

/**
 * Prose with `backticks` in it. The page has no markdown, and a name like
 * `references` set in the body face reads as a word rather than as the key it
 * is; the site sets code in code everywhere else, so it does here too.
 */
export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="text-fg">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/** A framed block. The label is a filename or a command, never a description. */
export function Panel({
  label,
  note,
  dim = false,
  tone = 'panel',
  copy,
  children,
}: {
  label?: string;
  note?: string;
  dim?: boolean;
  tone?: 'panel' | 'term';
  copy?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`group flex min-w-0 flex-col border border-line ${
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
  );
}

/**
 * A folder layout. The box-drawing sits back so the names carry, and the
 * config file is picked out, since where it lives is the whole point of
 * showing a tree at all. Anything after a ` # ` is a note about the line it
 * sits on, padded into one column so the notes read as a margin against the
 * shape rather than as ragged sentences inside it.
 */
export function Tree({ text }: { text: string }) {
  const rows = text.split('\n').map((line) => {
    const at = line.indexOf(' # ');
    const body = at === -1 ? line : line.slice(0, at);
    const match = body.match(/^([\u2500-\u257F ]*)(.*)$/u);
    return {
      branch: match ? match[1] : '',
      name: match ? match[2] : body,
      note: at === -1 ? null : line.slice(at + 1),
      width: body.length,
    };
  });
  // Only the annotated lines set the column, so a long path further down runs
  // past the notes instead of pushing every one of them off the panel.
  const column = Math.max(0, ...rows.filter((row) => row.note).map((row) => row.width));

  return (
    // The one block that does not wrap: a wrapped continuation lands under the
    // box-drawing and reads as another entry, so the shape is gone. It scrolls
    // inside the panel instead, which `min-w-0` up there is what allows.
    <pre className="leading-code">
      {rows.map((row, i) => (
        <div key={i}>
          <span className="text-dim select-none">{row.branch}</span>
          <span className="text-fg">{row.name}</span>
          {row.note ? (
            <span className="text-muted">
              <span className="select-none">{' '.repeat(column - row.width + 2)}</span>
              {row.note}
            </span>
          ) : null}
        </div>
      ))}
    </pre>
  );
}

/**
 * Shiki output for JSON, rendered in Node at build time. `reveal` fades the
 * lines in one at a time, which is what a file being written looks like; the
 * markup is the finished file either way, so nothing about the page depends on
 * the animation having run.
 */
export function Highlighted({ name, reveal }: { name: string; reveal?: { chunks: number[] } }) {
  const html = reveal ? revealLines(highlighted[name].html, reveal) : highlighted[name].html;
  return <div className="shiki-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Marks each line with the group it arrives in. Shiki emits exactly this opener
 * once per line, which is the seam the class rides on; the HTML comes from a
 * build-time highlighter, so nothing a config or a repository wrote reaches it.
 * `chunks` is how many lines land together, and the stylesheet says when.
 */
function revealLines(html: string, reveal: { chunks: number[] }): string {
  const groups = reveal.chunks.flatMap((count, group) =>
    Array.from({ length: count }, () => group + 1),
  );
  let index = 0;
  return html.replaceAll('<span class="line">', () => {
    const group = groups[index++] ?? groups.at(-1) ?? 1;
    return `<span class="line rv rv-w${group}">`;
  });
}

/** The source behind a snippet, for the clipboard. */
export function source(name: string) {
  return highlighted[name].code;
}

const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'dlx']);

const STATE_TONE: Record<string, string> = {
  ready: 'text-ok',
  declared: 'text-muted',
  unresolvable: 'text-accent',
};

/**
 * Terminal output painted the way the CLI paints it, rather than the way a
 * shell grammar would guess. A highlighter has no idea that green means a
 * reference is on disk, and it colors output it cannot parse, which is how the
 * blue got in.
 */
function Line({ text, inline = false }: { text: string; inline?: boolean }) {
  const Wrap = inline ? 'span' : 'div';
  if (text === '') return <div>&nbsp;</div>;

  if (text.startsWith('# ')) return <div className="text-dim">{text}</div>;

  // A command with no prompt in front of it: the agent ran this, not a person,
  // so there is no shell for the dollar sign to belong to.
  if (text.startsWith('agent-reference ')) {
    return (
      <div>
        <span className="text-accent">agent-reference</span>
        {text.slice('agent-reference'.length)}
      </div>
    );
  }

  if (text.startsWith('$ ')) {
    const words = text.slice(2).split(' ');
    // A runner is not the command. `npx agent-reference init` should put the
    // emphasis on the tool being run, the way reading it aloud would.
    const at = RUNNERS.has(words[0]) ? 1 : 0;
    return (
      <div>
        <span className="text-muted select-none">$ </span>
        {at > 0 ? <span className="text-muted">{words[0]} </span> : null}
        <span className="text-accent">{words[at]}</span>
        {words.length > at + 1 ? ` ${words.slice(at + 1).join(' ')}` : null}
      </div>
    );
  }

  const scope = text.match(/^(\S+) (\(.+\))$/u);
  if (scope) {
    return (
      <div>
        {scope[1]} <span className="text-muted">{scope[2]}</span>
      </div>
    );
  }

  const row = text.match(/^(\s*)(\S+)(\s+)(.*·.*)$/u);
  if (row) {
    const [, indent, name, gap, facts] = row;
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
    );
  }

  return <Wrap>{text}</Wrap>;
}

/**
 * A coding-agent session rather than a shell. The point of showing it this way
 * is that nobody types these commands: the agent does, which is the whole
 * reason the tool prints paths instead of file contents. With `reveal` it plays
 * once, a tool call at a time.
 */
export function Session({ text, reveal = false }: { text: string; reveal?: boolean }) {
  const lines = text.split('\n');
  const steps = stepIndices(lines);

  return (
    <pre className="code-wrap leading-code">
      {lines.map((line, i) => {
        const element = sessionLine(line, i);
        if (!reveal) return element;
        return cloneElement(element, {
          className: `${element.props.className ?? ''} rv ${STEP_CLASS[steps[i] ?? 0]}`.trim(),
        });
      })}
    </pre>
  );
}

/**
 * A tool call and the results under it arrive together, the way they do in a
 * real session, so the group is per call rather than per line. The stylesheet
 * holds the timing; this only says what belongs with what.
 */
function stepIndices(lines: string[]): number[] {
  const steps: number[] = [];
  let step = 0;
  for (const line of lines) {
    if (line.startsWith('* ')) step += 1;
    steps.push(step);
  }
  return steps;
}

const STEP_CLASS = ['rv-s0', 'rv-s1', 'rv-s2', 'rv-s3', 'rv-s4', 'rv-s5'];

function sessionLine(line: string, i: number): ReactElement<{ className?: string }> {
  if (line === '') return <div key={i}>&nbsp;</div>;

  if (line.startsWith('> ')) {
    return (
      <div key={i} className="prompt">
        <span className="text-dim select-none">{'> '}</span>
        {line.slice(2)}
      </div>
    );
  }

  if (line.startsWith('* ')) {
    const call = line.slice(2);
    const open = call.indexOf('(');
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
    );
  }

  const result = line.match(/^(\s+)(\u23BF )?(.*)$/u);
  if (result) {
    const [, indent, elbow, rest] = result;
    return (
      <div key={i}>
        {indent}
        <span className="text-line select-none">{elbow ? '\u23BF ' : ''}</span>
        <Line text={rest} inline />
      </div>
    );
  }

  return (
    <div key={i}>
      <Line text={line} inline />
    </div>
  );
}

export function Term({ text }: { text: string }) {
  return (
    <pre className="code-wrap leading-code">
      {text.split('\n').map((line, i) => (
        <Line key={`${i}-${line}`} text={line} />
      ))}
    </pre>
  );
}
