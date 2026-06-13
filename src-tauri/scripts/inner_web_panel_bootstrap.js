/**
 * Tauri 内嵌 panel 子 WebView：document.cookie 变更时写入 Cookie 罐（对齐 iframe bootstrap）
 */
(function () {
  if (window.__READER_INNER_WEB_PANEL_COOKIE__) return;
  window.__READER_INNER_WEB_PANEL_COOKIE__ = true;

  try {
    var ua = String(navigator.userAgent || '').trim();
    if (ua) {
      window.__READER_PANEL_UA__ = ua;
      var inv =
        window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv) {
        inv('store_inner_web_panel_user_agent', { ua: ua }).catch(function () {});
      }
    }
  } catch (e) {
    /* ignore */
  }

  function syncToHost() {
    try {
      var href = String(location.href || '');
      if (!/^https?:/i.test(href)) return;
      var cookies = String(document.cookie || '').trim();
      if (!cookies) return;
      var inv =
        window.__TAURI_INTERNALS__ &&
        window.__TAURI_INTERNALS__.invoke;
      if (!inv) return;
      inv('sync_document_cookies_for_inner_web', {
        url: href,
        cookies: cookies,
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  window.__READER_INNER_WEB_PANEL_FLUSH__ = syncToHost;

  /** √ 前由 Rust capture_inner_web_panel_document_html 调用，写入 serverValue 等 DOM 快照 */
  window.__READER_INNER_WEB_PANEL_CAPTURE_HTML__ = function () {
    try {
      var html = document.documentElement ? document.documentElement.outerHTML : '';
      var inv =
        window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv && html) {
        inv('store_inner_web_panel_html_snapshot', { html: html }).catch(function () {});
      }
      return html;
    } catch (e) {
      return '';
    }
  };

  try {
    var proto = Document.prototype;
    var desc =
      Object.getOwnPropertyDescriptor(proto, 'cookie') ||
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
    if (desc && desc.configurable && desc.get && desc.set) {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () {
          return desc.get.call(document);
        },
        set: function (v) {
          desc.set.call(document, v);
          syncToHost();
        },
      });
    }
  } catch (e) {
    /* ignore */
  }
})();

(function () {
  if (window.__READER_INNER_WEB_NAV__) return;
  window.__READER_INNER_WEB_NAV__ = true;

  function isImportScheme(h) {
    return /^(legado|yuedu):\/\//i.test(String(h || '').trim());
  }

  function isHttpScheme(h) {
    return /^https?:\/\//i.test(String(h || '').trim());
  }

  function resolveAbsUrl(raw) {
    try {
      return new URL(String(raw || ''), String(location.href || '')).href;
    } catch (e) {
      return String(raw || '').trim();
    }
  }

  /**
   * legado/yuedu → 宿主；http(s) 与相对链接 → panel 内导航（对齐 Legado ReadRssActivity handleCommonSchemes）
   */
  function nav(href, target) {
    var h = String(href || '').trim();
    if (!h) return;
    if (isHttpScheme(h) || (!isImportScheme(h) && h.indexOf('://') === -1)) {
      var abs = isHttpScheme(h) ? h : resolveAbsUrl(h);
      if (!isHttpScheme(abs)) return;
      try {
        var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
        if (inv) {
          inv('inner_web_panel_open_link', {
            url: abs,
            target: target || null,
          }).catch(function () {
            try {
              location.assign(abs);
            } catch (e2) {
              location.href = abs;
            }
          });
          return;
        }
      } catch (e) {
        /* fall through */
      }
      try {
        location.assign(abs);
      } catch (e3) {
        location.href = abs;
      }
      return;
    }
    if (!isImportScheme(h)) return;
    try {
      var inv2 = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv2) {
        inv2('inner_web_panel_open_link', {
          url: h,
          target: target || null,
        }).catch(function () {});
        return;
      }
    } catch (e4) {
      /* ignore */
    }
    try {
      location.href = h;
    } catch (e5) {
      /* ignore */
    }
  }

  function installShellOpenShim() {
    try {
      var ti =
        window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__ === 'object'
          ? window.__TAURI_INTERNALS__
          : {};
      if (!ti.plugins) ti.plugins = {};
      window.__TAURI_INTERNALS__ = ti;
      if (!window.__TAURI__) window.__TAURI__ = {};
      var shellOpen = function (u) {
        var url = String(u || '').trim();
        if (!url) return Promise.reject(new Error('empty'));
        if (isImportScheme(url) || isHttpScheme(url)) {
          nav(url, '_blank');
          return Promise.resolve();
        }
        try {
          var abs = resolveAbsUrl(url);
          if (isHttpScheme(abs)) {
            nav(abs, '_blank');
            return Promise.resolve();
          }
        } catch (e) {
          /* ignore */
        }
        return Promise.reject(new Error('unsupported'));
      };
      var shellWrap = { open: shellOpen };
      window.__TAURI__.shell = shellWrap;
      try {
        Object.defineProperty(window.__TAURI__, 'shell', {
          configurable: true,
          enumerable: true,
          get: function () {
            return shellWrap;
          },
        });
      } catch (e2) {
        /* ignore */
      }
    } catch (e) {
      /* ignore */
    }
  }

  installShellOpenShim();

  try {
    var rawOpen = window.open;
    window.open = function (u, t, f) {
      var url = String(u || '').trim();
      if (isImportScheme(url) || isHttpScheme(url)) {
        nav(url, t || '_blank');
        return null;
      }
      if (url && !/^javascript:/i.test(url)) {
        try {
          var abs = resolveAbsUrl(url);
          if (isHttpScheme(abs)) {
            nav(abs, t || '_blank');
            return null;
          }
        } catch (e) {
          /* ignore */
        }
      }
      return rawOpen.apply(window, arguments);
    };
  } catch (e) {
    /* ignore */
  }

  function shouldCaptureLink(raw, resolved) {
    if (!raw || /^javascript:/i.test(raw) || raw.charAt(0) === '#') return false;
    if (isImportScheme(raw) || isImportScheme(resolved)) return true;
    if (isHttpScheme(resolved)) return true;
    if (
      raw.charAt(0) === '/' ||
      raw.indexOf('./') === 0 ||
      raw.indexOf('../') === 0
    ) {
      return true;
    }
    return false;
  }

  function bindLinkCapture() {
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var raw = a.getAttribute('href') || '';
        var resolved = a.href || resolveAbsUrl(raw);
        if (!shouldCaptureLink(raw, resolved)) return;
        e.preventDefault();
        e.stopPropagation();
        nav(resolved, a.getAttribute('target'));
      },
      true
    );
  }

  function onReady() {
    installShellOpenShim();
    bindLinkCapture();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', installShellOpenShim);
})();
