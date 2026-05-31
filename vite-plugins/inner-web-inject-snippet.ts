import { resolveInnerWebDocumentBaseUrl } from './inner-web-document-html';
import {
  extractProxiedDocumentQuery,
  patchProxiedDocumentLocationQuery,
} from './inner-web-proxied-query';

export { extractProxiedDocumentQuery, patchProxiedDocumentLocationQuery };

export function buildInnerWebInjectScript(options: {
  targetOrigin: string;
  targetPageUrl: string;
  /** 被代理的真实文档 URL（session.target） */
  documentTargetUrl?: string;
  /** 真实文档 query，不含 `?` */
  documentQuery?: string;
  cookie: string;
  sessionId: string;
  proxyPath: string;
}): string {
  const { targetOrigin, targetPageUrl, cookie, sessionId, proxyPath } = options;
  const documentTargetUrl = options.documentTargetUrl ?? targetPageUrl;
  const documentQuery = options.documentQuery ?? '';
  const channel = 'reader-inner-web';
  return `(function(){
var NativeUSP=window.URLSearchParams;
var DOC_TARGET=${JSON.stringify(documentTargetUrl)};
var DOC_QUERY=${JSON.stringify(documentQuery)};
var PROXY_ORIGIN=window.location.origin;
var PROXY_BASE=${JSON.stringify(proxyPath)};
function docSearchString(){
  if(!DOC_QUERY)return'';
  return DOC_QUERY.charAt(0)==='?'?DOC_QUERY:'?'+DOC_QUERY;
}
function queryFromDocTarget(){
  if(DOC_QUERY)return DOC_QUERY;
  try{
    var sp=new NativeUSP(window.location.search);
    var t=sp.get('target');
    if(!t&&DOC_TARGET)t=DOC_TARGET;
    if(!t)return'';
    var i=t.indexOf('?');
    return i>=0?t.slice(i+1):'';
  }catch(e){return'';}
}
function isProxyFrameSearch(s){
  var t=String(s||'');
  return /(?:^|[?&])target=/.test(t)&&/(?:^|[?&])session=/.test(t);
}
function needsQueryFix(s){
  if(!s||!String(s).trim())return true;
  return isProxyFrameSearch(s);
}
function queryFromProxyLocationSearch(s){
  try{
    var raw=String(s||'');
    if(raw.charAt(0)==='?')raw=raw.slice(1);
    var sp=new NativeUSP(raw);
    var t=sp.get('target');
    if(!t)return'';
    var i=t.indexOf('?');
    return i>=0?t.slice(i+1):'';
  }catch(e){return'';}
}
function PatchedUSP(init){
  var s=init===undefined||init===null?'':String(init);
  if(needsQueryFix(s)){
    var q=queryFromDocTarget();
    if(!q)q=queryFromProxyLocationSearch(s);
    if(q)s=q.charAt(0)==='?'?q.slice(1):q;
  }
  return new NativeUSP(s);
}
PatchedUSP.prototype=NativeUSP.prototype;
window.URLSearchParams=PatchedUSP;
function patchDocumentLocation(){
  if(!DOC_TARGET)return;
  try{
    var loc=window.location;
    var docUrl=new URL(DOC_TARGET);
    var searchVal=docSearchString()||docUrl.search;
    var proto=Location.prototype;
    function patchGetter(name,val){
      var d=Object.getOwnPropertyDescriptor(proto,name)||Object.getOwnPropertyDescriptor(loc,name);
      if(!d||!d.get)return;
      Object.defineProperty(proto,name,{
        configurable:true,
        enumerable:d.enumerable!==false,
        get:function(){return this===loc?val:d.get.call(this);},
        set:d.set
      });
    }
    patchGetter('search',searchVal);
    patchGetter('href',DOC_TARGET);
    patchGetter('pathname',docUrl.pathname);
    patchGetter('host',docUrl.host);
    patchGetter('hostname',docUrl.hostname);
    patchGetter('origin',docUrl.origin);
    patchGetter('protocol',docUrl.protocol+':');
  }catch(e){}
}
patchDocumentLocation();
var ORIGIN=${JSON.stringify(targetOrigin)};
var PAGE=${JSON.stringify(targetPageUrl)};
var SESSION=${JSON.stringify(sessionId)};
var CHANNEL=${JSON.stringify(channel)};
var store=${JSON.stringify(cookie)};
function mergeCookie(prev,add){
  var map={};
  String(prev||'').split(';').forEach(function(p){
    p=p.trim();if(!p)return;
    var i=p.indexOf('=');
    if(i<0)return;
    map[p.slice(0,i).trim()]=p.slice(i+1).trim();
  });
  String(add||'').split(';').forEach(function(p){
    p=p.trim();if(!p)return;
    var i=p.indexOf('=');
    if(i<0)return;
    map[p.slice(0,i).trim()]=p.slice(i+1).trim();
  });
  return Object.keys(map).map(function(k){return k+'='+map[k];}).join(';');
}
function syncParent(){
  try{
    window.parent.postMessage({channel:CHANNEL,id:'sync',method:'syncDocumentCookie',args:{sessionId:SESSION,cookie:store}},'*');
  }catch(e){}
}
function resolveToTarget(url){
  return new URL(url,PAGE).href;
}
function shouldProxy(url){
  try{return new URL(url,PAGE).origin===ORIGIN;}catch(e){return false;}
}
function proxyEndpoint(){
  if(PROXY_BASE.indexOf('http')===0)return PROXY_BASE;
  return PROXY_ORIGIN+(PROXY_BASE.charAt(0)==='/'?PROXY_BASE:'/'+PROXY_BASE);
}
function proxyUrl(url){
  var abs=resolveToTarget(url);
  if(abs.indexOf('/webfonts/')!==-1&&abs.indexOf('/static/webfonts/')===-1){
    abs=abs.replace(ORIGIN+'/webfonts/',ORIGIN+'/static/webfonts/');
  }
  var out=proxyEndpoint()+'?target='+encodeURIComponent(abs);
  if(SESSION)out+='&session='+encodeURIComponent(SESSION);
  return out;
}
function withCookie(init){
  init=init||{};
  var h=new Headers(init.headers||{});
  if(store)h.set('X-Reader-Cookie',store);
  var o=Object.assign({},init,{headers:h,credentials:'omit'});
  return o;
}
function buildProxyInit(input,init,url){
  var o=withCookie(init);
  if(input&&typeof input==='object'&&input.url){
    var req=input;
    if(req.method)o.method=req.method;
    if(req.body!=null&&o.body==null)o.body=req.body;
    if(req.headers){
      var rh=new Headers(o.headers||{});
      req.headers.forEach(function(v,k){if(!rh.has(k))rh.set(k,v);});
      o.headers=rh;
    }
    if(req.signal&&!o.signal)o.signal=req.signal;
  }
  try{
    var abs=resolveToTarget(url);
    var methodUpper=String(o.method||'GET').toUpperCase();
    if(methodUpper==='GET'||methodUpper==='HEAD'){
      var hs=o.headers;
      if(hs&&hs.delete){hs.delete('Content-Type');hs.delete('content-type');}
    }
    if(methodUpper==='POST'&&abs.indexOf('/user_api')!==-1){
      delete o.body;
      var hs=o.headers;
      if(hs&&hs.delete){hs.delete('Content-Type');hs.delete('content-type');}
    }
  }catch(e){}
  return o;
}
function applySessionCookieHeader(r){
  try{
    var h=r.headers&&r.headers.get&&r.headers.get('X-Reader-Session-Cookie');
    if(h){store=String(h);syncParent();}
  }catch(e){}
  return r;
}
var rawFetch=window.fetch.bind(window);
window.fetch=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url);
  if(url&&shouldProxy(url))return rawFetch(proxyUrl(url),buildProxyInit(input,init,url)).then(applySessionCookieHeader);
  return rawFetch(input,init);
};
var XO=XMLHttpRequest.prototype.open;
var XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(m,u){
  this.__readerMethod=m;
  this.__readerUrl=u;
  return XO.apply(this,arguments);
};
XMLHttpRequest.prototype.send=function(body){
  var self=this;
  var u=self.__readerUrl;
  if(u&&shouldProxy(u)){
    var m=(self.__readerMethod||'GET').toUpperCase();
    var init={method:m};
    if(!(m==='POST'&&resolveToTarget(u).indexOf('/user_api')!==-1))init.body=body;
    rawFetch(proxyUrl(u),withCookie(init))
      .then(function(r){applySessionCookieHeader(r);return r.text().then(function(t){
        Object.defineProperty(self,'status',{value:r.status});
        Object.defineProperty(self,'responseText',{value:t});
        Object.defineProperty(self,'readyState',{value:4});
        if(self.onreadystatechange)self.onreadystatechange();
        if(self.onload)self.onload();
      });})
      .catch(function(){
        if(self.onerror)self.onerror();
      });
    return;
  }
  return XS.apply(this,arguments);
};
try{
  Object.defineProperty(document,'cookie',{
    configurable:true,
    enumerable:true,
    get:function(){return store;},
    set:function(v){store=mergeCookie(store,v);syncParent();}
  });
}catch(e){}
window.addEventListener('message',function(ev){
  var d=ev.data;
  if(!d||d.channel!==CHANNEL||!d.id)return;
  if(d.method==='exportCookies'){
    syncParent();
    try{ev.source.postMessage({channel:CHANNEL,id:d.id,result:store},ev.origin||'*');}catch(e){}
  }
});
window.addEventListener('beforeunload',function(){syncParent();});
window.addEventListener('pagehide',function(){syncParent();});
syncParent();
})();`;
}

