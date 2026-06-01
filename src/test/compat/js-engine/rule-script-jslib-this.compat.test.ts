import { describe, expect, it } from 'vitest';
import { EXPLORE_JSLIB_THIS_BIND_SHIM } from '@/lib/js-engine/legado/source-script-shared';
import {
  buildRuleScriptFullBody,
  RULE_SCRIPT_JSLIB_THIS_BIND_SHIM,
} from '@/lib/js-engine/legado/rule-script-patches';

describe('rule-script jsLib this bind', () => {
  it('buildRuleScriptFullBody 包含 this 绑定 shim', () => {
    const body = buildRuleScriptFullBody('result = 1;', 'function paraForAndroid() {}');
    expect(body).toContain('__readerBindJsLibThis');
    expect(body).toContain('__readerBindExploreJsLibThis');
    expect(body).toContain(RULE_SCRIPT_JSLIB_THIS_BIND_SHIM.slice(0, 40));
    expect(body).toContain(EXPLORE_JSLIB_THIS_BIND_SHIM.slice(0, 40));
  });

  it('BaseUrl 经 explore shim 可调用 this.getVariable', () => {
    const jsLib = `
      function getVariable() { return this.source.getVariable(); }
      function BaseUrl() {
        var v = this.getVariable();
        var o = JSON.parse(v || '{}');
        return o['线路'] || o.server || '';
      }
    `;
    const scope = {
      source: {
        getVariable: () => '{"线路":"https://v1.gyks.cf"}',
      },
      cache: { put: () => {}, get: () => null, remove: () => {} },
      java: {},
      getArguments: (raw: string, key?: string) => {
        const o = JSON.parse(raw || '{}') as Record<string, string>;
        return key ? o[key] : o;
      },
    };
    const fn = new Function(
      '__scope__',
      `with (__scope__) {\n${buildRuleScriptFullBody('result = BaseUrl(); return result;', jsLib)}\n}`,
    );
    expect(fn(scope)).toBe('https://v1.gyks.cf');
  });

  it('paraForAndroid 经 shim 可读到 source.getVariable', () => {
    const jsLib = `
      function paraForAndroid(content, sources, ydv) {
        var v = this.source.getVariable();
        return content + '|' + (v || 'ok');
      }
    `;
    const scope = {
      source: {
        getVariable: () => '{"plcolor":"#000"}',
      },
      cache: {
        putMemory: () => {},
        getFromMemory: () => 0,
      },
      java: {},
      getArguments: (raw: string, key?: string) => {
        const o = JSON.parse(raw || '{}') as Record<string, string>;
        return key ? o[key] : o;
      },
    };
    const fn = new Function(
      '__scope__',
      `with (__scope__) {\n${buildRuleScriptFullBody('result = paraForAndroid("<p>x</p>", "番茄", false); return result;', jsLib)}\n}`,
    );
    const out = fn(scope) as string;
    expect(String(out)).toContain('<p>x</p>');
    expect(String(out)).toContain('plcolor');
  });
});
