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
