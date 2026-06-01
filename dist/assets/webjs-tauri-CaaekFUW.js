import{i as c,a as s,q as o,t as u}from"./index-BJyKM90A.js";function _(e,r){const a=o(),i=u(e);return`
(async function() {
  ${a.replace(/`/g,"\\`")}
  try {
    var __exec = ${JSON.stringify(i)};
    var __fn = new Function('return (' + __exec + ')')();
    var __r = await __fn();
    var out = String(__r == null ? '' : __r);
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(r)},
      result: out,
      error: null
    });
  } catch (e) {
    await window.__TAURI_INTERNALS__.invoke('backstage_webjs_complete', {
      id: ${JSON.stringify(r)},
      result: '',
      error: String(e && e.message ? e.message : e)
    });
  }
})();
`.trim()}async function d(e){var i,t,n;if(!c())throw new Error("非 Tauri 环境");const r=typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():`bw-${Date.now()}`,a=e.delayMs??((i=e.script)!=null&&i.trim()?0:900);return s("run_backstage_webjs",{params:{requestId:r,url:((t=e.url)==null?void 0:t.trim())||void 0,html:e.html,baseUrl:e.baseUrl,script:_(e,r),bridgeScript:void 0,cookies:((n=e.cookies)==null?void 0:n.trim())||void 0,headersJson:e.headers?JSON.stringify(e.headers):void 0,delayMs:a,timeoutMs:e.timeoutMs??6e4,priorResult:e.priorResult,sourceRegex:e.sourceRegex,overrideUrlRegex:e.overrideUrlRegex}})}export{d as runWebJsInTauri};
