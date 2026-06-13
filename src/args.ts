import type { CliOptions } from './types.ts';

const COMMANDS = new Set(['list', 'clone', 'init', 'help', 'version']);

export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: 'list',
    projectPath: null,
    packages: [],
    all: false,
    allImporters: false,
    json: false,
    nonInteractive: false,
    metadataFile: null,
    registry: null,
    bareStoreDir: null,
    worktreeRoot: null,
    configFile: null,
    force: false
  };

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      options.command = 'help';
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      options.command = 'version';
      continue;
    }
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--all-importers') {
      options.allImporters = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--non-interactive') {
      options.nonInteractive = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--package' || arg === '-p') {
      options.packages.push(readFlagValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--package=')) {
      options.packages.push(arg.slice('--package='.length));
      continue;
    }
    if (arg === '--metadata-file') {
      options.metadataFile = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--registry') {
      options.registry = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--cache-dir' || arg === '--store-dir') {
      options.bareStoreDir = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--worktree-dir') {
      options.worktreeRoot = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--config') {
      options.configFile = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional[0] && COMMANDS.has(positional[0])) {
    options.command = positional[0] as CliOptions['command'];
    options.projectPath = positional[1] ?? null;
  } else {
    options.projectPath = positional[0] ?? null;
  }

  return options;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
