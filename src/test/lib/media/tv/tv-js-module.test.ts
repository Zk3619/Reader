import { describe, expect, it } from 'vitest';
import {
  buildSpiderInitArg,
  extractModuleImports,
  isEsModuleSpiderSource,
  resolveTvExtUrl,
  resolveTvModuleUrl,
} from '@/lib/media/tv/spider/tv-js-module';

describe('tv-js-module', () => {
  it('detects ES module spider sources', () => {
    expect(isEsModuleSpiderSource('import x from "./a.js"')).toBe(true);
    expect(isEsModuleSpiderSource('export default {}')).toBe(true);
    expect(isEsModuleSpiderSource('var rule = {}')).toBe(false);
  });

  it('extracts import specifiers', () => {
    const src = `import { cheerio } from "https://example.com/lib.js";
export { foo } from './rel.js';`;
    expect(extractModuleImports(src)).toEqual([
      'https://example.com/lib.js',
      './rel.js',
    ]);
  });

  it('extracts multiline imports with non-ascii identifiers', () => {
    const src = `import {
    cheerio,
    模板
} from "https://pan.vma.cc/pan/down.php/abc.js";`;
    expect(extractModuleImports(src)).toEqual([
      'https://pan.vma.cc/pan/down.php/abc.js',
    ]);
  });

  it('resolves module and ext URLs against config base', () => {
    const base = 'https://cfg.example/vod.json';
    expect(resolveTvModuleUrl(base, './js/Anime1.js', base)).toBe(
      'https://cfg.example/js/Anime1.js',
    );
    expect(resolveTvExtUrl('./js/Anime1.js', base)).toBe(
      'https://cfg.example/js/Anime1.js',
    );
  });

  it('builds catvod init arg with resolved ext URL', () => {
    const arg = buildSpiderInitArg(
      'site1',
      './js/rule.js',
      'function __jsEvalReturn(){return {}}',
      'https://cfg.example/vod.json',
    );
    expect(arg).toEqual({
      stype: 3,
      skey: 'site1',
      ext: 'https://cfg.example/js/rule.js',
    });
  });
});
