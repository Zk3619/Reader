import{N as o,O as n,t as d}from"./toc-page-parser.worker-CujKpANG.js";async function c(t){const a=await o(),r=Date.now();await a.execute(`INSERT INTO ${n.sources}
      (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       enabled = excluded.enabled,
       script = excluded.script,
       script_url = excluded.script_url,
       version = excluded.version,
       custom_order = excluded.custom_order,
       meta_json = excluded.meta_json,
       updated_at = excluded.updated_at`,[t.id,t.kind,t.name,t.enabled?1:0,t.script??null,t.scriptUrl??null,t.version??null,t.customOrder,t.metaJson||"{}",t.createdAt??r,t.updatedAt??r])}async function m(t){await(await o()).execute(`DELETE FROM ${n.sources} WHERE id = ?`,[t])}async function u(t){const a=await o(),r=Date.now();let i=0;for(const e of t){const s=String(e??"").trim();s&&(await a.execute(`INSERT OR IGNORE INTO ${n.searchKeywords} (word, usage, lastUseTime)
       VALUES (?, 1, ?)`,[s,r-i]),i+=1)}}async function l(t){if(await d(t,n.sources)&&await d(t,n.searchKeywords)){try{const{getMusicConfigCache:a,warmMusicConfigCache:r}=await import("./music-config-storage-B6WKqujA.js").then(function(e){return e.m});await r();const i=a();Array.isArray(i.searchHistory)&&i.searchHistory.length>0&&await u(i.searchHistory)}catch(a){console.warn("[数据库] 音频搜索历史迁入失败:",a)}try{const{listUserApiScripts:a}=await import("./user-api-engine-DLLJyBKz.js").then(function(e){return e.t}),r=a();let i=100;for(const e of r)await c({id:e.id,kind:"user_api",name:e.name||e.id,enabled:!!e.enabled,script:typeof e.script=="string"?e.script:void 0,version:typeof e.version=="string"?e.version:void 0,customOrder:i++,metaJson:JSON.stringify({allowShowUpdateAlert:e.allowShowUpdateAlert??!0})})}catch(a){console.warn("[数据库] UserApi 源迁入失败:",a)}}}var w=Object.freeze({__proto__:null,migrateAudioSettingsIntoDb:l});export{m as d,w as m,c as u};
