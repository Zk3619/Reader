/**
 * RSS 正文 HTML 文档：data/srcdoc 加载 + 脚本复活 + 图片桥接
 */

import { isTauri } from '@/lib/platform/detect';
import { inlineScriptTag } from '@/lib/rss-source/rss-inline-script';

export const RSS_IMG_CHANNEL = 'reader-rss-img';

/** Tauri WebView2：data URL 比 blob 更稳定执行内联脚本（对齐 inner-web-tauri panel） */
export function buildRssDataDocumentUrl(html: string): string {
  const b64 = btoa(unescape(encodeURIComponent(html)));
  return `data:text/html;charset=utf-8;base64,${b64}`;
}

/** RSS ruleContent 始终用预取 HTML，不走书源直连 URL */
export function shouldUseRssContentSrcdoc(): boolean {
  return !isTauri();
}

/** 正文内 CDN 图经父页 fetch→blob（iframe 无法带 Referer） */
export function buildRssContentImageBridgeScript(): string {
  const ch = RSS_IMG_CHANNEL;
  return `
(function(){
  if(window.__READER_RSS_IMG_BRIDGE__)return;
  window.__READER_RSS_IMG_BRIDGE__=true;
  var pending={};
  function fetchBlob(url){
    return new Promise(function(resolve,reject){
      var id='ri_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
      var done=false;
      function finish(fn,v){
        if(done)return;
        done=true;
        delete pending[id];
        fn(v);
      }
      pending[id]={resolve:function(u){finish(resolve,u);},reject:function(e){finish(reject,e);}};
      try{
        window.parent.postMessage({channel:'${ch}',id:id,url:String(url||'')},'*');
      }catch(e){
        finish(reject,e);
        return;
      }
      setTimeout(function(){finish(reject,new Error('img timeout'));},60000);
    });
  }
  window.addEventListener('message',function(ev){
    var d=ev.data;
    if(!d||d.channel!=='${ch}'||!d.id||!pending[d.id])return;
    var p=pending[d.id];
    if(d.ok&&d.blobUrl)p.resolve(String(d.blobUrl));
    else p.reject(new Error(d.error||'img failed'));
  });
  function needProxy(u){
    if(!u||u.indexOf('data:')===0||u.indexOf('blob:')===0)return false;
    if(u.indexOf('__reader_http')!==-1)return false;
    return /^https?:/i.test(u);
  }
  function patchImg(img){
    var raw=img.getAttribute('src');
    if(!raw||!needProxy(raw))return;
    var abs;
    try{abs=new URL(raw,document.baseURI).href;}catch(e){abs=raw;}
    img.removeAttribute('loading');
    fetchBlob(abs).then(function(blobUrl){
      img.setAttribute('src',blobUrl);
    }).catch(function(){});
  }
  function watch(root){
    if(!root||!root.querySelectorAll)return;
    root.querySelectorAll('img').forEach(patchImg);
    try{
      new MutationObserver(function(ms){
        ms.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if(n.nodeType!==1)return;
            if(n.tagName==='IMG')patchImg(n);
            if(n.querySelectorAll)n.querySelectorAll('img').forEach(patchImg);
          });
          if(m.type==='attributes'&&m.target&&m.target.tagName==='IMG')patchImg(m.target);
        });
      }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-src','loading']});
    }catch(_){}
  }
  function boot(){
    var list=document.getElementById('imgList');
    if(list)watch(list);
    else watch(document.body||document.documentElement);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
`.trim();
}

export function injectRssContentImageBridge(html: string): string {
  const tag = inlineScriptTag(buildRssContentImageBridgeScript());
  const headIndex = html.indexOf('<head>');
  if (headIndex >= 0) {
    return `${html.slice(0, headIndex + 6)}${tag}${html.slice(headIndex + 6)}`;
  }
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `<head>${tag}</head>${html}`;
}

/** WebView 偶发不执行 body 内联脚本：加载后克隆重插 */
export function reviveRssInlineScripts(doc: Document): number {
  const scripts = doc.querySelectorAll('body script:not([src])');
  let count = 0;
  scripts.forEach((old) => {
    const code = old.textContent?.trim();
    if (!code) return;
    const neu = doc.createElement('script');
    neu.textContent = code;
    old.parentNode?.replaceChild(neu, old);
    count += 1;
  });
  return count;
}
