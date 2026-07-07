export interface CliOptions {
  command: 'list' | 'clone' | 'init' | 'status' | 'help' | 'version';
  projectPath: string | null;
  packages: string[];
  all: boolean;
  allImporters: boolean;
  json: boolean;
  nonInteractive: boolean;
  metadataFile: string | null;
  registry: string | null;
  storeDir: string | null;
  worktreeRoot: string | null;
  configFile: string | null;
  force: boolean;
}

const COMMANDS = new Set(['list', 'clone', 'init', 'status', 'help', 'version']);

const BOOLEAN_FLAGS: Record<string, 'all' | 'allImporters' | 'json' | 'nonInteractive' | 'force'> = {
  '--all': 'all',
  '--all-importers': 'allImporters',
  '--json': 'json',
  '--non-interactive': 'nonInteractive',
  '--force': 'force'
};

const VALUE_FLAGS: Record<string, 'metadataFile' | 'registry' | 'storeDir' | 'worktreeRoot' | 'configFile'> = {
  '--metadata-file': 'metadataFile',
  '--registry': 'registry',
  '--cache-dir': 'storeDir',
  '--store-dir': 'storeDir',
  '--worktree-dir': 'worktreeRoot',
  '--config': 'configFile'
};

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
    storeDir: null,
    worktreeRoot: null,
    configFile: null,
    force: false
  };

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    const booleanFlag = BOOLEAN_FLAGS[arg];
    const valueFlag = VALUE_FLAGS[arg];

    if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg === '--version' || arg === '-v') {
      options.command = 'version';
    } else if (booleanFlag) {
      options[booleanFlag] = true;
    } else if (arg === '--package' || arg === '-p') {
      options.packages.push(readFlagValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--package=')) {
      options.packages.push(arg.slice('--package='.length));
    } else if (valueFlag) {
      options[valueFlag] = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
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
