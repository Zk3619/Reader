import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  readBookSourceVariableJson,
  seedBookSourceArgsFromHeader,
  writeBookSourceVariableJson,
} from '@/lib/book-source/source-variables';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { readBookSourceArgsField } from '@/lib/book-source/source-http';

const source: BookSource = {
  sourceUrl: 'https://qt.example/test',
  sourceName: '测试',
  sourceType: 0,
  customOrder: 0,
  enabled: true,
  enableExplore: false,
  lastUpdateTime: 0,
  respondTime: 0,
  weight: 0,
  eventListener: false,
  customButton: false,
  nextPageLazyLoad: false,
  header: '{"server":"https://gyks.cf","deviceId":"715526ded4651ef6"}',
};

describe('source-variables', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    });
  });

  it('seedBookSourceArgsFromHeader 写入 deviceId', () => {
    seedBookSourceArgsFromHeader(source);
    expect(readBookSourceArgsField(source, 'deviceId')).toBe('715526ded4651ef6');
  });

  it('writeBookSourceVariableJson 覆盖并供 resolve 读取', () => {
    writeBookSourceVariableJson(
      source,
      JSON.stringify({ deviceId: 'abc123def4567890', server: 'https://gyks.cf' }),
    );
    expect(readBookSourceArgsField(source, 'deviceId')).toBe('abc123def4567890');
    const raw = localStorage.getItem(getSourceArgsKey(source));
    expect(raw).toContain('abc123def4567890');
  });

  it('readBookSourceVariableJson 在无 args 时回退 header', () => {
    const text = readBookSourceVariableJson(source);
    expect(text).toContain('715526ded4651ef6');
  });

  it('已有 args 时不被 seed 覆盖', () => {
    writeBookSourceVariableJson(source, JSON.stringify({ deviceId: 'existing-id' }));
    seedBookSourceArgsFromHeader(source);
    expect(readBookSourceArgsField(source, 'deviceId')).toBe('existing-id');
  });
});
