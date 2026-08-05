import{bO as i,bP as d,bM as h}from"./index-DA1eigWE.js";function n(e){return{id:e.id,title:e.title||"",episodeUrl:e.episode_url||"",mediaUrl:e.media_url||"",bgmId:e.bgm_id??null,cachePath:e.cache_path,cacheTier:h(e.cache_tier),cachedAt:e.cached_at||0,cacheBytes:e.cache_bytes||0,cacheMime:e.cache_mime,localPath:e.local_path,isHls:(e.is_hls||0)===1,hasMedia:(e.has_media||0)===1}}async function _(e){const a=await i(),t=d.episodeCache;await a.execute(`INSERT INTO ${t} (
      id, title, episode_url, media_url, bgm_id, cache_path, cache_tier,
      cached_at, cache_bytes, cache_mime, local_path, is_hls, has_media
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      episode_url = excluded.episode_url,
      media_url = excluded.media_url,
      bgm_id = excluded.bgm_id,
      cache_path = excluded.cache_path,
      cache_tier = excluded.cache_tier,
      cached_at = excluded.cached_at,
      cache_bytes = excluded.cache_bytes,
      cache_mime = excluded.cache_mime,
      local_path = excluded.local_path,
      is_hls = excluded.is_hls,
      has_media = excluded.has_media`,[e.id,e.title,e.episodeUrl,e.mediaUrl,e.bgmId??null,e.cachePath??null,e.cacheTier,e.cachedAt,e.cacheBytes,e.cacheMime??null,e.localPath??null,e.isHls?1:0,e.hasMedia?1:0])}async function E(e){await(await i()).execute(`DELETE FROM ${d.episodeCache} WHERE id = ?`,[e])}async function C(e){var s,o;const a=await i(),t=d.episodeCache;if(e==="all"){const l=await a.select(`SELECT COUNT(*) as c FROM ${t}`);return await a.execute(`DELETE FROM ${t}`),((s=l[0])==null?void 0:s.c)??0}const c=await a.select(`SELECT COUNT(*) as c FROM ${t} WHERE cache_tier = ?`,[e]);return await a.execute(`DELETE FROM ${t} WHERE cache_tier = ?`,[e]),((o=c[0])==null?void 0:o.c)??0}async function p(){return(await(await i()).select(`SELECT * FROM ${d.episodeCache} ORDER BY cached_at DESC`)).map(n)}async function b(){const e=await i(),a=d.episodeCache,c=(await e.select(`SELECT
      COUNT(*) as count,
      SUM(CASE WHEN cache_tier = 'manual' THEN 1 ELSE 0 END) as manual_count,
      SUM(CASE WHEN cache_tier = 'auto' OR cache_tier IS NULL OR cache_tier = '' THEN 1 ELSE 0 END) as auto_count,
      COALESCE(SUM(cache_bytes), 0) as total_bytes,
      SUM(CASE WHEN has_media = 1 THEN 1 ELSE 0 END) as media_count,
      SUM(CASE WHEN is_hls = 1 THEN 1 ELSE 0 END) as hls_count
     FROM ${a}`))[0];return{count:(c==null?void 0:c.count)??0,autoCount:(c==null?void 0:c.auto_count)??0,manualCount:(c==null?void 0:c.manual_count)??0,totalBytes:(c==null?void 0:c.total_bytes)??0,mediaCount:(c==null?void 0:c.media_count)??0,hlsMetaCount:(c==null?void 0:c.hls_count)??0}}export{C as clearVideoEpisodeCacheIndexByTier,E as deleteVideoEpisodeCacheIndex,b as getVideoEpisodeCacheIndexStats,p as listVideoEpisodeCacheIndex,_ as upsertVideoEpisodeCacheIndex};
