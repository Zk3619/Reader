/**
 * srcdoc 无法 loadDataWithBaseURL：隐藏 iframe 改 ajaxAwait / 父页 fetch + DOMParser
 */

export function buildRssSubframeFetchPatch(): string {
  return `
(function(){
  if(window.__READER_RSS_IFRAME_PATCH__)return;
  window.__READER_RSS_IFRAME_PATCH__=true;
  var nativeCreate=Document.prototype.createElement;
  function absUrl(u){
    try{return new URL(u,document.baseURI).href;}catch(e){return String(u||'');}
  }
  function fetchHtml(url){
    var abs=absUrl(url);
    if(typeof window.__READER_RSS_FETCH__==='function'){
      return window.__READER_RSS_FETCH__(abs);
    }
    if(typeof ajaxAwait==='function'){
      return Promise.resolve(ajaxAwait(abs));
    }
    if(typeof getAwait==='function'){
      return Promise.resolve(getAwait(abs));
    }
    return fetch(abs,{credentials:'include'}).then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.text();
    });
  }
  function pickImgUrl(img,base){
    var ds=img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('data-lazy-src');
    var src=img.getAttribute('src')||'';
    var pick=ds||src;
    if(!pick||pick.indexOf('data:')===0)return '';
    try{return new URL(pick,base||document.baseURI).href;}catch(e){return pick;}
  }
  function normalizeImages(doc,base){
    var urls=[];
    doc.querySelectorAll('img').forEach(function(img){
      var abs=pickImgUrl(img,base);
      if(abs){
        img.setAttribute('src',abs);
        img.removeAttribute('loading');
        urls.push(abs);
      }
    });
    return urls;
  }
  function parseDoc(html,base){
    var doc=new DOMParser().parseFromString(html||'','text/html');
    normalizeImages(doc,base);
    return doc;
  }
  function extractImageUrls(doc,base){
    var sel=['.content_left img','.content img','img'];
    var i,imgs,urls,out=[];
    for(i=0;i<sel.length;i++){
      imgs=doc.querySelectorAll(sel[i]);
      if(imgs&&imgs.length){
        imgs.forEach(function(img){
          var u=pickImgUrl(img,base)||'';
          if(u)out.push(u);
        });
        if(out.length)return out;
      }
    }
    return out;
  }
  Document.prototype.createElement=function(tagName,options){
    var tag=String(tagName).toLowerCase();
    if(tag!=='iframe')return nativeCreate.call(this,tagName,options);
    var host=nativeCreate.call(this,'div');
    host.style.display='none';
    host.setAttribute('data-reader-rss-frame','1');
    var parsedDoc=null,assignedSrc='',userOnload=null,userOnerror=null;
    Object.defineProperty(host,'contentDocument',{get:function(){return parsedDoc;}});
    Object.defineProperty(host,'contentWindow',{get:function(){return null;}});
    Object.defineProperty(host,'src',{
      get:function(){return assignedSrc;},
      set:function(v){
        assignedSrc=String(v||'');
        var pageBase=absUrl(assignedSrc);
        fetchHtml(assignedSrc).then(function(html){
          parsedDoc=parseDoc(html,pageBase);
          if(userOnload)userOnload.call(host,{type:'load'});
        }).catch(function(err){
          if(userOnerror)userOnerror.call(host,err);
        });
      }
    });
    Object.defineProperty(host,'onload',{
      get:function(){return userOnload;},
      set:function(fn){userOnload=typeof fn==='function'?fn:null;}
    });
    Object.defineProperty(host,'onerror',{
      get:function(){return userOnerror;},
      set:function(fn){userOnerror=typeof fn==='function'?fn:null;}
    });
    return host;
  };
})();
`.trim();
}
