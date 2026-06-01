import { describe, expect, it } from 'vitest';
import {
  buildLegadoExploreScriptBundle,
  EXPLORE_JSLIB_THIS_BIND_SHIM,
} from '@/lib/js-engine/legado/source-script-shared';

describe('explore jsLib this bind', () => {
  it('bundle 包含 this 绑定 shim', () => {
    const body = buildLegadoExploreScriptBundle('function BaseUrl() { return "x"; }', 'result = 1;');
    expect(body).toContain('__readerBindExploreJsLibThis');
    expect(body).toContain(EXPLORE_JSLIB_THIS_BIND_SHIM.slice(0, 40));
  });

  it('jsLib 风格 getVariable/BaseUrl 在 with 作用域可执行', () => {
    const jsLib = `
let hosts = ['https://v1.gyks.cf'];
const defaultConfig = { 线路: hosts[0] };
function getVariable(k) {
  if (k == undefined) k = "";
  const { source } = this;
  let parsed = {};
  try { parsed = JSON.parse(source.getVariable()); } catch {}
  if (k == "") return parsed;
  let value = parsed[k];
  if (value == undefined) value = defaultConfig[k];
  return value != undefined ? value : "";
}
function BaseUrl() {
  let hostsbk = this.getVariable('云端配置')['hosts'] || hosts;
  let h = this.getVariable("线路");
  if (!h || String(h) == "undefind") h = hostsbk[0];
  return h;
}
`;
    const scope: Record<string, unknown> = {
      result: undefined,
      source: {
        getVariable: () =>
          JSON.stringify({
            线路: 'https://v1.gyks.cf',
            云端配置: { hosts: ['https://v1.gyks.cf'] },
          }),
        setVariable: () => {},
      },
      cache: { put: () => {}, get: () => null, remove: () => {} },
      java: {},
      getArguments: (a: string, k?: string) => {
        const o = JSON.parse(a || '{}') as Record<string, unknown>;
        return k ? o[k] : o;
      },
    };
    const script = buildLegadoExploreScriptBundle(jsLib, 'result = BaseUrl();');
    const fn = new Function(
      '__scope__',
      'scriptText',
      'with(__scope__) { eval(scriptText); }',
    );
    fn(scope, script);
    expect(String(scope.result)).toBe('https://v1.gyks.cf');
  });
});
