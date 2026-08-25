import path from 'node:path';

import { displayPath } from './fs-utils.ts';
import type { InitSurvey } from './init.ts';

export interface InitFormatOptions {
  /** ANSI color. Callers decide from the stream: a TTY without NO_COLOR set. */
  color: boolean;
  /** Shorten home paths to `~/...`. Only for humans; piped output keeps literal paths. */
  tilde: boolean;
}

const OPENING = 'init reads and prints. It writes nothing; you do the writing.';

/**
 * The brief is a prompt this tool hands to an agent, so only values `init` computed itself
 * are interpolated into it: paths it stat'd, filenames from a fixed list, and counts.
 * Nothing read out of a config file or a transcript is ever rendered here, or a checked-in
 * file would be able to write instructions to a future agent in this tool's voice.
 */
export function briefSteps(survey: InitSurvey): string[] {
  return [
    skillStep(survey),
    miningStep(survey),
    proposeStep(),
    writeStep(survey),
    showStep(),
    instructionStep(survey),
  ];
}

export function formatInitBrief(survey: InitSurvey, options: InitFormatOptions): string {
  const show = (value: string): string => displayPath(value, { tilde: options.tilde });
  const sections = [`${OPENING}\n`, `${surveySection(survey, options).join('\n')}\n`];

  if (survey.transcriptStores.length > 0) {
    const rows = survey.transcriptStores.map((store) => [
      store.agent,
      show(store.path),
      `${store.sessions} ${store.sessions === 1 ? 'session' : 'sessions'}, ${store.format}`,
    ]);
    sections.push(
      `${[dim('transcript stores on this machine', options.color), ...columns(rows, 2)].join('\n')}\n`,
    );
  }

  const note = standingReferencesNote(survey);
  const steps = briefSteps(survey).map((step, index) => indentStep(index + 1, step));
  sections.push(
    [dim('brief for the agent', options.color), ...(note ? [`  ${note}`, ''] : []), ...steps].join(
      '\n',
    ),
  );

  return `${sections.join('\n')}\n`;
}

function surveySection(survey: InitSurvey, options: InitFormatOptions): string[] {
  const show = (value: string): string => displayPath(value, { tilde: options.tilde });
  const rows: string[][] = [
    ['project', show(survey.projectRoot)],
    ['config', configSummary(survey)],
    ['lockfile', lockfileSummary(survey)],
    ['gitignore', gitignoreSummary(survey)],
    ['instructions', instructionSummary(survey)],
    ['skill', skillSummary(survey, show)],
  ];

  return [dim('this project', options.color), ...columns(rows, 2)];
}

function configSummary(survey: InitSurvey): string {
  const files = [survey.configPath, survey.localConfigPath].filter(
    (file): file is string => file !== null,
  );
  if (files.length === 0) return 'none';

  const names = files.map((file) => path.basename(file)).join(', ');
  const count = survey.referenceCount;
  return `${names}, ${count} ${count === 1 ? 'reference' : 'references'}`;
}

function lockfileSummary(survey: InitSurvey): string {
  if (!survey.lockfilePath) return 'none; path and git references work without one';
  const count = survey.dependencyCount;
  return `${path.basename(survey.lockfilePath)}, ${count} ${count === 1 ? 'dependency' : 'dependencies'}`;
}

function gitignoreSummary(survey: InitSurvey): string {
  if (!survey.gitRepository) return 'not a git repository';
  // Tracked outranks ignored: a committed file is the state .gitignore cannot fix.
  if (survey.localConfigTracked) return 'agent-reference.local.json COMMITTED; it needs untracking';
  return survey.localConfigIgnored
    ? 'agent-reference.local.json ignored'
    : 'agent-reference.local.json NOT ignored';
}

function instructionSummary(survey: InitSurvey): string {
  if (survey.instructionFiles.length === 0) return 'none found';
  return survey.instructionFiles
    .map((file) => (file.linkTarget ? `${file.file} -> ${file.linkTarget}` : file.file))
    .join(', ');
}

function skillSummary(survey: InitSurvey, show: (value: string) => string): string {
  if (survey.skill.installed.length > 0) return survey.skill.installed.map(show).join(', ');
  return 'not installed; this project cannot discover the tool on its own';
}

function standingReferencesNote(survey: InitSurvey): string | null {
  if (survey.referenceCount === 0) return null;
  const count = survey.referenceCount;
  return `This project already declares ${count} ${count === 1 ? 'reference' : 'references'}. Add to them; never drop one to make status read clean.`;
}

function skillStep(survey: InitSurvey): string {
  if (survey.skill.installed.length > 0) {
    return 'The agent-reference skill is already installed here. Nothing to do.';
  }

  const [machineWide, ...inProject] = survey.skill.candidates;
  const lines = [
    'Install the skill, so a later session in this project finds the tool without being told.',
    'Nothing below this step matters without it: a config no skill points at is never opened.',
    'Ask the user which of these they want, then install it there:',
    `  every project on this machine:  ${machineWide ?? ''}`,
    `  this project only, committed:   ${inProject[0] ?? ''}`,
    // Installed rather than copied, wherever it can be: the installer records where the
    // file came from, so a later `skills update` refreshes it. A copy has no such record,
    // and the skill is the artifact that changes most.
    'Install it with: npx skills add mutewinter/agent-reference',
  ];

  if (survey.skill.source) {
    lines.push(`With no network, copy ${survey.skill.source} into the directory instead.`);
  }
  lines.push('Either way that file is a stub. Run `agent-reference guide` for the rest of it.');

  return lines.join('\n');
}

