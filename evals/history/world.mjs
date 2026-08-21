/**
 * Builds a synthetic world for the `history` eval: a project that talks to an upstream
 * library, and that library's real git history sitting in a local repository.
 *
 * The question the world asks can only be answered from commits. The working tree at HEAD
 * states the current rule and the release it shipped in, and says nothing about what the
 * library used to do or why it stopped, because the commit that changed it deleted the old
 * path and explained itself in its message. An agent that reads only the checkout can
 * describe the behavior and cannot explain it.
 *
 * Nothing here touches the network. Upstream is a local git repository, reached through a
 * relative `file:` spec so the committed config holds no machine path.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * What a correct run ends with, split by where each fact lives. `fromTree` is what reading
 * the checkout answers; `onlyFromHistory` is what nothing but git answers, and is the whole
 * point of the suite. The grader reads this, so the fixture and the scoring cannot drift.
 */
export const EXPECTED = {
  reference: 'wire-format',
  question: 'what wire-format used to do with payloads over 64 KiB, and why it stopped',
  fromTree: {
    cap: '65536 bytes, in src/frame.js',
    release: '2.3.0, named in CHANGELOG.md'
  },
  onlyFromHistory: {
    commit: 'wire: cap frame payloads at 64 KiB (#214)',
    issue: '#214',
    priorBehavior: 'oversized payloads were split across continuation frames and reassembled by the reader',
    reason: 'a peer could pin an unbounded reader buffer by announcing a huge payload, and 64 KiB is the v2 receive window',
    migration: 'callers should split their own payloads into separate messages'
  },
  /** A word that exists nowhere in the HEAD tree, so finding it means history was read. */
  historyOnlyWord: 'continuation'
};

export async function buildWorld(runDir) {
  const home = path.join(runDir, 'home');
  const world = path.join(runDir, 'world');
  const upstream = path.join(world, 'upstream');
  const projectRoot = path.join(world, 'projects', 'telemetry-gateway');

  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(upstream, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });

  const repoPath = await buildUpstream(upstream);
  await assertHistoryOnly(repoPath);
  await buildProject(projectRoot, repoPath);

  return { home, world, projectRoot, upstreamPath: repoPath };
}

/**
 * wire-format's history, written so that the interesting commit is neither the newest nor
 * the tagged one: the cap lands in its own commit and is released two commits later, so
 * "when did this change" and "why did it change" are different lookups.
 */
async function buildUpstream(parent) {
  const repoPath = await initRepo(parent, 'wire-format');

  await writeFiles(repoPath, {
    'package.json': manifest('1.0.0'),
    'README.md': [
      '# wire-format',
      '',
      'A framed binary codec. Every frame is a 8-byte header followed by its payload.',
      ''
    ].join('\n'),
    'src/frame.js': FRAME_V1,
    'src/index.js': "export { encodeFrame, decodeFrame } from './frame.js';\n"
  });
  await commit(repoPath, 'wire: first cut of the frame codec');
  await tag(repoPath, 'v1.0.0');

  await writeFiles(repoPath, {
    'package.json': manifest('1.4.0'),
    'README.md': [
      '# wire-format',
      '',
      'A framed binary codec. Every frame is a 8-byte header followed by its payload.',
      '',
      '## Large payloads',
      '',
      'A payload too big for one frame is split across continuation frames and reassembled',
      'by the reader. Callers do not have to think about frame size.',
      ''
    ].join('\n'),
    'src/frame.js': FRAME_CONTINUATIONS,
    'src/index.js': "export { encodeFrame, decodeFrame, splitIntoContinuations } from './frame.js';\n"
  });
  await commit(repoPath, 'wire: split oversized payloads across continuation frames');
  await tag(repoPath, 'v1.4.0');

  await writeFiles(repoPath, {
    'package.json': manifest('2.0.0'),
    'src/handshake.js': HANDSHAKE
  });
  await commit(repoPath, 'wire: add the v2 handshake and its receive window');
  await tag(repoPath, 'v2.0.0');

  await writeFiles(repoPath, {
    'package.json': manifest('2.2.1'),
    'src/frame.js': FRAME_CONTINUATIONS.replace(
      'export function decodeFrame(bytes) {',
      'export function decodeFrame(bytes) {\n  if (bytes.length > 8 + readLength(bytes)) throw new Error("trailing bytes after frame");'
    )
  });
  await commit(repoPath, 'wire: reject trailing garbage after a frame');
  await tag(repoPath, 'v2.2.1');

  // The commit the whole suite exists for. It deletes the old path and carries the only
  // written account of why, which is exactly the shape of the thing an agent cannot grep.
  await writeFiles(repoPath, {
    'README.md': [
      '# wire-format',
      '',
      'A framed binary codec. Every frame is a 8-byte header followed by its payload.',
      '',
      '## Large payloads',
      '',
      'A payload over `MAX_PAYLOAD` is refused. Send it as several messages.',
      ''
    ].join('\n'),
    'src/frame.js': FRAME_CAPPED,
    'src/index.js': "export { encodeFrame, decodeFrame, MAX_PAYLOAD } from './frame.js';\n"
  });
  await commit(repoPath, CAP_COMMIT_MESSAGE);

  await writeFiles(repoPath, {
    'package.json': manifest('2.3.0'),
    'CHANGELOG.md': ['# Changelog', '', '## 2.3.0', '', '- Reject frames whose payload exceeds 64 KiB.', ''].join('\n')
  });
  await commit(repoPath, 'wire: release 2.3.0');
  await tag(repoPath, 'v2.3.0');

  await writeFiles(repoPath, {
    'src/index.js': "export { encodeFrame, decodeFrame, MAX_PAYLOAD } from './frame.js';\nexport { RECEIVE_WINDOW } from './handshake.js';\n"
  });
  await commit(repoPath, 'wire: export the receive window alongside the codec');

  await writeFiles(repoPath, {
    'package.json': manifest('2.4.0'),
    'CHANGELOG.md': [
      '# Changelog',
      '',
      '## 2.4.0',
      '',
      '- Export `RECEIVE_WINDOW`.',
      '',
      '## 2.3.0',
      '',
      '- Reject frames whose payload exceeds 64 KiB.',
      ''
    ].join('\n')
  });
  await commit(repoPath, 'wire: release 2.4.0');
  await tag(repoPath, 'v2.4.0');

  return repoPath;
}

