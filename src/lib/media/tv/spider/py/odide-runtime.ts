/**
 * Pyodide 降级运行时（Wasm Python）
 * 能力子集：无 lxml；网络用 fetch；FongMi 重度源请用本机 Python
 */

import { resolveProxyBaseUrl } from '../../proxy/client';

type RpcResult = { ok: boolean; data?: string; error?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;
let loadError: string | null = null;
let loadPromise: Promise<boolean> | null = null;

const ODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const HOST_PY = `
import json, sys, types, traceback
from js import fetch

PROXY_BASE = "http://127.0.0.1:9978/proxy"
_spiders = {}

async def _fetch_text(url):
    r = await fetch(url)
    t = await r.text()
    return t

class Spider:
    def __init__(self):
        self.extend = ""
        self.siteKey = ""
    def init(self, extend=""):
        self.extend = extend or ""
    def homeContent(self, filter):
        return {}
    def homeVideoContent(self):
        return {}
    def categoryContent(self, tid, pg, filter, extend):
        return {}
    def detailContent(self, ids):
        return {}
    def searchContent(self, key, quick, pg="1"):
        return {}
    def playerContent(self, flag, id, vipFlags):
        return {}
    def getDependence(self):
        return []
    def getProxyUrl(self, local=True):
        return PROXY_BASE + "?do=py"
    def html(self, content):
        raise RuntimeError("Pyodide 降级不支持 lxml，请安装本机 Python")
    def fetch(self, *a, **k):
        raise RuntimeError("Pyodide 降级不支持 requests.fetch，请安装本机 Python")
    def log(self, msg):
        print(msg)

base = types.ModuleType("base")
bs = types.ModuleType("base.spider")
bs.Spider = Spider
sys.modules["base"] = base
sys.modules["base.spider"] = bs

async def ensure(api, ext, site_key=""):
    key = api + chr(0) + (ext or "")
    if key in _spiders:
        return _spiders[key]
    src = await _fetch_text(api)
    ns = {"__name__": "tvpy_user"}
    # 注入基类名供「class Spider(Spider)」解析：先放入 base.spider
    exec(compile(src, api, "exec"), ns, ns)
    cls = ns.get("Spider")
    if cls is None:
        raise RuntimeError("源未导出 class Spider")
    spider = cls()
    spider.siteKey = site_key or ""
    try:
        spider.init(ext or "")
    except TypeError:
        spider.init()
    _spiders[key] = spider
    return spider

def call_sync(spider, method, args):
    fn = getattr(spider, method, None)
    if not callable(fn):
        return {"list": [], "msg": "method missing: " + method}
    return fn(*args) if args else fn()

async def invoke(api, ext, method, args_json, site_key, proxy_base):
    global PROXY_BASE
    if proxy_base:
        PROXY_BASE = str(proxy_base).rstrip("/")
    try:
        spider = await ensure(api, ext or "", site_key or "")
        args = json.loads(args_json) if args_json else []
        out = call_sync(spider, method, args)
        if isinstance(out, (dict, list)):
            data = json.dumps(out, ensure_ascii=False)
        else:
            data = "" if out is None else str(out)
        return json.dumps({"ok": True, "data": data}, ensure_ascii=False)
    except Exception:
        return json.dumps({"ok": False, "error": traceback.format_exc()}, ensure_ascii=False)
`;

export async function probePyodide(force = false): Promise<{ ok: boolean; error?: string }> {
  if (!force && pyodide) return { ok: true };
  if (!force && loadError && !loadPromise) return { ok: false, error: loadError };
  const ok = await ensurePyodide();
  return ok ? { ok: true } : { ok: false, error: loadError || 'Pyodide 不可用' };
}

async function ensurePyodide(): Promise<boolean> {
  if (pyodide) return true;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ `${ODIDE_CDN}pyodide.mjs`);
      const inst = await mod.loadPyodide({ indexURL: ODIDE_CDN });
      await inst.runPythonAsync(HOST_PY);
      pyodide = inst;
      loadError = null;
      return true;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      pyodide = null;
      return false;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export async function odidePyInvoke(payload: {
  api: string;
  ext: string;
  method: string;
  args: unknown[];
  siteKey?: string;
}): Promise<string> {
  const ok = await ensurePyodide();
  if (!ok || !pyodide) {
    throw new Error(
      loadError
        ? `Pyodide 降级失败: ${loadError}`
        : 'Pyodide 不可用；建议安装本机 Python（python.org）',
    );
  }
  if (!/^https?:\/\//i.test(payload.api)) {
    throw new Error('Pyodide 模式需要 http(s) 的 .py 地址');
  }
  const proxyBase = await resolveProxyBaseUrl();
  const invoke = pyodide.globals.get('invoke');
  const raw = await invoke(
    payload.api,
    payload.ext ?? '',
    payload.method,
    JSON.stringify(payload.args ?? []),
    payload.siteKey ?? '',
    proxyBase,
  );
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const parsed = JSON.parse(text) as RpcResult;
  if (!parsed.ok) throw new Error(parsed.error || 'pyodide error');
  return parsed.data ?? '';
}

export function destroyOdideRuntime(): void {
  pyodide = null;
  loadError = null;
  loadPromise = null;
}
