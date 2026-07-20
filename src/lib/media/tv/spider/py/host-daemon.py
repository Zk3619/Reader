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
from contextlib import contextmanager
from importlib.machinery import SourceFileLoader

CACHE = os.environ.get("READER_TV_PY_CACHE") or os.path.join(
    os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp", "reader-tv-py"
)
SITE_PACKAGES = os.path.join(CACHE, "site-packages")
PROXY_BASE = os.environ.get("READER_TV_PROXY", "http://127.0.0.1:9978/proxy").rstrip("/")
_ssl_ctx = None
_requests = None
try:
    import ssl

    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
except Exception:
    pass

os.makedirs(CACHE, exist_ok=True)
os.makedirs(SITE_PACKAGES, exist_ok=True)
if SITE_PACKAGES not in sys.path:
    sys.path.insert(0, SITE_PACKAGES)

import threading

_deps_lock = threading.Lock()
_deps_ready = threading.Event()
_crypto_warn_once = False


def _normalize_url(url):
    """urllib.request 要求 ASCII URL；配置里中文路径需 percent-encode。"""
    try:
        parts = urllib.parse.urlsplit(url)
    except Exception:
        return url
    if parts.scheme not in ("http", "https", "file"):
        return url
    path = urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=-._~")
    query = urllib.parse.quote(parts.query, safe="=&%:@!$'()*+,;/-._~?") if parts.query else ""
    fragment = urllib.parse.quote(parts.fragment, safe="=%:@!$&'()*+,;/-._~?") if parts.fragment else ""
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, fragment))


def _purge_failed_imports(*roots):
    for name in list(sys.modules):
        for root in roots:
            if name == root or name.startswith(root + "."):
                try:
                    del sys.modules[name]
                except Exception:
                    pass


def _missing_common_pkgs():
    miss = []
    try:
        import Crypto  # noqa: F401
    except Exception:
        miss.append("pycryptodome")
    try:
        import requests  # noqa: F401
    except Exception:
        miss.append("requests")
    try:
        import pyquery  # noqa: F401
    except Exception:
        miss.append("pyquery")
    try:
        import lxml  # noqa: F401
    except Exception:
        miss.append("lxml")
    try:
        import bs4  # noqa: F401
    except Exception:
        miss.append("beautifulsoup4")
    return miss


def _pip_name_for_import(mod_name):
    """import 名 → pip 包名（FongMi/chaquo 常见缺包）。"""
    if not mod_name:
        return None
    root = str(mod_name).split(".")[0]
    mapping = {
        "bs4": "beautifulsoup4",
        "Crypto": "pycryptodome",
        "Cryptodome": "pycryptodomex",
        "requests": "requests",
        "pyquery": "pyquery",
        "lxml": "lxml",
        "PIL": "Pillow",
        "yaml": "PyYAML",
        "cv2": "opencv-python-headless",
        "numpy": "numpy",
        "pandas": "pandas",
        "html5lib": "html5lib",
        "soupsieve": "soupsieve",
        "cssselect": "cssselect",
        "fake_useragent": "fake-useragent",
        "httpx": "httpx",
        "aiohttp": "aiohttp",
        "jieba": "jieba",
        "gmssl": "gmssl",
    }
    return mapping.get(root, root if root.isidentifier() else None)


def _refresh_requests_ref():
    global _requests
    try:
        import requests as _req  # type: ignore

        _requests = _req
    except Exception:
        pass


def _pip_install_target(pkgs):
    import subprocess

    print(
        "[tv-py] pip install --target",
        SITE_PACKAGES,
        ":",
        " ".join(pkgs),
        file=sys.stderr,
    )
    r = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--target",
            SITE_PACKAGES,
            "--upgrade",
            "-q",
            *pkgs,
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "")[:500]
        print("[tv-py] pip install failed:", err, file=sys.stderr)
        return False
    return True


