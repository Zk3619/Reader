/**
 * RSS 正文 HTML 文档：data/srcdoc 加载 + 脚本复活 + 图片桥接
 */

import { buildBlobDocumentUrl, revokeBlobDocumentUrl } from '@/lib/platform/inner-web-document-html';
import { inlineScriptTag } from '@/lib/rss-source/rss-inline-script';

export const RSS_IMG_CHANNEL = 'reader-rss-img';

/** Tauri WebView2：data URL 比 blob 更稳定执行内联脚本（对齐 inner-web-tauri panel） */
export function buildRssDataDocumentUrl(html: string): string {
  const b64 = btoa(unescape(encodeURIComponent(html)));
  return `data:text/html;charset=utf-8;base64,${b64}`;
}

/**
 * RSS ruleContent 不用 srcdoc（内联脚本在部分 WebView 不执行）。
 * 统一走 writeRssContentDocumentToFrame（对齐 Legado loadDataWithBaseURL）。
 */
export function shouldUseRssContentSrcdoc(): boolean {
  return false;
}

/** 正文脚本是否仍停在模板初始文案（未执行或执行失败） */
export function needsRssScriptRevive(doc: Document): boolean {
  const bar = doc.getElementById('statusBar');
  if (!bar) return false;
  const text = bar.textContent?.trim() ?? '';
  return text === '加载中…' || text === '加载中...' || text === '加载中';
}

/**
 * 将预取 HTML 写入 iframe（document.write + blob 回退），保证 head/body 脚本按序执行。
 * 返回 revoke，用于释放 blob: URL。
 */
export function writeRssContentDocumentToFrame(
  frame: HTMLIFrameElement,
  html: string,
): () => void {
  frame.removeAttribute('srcdoc');
  let blobUrl: string | undefined;

  const tryDocumentWrite = (): boolean => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return false;
      doc.open();
      doc.write(html);
      doc.close();
      return true;
    } catch {
      return false;
    }
  };

  if (!tryDocumentWrite()) {
    blobUrl = buildBlobDocumentUrl(html);
    frame.src = blobUrl;
  } else {
    frame.removeAttribute('src');
  }

  return () => {
    if (blobUrl) revokeBlobDocumentUrl(blobUrl);
  };
}

