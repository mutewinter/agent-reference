import path from 'node:path';

import { createDependencyEntry } from './lock-utils.ts';
import { resolveRegistryVersion } from './registry-version.ts';
import type {
  DepCloneConfig,
  DepCloneDependency,
  DependencyType,
  MetadataResolverOptions,
  ProjectContext
} from './types.ts';

const CONFIG_DEPENDENCY_SECTIONS: DependencyType[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies'
];

export async function resolveConfigDependencies(
  config: DepCloneConfig | undefined,
  context: ProjectContext,
  options: MetadataResolverOptions & { configPath?: string } = {}
): Promise<DepCloneDependency[]> {
  if (!config) return [];

  const entries: DepCloneDependency[] = [];
  const configPath = options.configPath ?? path.join(context.projectRoot, 'depclone.config.json');

  for (const dependencyType of CONFIG_DEPENDENCY_SECTIONS) {
    const dependencies = config[dependencyType] ?? {};
    for (const [name, specifier] of Object.entries(dependencies)) {
      const version = await resolveRegistryVersion(name, specifier, options);
      entries.push(createDependencyEntry({
        name,
        version,
        specifier,
        dependencyType,
        packageManager: 'config',
        importer: 'depclone.config.json',
        projectRoot: context.projectRoot,
        packageJsonPath: configPath,
        lockfilePath: context.lockfilePath
      }));
    }
  }

  return entries;
}
