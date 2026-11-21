import { describe, expect, it } from 'vitest';
import { checkGuildSettings, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import { DEFAULT_TEXT, fake, LOCAL, type Fake } from './settingsWrite.fixtures.test-util.ts';

/** The GitHub Enterprise Server host: written by hand, kept by settings:write. */

function written(f: Fake): GuildSettings {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text));
}

function localTextWithHost(host: string): string {
  const base = checkGuildSettings(JSON.parse(DEFAULT_TEXT));
  return `${JSON.stringify({ ...base, host }, null, 2)}\n`;
}

describe('runSettingsWrite host', () => {
  it('keeps the host of the local settings when it overwrites them', async () => {
    const f = fake();
    f.files.set(LOCAL, localTextWithHost('github.example.com'));
    expect(await runSettingsWrite(['--write', '--overwrite'], f.deps)).toBe(0);
    expect(written(f).host).toBe('github.example.com');
  });

  it('asks the labels on that host', async () => {
    const f = fake();
    f.files.set(LOCAL, localTextWithHost('github.example.com'));
    await runSettingsWrite(['--dry-run'], f.deps);
    expect(f.ghCalls.length).toBeGreaterThan(0);
    for (const call of f.ghCalls) {
      expect(call.slice(0, 3)).toEqual(['api', '--hostname', 'github.example.com']);
    }
  });

  it('writes no host when the settings it starts from have none', async () => {
    const f = fake();
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
    expect('host' in written(f)).toBe(false);
    for (const call of f.ghCalls) expect(call).not.toContain('--hostname');
  });
});
