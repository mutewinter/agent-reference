import { setLabel } from './config.ts';
import type {
  AgentReferenceConfig,
  AgentReferenceKind,
  ConfiguredReference,
  ReferenceSelectionOptions,
  ReferenceSet,
  ReferenceSetMember
} from './types.ts';

const KINDS: AgentReferenceKind[] = ['package', 'folder', 'git'];

export function configuredReferences(config: AgentReferenceConfig | undefined): ConfiguredReference[] {
  if (!config) return [];
  return [...config.packages, ...config.folders, ...config.git];
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
      .map((reference) => ({ kind: reference.kind, name: reference.name }))
  }));
}

export function selectionFilter(
  config: AgentReferenceConfig | undefined,
  options: ReferenceSelectionOptions
): ((kind: AgentReferenceKind, name: string) => boolean) | null {
  const setInputs = splitSelectors(options.sets);
  const referenceSelectors = splitSelectors(options.references);
  if (setInputs.length === 0 && referenceSelectors.length === 0) return null;

  const allowed = new Set<string>();
  const sets = resolveSets(config);

  for (const input of setInputs) {
    for (const member of matchSet(input, sets).members) {
      allowed.add(memberKey(member.kind, member.name));
    }
  }

  for (const selector of referenceSelectors) {
    const { kind, name } = parseSelector(selector);
    for (const candidate of kind ? [kind] : KINDS) {
      allowed.add(memberKey(candidate, name));
    }
  }

  return (kind, name) => allowed.has(memberKey(kind, name));
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
      : sets.filter((set) => `${set.name ?? ''} ${set.description}`.toLowerCase().includes(input.toLowerCase()));

  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new Error(`No set matches "${input}". ${knownSetsMessage(sets)}`);
  }
  throw new Error(
    `"${input}" matches ${candidates.length} sets: ${candidates.map((set) => `"${set.description}"`).join(', ')}. Be more specific.`
  );
}

export function describeSelection(options: ReferenceSelectionOptions): string {
  const parts = [
    ...splitSelectors(options.sets).map((input) => `set "${input}"`),
    ...splitSelectors(options.references).map((name) => `reference "${name}"`)
  ];
  return parts.join(', ');
}

/** Names an agent can actually pass, so a miss is one step from a hit. */
export function knownSelectorsMessage(
  config: AgentReferenceConfig | undefined,
  installedNames: string[] = []
): string {
  const references = referenceLabels(configuredReferences(config));
  const extraPackages = installedNames.filter((name) => !references.includes(`package:${name}`));

  const parts = [
    `Known references: ${[...references, ...extraPackages.map((name) => `package:${name}`)].join(', ') || 'none'}.`
  ];
  const sets = resolveSets(config);
  if (sets.length > 0) parts.push(knownSetsMessage(sets));

  return parts.join(' ');
}

function knownSetsMessage(sets: ReferenceSet[]): string {
  return `Known sets: ${sets.map((set) => (set.name ? `${set.name} ("${set.description}")` : `"${set.description}"`)).join(', ') || 'none'}.`;
}

export function splitSelectors(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
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