const CAP_COMMIT_MESSAGE = [
  'wire: cap frame payloads at 64 KiB (#214)',
  '',
  'Continuation frames let a peer announce a payload of any size and feed it to us one',
  'frame at a time, so a single connection could pin an unbounded reader buffer long',
  'before we had enough of the message to decide it was garbage. Reassembly is also where',
  'every fuzz crash we have seen landed.',
  '',
  'The cap is the v2 receive window: a payload that does not fit in the window has nowhere',
  'to go anyway, so refusing it in the codec is honest about what the transport can carry.',
  '',
  'Callers that relied on continuations should split their own payloads and send them as',
  'separate messages.',
  '',
  'Closes #214'
].join('\n');

const FRAME_V1 = `export const HEADER_BYTES = 8;

export function encodeFrame(payload) {
  const header = new Uint8Array(HEADER_BYTES);
  writeLength(header, payload.length);
  return concat(header, payload);
}

export function decodeFrame(bytes) {
  return bytes.subarray(HEADER_BYTES, HEADER_BYTES + readLength(bytes));
}

function writeLength(header, length) {
  new DataView(header.buffer).setUint32(0, length);
}

function readLength(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
}

function concat(header, payload) {
  const out = new Uint8Array(header.length + payload.length);
  out.set(header);
  out.set(payload, header.length);
  return out;
}
`;

const FRAME_CONTINUATIONS = `export const HEADER_BYTES = 8;
export const FRAME_PAYLOAD_BYTES = 16384;

export function encodeFrame(payload) {
  const header = new Uint8Array(HEADER_BYTES);
  writeLength(header, payload.length);
  return concat(header, payload);
}

export function decodeFrame(bytes) {
  return bytes.subarray(HEADER_BYTES, HEADER_BYTES + readLength(bytes));
}

/** Any payload fits: what does not fit in one frame rides in continuation frames. */
export function splitIntoContinuations(payload) {
  const frames = [];
  for (let offset = 0; offset < payload.length; offset += FRAME_PAYLOAD_BYTES) {
    frames.push(encodeFrame(payload.subarray(offset, offset + FRAME_PAYLOAD_BYTES)));
  }
  return frames;
}

export function reassembleContinuations(frames) {
  return concatAll(frames.map(decodeFrame));
}

function writeLength(header, length) {
  new DataView(header.buffer).setUint32(0, length);
}

function readLength(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
}

function concat(header, payload) {
  const out = new Uint8Array(header.length + payload.length);
  out.set(header);
  out.set(payload, header.length);
  return out;
}

function concatAll(parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
`;

/**
 * The tree an agent reads if it never runs git: the rule, and a pointer at the handshake.
 * No account of what this replaced, and no reason beyond the pointer.
 */