/** 正文内 CDN 图经父页 fetch→blob（iframe 无法带 Referer） */
export function buildRssContentImageBridgeScript(): string {
  const ch = RSS_IMG_CHANNEL;
  return `
(function(){
  if(window.__READER_RSS_IMG_BRIDGE__)return;
  window.__READER_RSS_IMG_BRIDGE__=true;
  var pending={};
  var phBlobCache={};
  var phBlobInflight={};
  var imgSrcDesc=null;
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
  function resolveAbs(raw){
    try{return new URL(raw,document.baseURI).href;}catch(e){return String(raw||'');}
  }
  function asImgNode(el){
    if(!el)return null;
    if(el.nodeType===1&&String(el.tagName||'').toUpperCase()==='IMG')return el;
    var t=el.target;
    if(t&&t.nodeType===1&&String(t.tagName||'').toUpperCase()==='IMG')return t;
    return null;
  }
  function isPlaceholderUrl(u){
    var s=String(u||'').toLowerCase();
    return s.indexOf('thumbnail.gif')!==-1||s.indexOf('/static/thumbnail')!==-1;
  }
  function needProxy(u){
    if(!u||u.indexOf('data:')===0||u.indexOf('blob:')===0)return false;
    if(u.indexOf('__reader_http')!==-1)return false;
    return /^https?:/i.test(u);
  }
  function setImgSrcRaw(img,url){
    img.setAttribute('data-reader-bypass','1');
    if(imgSrcDesc&&imgSrcDesc.set)imgSrcDesc.set.call(img,url);
    else img.setAttribute('src',url);
    img.removeAttribute('data-reader-bypass');
  }
  function rememberPlaceholder(img){
    var ph=img.getAttribute('data-reader-ph');
    if(ph)return ph;
    var cur=img.getAttribute('src');
    if(!cur)return null;
    var abs=resolveAbs(cur);
    if(isPlaceholderUrl(abs)){
      img.setAttribute('data-reader-ph',abs);
      return abs;
    }
    return null;
  }
  function ensurePlaceholderBlob(ph,cb){
    if(!ph){cb('');return;}
    if(ph.indexOf('blob:')===0||ph.indexOf('data:')===0){cb(ph);return;}
    if(phBlobCache[ph]){cb(phBlobCache[ph]);return;}
    if(!needProxy(ph)){cb(ph);return;}
    if(phBlobInflight[ph]){
      phBlobInflight[ph].push(cb);
      return;
    }
    phBlobInflight[ph]=[cb];
    fetchBlob(ph).then(function(blobUrl){
      phBlobCache[ph]=blobUrl;
      var cbs=phBlobInflight[ph]||[];
      delete phBlobInflight[ph];
      cbs.forEach(function(fn){fn(blobUrl);});
    }).catch(function(){
      var cbs=phBlobInflight[ph]||[];
      delete phBlobInflight[ph];
      cbs.forEach(function(fn){fn(ph);});
    });
  }
  function showPlaceholder(img,cb){
    var ph=img.getAttribute('data-reader-ph')||rememberPlaceholder(img);
    if(!ph){if(cb)cb();return;}
    ensurePlaceholderBlob(ph,function(blobPh){
      if(blobPh)setImgSrcRaw(img,blobPh);
      img.setAttribute('data-reader-img-loading','1');
      if(cb)cb();
    });
  }
  function shouldInterceptImgSrc(img,val){
    if(!img||!img.getAttribute)return false;
    if(img.getAttribute('data-reader-bypass')==='1')return false;
    var abs=resolveAbs(val);
    if(!needProxy(abs))return false;
    if(img.getAttribute('data-src')||img.getAttribute('data-reader-ph'))return true;
    return isPlaceholderUrl(abs);
  }
  function patchImg(el,forceTarget){
    var img=asImgNode(el);
    if(!img)return;
    bindImgError(img);
    rememberPlaceholder(img);
    var ds=img.getAttribute('data-src');
    var target=forceTarget||ds;
    if(!target)return;
    var abs=resolveAbs(target);
    if(!needProxy(abs))return;
    if(img.getAttribute('data-reader-inflight')===abs)return;
    img.setAttribute('data-reader-inflight',abs);
    img.setAttribute('data-reader-patching','1');
    img.removeAttribute('loading');
    showPlaceholder(img,function(){
      fetchBlob(abs).then(function(blobUrl){
        setImgSrcRaw(img,blobUrl);
        img.removeAttribute('data-reader-patching');
        img.removeAttribute('data-reader-inflight');
        img.removeAttribute('data-reader-img-loading');
        img.removeAttribute('data-reader-ph');
      }).catch(function(){
        img.removeAttribute('data-reader-inflight');
        img.removeAttribute('data-reader-patching');
        showPlaceholder(img);
      });
    });
  }
  function bindImgError(el){
    var img=asImgNode(el);
    if(!img)return;
    if(img.getAttribute('data-reader-err-bound')==='1')return;
    img.setAttribute('data-reader-err-bound','1');
    img.addEventListener('error',function(){
      if(img.getAttribute('data-reader-bypass')==='1')return;
      var cur=resolveAbs(img.getAttribute('src')||'');
      if(!cur||cur.indexOf('blob:')===0||cur.indexOf('data:')===0)return;
      if(img.getAttribute('data-reader-patching')==='1'){
        showPlaceholder(img);
        return;
      }
      var ds=img.getAttribute('data-src');
      if(ds&&needProxy(resolveAbs(ds))){
        showPlaceholder(img);
        patchImg(img);
      }
    },true);
  }
  function installImgSrcHooks(){
    if(window.__READER_RSS_IMG_HOOKS__)return;
    window.__READER_RSS_IMG_HOOKS__=true;
    imgSrcDesc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
    if(imgSrcDesc&&imgSrcDesc.set){
      Object.defineProperty(HTMLImageElement.prototype,'src',{
        set:function(val){
          if(shouldInterceptImgSrc(this,val)){
            patchImg(this,String(val||''));
            return;
          }
          imgSrcDesc.set.call(this,val);
        },
        get:imgSrcDesc.get,
        configurable:true
      });
    }
    var origSet=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name,val){
      if(this.tagName==='IMG'&&String(name).toLowerCase()==='src'&&shouldInterceptImgSrc(this,val)){
        patchImg(this,String(val||''));
        return;
      }
      return origSet.call(this,name,val);
    };
  }
  function watch(root){
    if(!root||!root.querySelectorAll)return;
    root.querySelectorAll('img').forEach(function(img){bindImgError(img);patchImg(img);});
    try{
      new MutationObserver(function(ms){
        ms.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if(n.nodeType!==1)return;
            if(n.tagName==='IMG'){bindImgError(n);patchImg(n);}
            if(n.querySelectorAll)n.querySelectorAll('img').forEach(function(img){bindImgError(img);patchImg(img);});
          });
          if(m.type==='attributes'&&m.target&&m.target.tagName==='IMG'){
            var attr=m.attributeName||'';
            if(attr==='data-src'||attr==='src')patchImg(m.target);
          }
        });
      }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-src','loading']});
    }catch(_){}
  }
  function boot(){
    var list=document.getElementById('imgList')||document.getElementById('box');
    if(list)watch(list);
    else watch(document.body||document.documentElement);
  }
  window.__READER_RSS_PATCH_IMG__=patchImg;
  installImgSrcHooks();
  boot();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot);
    new MutationObserver(function(){
      if(document.body)boot();
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
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

/** WebView 偶发不执行 body 内联脚本：加载后克隆重插（须在 fetch/iframe 补丁注入之后） */
export function reviveRssInlineScripts(doc: Document): number {
  const scripts = doc.querySelectorAll('body script:not([src])');
  let count = 0;
  scripts.forEach((old) => {
    if (old.getAttribute('data-reader-revived') === '1') return;
    const code = old.textContent?.trim();
    if (!code) return;
    try {
      new Function(code);
    } catch {
      old.setAttribute('data-reader-revived', '1');
      return;
    }
    const neu = doc.createElement('script');
    neu.textContent = code;
    neu.setAttribute('data-reader-revived', '1');
    old.parentNode?.replaceChild(neu, old);
    count += 1;
  });
  return count;
}
