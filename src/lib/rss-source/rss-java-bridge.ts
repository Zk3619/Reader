/**
 * RSS WebView java 桥：对齐 Legado RssJsExtensions（java.open 等）
 */

import type { RssSource } from '@/types';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';

export const RSS_READ_CHANNEL = 'reader-rss-read';

export interface RssJavaOpenPayload {
  channel: typeof RSS_READ_CHANNEL;
  action: 'javaOpen';
  name: string;
  url?: string;
  title?: string;
  origin?: string;
}

export interface RssJavaOpenHandlers {
  onOpenLogin: (source: RssSource) => void | Promise<void>;
  onOpenSort: (source: RssSource, sortName?: string, sortUrl?: string) => void;
  onOpenRss: (source: RssSource, url?: string, title?: string) => void;
  onOpenSearch?: (keyword: string, origin?: string) => void;
  onShowPhoto?: (src: string, sourceKey?: string) => void;
}

function parseSortOpenArgs(
  url?: string | null,
  title?: string | null,
): { sortName?: string; sortUrl?: string } {
  const u = url?.trim();
  if (!u) return {};
  if (u.startsWith('{')) {
    try {
      const obj = JSON.parse(u) as Record<string, string>;
      const [sortName, sortUrl] = Object.entries(obj)[0] ?? [];
      if (sortName) return { sortName, sortUrl };
    } catch {
      /* ignore */
    }
  }
  return { sortName: title?.trim() || undefined, sortUrl: u };
}

async function resolveTargetRssSource(
  current: RssSource,
  origin?: string | null,
): Promise<RssSource | null> {
  const key = origin?.trim();
  if (!key) return current;
  if (key === current.sourceUrl) return current;
  return (await rssSourcesDb.getRssSource(key)) ?? current;
}

/**
 * 处理 iframe 内 java.open(name, url, title, origin)
 * @returns 是否已消费（不再做默认导航）
 */
export async function handleRssJavaOpen(
  currentSource: RssSource,
  handlers: RssJavaOpenHandlers,
  name: string,
  url?: string | null,
  title?: string | null,
  origin?: string | null,
): Promise<boolean> {
  const action = name.trim().toLowerCase();
  const target = await resolveTargetRssSource(currentSource, origin);

  switch (action) {
    case 'login': {
      const loginSource = origin?.trim()
        ? ((await rssSourcesDb.getRssSource(origin.trim())) ?? target)
        : target;
      if (!loginSource?.loginUrl?.trim()) {
        return true;
      }
      await handlers.onOpenLogin(loginSource);
      return true;
    }
    case 'sort': {
      if (!target) return true;
      const { sortName, sortUrl } = parseSortOpenArgs(url, title);
      handlers.onOpenSort(target, sortName, sortUrl);
      return true;
    }
    case 'rss': {
      if (!target) return true;
      handlers.onOpenRss(target, url?.trim() || undefined, title?.trim() || undefined);
      return true;
    }
    case 'search': {
      const kw = title?.trim() || url?.trim();
      if (kw) handlers.onOpenSearch?.(kw, origin?.trim() || undefined);
      return true;
    }
    default:
      return false;
  }
}

/** iframe 内 java.open / showPhoto 桩脚本 */
export function buildRssJavaOpenShim(): string {
  const ch = RSS_READ_CHANNEL;
  return `
(function(){
  if(window.__READER_RSS_JAVA_OPEN__)return;
  window.__READER_RSS_JAVA_OPEN__=true;
  window.java=window.java||{};
  var j=window.java;
  if(!j.open){
    j.open=function(name,url,title,origin){
      try{
        window.parent.postMessage({channel:'${ch}',action:'javaOpen',name:String(name||''),url:url==null?undefined:String(url),title:title==null?undefined:String(title),origin:origin==null?undefined:String(origin)},'*');
      }catch(e){console.error('[rss java.open]',e);}
    };
  }
  if(!j.showPhoto){
    j.showPhoto=function(src){
      try{
        window.parent.postMessage({channel:'${ch}',action:'showPhoto',src:String(src||'')},'*');
      }catch(e){console.error('[rss showPhoto]',e);}
    };
  }
})();
`.trim();
}

/** 正文资源黑白名单（srcdoc / 可注入同源 iframe） */
export function buildRssResourceGuardScript(source: RssSource): string {
  const bl = (source.contentBlacklist ?? '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wl = (source.contentWhitelist ?? '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bl.length === 0 && wl.length === 0) return '';

  const rules = JSON.stringify({ blacklist: bl, whitelist: wl });
  return `
(function(){
  if(document.documentElement.dataset.readerRssGuard)return;
  document.documentElement.dataset.readerRssGuard='1';
  var rules=${rules};
  function blocked(url){
    if(!url||url.indexOf('data:')===0||url.indexOf('blob:')===0)return false;
    var u=String(url);
    var i,b,w;
    if(rules.blacklist.length){
      for(i=0;i<rules.blacklist.length;i++){
        b=rules.blacklist[i];
        if(u.indexOf(b)===0)return true;
        try{if(new RegExp(b).test(u))return true;}catch(_){}
      }
      return false;
    }
    if(rules.whitelist.length){
      for(w=0;w<rules.whitelist.length;w++){
        b=rules.whitelist[w];
        if(u.indexOf(b)===0)return false;
        try{if(new RegExp(b).test(u))return false;}catch(_){}
      }
      return true;
    }
    return false;
  }
  function scrub(el){
    if(!el||!el.getAttribute)return;
    var attrs=['src','href','data-src','data-original'];
    for(var i=0;i<attrs.length;i++){
      var a=attrs[i],v=el.getAttribute(a);
      if(v&&blocked(v)){if(el.tagName==='SCRIPT')el.remove();else el.removeAttribute(a);}
    }
  }
  function walk(root){
    if(!root||!root.querySelectorAll)return;
    root.querySelectorAll('img,script,link,iframe,video,audio,source').forEach(scrub);
  }
  walk(document);
  try{
    new MutationObserver(function(ms){
      ms.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.nodeType!==1)return;
          scrub(n);
          walk(n);
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href','data-src','data-original']});
  }catch(_){}
})();
`.trim();
}

export function rssSourceKey(source: RssSource): string {
  return rssAsBookSource(source).bookSourceUrl ?? source.sourceUrl;
}
