/**
 * srcdoc 正文内 img 走 __reader_http 代理（携带 Referer / Cookie）
 */

export function buildRssContentImageProxyScript(
  sessionId: string,
  proxyPath: string,
): string {
  return `
(function(){
  if(window.__READER_RSS_IMG_PROXY__)return;
  window.__READER_RSS_IMG_PROXY__=true;
  var sid=${JSON.stringify(sessionId)};
  var base=${JSON.stringify(proxyPath)};
  function proxyRoot(){
    if(base.indexOf('://')>=0)return base.replace(/\\/$/,'');
    var roots=[window.top,window.parent,window];
    for(var i=0;i<roots.length;i++){
      try{
        var loc=roots[i]&&roots[i].location;
        if(loc&&loc.href)return new URL(base,loc.href).href.replace(/\\/$/,'');
      }catch(_){}
    }
    return base;
  }
  function proxify(u){
    if(!u||u.indexOf('data:')===0||u.indexOf('blob:')===0)return u;
    if(u.indexOf('__reader_http')!==-1)return u;
    try{
      var abs=new URL(u,document.baseURI).href;
      return proxyRoot()+'?target='+encodeURIComponent(abs)+'&session='+encodeURIComponent(sid);
    }catch(e){return u;}
  }
  function patchImg(img){
    var raw=img.getAttribute('src');
    if(!raw)return;
    img.removeAttribute('loading');
    img.loading='eager';
    var next=proxify(raw);
    if(next&&next!==raw)img.setAttribute('src',next);
  }
  function watch(root){
    if(!root||!root.querySelectorAll)return;
    root.querySelectorAll('img').forEach(patchImg);
    try{
      new MutationObserver(function(ms){
        ms.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if(n.nodeType===1){
              if(n.tagName==='IMG')patchImg(n);
              if(n.querySelectorAll)n.querySelectorAll('img').forEach(patchImg);
            }
          });
          if(m.type==='attributes'&&m.target&&m.target.tagName==='IMG')patchImg(m.target);
        });
      }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-src','loading']});
    }catch(_){}
  }
  var list=document.getElementById('imgList');
  if(list)watch(list);
  else document.addEventListener('DOMContentLoaded',function(){
    var el=document.getElementById('imgList');
    if(el)watch(el);
  });
})();
`.trim();
}

/** content 模式：有 Cookie 或书源头时走资源代理 */
export function rssContentNeedsAssetProxy(input: {
  pageUrl: string;
  cookies?: string;
  headers?: Record<string, string>;
}): boolean {
  if (!input.pageUrl.trim().startsWith('http')) return false;
  if (input.cookies?.trim()) return true;
  return Object.keys(input.headers ?? {}).length > 0;
}