function miningStep(survey: InitSurvey): string {
  if (survey.transcriptStores.length === 0) {
    return [
      `No transcript store turned up under ${survey.home}`,
      'Check whether the agent you are running keeps one elsewhere. Failing that, ask the user which',
      'repositories, folders, and documents they point agents at from this project, then go to step 3.',
    ].join('\n');
  }

  return [
    'Ask the user before this step. It reads their session history, so it is theirs to authorize,',
    'and they may prefer to just tell you which references matter. With a yes, mine the stores',
    'listed above and only those.',
    'Count and rank in the shell: what you need out of a session is a tally, not its text.',
    'Look at what the user wrote rather than what the agent replied, for absolute and ~/ paths, cd',
    'targets outside this project, owner/repo mentions, and git URLs.',
    'Rank by how many distinct sessions name a target, not by how often it appears within any one.',
    'Rank a target up when a session shows the agent guessing at where it lives, or reaching it in',
    'more than one attempt. An ambiguous name is exactly what a declared reference resolves.',
  ].join('\n');
}

function proposeStep(): string {
  return [
    'Propose 5 to 10, no more. This is an index an agent scans, not an inventory; a long list costs',
    'every later session tokens and gets skimmed instead of read.',
    'One session naming a target is not a pattern. Leave singletons out unless the user asks for one.',
    'Give each one a description saying when it is worth opening, phrased as a trigger condition',
    'rather than a summary of what it holds.',
    'Everything you propose goes in agent-reference.local.json first, whatever the path looks like,',
    "because it came out of the user's own session history. Ask before promoting any of it to the",
    'committed agent-reference.json.',
    'Do not propose paths inside this project unless the mining shows the user pointing agents at',
    'that subtree again and again. An in-repo path earns a reference when the description carries',
    'the value, not the path.',
  ].join('\n');
}

function writeStep(survey: InitSurvey): string {
  const lines = [
    'Write the JSON yourself; there are no commands that edit config. agent-reference schema prints',
    'the format.',
  ];

  if (survey.localConfigTracked) {
    lines.push(
      'agent-reference.local.json is committed. Adding it to .gitignore will not help, because git',
      'ignores nothing it already tracks. Run: git rm --cached agent-reference.local.json, list it in',
      '.gitignore, then commit. Tell the user that what it already held is in the history regardless.',
    );
  } else if (survey.gitRepository && !survey.localConfigIgnored) {
    lines.push('Add agent-reference.local.json to .gitignore; it is not ignored yet.');
  }
  lines.push('Then run: agent-reference validate');

  return lines.join('\n');
}

function showStep(): string {
  return [
    'Run: agent-reference status',
    'Quote that output verbatim in your reply, not a summary of it and not a claim that it ran.',
    'The user may never see a tool result, and this is the point of the exercise: they see',
    'exactly what their agent will see from here on. Then ask which entries belong in the',
    'shared file.',
  ].join('\n');
}

function instructionStep(survey: InitSurvey): string {
  if (survey.editTargets.length === 0) {
    return [
      'No agent instruction file here. Ask the user which file their agent reads, or create AGENTS.md',
      'holding one sentence: this project declares references in agent-reference.json and',
      'agent-reference.local.json, and agent-reference status lists them.',
    ].join('\n');
  }

  const written = new Set(
    survey.instructionFiles
      .filter((file) => file.mentionsAgentReference)
      .map((file) => file.linkTarget ?? file.file),
  );
  const unwritten = survey.editTargets.filter((target) => !written.has(target));

  if (unwritten.length === 0) {
    return `${survey.editTargets.join(', ')} already mentions agent-reference. Leave it alone.`;
  }

  const lines = [
    `Add one sentence to ${unwritten.join(', ')}: this project declares references in`,
    'agent-reference.json and agent-reference.local.json, and agent-reference status lists them.',
    'One sentence, not a section. It is what finds the tool in a session where the skill never loads.',
  ];

  for (const link of survey.instructionFiles.filter((file) => file.linkTarget)) {
    lines.push(
      `${link.file} is a symlink to ${link.linkTarget}; edit the target once, not both names.`,
    );
  }

  return lines.join('\n');
}

/** Steps are multi-line, so continuation lines hang under the text rather than under the number. */
function indentStep(step: number, text: string): string {
  const [first, ...rest] = text.split('\n');
  const label = `  ${step}. `;
  return [`${label}${first}`, ...rest.map((line) => `${' '.repeat(label.length)}${line}`)].join(
    '\n',
  );
}

function columns(rows: string[][], indent: number): string[] {
  const width = Math.max(...rows.map((row) => row[0]?.length ?? 0));
  const pad = ' '.repeat(indent);
  return rows.map((row) => `${pad}${(row[0] ?? '').padEnd(width)}  ${row.slice(1).join('  ')}`);
}

function dim(text: string, enabled: boolean): string {
  return enabled ? `\u001b[2m${text}\u001b[0m` : text;
}
