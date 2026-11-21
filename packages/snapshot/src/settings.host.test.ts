import { describe, expect, it } from 'vitest';
import { makeSettings } from './settings.fixtures.test-util.ts';
import { describeIssues, guildSettingsSchema } from './settingsSchema.ts';

/** The GitHub Enterprise Server host of the company's repository. */

function issuesOf(input: unknown): string {
  const result = guildSettingsSchema.safeParse(input);
  return result.success ? '' : describeIssues(result.error);
}

describe('guildSettingsSchema host', () => {
  it('keeps settings without host valid (github.com)', () => {
    const settings = makeSettings(4);
    expect('host' in settings).toBe(false);
    expect(issuesOf(settings)).toBe('');
  });

  it('accepts a GitHub Enterprise Server host name', () => {
    for (const host of ['github.example.com', 'git.corp-1.example.co.jp', 'ghe.io']) {
      expect(guildSettingsSchema.parse({ ...makeSettings(4), host }).host).toBe(host);
    }
  });

  it('refuses github.com itself, schemes, ports, paths, users, upper case and odd labels', () => {
    const settings = makeSettings(4);
    for (const host of [
      'github.com',
      'https://github.example.com',
      'github.example.com:8443',
      'github.example.com/owner',
      'me@github.example.com',
      'GitHub.example.com',
      'localhost',
      '-github.example.com',
      'github-.example.com',
      'github..example.com',
      'github.example.com.',
      '--hostname',
      '',
    ]) {
      expect(issuesOf({ ...settings, host }), host).toMatch(/at host/);
    }
  });
});
