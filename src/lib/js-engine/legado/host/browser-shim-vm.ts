/**
 * QuickJS 内最小浏览器占位（发现/搜索脚本在 Function+with 下可落到 window/document）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid } from '@/lib/js-engine/core/runtime';

export function injectBrowserLegadoShims(vm: QuickJSContext, baseUrl: string): void {
  const base = JSON.stringify(baseUrl || '');
  evalCodeVoid(
    vm,
    `
    (function() {
      if (typeof globalThis.window !== 'undefined' && globalThis.window.location) return;
      var loc = { href: ${base}, origin: ${base}, protocol: 'https:', host: '', pathname: '/', search: '', hash: '' };
      try {
        var u = new URL(${base});
        loc.href = u.href;
        loc.origin = u.origin;
        loc.protocol = u.protocol;
        loc.host = u.host;
        loc.pathname = u.pathname || '/';
        loc.search = u.search || '';
        loc.hash = u.hash || '';
      } catch (e) {}
      var stubEl = {
        ownerDocument: null,
        style: {},
        setAttribute: function() {},
        getAttribute: function() { return ''; },
        appendChild: function() { return this; },
        removeChild: function() { return this; },
        innerHTML: '',
        textContent: '',
        childNodes: []
      };
      stubEl.ownerDocument = stubEl;
      var doc = {
        ownerDocument: null,
        documentElement: stubEl,
        body: stubEl,
        head: stubEl,
        createElement: function() { return stubEl; },
        createTextNode: function(t) { return { nodeValue: String(t == null ? '' : t), textContent: String(t == null ? '' : t) }; },
        getElementById: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; }
      };
      doc.ownerDocument = doc;
      globalThis.document = doc;
      globalThis.window = {
        location: loc,
        document: doc,
        navigator: { userAgent: 'Reader/Web' },
        setTimeout: function(fn) { try { fn(); } catch (e) {} return 0; },
        clearTimeout: function() {}
      };
    })();
  `,
  );
}