def _install_common_deps_locked():
    """持锁安装到 CACHE/site-packages，供本进程与热重载 daemon 共用。"""
    if SITE_PACKAGES not in sys.path:
        sys.path.insert(0, SITE_PACKAGES)
    miss = _missing_common_pkgs()
    if miss:
        _pip_install_target(miss)
        _purge_failed_imports(
            "Crypto",
            "Cryptodome",
            "requests",
            "pyquery",
            "lxml",
            "cssselect",
            "bs4",
            "soupsieve",
        )
        import importlib

        importlib.invalidate_caches()
    _install_crypto_shim_if_needed()
    _refresh_requests_ref()
    if not _missing_common_pkgs() or "Crypto" in sys.modules:
        _deps_ready.set()


def _ensure_common_deps(blocking=False):
    """
    默认后台安装，不阻塞 stdin 启动。
    Spider 加载前会 blocking 等待同一次安装完成。
    """
    if SITE_PACKAGES not in sys.path:
        sys.path.insert(0, SITE_PACKAGES)
    if not _missing_common_pkgs():
        _install_crypto_shim_if_needed()
        _refresh_requests_ref()
        _deps_ready.set()
        return

    def _bg():
        try:
            with _deps_lock:
                _install_common_deps_locked()
        except Exception as e:
            print("[tv-py] dep install error:", e, file=sys.stderr)
            _deps_ready.set()

    if blocking:
        with _deps_lock:
            _install_common_deps_locked()
        return

    if _deps_ready.is_set():
        return
    threading.Thread(target=_bg, name="tv-py-deps", daemon=True).start()


def _ensure_deps_for_spider():
    """加载 Spider 前保证 Crypto/requests/pyquery 可用（必要时同步 pip）。"""
    if SITE_PACKAGES not in sys.path:
        sys.path.insert(0, SITE_PACKAGES)
    if not _missing_common_pkgs():
        return
    print("[tv-py] waiting deps for spider…", file=sys.stderr)
    # 若后台线程已在装：等同一把锁；否则本线程直接装
    with _deps_lock:
        _install_common_deps_locked()
    still = _missing_common_pkgs()
    if still:
        print("[tv-py] deps still missing after install:", still, file=sys.stderr)


def _install_crypto_shim_if_needed():
    """pip 失败时用 cryptography / 最小 PKCS7 实现顶上 Crypto.Util.Padding + AES。"""
    global _crypto_warn_once
    try:
        import Crypto  # noqa: F401

        return
    except Exception:
        pass
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives import padding as _pad
        from cryptography.hazmat.backends import default_backend
    except Exception as e:
        if not _crypto_warn_once:
            _crypto_warn_once = True
            print(
                "[tv-py] Crypto 暂不可用，等待 pip 安装 pycryptodome:",
                e,
                file=sys.stderr,
            )
        return

    util = types.ModuleType("Crypto.Util")
    padding_mod = types.ModuleType("Crypto.Util.Padding")

    def pad(data, block_size):
        padder = _pad.PKCS7(block_size * 8).padder()
        return padder.update(data) + padder.finalize()

    def unpad(data, block_size):
        unpadder = _pad.PKCS7(block_size * 8).unpadder()
        return unpadder.update(data) + unpadder.finalize()

    padding_mod.pad = pad
    padding_mod.unpad = unpad
    util.Padding = padding_mod

    cipher_mod = types.ModuleType("Crypto.Cipher")

    class AES:
        MODE_ECB = 1
        MODE_CBC = 2

        def __init__(self, key, mode, iv=None):
            self._key = key
            self._mode = mode
            self._iv = iv or b"\0" * 16

        def encrypt(self, data):
            if self._mode == AES.MODE_CBC:
                cipher = Cipher(algorithms.AES(self._key), modes.CBC(self._iv), backend=default_backend())
            else:
                cipher = Cipher(algorithms.AES(self._key), modes.ECB(), backend=default_backend())
            enc = cipher.encryptor()
            return enc.update(data) + enc.finalize()

        def decrypt(self, data):
            if self._mode == AES.MODE_CBC:
                cipher = Cipher(algorithms.AES(self._key), modes.CBC(self._iv), backend=default_backend())
            else:
                cipher = Cipher(algorithms.AES(self._key), modes.ECB(), backend=default_backend())
            dec = cipher.decryptor()
            return dec.update(data) + dec.finalize()

        @staticmethod
        def new(key, mode=1, iv=None):
            return AES(key, mode, iv)

    cipher_mod.AES = AES
    root = types.ModuleType("Crypto")
    root.Util = util
    root.Cipher = cipher_mod
    sys.modules["Crypto"] = root
    sys.modules["Crypto.Util"] = util
    sys.modules["Crypto.Util.Padding"] = padding_mod
    sys.modules["Crypto.Cipher"] = cipher_mod
    print("[tv-py] Crypto shim installed via cryptography", file=sys.stderr)


