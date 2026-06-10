import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildLegadoExploreScriptBundle,
  GYKS_SWITCH_LINE_SHIM,
  createSourceVariableHandlers,
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { patchExploreScriptGyksDynamicBaseUrl } from '@/lib/js-engine/legado/legado-explore-java-device';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';
import type { BookSource } from '@/types';

const CLOUD_HOSTS = [
  'https://v1.gyks.cf',
  'https://v2.gyks.cf',
  'https://v3.gyks.cf',
];

const LOCAL_HOSTS = [
  ...CLOUD_HOSTS,
  'http://101.35.133.34:8888',
];

const GYKS_JSLIB = `
let hosts = ${JSON.stringify(LOCAL_HOSTS)};
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
function setVariable(k, v, t) {
  const vs = this.getVariable();
  vs[k] = v;
  source.setVariable(JSON.stringify(vs));
}
function BaseUrl() {
  let hostsbk = this.getVariable('云端配置')['hosts'] || hosts;
  let h = this.getVariable("线路");
  if (!h || String(h) == "undefind") h = hostsbk[0];
  return h;
}
function switchToNextLine(toast) {
  if (toast == undefined) toast = false;
  const currentLine = this.BaseUrl();
  let hostsbk = this.getVariable('云端配置')['hosts'] || hosts;
  let currentIndex = hostsbk.findIndex(item => item == currentLine);
  let nextIndex = (currentIndex + 1) % hostsbk.length;
  const nextLine = hostsbk[nextIndex];
  this.setVariable("线路", nextLine, false);
  return nextLine;
}
`;

describe('GYKS_SWITCH_LINE_SHIM', () => {
  it('bundle 包含 switchToNextLine 修复 shim', () => {
    const bundle = buildLegadoExploreScriptBundle(GYKS_JSLIB, 'result = 1;');
    expect(bundle).toContain('__readerGyksSwitchLineFix');
    expect(bundle).toContain(GYKS_SWITCH_LINE_SHIM.slice(0, 40));
  });

  it('手动 IP 线路失败切线时按合并列表轮转，不直接跳回 v1', () => {
    const ip = 'http://101.35.133.34:8888';
    const store: Record<string, unknown> = {
      线路: ip,
      云端配置: { hosts: CLOUD_HOSTS },
    };
    const scope: Record<string, unknown> = {
      result: undefined,
      source: {
        getVariable: () => JSON.stringify(store),
        setVariable: (raw: string) => {
          Object.assign(store, JSON.parse(raw) as Record<string, unknown>);
        },
      },
      cache: { put: () => {}, get: () => null, remove: () => {} },
      java: { longToast: () => {} },
      getArguments: (a: string, k?: string) => {
        const o = JSON.parse(a || '{}') as Record<string, unknown>;
        return k ? o[k] : o;
      },
    };
    const script = buildLegadoExploreScriptBundle(
      GYKS_JSLIB,
      'result = switchToNextLine(false);',
    );
    const fn = new Function(
      '__scope__',
      'scriptText',
      'with(__scope__) { eval(scriptText); }',
    );
    fn(scope, script);
    expect(String(scope.result)).toBe('https://v1.gyks.cf');
    expect(store['线路']).toBe('https://v1.gyks.cf');

    fn(scope, script);
    expect(String(scope.result)).toBe('https://v2.gyks.cf');
  });
});

describe('patchExploreScriptGyksDynamicBaseUrl', () => {
  it('discovestyle 与 get_book_shelf 改用 BaseUrl()', () => {
    const script = `
var base_url = BaseUrl();
var durl = \`\${base_url}/discovestyle?source=x\`;
let qtsjurl = base_url + '/get_book_shelf,' + '{}';
`;
    const patched = patchExploreScriptGyksDynamicBaseUrl(script);
    expect(patched).toContain('var durl = `${BaseUrl()}/discovestyle?');
    expect(patched).toContain("let qtsjurl = BaseUrl() + '/get_book_shelf,");
  });
});

describe('createSourceVariableHandlers line bump', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setVariable 变更 线路 时递增 explore args 版本', () => {
    const source = { sourceUrl: 'gyks-test', sourceName: 'test' } as BookSource;
    const argsKey = getSourceArgsKey(source);
    ls.set(argsKey, JSON.stringify({ 线路: 'https://v1.gyks.cf' }));
    const handlers = createSourceVariableHandlers(source, argsKey);
    expect(getExploreSourceArgsVersion(source.sourceUrl)).toBe(0);

    handlers.setVariable(JSON.stringify({ 线路: 'http://101.35.133.34:8888' }));
    expect(getExploreSourceArgsVersion(source.sourceUrl)).toBe(1);
  });
});
