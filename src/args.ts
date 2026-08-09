export type CliCommand = 'status' | 'clone' | 'validate' | 'schema' | 'help' | 'version';

export interface CliOptions {
  command: CliCommand;
  /** Reference names, or one project directory / package.json path. */
  positionals: string[];
  groups: string[];
  json: boolean;
}

const COMMANDS = new Set<string>(['status', 'clone', 'validate', 'schema', 'help', 'version']);
const VALID_OPTIONS = '--group <name>, --json';

export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = { command: 'status', positionals: [], groups: [], json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inlineValue = equals === -1 ? null : arg.slice(equals + 1);

    if (flag === '--help' || flag === '-h') {
      options.command = 'help';
    } else if (flag === '--version' || flag === '-v') {
      options.command = 'version';
    } else if (flag === '--json') {
      options.json = true;
    } else if (flag === '--group') {
      options.groups.push(inlineValue ?? readFlagValue(argv, index, flag));
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
  if (first && COMMANDS.has(first)) {
    options.command = first as CliCommand;
    options.positionals = rest;
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
