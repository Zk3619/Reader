/**
 * 在所有子 frame 文档开始前执行（由 Rust AddScriptToExecuteOnDocumentCreated 注入）。
 * 1. 避免 Tauri 在 iframe 内注入脚本访问 undefined.plugins 报错
 * 2. 通过 postMessage 让主窗口代理 Cookie 写入 WebView Cookie 罐
 */
(function () {
  if (window.self === window.top) return;

  try {
    var ti =
      window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__ === 'object'
        ? window.__TAURI_INTERNALS__
        : {};
    if (!ti.plugins) ti.plugins = {};
    window.__TAURI_INTERNALS__ = ti;
    if (!window.__TAURI__) window.__TAURI__ = {};
  } catch (e) {
    /* ignore */
  }

  if (window.__READER_INNER_WEB_BRIDGE__) return;
  window.__READER_INNER_WEB_BRIDGE__ = true;

  var CHANNEL = 'reader-inner-web';
  var seq = 0;
  var pending = new Map();

  function replyToParent(id, payload) {
    try {
      window.parent.postMessage(Object.assign({ channel: CHANNEL, id: id }, payload), '*');
    } catch (e) {
      /* ignore */
    }
  }

  function callParent(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + String(++seq);
      pending.set(id, { resolve: resolve, reject: reject });
      try {
        window.parent.postMessage(
          { channel: CHANNEL, id: id, method: method, args: args || {} },
          '*'
        );
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.channel !== CHANNEL) return;
    if (d.method === 'readDocumentCookie' && d.id) {
      replyToParent(d.id, { result: document.cookie || '' });
      return;
    }
    if (!d.id) return;
    var p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  });

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
        callParent('syncDocumentCookie', {
          url: location.href,
          cookie: document.cookie,
        }).catch(function () {});
      },
    });
  }

  callParent('iframeReady', { url: location.href }).catch(function () {});
})();
