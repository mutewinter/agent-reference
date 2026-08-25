import { CLI_COMMANDS } from './args.ts';
import type {
  AgentReferenceConfig,
  AgentReferenceKind,
  ConfiguredReference,
  ReferenceSelectionOptions,
  ReferenceSet,
  ReferenceSetMember,
} from './types.ts';

const KINDS: AgentReferenceKind[] = ['package', 'path', 'git'];

export function configuredReferences(
  config: AgentReferenceConfig | undefined,
): ConfiguredReference[] {
  if (!config) return [];
  return [...config.packages, ...config.paths, ...config.git];
}

/**
 * Sets resolve from containment: members are declared inside the set, and each parsed
 * reference carries the names of the sets that declared it. The same source listed in two
 * sets is one reference with two labels.
 */
export function resolveSets(config: AgentReferenceConfig | undefined): ReferenceSet[] {
  if (!config) return [];
  const references = configuredReferences(config);

  return config.sets.map((set) => ({
    name: set.name,
    description: set.description,
    members: references
      .filter((reference) => reference.sets.includes(set.name))
      .map((reference) => ({ kind: reference.kind, name: reference.name })),
  }));
}

/** A selector the caller wrote that nothing in the config answered to. */
export interface UnmatchedSelector {
  /** How the message names it: `reference "zod"`. */
  label: string;
  /** The raw word, for the hint that offers a command reading of it. */
  input: string;
}

export interface ReferenceSelection {
  matches: (kind: AgentReferenceKind, name: string) => boolean;
  /**
   * Which selectors nothing answered to. Only meaningful once every candidate has been
   * offered to `matches`, because that is what records the hits.
   */
  unmatched: () => UnmatchedSelector[];
}

/**
 * One namespace, so one selector. A name is a reference or a set, and a set stands for its
 * members; nothing has to be qualified, because a name means exactly one thing in a config.
 */
export function selectionFilter(
  config: AgentReferenceConfig | undefined,
  options: ReferenceSelectionOptions,
): ReferenceSelection | null {
  const inputs = splitSelectors(options.references);
  if (inputs.length === 0) return null;

  // Per selector rather than one flat set: a run naming several references used to report
  // success as long as any one of them hit, so a typo was dropped in silence and the
  // reference it meant was never materialized.
  const selectors: Array<UnmatchedSelector & { keys: Set<string> }> = [];
  const sets = resolveSets(config);
  const references = configuredReferences(config);

  for (const input of inputs) {
    selectors.push({
      label: `reference "${input}"`,
      input,
      keys: selectorKeys(input, sets, references),
    });
  }

  const hits = new Set<string>();

  return {
    matches(kind, name) {
      const key = memberKey(kind, name);
      if (!selectors.some((selector) => selector.keys.has(key))) return false;
      hits.add(key);
      return true;
    },
    unmatched: () =>
      selectors
        .filter((selector) => ![...selector.keys].some((key) => hits.has(key)))
        .map(({ label, input }) => ({ label, input })),
  };
}

/**
 * What one selector stands for. An exact name wins outright; a set expands to its members;
 * anything left over is matched against descriptions, so the phrasing a user says in chat
 * ("the documentation sources") works at the CLI without being the reference's name.
 */
function selectorKeys(
  input: string,
  sets: ReferenceSet[],
  references: ConfiguredReference[],
): Set<string> {
  const set = sets.find((candidate) => candidate.name === input);
  if (set) return new Set(set.members.map((member) => memberKey(member.kind, member.name)));

  if (references.some((reference) => reference.name === input)) {
    return new Set(KINDS.map((kind) => memberKey(kind, input)));
  }

  const described = matchDescription(input, sets, references);
  if (described) return described;

  // Nothing named it and nothing described it. The keys are still generated so the caller
  // reports which selector missed rather than silently narrowing to nothing.
  return new Set(KINDS.map((kind) => memberKey(kind, input)));
}

function matchDescription(
  input: string,
  sets: ReferenceSet[],
  references: ConfiguredReference[],
): Set<string> | null {
  const needle = input.toLowerCase();
  const setHits = sets.filter((set) => (set.description ?? '').toLowerCase().includes(needle));
  const referenceHits = references.filter((reference) =>
    (reference.description ?? '').toLowerCase().includes(needle),
  );

  if (setHits.length === 1 && referenceHits.length === 0) {
    return new Set(setHits[0]!.members.map((member) => memberKey(member.kind, member.name)));
  }
  if (referenceHits.length === 1 && setHits.length === 0) {
    const hit = referenceHits[0]!;
    return new Set([memberKey(hit.kind, hit.name)]);
  }
  return null;
}

/** Says which selector missed and what could have been written instead. */
export function missingSelectionMessage(
  missing: UnmatchedSelector[],
  config: AgentReferenceConfig | undefined,
): string {
  return [
    `Nothing matched ${missing.map((selector) => selector.label).join(', ')}.`,
    knownSelectorsMessage(config),
    unknownCommandHint(missing.map((selector) => selector.input)),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Names an agent can actually pass, so a miss is one step from a hit. */
export function knownSelectorsMessage(
  config: AgentReferenceConfig | undefined,
  installedNames: string[] = [],
): string {
  const references = configuredReferences(config).map((reference) => reference.name);
  const sets = resolveSets(config);
  const extraPackages = installedNames.filter((name) => !references.includes(name));

  const parts = [`Known references: ${[...references, ...extraPackages].join(', ') || 'none'}.`];
  if (sets.length > 0) parts.push(knownSetsMessage(sets));

  return parts.join(' ');
}

/**
 * The shape a newer instruction takes when it reaches an older CLI: a command this build
 * does not have is not rejected, it falls through to the default command and is read as a
 * reference name, so the failure blames the config. Nothing local can prove that is what
 * happened, so this offers the other reading rather than asserting it.
 */
export function unknownCommandHint(selectors: string[]): string | null {
  const words = selectors.filter(
    (value) => /^[a-z][a-z-]*$/.test(value) && !CLI_COMMANDS.includes(value),
  );
  if (words.length === 0) return null;

  return `If ${words.map((word) => `"${word}"`).join(' or ')} was meant as a command, this build does not have it; it has ${CLI_COMMANDS.join(', ')}. Instructions naming a command this CLI lacks are newer than the CLI.`;
}

function knownSetsMessage(sets: ReferenceSet[]): string {
  return `Known sets: ${sets.map((set) => set.name).join(', ') || 'none'}.`;
}

export function splitSelectors(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function memberKey(kind: AgentReferenceKind, name: string): string {
  return `${kind}:${name}`;
}

export function setMemberKey(member: ReferenceSetMember): string {
  return memberKey(member.kind, member.name);
}
