export interface CliOptions {
  command: 'list' | 'clone' | 'init' | 'status' | 'validate' | 'schema' | 'help' | 'version';
  projectPath: string | null;
  packages: string[];
  groups: string[];
  references: string[];
  all: boolean;
  allImporters: boolean;
  json: boolean;
  nonInteractive: boolean;
  metadataFile: string | null;
  registry: string | null;
  storeDir: string | null;
  worktreeRoot: string | null;
  configFile: string | null;
  gitBin: string | null;
  force: boolean;
}

const COMMANDS = new Set(['list', 'clone', 'init', 'status', 'validate', 'schema', 'help', 'version']);

const BOOLEAN_FLAGS: Record<string, 'all' | 'allImporters' | 'json' | 'nonInteractive' | 'force'> = {
  '--all': 'all',
  '--all-importers': 'allImporters',
  '--json': 'json',
  '--non-interactive': 'nonInteractive',
  '--force': 'force'
};

const LIST_FLAGS: Record<string, 'packages' | 'groups' | 'references'> = {
  '--package': 'packages',
  '-p': 'packages',
  '--group': 'groups',
  '-g': 'groups',
  '--reference': 'references'
};

const VALUE_FLAGS: Record<string, 'metadataFile' | 'registry' | 'storeDir' | 'worktreeRoot' | 'configFile' | 'gitBin'> = {
  '--metadata-file': 'metadataFile',
  '--registry': 'registry',
  '--cache-dir': 'storeDir',
  '--store-dir': 'storeDir',
  '--worktree-dir': 'worktreeRoot',
  '--config': 'configFile',
  '--git-bin': 'gitBin'
};

export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: 'list',
    projectPath: null,
    packages: [],
    groups: [],
    references: [],
    all: false,
    allImporters: false,
    json: false,
    nonInteractive: false,
    metadataFile: null,
    registry: null,
    storeDir: null,
    worktreeRoot: null,
    configFile: null,
    gitBin: null,
    force: false
  };

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inlineValue = equals === -1 ? null : arg.slice(equals + 1);

    const booleanFlag = BOOLEAN_FLAGS[flag];
    const listFlag = LIST_FLAGS[flag];
    const valueFlag = VALUE_FLAGS[flag];

    if (flag === '--help' || flag === '-h') {
      options.command = 'help';
    } else if (flag === '--version' || flag === '-v') {
      options.command = 'version';
    } else if (booleanFlag) {
      options[booleanFlag] = true;
    } else if (listFlag) {
      options[listFlag].push(inlineValue ?? readFlagValue(argv, index, flag));
      if (inlineValue === null) index += 1;
    } else if (valueFlag) {
      options[valueFlag] = inlineValue ?? readFlagValue(argv, index, flag);
      if (inlineValue === null) index += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${flag}`);
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
