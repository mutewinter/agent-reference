import { CLI_COMMANDS } from './args.ts';
import { setLabel } from './config.ts';
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
 * reference carries the labels of the sets that declared it. The same reference listed in
 * two sets is one reference with two labels.
 */
export function resolveSets(config: AgentReferenceConfig | undefined): ReferenceSet[] {
  if (!config) return [];
  const references = configuredReferences(config);

  return config.sets.map((set) => ({
    name: set.name,
    description: set.description,
    members: references
      .filter((reference) => reference.sets.includes(setLabel(set)))
      .map((reference) => ({ kind: reference.kind, name: reference.name })),
  }));
}

/** A selector the caller wrote that nothing in the config answered to. */
export interface UnmatchedSelector {
  /** How the message names it: `reference "zod"` or `set "engines"`. */
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

export function selectionFilter(
  config: AgentReferenceConfig | undefined,
  options: ReferenceSelectionOptions,
): ReferenceSelection | null {
  const setInputs = splitSelectors(options.sets);
  const referenceSelectors = splitSelectors(options.references);
  if (setInputs.length === 0 && referenceSelectors.length === 0) return null;

  // Per selector rather than one flat set: a run naming several references used to report
  // success as long as any one of them hit, so a typo was dropped in silence and the
  // reference it meant was never materialized.
  const selectors: Array<UnmatchedSelector & { keys: Set<string> }> = [];
  const sets = resolveSets(config);

  for (const input of setInputs) {
    const keys = new Set(
      matchSet(input, sets).members.map((member) => memberKey(member.kind, member.name)),
    );
    selectors.push({ label: `set "${input}"`, input, keys });
  }

  for (const input of referenceSelectors) {
    const { kind, name } = parseSelector(input);
    const keys = new Set((kind ? [kind] : KINDS).map((candidate) => memberKey(candidate, name)));
    selectors.push({ label: `reference "${input}"`, input, keys });
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

/**
 * A set is addressed the way a human would say it: its short name, its exact description,
 * or any substring of either that matches exactly one set ("engines" finds "Chess engines
 * we study upstream").
 */
function matchSet(input: string, sets: ReferenceSet[]): ReferenceSet {
  const exact = sets.filter((set) => set.name === input || set.description === input);
  const candidates =
    exact.length > 0
      ? exact
      : sets.filter((set) =>
          `${set.name ?? ''} ${set.description}`.toLowerCase().includes(input.toLowerCase()),
        );

  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new Error(`No set matches "${input}". ${knownSetsMessage(sets)}`);
  }
  throw new Error(
    `"${input}" matches ${candidates.length} sets: ${candidates.map((set) => `"${set.description}"`).join(', ')}. Be more specific.`,
  );
}

/** Names an agent can actually pass, so a miss is one step from a hit. */
export function knownSelectorsMessage(
  config: AgentReferenceConfig | undefined,
  installedNames: string[] = [],
): string {
  const references = referenceLabels(configuredReferences(config));
  const extraPackages = installedNames.filter((name) => !references.includes(`package:${name}`));

  const parts = [
    `Known references: ${[...references, ...extraPackages.map((name) => `package:${name}`)].join(', ') || 'none'}.`,
  ];
  const sets = resolveSets(config);
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
  return `Known sets: ${sets.map((set) => (set.name ? `${set.name} ("${set.description}")` : `"${set.description}"`)).join(', ') || 'none'}.`;
}

export function splitSelectors(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function parseSelector(selector: string): { kind: AgentReferenceKind | null; name: string } {
  const separator = selector.indexOf(':');
  if (separator === -1) return { kind: null, name: selector };

  const prefix = selector.slice(0, separator) as AgentReferenceKind;
  if (!KINDS.includes(prefix)) return { kind: null, name: selector };
  return { kind: prefix, name: selector.slice(separator + 1) };
}

function referenceLabels(references: ConfiguredReference[]): string[] {
  return references.map((reference) => `${reference.kind}:${reference.name}`);
}

function memberKey(kind: AgentReferenceKind, name: string): string {
  return `${kind}:${name}`;
}

export function setMemberKey(member: ReferenceSetMember): string {
  return memberKey(member.kind, member.name);
}
