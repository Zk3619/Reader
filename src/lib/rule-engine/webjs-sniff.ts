/**
 * Legado sourceRegex / overrideUrlRegex 嗅探（Web + Tauri 共用脚本片段）
 */

export interface WebJsSniffOptions {
  sourceRegex?: string;
  overrideUrlRegex?: string;
  timeoutMs?: number;
  pollMs?: number;
}

/** 在页面内等待嗅探命中，返回捕获 URL 或 null（继续走常规 HTML） */
export function buildWebJsSniffScript(opts: WebJsSniffOptions): string {
  const sourceRe = opts.sourceRegex?.trim();
  const overrideRe = opts.overrideUrlRegex?.trim();
  if (!sourceRe && !overrideRe) return '';

  const timeout = opts.timeoutMs ?? 30_000;
  const poll = opts.pollMs ?? 200;

  return `
(function(){
  if (window.__READER_SNIFF_DONE__) return;
  window.__READER_SNIFF_DONE__ = true;
  window.__READER_SNIFF_URLS__ = window.__READER_SNIFF_URLS__ || [];
  var _fetch = window.fetch;
  if (_fetch && !_fetch.__readerPatched) {
    window.fetch = function() {
      try { window.__READER_SNIFF_URLS__.push(String(arguments[0])); } catch(e) {}
      return _fetch.apply(this, arguments);
    };
    window.fetch.__readerPatched = true;
  }
  var _open = XMLHttpRequest.prototype.open;
  if (_open && !_open.__readerPatched) {
    XMLHttpRequest.prototype.open = function(method, url) {
      try { window.__READER_SNIFF_URLS__.push(String(url)); } catch(e) {}
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.open.__readerPatched = true;
  }
  function matchAny(reStr, url) {
    if (!reStr || !url) return false;
    try { return new RegExp(reStr).test(url); } catch(e) { return false; }
  }
  window.__readerWaitSniff = function() {
    return new Promise(function(resolve) {
      var deadline = Date.now() + ${timeout};
      function tick() {
        var href = String(location.href || '');
        if (${JSON.stringify(overrideRe || '')} && matchAny(${JSON.stringify(overrideRe || '')}, href)) {
          resolve(href);
          return;
        }
        if (${JSON.stringify(sourceRe || '')}) {
          var list = window.__READER_SNIFF_URLS__ || [];
          for (var i = list.length - 1; i >= 0; i--) {
            if (matchAny(${JSON.stringify(sourceRe || '')}, list[i])) {
              resolve(list[i]);
              return;
            }
          }
        }
        if (Date.now() > deadline) {
          resolve(null);
          return;
        }
        setTimeout(tick, ${poll});
      }
      tick();
    });
  };
})();
`.trim();
}
