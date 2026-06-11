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

  function syncPageTitle() {
    try {
      var t = String(document.title || '').trim();
      if (!t) return;
      var inv =
        window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv) {
        inv('store_inner_web_panel_page_title', { title: t }).catch(function () {});
      }
    } catch (e) {
      /* ignore */
    }
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncPageTitle);
    } else {
      syncPageTitle();
    }
    window.addEventListener('load', syncPageTitle);
    var titleEl = document.querySelector('title');
    if (titleEl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncPageTitle).observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  } catch (e) {
    /* ignore */
  }

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

  function nav(href, target) {
    var h = String(href || '');
    try {
      var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv && (/^https?:/i.test(h) || /^(legado|yuedu):/i.test(h))) {
        inv('inner_web_panel_open_link', {
          url: h,
          target: target || null,
        }).catch(function () {});
        return;
      }
    } catch (e) {
      /* ignore */
    }
    try {
      if (/^(legado|yuedu):/i.test(h)) {
        location.href = h;
        return;
      }
      if (/^https?:/i.test(h) && target !== '_blank') location.href = h;
      else if (/^https?:/i.test(h)) window.open(h, '_blank');
    } catch (e2) {
      /* ignore */
    }
  }

  function installShellOpenShim() {
    try {
      var ti = window.__TAURI_INTERNALS__ || {};
      if (!ti.plugins) ti.plugins = {};
      window.__TAURI_INTERNALS__ = ti;
      if (!window.__TAURI__) window.__TAURI__ = {};
      var shellOpen = function (u) {
        nav(String(u || ''), '_blank');
        return Promise.resolve();
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
    window.open = function (u, t) {
      nav(u, t || '_blank');
      return null;
    };
  } catch (e) {
    /* ignore */
  }

  function bindLinkCapture() {
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var raw = a.getAttribute('href') || '';
        if (!raw || /^javascript:/i.test(raw) || raw.charAt(0) === '#') return;
        e.preventDefault();
        e.stopPropagation();
        nav(a.href, a.getAttribute('target'));
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
