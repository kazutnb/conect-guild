import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CollectorError } from './errors.ts';
import {
  ghApiProjected,
  ghApiProjectedPage,
  ghOnHost,
  parseJsonLines,
  parseOrThrow,
  projectionFilter,
  type GhRunner,
} from './gh.ts';

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof CollectorError ? error.kind : 'other';
  }
  return undefined;
}

describe('parseJsonLines', () => {
  it('parses one JSON value per line across pages', () => {
    expect(parseJsonLines('{"a":1}\n"x.md"\n{"a":2}\n')).toEqual([{ a: 1 }, 'x.md', { a: 2 }]);
  });

  it('keeps escaped newlines inside a value', () => {
    expect(parseJsonLines('"line1\\nline2"\n')).toEqual(['line1\nline2']);
  });

  it('returns [] for empty output (no items on any page)', () => {
    expect(parseJsonLines('')).toEqual([]);
  });

  it.each([
    ['a broken line', '{"a":1}\n{"a":\n'],
    ['raw text', 'not json\n'],
  ])('rejects %s as validation-failed', (_label, stdout) => {
    expect(kindOf(() => parseJsonLines(stdout))).toBe('validation-failed');
  });
});

describe('projectionFilter', () => {
  it('fails on a page that is not an array instead of printing nothing', () => {
    expect(projectionFilter('.filename')).toBe(
      'if type != "array" then error("unexpected page") else .[] end | .filename | @json',
    );
  });
});

describe('ghApiProjected', () => {
  it('projects each item inside gh with --paginate --jq and no --slurp', async () => {
    const calls: (readonly string[])[] = [];
    const gh: GhRunner = (args) => {
      calls.push(args);
      return Promise.resolve('"a.md"\n"b.md"\n');
    };
    await expect(ghApiProjected(gh, 'repos/o/n/pulls/1/files', '.filename')).resolves.toEqual([
      'a.md',
      'b.md',
    ]);
    expect(calls).toEqual([
      ['api', '--paginate', '--jq', projectionFilter('.filename'), 'repos/o/n/pulls/1/files'],
    ]);
  });

  it('passes a gh failure through unchanged', async () => {
    const gh: GhRunner = () => Promise.reject(new CollectorError('gh-failed'));
    await expect(ghApiProjected(gh, 'x', '.')).rejects.toMatchObject({ kind: 'gh-failed' });
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data or throws validation-failed', () => {
    expect(parseOrThrow(z.number(), 1)).toBe(1);
    expect(kindOf(() => parseOrThrow(z.number(), 'x'))).toBe('validation-failed');
  });
});

describe('ghApiProjectedPage', () => {
  it('asks for one page only (no --paginate) and parses its lines', async () => {
    const calls: (readonly string[])[] = [];
    const gh = (args: readonly string[]) => {
      calls.push(args);
      return Promise.resolve('{"n":1}\n{"n":2}\n');
    };
    await expect(
      ghApiProjectedPage(gh, 'repos/a/b/issues?per_page=100', '{n: .number}'),
    ).resolves.toEqual([{ n: 1 }, { n: 2 }]);
    expect(calls).toEqual([
      ['api', '--jq', projectionFilter('{n: .number}'), 'repos/a/b/issues?per_page=100'],
    ]);
  });
});

describe('ghOnHost', () => {
  function recorder(): GhRunner & { calls: (readonly string[])[] } {
    const calls: (readonly string[])[] = [];
    const run: GhRunner = (args) => {
      calls.push(args);
      return Promise.resolve('');
    };
    return Object.assign(run, { calls });
  }

  it('returns the same runner without a host (github.com)', () => {
    const gh = recorder();
    expect(ghOnHost(gh, undefined)).toBe(gh);
  });

  it('puts --hostname right after api, as its own argument', async () => {
    const gh = recorder();
    const onHost = ghOnHost(gh, 'github.example.com');
    await onHost(['api', '--paginate', '--jq', '.', 'repos/a/b/issues']);
    await onHost(['api', 'graphql', '-f', 'owner=a']);
    expect(gh.calls).toEqual([
      ['api', '--hostname', 'github.example.com', '--paginate', '--jq', '.', 'repos/a/b/issues'],
      ['api', '--hostname', 'github.example.com', 'graphql', '-f', 'owner=a'],
    ]);
  });

  it('leaves calls that are not gh api as they are', async () => {
    const gh = recorder();
    await ghOnHost(gh, 'github.example.com')(['repo', 'view', 'a/b']);
    expect(gh.calls).toEqual([['repo', 'view', 'a/b']]);
  });
});
