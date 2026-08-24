import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgv } from '../src/args.ts';

test('an empty inline flag value is refused rather than read as zero', () => {
  // `Number('')` is 0 and finite, so `--days=` asked prune to delete every checkout in the
  // store. An unset shell variable writes exactly that.
  assert.throws(() => parseArgv(['store', '--prune', '--days=']), /--days requires a value/);
  assert.throws(() => parseArgv(['status', '--set=']), /--set requires a value/);

  // A deliberate zero is still a zero: "everything is stale" is a request somebody can mean.
  assert.equal(parseArgv(['store', '--prune', '--days=0']).days, 0);
  assert.equal(parseArgv(['store', '--prune', '--days', '0']).days, 0);
});

test('a flag value is read the same written either way', () => {
  assert.deepEqual(parseArgv(['status', '--set=engines']).sets, ['engines']);
  assert.deepEqual(parseArgv(['status', '--set', 'engines']).sets, ['engines']);
  assert.deepEqual(parseArgv(['status', '--set', 'a', '--set=b']).sets, ['a', 'b']);
  assert.equal(parseArgv(['store', '--days=7']).days, 7);
  assert.equal(parseArgv(['store', '--days', '7']).days, 7);
});

test('the command is the first bare word, wherever the flags sit', () => {
  assert.equal(parseArgv([]).command, 'status');
  assert.equal(parseArgv(['--json', 'clone']).command, 'clone');
  assert.deepEqual(parseArgv(['get', 'zod', 'react']).positionals, ['zod', 'react']);
  assert.equal(parseArgv(['--help']).command, 'help');
});

test('a negative or unreadable day count is refused', () => {
  assert.throws(() => parseArgv(['store', '--days=-1']), /non-negative number/);
  assert.throws(() => parseArgv(['store', '--days=soon']), /non-negative number/);
});

test('an unknown option names the ones that exist', () => {
  assert.throws(() => parseArgv(['status', '--verbose']), /Unknown option: --verbose/);
  // Agents type this by convention, and erroring on it would cost them a turn for nothing.
  assert.equal(parseArgv(['status', '--non-interactive']).command, 'status');
});