def _http_get(url, headers=None, timeout=30):
    url = _normalize_url(url)
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "okhttp/3.15"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as r:
        return r.read()


def _http_post(url, data=None, headers=None, timeout=30):
    url = _normalize_url(url)
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
try:
    import requests as _requests  # type: ignore
except Exception:
    _requests = None

_etree = None
try:
    from lxml import etree as _etree  # type: ignore
except Exception:
    pass

# 后台预装；Spider 加载前会再阻塞等待同一次安装
_ensure_common_deps()


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
    _ensure_deps_for_spider()
    key = api + "\0" + (ext or "")
    if key in _spiders:
        return _spiders[key]
    path = os.path.join(CACHE, _basename(api))
    _download(path, api)
    mod_name = os.path.splitext(os.path.basename(path))[0]
    # 避免缓存模块名冲突
    uniq = "tvpy_%s_%s" % (mod_name, abs(hash(api)) % 10**8)
    mod = None
    last_err = None
    for attempt in range(3):
        try:
            # Spider 里 print() 绝不能进 stdout，否则污染 JSON RPC
            with _spider_stdio():
                mod = SourceFileLoader(uniq, path).load_module()
            break
        except ModuleNotFoundError as e:
            last_err = e
            pkg = _pip_name_for_import(getattr(e, "name", None))
            if not pkg or attempt >= 2:
                raise
            print("[tv-py] on-demand install:", pkg, file=sys.stderr)
            with _deps_lock:
                _pip_install_target([pkg])
                _purge_failed_imports(str(getattr(e, "name", "") or "").split(".")[0] or pkg)
                import importlib

                importlib.invalidate_caches()
        except Exception as e:
            last_err = e
            raise
    if mod is None:
        raise last_err or RuntimeError("load spider failed: %s" % api)
    if not hasattr(mod, "Spider"):
        raise RuntimeError("Python 源未导出 class Spider: %s" % api)
    # 重置单例，保证多站隔离
    try:
        mod.Spider._instance = None
    except Exception:
        pass
    with _spider_stdio():
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
    with _spider_stdio():
        if method == "searchContent":
            # (key, quick) or (key, quick, pg)
            if len(args) == 2:
                out = fn(args[0], args[1])
            else:
                out = fn(*args)
        else:
            out = fn(*args) if args else fn()
    return out


# 协议：仅 _RPC_STDOUT 写 JSON；Spider print 全部进 stderr
_RPC_STDOUT = sys.stdout


class _StdoutToStderr:
    encoding = getattr(sys.stderr, "encoding", "utf-8")

    def write(self, s):
        try:
            sys.stderr.write(s)
        except Exception:
            pass
        return len(s) if isinstance(s, str) else 0

    def flush(self):
        try:
            sys.stderr.flush()
        except Exception:
            pass

    def isatty(self):
        return False


@contextmanager
def _spider_stdio():
    old = sys.stdout
    sys.stdout = _StdoutToStderr()
    try:
        yield
    finally:
        sys.stdout = old


def _respond(ok, data=None, error=None):
    if ok:
        if isinstance(data, (dict, list)):
            payload = json.dumps(data, ensure_ascii=False)
        elif data is None:
            payload = ""
        else:
            payload = str(data)
        print(
            json.dumps({"ok": True, "data": payload}, ensure_ascii=False),
            file=_RPC_STDOUT,
            flush=True,
        )
    else:
        print(
            json.dumps({"ok": False, "error": error or "error"}, ensure_ascii=False),
            file=_RPC_STDOUT,
            flush=True,
        )


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
