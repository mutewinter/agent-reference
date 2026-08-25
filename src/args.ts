export type CliCommand =
  | 'status'
  | 'get'
  | 'versions'
  | 'clone'
  | 'init'
  | 'validate'
  | 'guide'
  | 'schema'
  | 'store'
  | 'help'
  | 'version';

export interface CliOptions {
  command: CliCommand;
  /** Reference names, or one project directory / package.json path. */
  positionals: string[];
  json: boolean;
  prune: boolean;
  days: number | null;
  /** `--help` after a command, which asks about that command rather than running it. */
  help: boolean;
  /** The command `--help` was asked about, when one was named. */
  helpTopic: CliCommand | null;
}

/** Every verb this build answers to. Ordered as the help lists them. */
export const CLI_COMMANDS: readonly string[] = [
  'get',
  'versions',
  'status',
  'clone',
  'init',
  'validate',
  'guide',
  'schema',
  'store',
  'help',
  'version',
];

const COMMANDS = new Set<string>(CLI_COMMANDS);
const VALID_OPTIONS = '--json, --prune, --days <n>';

export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: 'status',
    positionals: [],
    json: false,
    prune: false,
    days: null,
    help: false,
    helpTopic: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inlineValue = equals === -1 ? null : arg.slice(equals + 1);

    if (flag === '--help' || flag === '-h') {
      options.help = true;
    } else if (flag === '--version' || flag === '-v') {
      options.command = 'version';
    } else if (flag === '--json') {
      options.json = true;
    } else if (flag === '--prune') {
      options.prune = true;
    } else if (flag === '--days') {
      const value = Number(flagValue(argv, index, flag, inlineValue));
      if (!Number.isFinite(value) || value < 0)
        throw new Error('--days requires a non-negative number');
      options.days = value;
      if (inlineValue === null) index += 1;
    } else if (flag === '--non-interactive') {
      // Always true now. Accepted because agents type it by convention, and erroring on a
      // flag that only restates the default would cost them a turn for nothing.
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${flag}. Valid options are ${VALID_OPTIONS}.`);
    } else {
      options.positionals.push(arg);
    }
  }

  const [first, ...rest] = options.positionals;
  const named = Boolean(first && COMMANDS.has(first));
  if (named) {
    options.command = first as CliCommand;
    options.positionals = rest;
  }

  // Asked last, so it wins over the command word that precedes it. `clone --help` used to
  // run the clone: the positional overwrote the help request, and a flag that asks a
  // question performed a fetch instead of answering it. The topic is only the word that was
  // actually typed, never the command `status` defaults to.
  if (options.help) {
    if (named && options.command !== 'help') options.helpTopic = options.command;
    options.command = 'help';
  }

  return options;
}

/**
 * The value for a flag written either way. An empty `--days=` read as `Number('')`, which
 * is 0 and finite, so a typo or an unset shell variable asked `store --prune` to delete
 * every checkout in the store rather than failing.
 */
function flagValue(
  argv: string[],
  index: number,
  flag: string,
  inlineValue: string | null,
): string {
  if (inlineValue === null) return readFlagValue(argv, index, flag);
  if (!inlineValue.trim()) throw new Error(`${flag} requires a value`);
  return inlineValue;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
