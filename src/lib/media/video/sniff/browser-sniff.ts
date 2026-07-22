/**
 * 内置嗅探浏览器（E5）：URL 检测 + 注入脚本片段
 * 实际 WebView 宿主由 UI 页挂载；此处提供检测与脚本
 */

const MEDIA_RE =
  /\.(m3u8|mpd|mp4|flv|ts|m4s|mkv)(\?|$)/i;

export type SniffHit = {
  url: string;
  kind: 'hls' | 'dash' | 'mp4' | 'flv' | 'other';
};

export function classifyMediaUrl(url: string): SniffHit['kind'] {
  const u = url.toLowerCase();
  if (u.includes('.m3u8')) return 'hls';
  if (u.includes('.mpd')) return 'dash';
  if (u.includes('.flv')) return 'flv';
  if (u.includes('.mp4')) return 'mp4';
  return 'other';
}

export function detectSniffUrlsFromText(text: string): SniffHit[] {
  const found = new Map<string, SniffHit>();
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0].replace(/[),.;]+$/, '');
    if (!MEDIA_RE.test(raw) && !/m3u8|mpd|mime=video/i.test(raw)) continue;
    if (!found.has(raw)) {
      found.set(raw, { url: raw, kind: classifyMediaUrl(raw) });
    }
  }
  return [...found.values()];
}

/** 注入到内置 WebView 的轻量嗅探脚本（postMessage 回传） */
export function buildSniffInjectScript(channel = 'reader-video-sniff'): string {
  return `(function(){
  var ch=${JSON.stringify(channel)};
  function report(u){
    try{parent.postMessage({channel:ch,url:String(u||'')},'*');}catch(e){}
  }
  function scan(){
    document.querySelectorAll('video,source').forEach(function(el){
      var s=el.currentSrc||el.src||el.getAttribute('src');
      if(s) report(s);
    });
  }
  var mo=new MutationObserver(scan);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  scan();
  var oOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    try{if(typeof u==='string'&&/m3u8|mpd|\\.mp4|\\.flv/i.test(u)) report(u);}catch(e){}
    return oOpen.apply(this,arguments);
  };
})();`;
}

const SNIFF_HISTORY_KEY = 'reader.video.sniffHistory.v1';

export function pushSniffHistory(url: string): void {
  try {
    const raw = localStorage.getItem(SNIFF_HISTORY_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [url, ...list.filter((x) => x !== url)].slice(0, 50);
    localStorage.setItem(SNIFF_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
}

export function loadSniffHistory(): string[] {
  try {
    const raw = localStorage.getItem(SNIFF_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
