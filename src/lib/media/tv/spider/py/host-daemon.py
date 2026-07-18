# Reader TV Python Spider host — 对齐 FongMi chaquo/app.py + base/spider.py（无 Java）
# 协议：stdin 每行一个 JSON 请求，stdout 每行一个 JSON 响应
import json
import os
import re
import sys
import time
import traceback
import types
import urllib.error
import urllib.parse
import urllib.request
from importlib.machinery import SourceFileLoader

CACHE = os.environ.get("READER_TV_PY_CACHE") or os.path.join(
    os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp", "reader-tv-py"
)
PROXY_BASE = os.environ.get("READER_TV_PROXY", "http://127.0.0.1:9978/proxy").rstrip("/")
_ssl_ctx = None
try:
    import ssl

    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
except Exception:
    pass

os.makedirs(CACHE, exist_ok=True)


def _http_get(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "okhttp/3.15"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as r:
        return r.read()


def _http_post(url, data=None, headers=None, timeout=30):
    body = None
    hdrs = dict(headers or {"User-Agent": "okhttp/3.15"})
    if isinstance(data, dict):
        body = urllib.parse.urlencode(data).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif isinstance(data, (bytes, bytearray)):
        body = bytes(data)
    elif data is not None:
        body = str(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as r:
        return r.read()


# --- optional deps (best-effort) ---
_requests = None
try:
    import requests as _requests  # type: ignore
except Exception:
    pass

_etree = None
try:
    from lxml import etree as _etree  # type: ignore
except Exception:
    pass


# --- Fake Java bridges used by FongMi base.spider ---
class _Proxy:
    @staticmethod
    def getUrl(local=True):
        return PROXY_BASE

    @staticmethod
    def getPort():
        try:
            u = urllib.parse.urlparse(PROXY_BASE)
            if u.port:
                return str(u.port)
        except Exception:
            pass
        return "9978"


class _PythonPlatform:
    @staticmethod
    def getApplication():
        return _App()


class _App:
    def getCacheDir(self):
        return _File(CACHE)


class _File:
    def __init__(self, path):
        self._path = path

    def getAbsolutePath(self):
        return self._path


class _Python:
    @staticmethod
    def getPlatform():
        return _PythonPlatform()


def _install_fake_modules():
    # com.github.catvod.Proxy
    catvod = types.ModuleType("com.github.catvod")
    catvod.Proxy = _Proxy
    com = types.ModuleType("com")
    github = types.ModuleType("com.github")
    sys.modules["com"] = com
    sys.modules["com.github"] = github
    sys.modules["com.github.catvod"] = catvod

    # com.chaquo.python.Python
    chaquo = types.ModuleType("com.chaquo")
    chaquo_python = types.ModuleType("com.chaquo.python")
    chaquo_python.Python = _Python
    sys.modules["com.chaquo"] = chaquo
    sys.modules["com.chaquo.python"] = chaquo_python

    # base.spider
    base = types.ModuleType("base")
    spider_mod = types.ModuleType("base.spider")

    class Spider(object):
        _instance = None

        def __init__(self):
            self.extend = ""
            self.siteKey = ""

        def __new__(cls, *args, **kwargs):
            if cls._instance:
                return cls._instance
            cls._instance = super(Spider, cls).__new__(cls)
            return cls._instance

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

        def liveContent(self, url):
            return ""

        def localProxy(self, param):
            return []

        def isVideoFormat(self, url):
            return False

        def manualVideoCheck(self):
            return False

        def action(self, action):
            return {}

        def destroy(self):
            pass

        def getName(self):
            return ""

        def getDependence(self):
            return []

        def loadSpider(self, name):
            return self.loadModule(name).Spider()

        def loadModule(self, name):
            path = os.path.join(CACHE, name + ".py")
            return SourceFileLoader(name, path).load_module()

        def regStr(self, reg, src, group=1):
            m = re.search(reg, src)
            return m.group(group) if m else ""

        def removeHtmlTags(self, src):
            return re.sub(r"<.*?>", "", src or "")

        def cleanText(self, src):
            return re.sub(
                "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]",
                "",
                src or "",
            )

        def fetch(
            self,
            url,
            params=None,
            cookies=None,
            headers=None,
            timeout=5,
            verify=True,
            stream=False,
            allow_redirects=True,
        ):
            if _requests is not None:
                return _requests.get(
                    url,
                    params=params,
                    cookies=cookies,
                    headers=headers,
                    timeout=timeout,
                    verify=verify,
                    stream=stream,
                    allow_redirects=allow_redirects,
                )
            full = url
            if params:
                full += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
            data = _http_get(full, headers=headers, timeout=timeout)
            return _SimpleResp(data)

        def post(
            self,
            url,
            params=None,
            data=None,
            json=None,
            cookies=None,
            headers=None,
            timeout=5,
            verify=True,
            stream=False,
            allow_redirects=True,
        ):
            if _requests is not None:
                return _requests.post(
                    url,
                    params=params,
                    data=data,
                    json=json,
                    cookies=cookies,
                    headers=headers,
                    timeout=timeout,
                    verify=verify,
                    stream=stream,
                    allow_redirects=allow_redirects,
                )
            payload = data
            hdrs = dict(headers or {})
            if json is not None:
                import json as _json

                payload = _json.dumps(json, ensure_ascii=False).encode("utf-8")
                hdrs.setdefault("Content-Type", "application/json")
            raw = _http_post(url, data=payload, headers=hdrs, timeout=timeout)
            return _SimpleResp(raw)

        def html(self, content):
            if _etree is None:
                raise RuntimeError("lxml 未安装：请 pip install lxml（FongMi Python 源常用）")
            return _etree.HTML(content)

        def str2json(self, s):
            return json.loads(s)

        def json2str(self, o):
            return json.dumps(o, ensure_ascii=False)

        def getProxyUrl(self, local=True):
            return PROXY_BASE + "?do=py"

        def log(self, msg):
            if isinstance(msg, (dict, list)):
                print(json.dumps(msg, ensure_ascii=False), file=sys.stderr)
            else:
                print(str(msg), file=sys.stderr)

        def getCache(self, key):
            try:
                port = _Proxy.getPort()
                value = (
                    self.fetch(
                        "http://127.0.0.1:%s/cache?do=get&key=%s" % (port, urllib.parse.quote(str(key))),
                        timeout=5,
                    ).text
                    or ""
                )
            except Exception:
                return None
            if not value:
                return None
            if (value.startswith("{") and value.endswith("}")) or (
                value.startswith("[") and value.endswith("]")
            ):
                try:
                    obj = json.loads(value)
                    if isinstance(obj, dict):
                        if "expiresAt" not in obj or obj["expiresAt"] >= int(time.time()):
                            return obj
                        self.delCache(key)
                        return None
                    return obj
                except Exception:
                    return value
            return value

        def setCache(self, key, value):
            if isinstance(value, (int, float)):
                value = str(value)
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            try:
                port = _Proxy.getPort()
                r = self.post(
                    "http://127.0.0.1:%s/cache?do=set&key=%s" % (port, urllib.parse.quote(str(key))),
                    data={"value": value},
                    timeout=5,
                )
                return "succeed" if getattr(r, "status_code", 200) == 200 else "failed"
            except Exception:
                return "failed"

        def delCache(self, key):
            try:
                port = _Proxy.getPort()
                self.fetch(
                    "http://127.0.0.1:%s/cache?do=del&key=%s" % (port, urllib.parse.quote(str(key))),
                    timeout=5,
                )
                return "succeed"
            except Exception:
                return "failed"

    class _SimpleResp(object):
        def __init__(self, data):
            self._data = data if isinstance(data, (bytes, bytearray)) else str(data).encode("utf-8")
            self.status_code = 200
            self.encoding = "utf-8"

        @property
        def content(self):
            return self._data

        @property
        def text(self):
            return self._data.decode(self.encoding, "ignore")

    spider_mod.Spider = Spider
    sys.modules["base"] = base
    sys.modules["base.spider"] = spider_mod


_install_fake_modules()

_spiders = {}


def _basename(api):
    name = os.path.basename(urllib.parse.urlparse(api).path if "://" in api else api)
    if not name.endswith(".py"):
        name = (name or "spider") + ".py"
    return name


def _download(path, api):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if api.startswith("http://") or api.startswith("https://"):
        data = _http_get(api)
        with open(path, "wb") as f:
            f.write(data)
    elif os.path.isfile(api):
        with open(api, "rb") as src, open(path, "wb") as dst:
            dst.write(src.read())
    else:
        # 相对路径已在前端解析为 http；此处把字面量当源码写入（对齐 app.download 非 http 分支）
        with open(path, "wb") as f:
            f.write(api.encode("utf-8"))


def _resolve_dep(api, name):
    if name.startswith("http://") or name.startswith("https://"):
        return name
    if api.startswith("http://") or api.startswith("https://"):
        return urllib.parse.urljoin(api, name)
    return name


def _ensure_spider(api, ext, site_key=""):
    key = api + "\0" + (ext or "")
    if key in _spiders:
        return _spiders[key]
    path = os.path.join(CACHE, _basename(api))
    _download(path, api)
    mod_name = os.path.splitext(os.path.basename(path))[0]
    # 避免缓存模块名冲突
    uniq = "tvpy_%s_%s" % (mod_name, abs(hash(api)) % 10**8)
    mod = SourceFileLoader(uniq, path).load_module()
    if not hasattr(mod, "Spider"):
        raise RuntimeError("Python 源未导出 class Spider: %s" % api)
    # 重置单例，保证多站隔离
    try:
        mod.Spider._instance = None
    except Exception:
        pass
    spider = mod.Spider()
    spider.siteKey = site_key or ""
    # dependence
    deps = []
    try:
        deps = spider.getDependence() or []
    except Exception:
        deps = []
    for item in deps:
        dep_name = str(item)
        if not dep_name.endswith(".py"):
            dep_name = dep_name + ".py"
        dep_path = os.path.join(CACHE, os.path.basename(dep_name))
        _download(dep_path, _resolve_dep(api, dep_name))
    try:
        spider.init(ext or "")
    except TypeError:
        spider.init()
    _spiders[key] = spider
    return spider


def _call(spider, method, args):
    # FongMi 方法名
    fn = getattr(spider, method, None)
    if not callable(fn):
        aliases = {
            "homeContent": "home",
            "homeVideoContent": "homeVod",
            "categoryContent": "category",
            "detailContent": "detail",
            "searchContent": "search",
            "playerContent": "play",
        }
        fn = getattr(spider, aliases.get(method, method), None)
    if not callable(fn):
        return {"list": [], "msg": "method missing: " + method}
    if method == "categoryContent" and len(args) >= 4 and isinstance(args[3], str):
        try:
            args = list(args)
            args[3] = json.loads(args[3])
        except Exception:
            pass
    if method == "detailContent" and len(args) >= 1 and isinstance(args[0], str):
        try:
            args = list(args)
            args[0] = json.loads(args[0])
        except Exception:
            pass
    if method == "playerContent" and len(args) >= 3 and isinstance(args[2], str):
        try:
            args = list(args)
            args[2] = json.loads(args[2])
        except Exception:
            pass
    if method == "searchContent":
        # (key, quick) or (key, quick, pg)
        if len(args) == 2:
            out = fn(args[0], args[1])
        else:
            out = fn(*args)
    else:
        out = fn(*args) if args else fn()
    return out


def _respond(ok, data=None, error=None):
    if ok:
        if isinstance(data, (dict, list)):
            payload = json.dumps(data, ensure_ascii=False)
        elif data is None:
            payload = ""
        else:
            payload = str(data)
        print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False), flush=True)
    else:
        print(json.dumps({"ok": False, "error": error or "error"}, ensure_ascii=False), flush=True)


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        if req.get("proxyBase"):
            PROXY_BASE = str(req["proxyBase"]).rstrip("/")
        spider = _ensure_spider(
            req.get("api") or "",
            req.get("ext") or "",
            req.get("siteKey") or "",
        )
        out = _call(spider, req.get("method") or "", req.get("args") or [])
        _respond(True, out)
    except Exception:
        _respond(False, error=traceback.format_exc())
