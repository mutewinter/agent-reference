import type {
  AgentReferenceConfig,
  AgentReferenceKind,
  ConfiguredReference,
  ReferenceGroup,
  ReferenceGroupMember,
  ReferenceSelectionOptions
} from './types.ts';

const KINDS: AgentReferenceKind[] = ['package', 'folder', 'git'];

export function configuredReferences(config: AgentReferenceConfig | undefined): ConfiguredReference[] {
  if (!config) return [];
  return [...config.packages, ...config.folders, ...config.git];
}

/**
 * Group membership can be declared on a reference (`groups: ["docs"]`) or on the group
 * (`groups.docs.references`). Both are unioned here so callers only ever see resolved members.
 */
export function resolveReferenceGroups(config: AgentReferenceConfig | undefined): ReferenceGroup[] {
  if (!config) return [];

  const references = configuredReferences(config);
  const groups = new Map<string, ReferenceGroup>();
  const groupFor = (name: string): ReferenceGroup => {
    const existing = groups.get(name);
    if (existing) return existing;
    const created: ReferenceGroup = { name, description: null, members: [] };
    groups.set(name, created);
    return created;
  };

  for (const group of config.groups) {
    groupFor(group.name).description = group.description;
  }

  for (const reference of references) {
    for (const name of reference.groups) {
      addMember(groupFor(name), reference);
    }
  }

  for (const group of config.groups) {
    for (const selector of group.references) {
      const matched = matchConfiguredReferences(references, selector);
      if (matched.length === 0) {
        throw new Error(
          `groups.${group.name}.references lists "${selector}", which is not a configured reference. ` +
            `Known references: ${referenceLabels(references).join(', ') || 'none'}.`
        );
      }
      for (const reference of matched) {
        addMember(groupFor(group.name), reference);
      }
    }
  }

  return [...groups.values()];
}

export function selectionFilter(
  config: AgentReferenceConfig | undefined,
  options: ReferenceSelectionOptions
): ((kind: AgentReferenceKind, name: string) => boolean) | null {
  const groupNames = splitSelectors(options.groups);
  const referenceSelectors = splitSelectors(options.references);
  if (groupNames.length === 0 && referenceSelectors.length === 0) return null;

  const allowed = new Set<string>();
  const groups = resolveReferenceGroups(config);

  for (const name of groupNames) {
    const group = groups.find((candidate) => candidate.name === name);
    if (!group) {
      throw new Error(
        `Unknown group "${name}". Known groups: ${groups.map((candidate) => candidate.name).join(', ') || 'none'}.`
      );
    }
    for (const member of group.members) {
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

export function describeSelection(options: ReferenceSelectionOptions): string {
  const parts = [
    ...splitSelectors(options.groups).map((name) => `group "${name}"`),
    ...splitSelectors(options.references).map((name) => `reference "${name}"`)
  ];
  return parts.join(', ');
}

export function splitSelectors(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function matchConfiguredReferences(references: ConfiguredReference[], selector: string): ConfiguredReference[] {
  const { kind, name } = parseSelector(selector);
  return references.filter((reference) => reference.name === name && (!kind || reference.kind === kind));
}

function parseSelector(selector: string): { kind: AgentReferenceKind | null; name: string } {
  const separator = selector.indexOf(':');
  if (separator === -1) return { kind: null, name: selector };

  const prefix = selector.slice(0, separator) as AgentReferenceKind;
  if (!KINDS.includes(prefix)) return { kind: null, name: selector };
  return { kind: prefix, name: selector.slice(separator + 1) };
}

function addMember(group: ReferenceGroup, reference: ConfiguredReference): void {
  if (group.members.some((member) => member.kind === reference.kind && member.name === reference.name)) return;
  group.members.push({ kind: reference.kind, name: reference.name });
}

function referenceLabels(references: ConfiguredReference[]): string[] {
  return references.map((reference) => `${reference.kind}:${reference.name}`);
}

function memberKey(kind: AgentReferenceKind, name: string): string {
  return `${kind}:${name}`;
}

export function groupMemberKey(member: ReferenceGroupMember): string {
  return memberKey(member.kind, member.name);
}
