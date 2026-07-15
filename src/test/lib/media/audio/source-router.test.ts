import { describe, expect, it } from 'vitest';
import { BUILTIN_SOURCES, BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';

describe('source-router', () => {
  it('includes kw/kg/tx/wy/mg builtin sources', () => {
    expect(BUILTIN_SOURCES).toEqual(['kw', 'kg', 'tx', 'wy', 'mg']);
  });

  it('has display labels for builtin sources', () => {
    for (const s of BUILTIN_SOURCES) {
      expect(BUILTIN_SOURCE_LABELS[s]).toBeTruthy();
    }
  });
});
