import { describe, expect, it } from 'vitest';
import {
  buildUserApiImportComparisons,
  compareUserApiVersions,
  defaultUserApiImportSelection,
  normalizeUserApiScriptForCompare,
} from '@/lib/media/audio/online/user-api-import-compare';
import { identifyUserApiScriptsFromCode } from '@/lib/media/audio/online/user-api-import-identify';
import type { UserApiScript } from '@/lib/media/audio/online/user-api-engine';

const SAMPLE_SCRIPT = `/**
 * @name DemoSource
 * @version 1.0.0
 * @author tester
 */
globalThis.lx.send('inited', { sources: {} });
globalThis.lx.on('request', async () => 'https://example.com/a.mp3');
`;

const SAMPLE_SCRIPT_V2 = SAMPLE_SCRIPT.replace('@version 1.0.0', '@version 2.0.0').replace(
  'https://example.com/a.mp3',
  'https://example.com/b.mp3',
);

function local(partial: Partial<UserApiScript> & Pick<UserApiScript, 'id' | 'name' | 'script'>): UserApiScript {
  return {
    enabled: false,
    initStatus: 'ready',
    ...partial,
  };
}

describe('user-api-import-compare', () => {
  it('normalizes line endings for content compare', () => {
    expect(normalizeUserApiScriptForCompare('a\r\nb\r')).toBe('a\nb');
  });

  it('compares versions numerically', () => {
    expect(compareUserApiVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareUserApiVersions('v1.2', '1.2')).toBe(0);
  });

  it('marks identical script as existing (not new/update)', () => {
    const sources = identifyUserApiScriptsFromCode(SAMPLE_SCRIPT);
    const comparisons = buildUserApiImportComparisons(sources, [
      local({ id: 'userapi_1', name: 'DemoSource', script: SAMPLE_SCRIPT, version: '1.0.0' }),
    ]);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].isNew).toBe(false);
    expect(comparisons[0].isUpdate).toBe(false);
    expect(defaultUserApiImportSelection(comparisons).size).toBe(0);
  });

  it('marks same name different content as update', () => {
    const sources = identifyUserApiScriptsFromCode(SAMPLE_SCRIPT_V2);
    const comparisons = buildUserApiImportComparisons(sources, [
      local({ id: 'userapi_1', name: 'DemoSource', script: SAMPLE_SCRIPT, version: '1.0.0' }),
    ]);
    expect(comparisons[0].isNew).toBe(false);
    expect(comparisons[0].isUpdate).toBe(true);
    expect(comparisons[0].existing?.id).toBe('userapi_1');
    expect(defaultUserApiImportSelection(comparisons).has(sources[0].id)).toBe(true);
  });

  it('marks unknown script as new', () => {
    const sources = identifyUserApiScriptsFromCode(SAMPLE_SCRIPT);
    const comparisons = buildUserApiImportComparisons(sources, []);
    expect(comparisons[0].isNew).toBe(true);
    expect(comparisons[0].isUpdate).toBe(false);
  });
});

describe('identifyUserApiScriptsFromCode', () => {
  it('accepts raw JS', () => {
    const list = identifyUserApiScriptsFromCode(SAMPLE_SCRIPT);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('DemoSource');
  });

  it('accepts JSON object with script field', () => {
    const list = identifyUserApiScriptsFromCode(
      JSON.stringify({ name: 'Wrapped', script: SAMPLE_SCRIPT }),
    );
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('DemoSource');
  });

  it('accepts JSON array of scripts', () => {
    const list = identifyUserApiScriptsFromCode(JSON.stringify([SAMPLE_SCRIPT, SAMPLE_SCRIPT_V2]));
    expect(list).toHaveLength(2);
  });
});
