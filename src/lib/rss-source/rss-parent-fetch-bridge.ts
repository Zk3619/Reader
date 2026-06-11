/**
 * srcdoc / iframe 内分页拉图：经父页 HTTP 代理（对齐 Legado WebView 同源 iframe + Cookie）
 */

export const RSS_FETCH_CHANNEL = 'reader-rss-fetch';

export function buildRssParentFetchBridgeScript(): string {
  const ch = RSS_FETCH_CHANNEL;
  return `
(function(){
  if(window.__READER_RSS_FETCH__)return;
  window.__READER_RSS_FETCH__=function(url){
    return new Promise(function(resolve,reject){
      var id='rf_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
      var done=false;
      function finish(fn,val){
        if(done)return;
        done=true;
        window.removeEventListener('message',onMsg);
        fn(val);
      }
      function onMsg(ev){
        var d=ev.data;
        if(!d||d.channel!=='${ch}'||d.id!==id)return;
        if(d.ok)finish(resolve,d.body==null?'':String(d.body));
        else finish(reject,new Error(d.error||'fetch failed'));
      }
      window.addEventListener('message',onMsg);
      try{
        window.parent.postMessage({channel:'${ch}',id:id,url:String(url||'')},'*');
      }catch(e){
        finish(reject,e);
        return;
      }
      setTimeout(function(){
        finish(reject,new Error('fetch timeout'));
      },60000);
    });
  };
})();
`.trim();
}

/** ruleContent 内用隐藏 iframe 拉图 */
export function rssContentNeedsSubframeBridge(html: string, enableJs: boolean): boolean {
  if (!enableJs) return false;
  return /createElement\s*\(\s*['"]iframe/i.test(html) || /<iframe[\s>]/i.test(html);
}
