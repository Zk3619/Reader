import{i as c,a as d,y as w,z as y}from"./index-SRncctmo.js";function f(e,t){const i=w(),r=y(e);return`
(async function() {
  ${i.replace(/`/g,"\\`")}
  try {
    var __exec = ${JSON.stringify(r)};
    var __fn = new Function('return (' + __exec + ')')();
    var __r = await __fn();
    var out = String(__r == null ? '' : __r);
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(t)},
      result: out,
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(t)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim()}async function b(e){var r;if(!c())throw new Error("非 Tauri 环境");const t=typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():`bw-html-${Date.now()}`,i=`
(async function() {
  try {
    if (document.readyState !== 'complete') {
      await new Promise(function(resolve) {
        if (document.readyState === 'complete') { resolve(); return; }
        window.addEventListener('load', resolve, { once: true });
      });
    }
    await new Promise(function(r) { setTimeout(r, 400); });
    var out = document.documentElement ? document.documentElement.outerHTML : '';
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(t)},
      result: String(out),
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(t)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim();return d("run_backstage_webjs",{params:{requestId:t,url:e.url.trim(),script:i,cookies:((r=e.cookies)==null?void 0:r.trim())||void 0,headersJson:e.headers?JSON.stringify(e.headers):void 0,delayMs:e.delayMs??2e3,timeoutMs:e.timeoutMs??9e4}})}async function h(e){var l,m;if(!c())throw new Error("非 Tauri 环境");const t=e.url.trim();let i=t;try{i=`${new URL(t).origin}/`}catch{}const r={...e.headers??{}};delete r.Cookie,delete r.cookie;const n=r["Content-Type"]??r["content-type"]??"application/x-www-form-urlencoded",a=((l=e.responseCharset)==null?void 0:l.trim())??"";let o=t;try{o=`${new URL(t).origin}/`}catch{}o=String(r.Referer??r.referer??o).trim();const u={"Content-Type":n,Accept:r.Accept??r.accept??"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"};o&&(u.Referer=o);const s=typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():`bw-post-${Date.now()}`,_=`
(async function() {
  try {
    var resp = await fetch(${JSON.stringify(t)}, {
      method: 'POST',
      credentials: 'include',
      headers: ${JSON.stringify(u)},
      body: ${JSON.stringify(e.body)}
    });
    var buf = await resp.arrayBuffer();
    var bytes = new Uint8Array(buf);
    var charset = ${JSON.stringify(a.toLowerCase())};
    var out = '';
    if (/^gb/.test(charset)) {
      try { out = new TextDecoder('gbk').decode(bytes); } catch (e) { out = new TextDecoder('utf-8').decode(bytes); }
    } else {
      out = new TextDecoder('utf-8').decode(bytes);
    }
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(s)},
      result: String(out),
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(s)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim();return d("run_backstage_webjs",{params:{requestId:s,url:i,script:_,cookies:((m=e.cookies)==null?void 0:m.trim())||void 0,headersJson:e.headers?JSON.stringify(r):void 0,delayMs:2200,timeoutMs:e.timeoutMs??9e4}})}async function p(e){var r,n,a;if(!c())throw new Error("非 Tauri 环境");const t=typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():`bw-${Date.now()}`,i=e.delayMs??((r=e.script)!=null&&r.trim()?0:900);return d("run_backstage_webjs",{params:{requestId:t,url:((n=e.url)==null?void 0:n.trim())||void 0,html:e.html,baseUrl:e.baseUrl,script:f(e,t),bridgeScript:void 0,cookies:((a=e.cookies)==null?void 0:a.trim())||void 0,headersJson:e.headers?JSON.stringify(e.headers):void 0,delayMs:i,timeoutMs:e.timeoutMs??6e4,priorResult:e.priorResult,sourceRegex:e.sourceRegex,overrideUrlRegex:e.overrideUrlRegex}})}export{b as runBackstageFetchHtml,h as runBackstageFetchPost,p as runWebJsInTauri};