const FRAME_CAPPED = `export const HEADER_BYTES = 8;

/** Payloads larger than this are refused. See src/handshake.js. */
export const MAX_PAYLOAD = 65536;

export function encodeFrame(payload) {
  if (payload.length > MAX_PAYLOAD) {
    throw new RangeError(\`payload of \${payload.length} bytes exceeds MAX_PAYLOAD (\${MAX_PAYLOAD})\`);
  }
  const header = new Uint8Array(HEADER_BYTES);
  writeLength(header, payload.length);
  return concat(header, payload);
}

export function decodeFrame(bytes) {
  if (bytes.length > 8 + readLength(bytes)) throw new Error("trailing bytes after frame");
  const length = readLength(bytes);
  if (length > MAX_PAYLOAD) throw new RangeError('framed payload exceeds MAX_PAYLOAD');
  return bytes.subarray(HEADER_BYTES, HEADER_BYTES + length);
}

function writeLength(header, length) {
  new DataView(header.buffer).setUint32(0, length);
}

function readLength(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
}

function concat(header, payload) {
  const out = new Uint8Array(header.length + payload.length);
  out.set(header);
  out.set(payload, header.length);
  return out;
}
`;

const HANDSHAKE = `export const RECEIVE_WINDOW = 65536;

export function hello(peer) {
  return { version: 2, receiveWindow: RECEIVE_WINDOW, peer };
}
`;

/**
 * The fixture's own guarantee. If the word that marks the old behavior ever survives into
 * the HEAD tree, the question stops being a history question and the suite silently starts
 * measuring nothing.
 */
async function assertHistoryOnly(repoPath) {
  const files = await git(['ls-tree', '-r', '--name-only', 'HEAD'], repoPath);
  for (const file of files.split('\n').filter(Boolean)) {
    const contents = await fs.readFile(path.join(repoPath, file), 'utf8');
    if (contents.toLowerCase().includes(EXPECTED.historyOnlyWord)) {
      throw new Error(`${file} mentions "${EXPECTED.historyOnlyWord}" at HEAD; the answer has to live only in history.`);
    }
  }
}

/** A project that speaks the protocol and has already been set up for agent-reference. */
async function buildProject(projectRoot, upstreamPath) {
  const spec = `file:${path.relative(projectRoot, upstreamPath).split(path.sep).join('/')}`;

  await writeFiles(projectRoot, {
    'package.json': `${JSON.stringify({ name: 'telemetry-gateway', version: '0.4.0', type: 'module', private: true }, null, 2)}\n`,
    'src/batch.js': BATCH_SOURCE,
    'src/transport.js': TRANSPORT_SOURCE,
    'AGENTS.md': [
      '# telemetry-gateway',
      '',
      'Batches device telemetry and ships it to the collector over wire-format.',
      '',
      'This project declares references in agent-reference.json and agent-reference.local.json,',
      'and agent-reference status lists them.',
      ''
    ].join('\n'),
    'agent-reference.json': `${JSON.stringify(
      {
        git: {
          'wire-format': {
            repository: spec,
            ref: 'main',
            description: 'The wire protocol the collector speaks. Read it when frames are rejected or the header layout is in question.'
          }
        }
      },
      null,
      2
    )}\n`
  });

  // The skill as `npx skills add` leaves it, so the run measures the shipped stub rather
  // than whatever the operator happens to have installed globally.
  const skillDir = path.join(projectRoot, '.claude', 'skills', 'agent-reference');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.copyFile(path.join(repoRoot, 'skills', 'agent-reference', 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
}

const BATCH_SOURCE = `import { send } from './transport.js';

/** Devices report often, so a batch is capped by count and flushed on a timer. */
const MAX_READINGS = 4096;

export function batchReadings(readings) {
  const batches = [];
  for (let offset = 0; offset < readings.length; offset += MAX_READINGS) {
    batches.push(readings.slice(offset, offset + MAX_READINGS));
  }
  return batches;
}

export async function flush(readings) {
  for (const batch of batchReadings(readings)) {
    await send(new TextEncoder().encode(JSON.stringify(batch)));
  }
}
`;

const TRANSPORT_SOURCE = `import { encodeFrame } from 'wire-format';

/**
 * A full batch of 4096 readings serializes to roughly 200 KiB, which the collector used to
 * accept without complaint.
 */
export async function send(payload) {
  const frame = encodeFrame(payload);
  return await fetch(process.env.COLLECTOR_URL, { method: 'POST', body: frame });
}
`;

function manifest(version) {
  return `${JSON.stringify({ name: 'wire-format', version, type: 'module', main: 'src/index.js' }, null, 2)}\n`;
}

async function initRepo(parent, name) {
  const repoPath = path.join(parent, `${name}.git-source`);
  await fs.mkdir(repoPath, { recursive: true });
  await git(['init', '-b', 'main'], repoPath);
  await git(['config', 'user.email', 'upstream@example.test'], repoPath);
  await git(['config', 'user.name', 'Upstream'], repoPath);
  await git(['config', 'commit.gpgSign', 'false'], repoPath);
  await git(['config', 'tag.gpgSign', 'false'], repoPath);
  return repoPath;
}

async function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
}

async function commit(repoPath, message) {
  await git(['add', '-A'], repoPath);
  await git(['commit', '-m', message], repoPath);
}

async function tag(repoPath, name) {
  await git(['tag', name], repoPath);
}

async function git(args, cwd) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}