/** @deprecated 使用 patchProxiedDocumentLocationQuery */
export const patchParagraphReviewEmbeddedQuery = patchProxiedDocumentLocationQuery;

export function injectHtmlForInnerWeb(
  html: string,
  targetUrl: string,
  cookie: string,
  sessionId: string,
  proxyPath: string,
  documentTargetUrl?: string,
): string {
  const docUrl = documentTargetUrl?.trim() || targetUrl;
  const origin = new URL(docUrl).origin;
  const pageBase = resolveInnerWebDocumentBaseUrl(docUrl);
  const docQuery = extractProxiedDocumentQuery(docUrl);
  const patched = patchProxiedDocumentLocationQuery(html, docUrl);
  const snippet = `<script>${buildInnerWebInjectScript({
    targetOrigin: origin,
    targetPageUrl: pageBase,
    documentTargetUrl: docUrl,
    documentQuery: docQuery,
    cookie,
    sessionId,
    proxyPath,
  })}</script>`;
  const baseTag = `<base href="${pageBase}">`;
  if (/<head[\s>]/i.test(patched)) {
    return patched.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${snippet}`);
  }
  if (/<html[\s>]/i.test(patched)) {
    return patched.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}${snippet}</head>`);
  }
  return `<!DOCTYPE html><html><head>${baseTag}${snippet}</head><body>${patched}</body></html>`;
}
