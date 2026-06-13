import { resolveInnerWebDocumentBaseUrl } from './inner-web-document-html';
import {
  extractProxiedDocumentQuery,
  patchProxiedDocumentLocationQuery,
} from './inner-web-proxied-query';
import { INNER_WEB_HOST_FIXES_SCRIPT } from './inner-web-host-fixes';

export { extractProxiedDocumentQuery, patchProxiedDocumentLocationQuery };

/** CF 验证页放宽 CSP，允许书源域 img/script 等在 localhost 代理页加载 */
export const INNER_WEB_CF_RELAX_CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: data: blob:; img-src 'self' https: http: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: blob:; connect-src 'self' https: http: blob:; frame-src 'self' https: http:; style-src 'self' 'unsafe-inline' https: http:;">`;

/** 移除 meta refresh，避免 iframe 代理页内导航风暴 */
export function stripInnerWebMetaRefresh(html: string): string {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!/\bhttp-equiv\s*=\s*["']?refresh["']?/i.test(tag)) return tag;
    return '';
  });
}

/** @deprecated 使用 stripInnerWebMetaRefresh */
export const stripImportDeepLinkMetaRefresh = stripInnerWebMetaRefresh;

/** CF 挑战页 CSP 仅允许 img-src 'self'（localhost），须移除 meta 才能让书源域资源加载 */
export function stripInnerWebCspMetaTags(html: string): string {
  return html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?(?:Content-Security-Policy(?:-Report-Only)?)["']?[^>]*>/gi,
    '',
  ).replace(
    /<meta\b[^>]*content\s*=\s*["'][^"']*Content-Security-Policy[^"']*["'][^>]*http-equiv[^>]*>/gi,
    '',
  );
}

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
  /** 纯 Web Cloudflare 验证：子资源浏览器直连书源域 */
  cloudflareChallenge?: boolean;
}): string {
  const { targetOrigin, targetPageUrl, cookie, sessionId, proxyPath } = options;
  const documentTargetUrl = options.documentTargetUrl ?? targetPageUrl;
  const documentQuery = options.documentQuery ?? '';
  const cloudflareChallenge = options.cloudflareChallenge === true;
  const channel = 'reader-inner-web';
  return `(function(){
var NativeUSP=window.URLSearchParams;
var __readerNativeHrefGet=(function(){
  try{
    var d=Object.getOwnPropertyDescriptor(Location.prototype,'href');
    if(d&&d.get)return function(loc){return d.get.call(loc);};
  }catch(e){}
  return function(loc){return String(loc.href||'');};
})();
function actualFrameHref(){
  return __readerNativeHrefGet(window.location);
}
function isProxyFrameDocument(){
  try{return window.location.pathname.indexOf('__reader_http')>=0;}catch(e){return false;}
}
var DOC_TARGET=${JSON.stringify(documentTargetUrl)};
var DOC_QUERY=${JSON.stringify(documentQuery)};
var CF_CHALLENGE=${JSON.stringify(cloudflareChallenge)};
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
if(!CF_CHALLENGE)patchDocumentLocation();
var ORIGIN=${JSON.stringify(targetOrigin)};
var PAGE=${JSON.stringify(targetPageUrl)};
var SESSION=${JSON.stringify(sessionId)};
var CHANNEL=${JSON.stringify(channel)};
var NAV_CHANNEL='reader-inner-web-navigate';
var store=${JSON.stringify(cookie)};
function isImportDeepLink(u){
  return /^(legado|yuedu):\\/\\//i.test(String(u||'').trim());
}
function navigateToHost(href,target){
  try{
    var h=typeof resolveNavigateHref==='function'?resolveNavigateHref(href):String(href||'').trim();
    if(!h)return;
    var now=Date.now();
    var norm=typeof normalizeHrefForCompare==='function'?normalizeHrefForCompare(h):h;
    if(norm===__readerHostNavNorm&&now-__readerHostNavAt<1500)return;
    __readerHostNavNorm=norm;
    __readerHostNavAt=now;
    window.parent.postMessage({channel:NAV_CHANNEL,href:h,target:target||null},'*');
  }catch(e){}
}
var __readerHostNavNorm='';
var __readerHostNavAt=0;
var __readerLastNavNorm='';
var __readerLastNavAt=0;
function normalizeHrefForCompare(u){
  try{
    var url=new URL(String(u),DOC_TARGET||actualFrameHref());
    url.hash='';
    var p=url.pathname.replace(/\\/+$/,'')||'/';
    return url.origin+p+url.search;
  }catch(e){return String(u);}
}
function navTargetKey(url){
  try{
    if(typeof resolveToTarget==='function'){
      var t=resolveToTarget(String(url||''));
      if(t&&/^https?:\\/\\//i.test(t))return normalizeHrefForCompare(t);
    }
  }catch(e){}
  return normalizeHrefForCompare(url);
}
function shouldSkipRepeatedNav(url){
  try{
    var key=navTargetKey(url);
    if(key===navTargetKey(actualFrameHref()))return true;
    if(DOC_TARGET&&key===normalizeHrefForCompare(DOC_TARGET))return true;
    var now=Date.now();
    if(key===__readerLastNavNorm&&now-__readerLastNavAt<1500)return true;
    __readerLastNavNorm=key;
    __readerLastNavAt=now;
  }catch(e){}
  return false;
}
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
function isAlreadyProxied(url){
  return String(url).indexOf('__reader_http')!==-1;
}
function isProxyFrameUrl(url){
  try{
    var u=new URL(String(url), PROXY_ORIGIN);
    return u.origin===PROXY_ORIGIN && u.pathname.indexOf('__reader_http')>=0;
  }catch(e){return false;}
}
function canonicalizeProxyHistoryUrl(raw){
  var s=String(raw);
  var marker='__reader_http';
  var idx=s.indexOf(marker);
  if(idx<0)return null;
  var rest=s.slice(idx+marker.length);
  if(rest.charAt(0)==='?')return proxyEndpoint()+rest;
  if(rest.charAt(0)==='/'&&rest.charAt(1)==='?')return proxyEndpoint()+rest.slice(1);
  return null;
}
function resolveToTarget(url){
  var s=String(url);
  if(isProxyFrameUrl(s)){
    try{
      var t=new URL(String(s), PROXY_ORIGIN).searchParams.get('target');
      if(t)return t;
    }catch(e){}
  }
  var canon=canonicalizeProxyHistoryUrl(s);
  if(canon){
    try{
      var t2=new URL(canon, PROXY_ORIGIN).searchParams.get('target');
      if(t2)return t2;
    }catch(e){}
  }
  return new URL(s,PAGE).href;
}
function resolveNavigateHref(url){
  try{
    var s=String(url||'').trim();
    if(!s)return '';
    if(/^https?:\\/\\//i.test(s))return resolveToTarget(s);
    return resolveToTarget(s);
  }catch(e){return String(url||'');}
}
function shouldNavigateDocumentViaHost(url){
  return isImportDeepLink(url);
}
function shouldProxyDocumentNavigate(abs){
  if(!isProxyFrameDocument())return false;
  if(isBrowserDirectPath(abs))return false;
  return /^https?:\\/\\//i.test(String(abs||''));
}
function navigateInFrame(url){
  if(isImportDeepLink(url)){navigateToHost(url);return;}
  var rw=rewriteHistoryUrl(url);
  if(shouldSkipRepeatedNav(rw))return;
  try{Location.prototype.assign.call(window.location,rw);}catch(e){window.location.assign(rw);}
}
function isBrowserDirectPath(abs){
  try{return new URL(abs).pathname.indexOf('/cdn-cgi/')!==-1;}catch(e){return false;}
}
function shouldProxySameOrigin(url){
  try{
    var abs=resolveToTarget(String(url));
    if(isAlreadyProxied(abs))return false;
    if(isBrowserDirectPath(abs))return false;
    return new URL(abs).origin===ORIGIN;
  }catch(e){return false;}
}
function shouldProxyRequest(url){
  if(shouldProxySameOrigin(url))return true;
  if(CF_CHALLENGE){
    try{
      var abs=resolveToTarget(String(url));
      if(isBrowserDirectPath(abs))return true;
    }catch(e){}
  }
  return false;
}
function shouldProxy(url){
  return shouldProxySameOrigin(url);
}
function proxyEndpoint(){
  if(PROXY_BASE.indexOf('http')===0)return PROXY_BASE;
  return PROXY_ORIGIN+(PROXY_BASE.charAt(0)==='/'?PROXY_BASE:'/'+PROXY_BASE);
}
function proxyUrl(url){
  var abs=resolveToTarget(url);
  var canon=canonicalizeProxyHistoryUrl(abs);
  if(canon)return canon;
  canon=canonicalizeProxyHistoryUrl(String(url));
  if(canon)return canon;
  if(isProxyFrameUrl(abs))return new URL(String(abs), PROXY_ORIGIN).href;
  if(abs.indexOf('/webfonts/')!==-1&&abs.indexOf('/static/webfonts/')===-1){
    abs=abs.replace(ORIGIN+'/webfonts/',ORIGIN+'/static/webfonts/');
  }
  var out=proxyEndpoint()+'?target='+encodeURIComponent(abs);
  if(SESSION)out+='&session='+encodeURIComponent(SESSION);
  return out;
}
function rewriteHistoryUrl(url){
  if(url==null||url==='')return url;
  try{
    var s=String(url);
    if(isImportDeepLink(s)){
      navigateToHost(s);
      return window.location.href;
    }
    if(s.charAt(0)==='#'||/^javascript:/i.test(s))return url;
    if(isProxyFrameUrl(s))return new URL(s, PROXY_ORIGIN).href;
    var canon=canonicalizeProxyHistoryUrl(s);
    if(canon)return canon;
    var abs=resolveToTarget(s);
    if(isProxyFrameUrl(abs))return new URL(String(abs), PROXY_ORIGIN).href;
    canon=canonicalizeProxyHistoryUrl(abs);
    if(canon)return canon;
    if(shouldProxyDocumentNavigate(abs))return proxyUrl(abs);
    if(new URL(abs).origin===ORIGIN)return proxyUrl(abs);
    return url;
  }catch(e){return url;}
}
function patchHistoryApi(){
  var rp=history.replaceState.bind(history);
  history.replaceState=function(state,title,url){
    return rp(state,title,url===undefined?url:rewriteHistoryUrl(url));
  };
  var pp=history.pushState.bind(history);
  history.pushState=function(state,title,url){
    return pp(state,title,url===undefined?url:rewriteHistoryUrl(url));
  };
}
patchHistoryApi();
function patchLocationNavigate(){
  var loc=Location.prototype;
  var rawAssign=loc.assign;
  if(rawAssign){
    loc.assign=function(url){
      if(shouldNavigateDocumentViaHost(url)){navigateToHost(url);return;}
      var rw=rewriteHistoryUrl(url);
      if(shouldSkipRepeatedNav(rw))return;
      return rawAssign.call(this,rw);
    };
  }
  var rawReplace=loc.replace;
  if(rawReplace){
    loc.replace=function(url){
      if(shouldNavigateDocumentViaHost(url)){navigateToHost(url);return;}
      var rw=rewriteHistoryUrl(url);
      if(shouldSkipRepeatedNav(rw))return;
      return rawReplace.call(this,rw);
    };
  }
}
patchLocationNavigate();
function patchLocationHrefSetter(){
  try{
    var loc=window.location;
    var proto=Location.prototype;
    var desc=Object.getOwnPropertyDescriptor(proto,'href');
    if(!desc||!desc.set)return;
    var rawSet=desc.set;
    var rawGet=desc.get;
    Object.defineProperty(proto,'href',{
      configurable:true,
      enumerable:desc.enumerable!==false,
      get:function(){
        if(!CF_CHALLENGE&&DOC_TARGET&&this===loc)return DOC_TARGET;
        return rawGet?rawGet.call(this):'';
      },
      set:function(v){
        if(isImportDeepLink(v)){navigateToHost(v);return;}
        var rw=rewriteHistoryUrl(v);
        if(shouldSkipRepeatedNav(rw))return;
        return rawSet.call(this,rw);
      }
    });
  }catch(e){}
}
patchLocationHrefSetter();
function interceptMetaRefresh(){
  try{
    document.querySelectorAll('meta[http-equiv]').forEach(function(m){
      if(String(m.getAttribute('http-equiv')).toLowerCase()!=='refresh')return;
      var c=String(m.getAttribute('content')||'');
      m.remove();
      var um=c.match(/url\\s*=\\s*([^;\\s]+)/i);
      if(!um)return;
      var u=um[1].replace(/^['"]|['"]$/g,'');
      var dm=c.match(/^\\s*(\\d+)/);
      var delay=dm?parseInt(dm[1],10)||0:0;
      if(isImportDeepLink(u)){
        if(delay<=0)navigateToHost(u);
        else setTimeout(function(){navigateToHost(u);},delay*1000);
      }else if(/^https?:\\/\\//i.test(u)){
        if(delay<=0)navigateInFrame(u);
        else setTimeout(function(){navigateInFrame(u);},delay*1000);
      }
    });
  }catch(e){}
}
interceptMetaRefresh();
if(typeof MutationObserver!=='undefined'){
  new MutationObserver(interceptMetaRefresh).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['http-equiv','content']});
}
try{
  var rawOpen=window.open;
  window.open=function(u,t,f){
    if(isImportDeepLink(u)){navigateToHost(u,t);return null;}
    return rawOpen.apply(window,arguments);
  };
}catch(e){}
if(CF_CHALLENGE){
  function stripRuntimeCspMetas(){
    try{
      document.querySelectorAll('meta[http-equiv="Content-Security-Policy"], meta[http-equiv="Content-Security-Policy-Report-Only"]').forEach(function(m){m.remove();});
    }catch(e){}
  }
  stripRuntimeCspMetas();
  if(typeof MutationObserver!=='undefined'){
    new MutationObserver(stripRuntimeCspMetas).observe(document.documentElement,{childList:true,subtree:true});
  }
}
function maybeProxyResourceUrl(url){
  if(url==null||url==='')return url;
  try{
    var s=String(url);
    if(s.charAt(0)==='#'||/^javascript:/i.test(s)||/^data:/i.test(s)||/^blob:/i.test(s))return url;
    var abs=resolveToTarget(s);
    if(isProxyFrameDocument()&&shouldProxyDocumentNavigate(abs))return proxyUrl(abs);
    if(shouldProxy(abs))return proxyUrl(abs);
    if(abs.startsWith('http'))return abs;
    return url;
  }catch(e){return url;}
}
function patchElementUrlProperty(proto,prop){
  var desc=Object.getOwnPropertyDescriptor(proto,prop);
  if(!desc||!desc.set)return;
  Object.defineProperty(proto,prop,{
    configurable:true,
    enumerable:desc.enumerable!==false,
    get:desc.get,
    set:function(v){desc.set.call(this,maybeProxyResourceUrl(v));}
  });
}
function patchDynamicResources(){
  patchElementUrlProperty(HTMLScriptElement.prototype,'src');
  if(typeof HTMLLinkElement!=='undefined'){
    patchElementUrlProperty(HTMLLinkElement.prototype,'href');
  }
  if(typeof HTMLAnchorElement!=='undefined'){
    patchElementUrlProperty(HTMLAnchorElement.prototype,'href');
  }
  if(typeof HTMLImageElement!=='undefined'){
    patchElementUrlProperty(HTMLImageElement.prototype,'src');
  }
  var rawSetAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){
    var n=String(name).toLowerCase();
    if(n==='src'||n==='href')value=maybeProxyResourceUrl(value);
    return rawSetAttribute.call(this,name,value);
  };
}
patchDynamicResources();
function bindImportDeepLinkCapture(){
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href]');
    if(!a)return;
    var raw=a.getAttribute('href')||'';
    if(!isImportDeepLink(raw)&&!isImportDeepLink(a.href))return;
    e.preventDefault();
    e.stopPropagation();
    navigateToHost(a.href,a.getAttribute('target'));
  },true);
}
bindImportDeepLinkCapture();
function withDirectInit(init){
  var o=Object.assign({},init||{});
  if(!o.credentials)o.credentials='include';
  return o;
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
  if(url){
    var abs=resolveToTarget(String(url));
    if(shouldProxyRequest(abs))return rawFetch(proxyUrl(url),buildProxyInit(input,init,url)).then(applySessionCookieHeader);
    if(abs.startsWith('http'))return rawFetch(abs,withDirectInit(init));
  }
  return rawFetch(input,init);
};
var XO=XMLHttpRequest.prototype.open;
var XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(m,u){
  this.__readerMethod=m;
  var abs=resolveToTarget(String(u));
  this.__readerProxied=shouldProxyRequest(abs);
  if(this.__readerProxied){
    this.__readerUrl=u;
    return XO.call(this,m,'about:blank');
  }
  this.withCredentials=true;
  return XO.call(this,m,abs.startsWith('http')?abs:u);
};
XMLHttpRequest.prototype.send=function(body){
  var self=this;
  if(self.__readerProxied){
    var u=self.__readerUrl;
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
  cloudflareChallenge?: boolean,
): string {
  const docUrl = documentTargetUrl?.trim() || targetUrl;
  const origin = new URL(docUrl).origin;
  const pageBase = resolveInnerWebDocumentBaseUrl(docUrl);
  const docQuery = extractProxiedDocumentQuery(docUrl);
  let patched = stripInnerWebMetaRefresh(patchProxiedDocumentLocationQuery(html, docUrl));
  if (cloudflareChallenge) {
    patched = stripInnerWebCspMetaTags(patched);
  }
  const snippet = `<script>${buildInnerWebInjectScript({
    targetOrigin: origin,
    targetPageUrl: pageBase,
    documentTargetUrl: docUrl,
    documentQuery: docQuery,
    cookie,
    sessionId,
    proxyPath,
    cloudflareChallenge,
  })}</script><script>${INNER_WEB_HOST_FIXES_SCRIPT}</script>`;
  const baseTag = cloudflareChallenge ? '' : `<base href="${pageBase}">`;
  const cfCspTag = cloudflareChallenge ? INNER_WEB_CF_RELAX_CSP_META : '';
  if (/<head[\s>]/i.test(patched)) {
    return patched.replace(/<head([^>]*)>/i, `<head$1>${cfCspTag}${baseTag}${snippet}`);
  }
  if (/<html[\s>]/i.test(patched)) {
    return patched.replace(/<html([^>]*)>/i, `<html$1><head>${cfCspTag}${baseTag}${snippet}</head>`);
  }
  return `<!DOCTYPE html><html><head>${cfCspTag}${baseTag}${snippet}</head><body>${patched}</body></html>`;
}
