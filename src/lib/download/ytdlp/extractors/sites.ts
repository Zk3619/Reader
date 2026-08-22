/**
 * VimeoIE / TwitchIE / SoundcloudIE — 高价值站点精简实现。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const TWITCH_CLIENT_ID = 'ue6666qo983tsx6so1t0vnawi233wa';

const TWITCH_GQL_HASHES: Record<string, string> = {
  CollectionSideBar: '016e1e4ccee0eb4698eb3bf1a04dc1c077fb746c78c82bac9a8f0289658fbd1a',
  FilterableVideoTower_Videos:
    '67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f',
};

/** 对齐 yt-dlp TwitchBaseIE._download_base_gql */
function twitchGqlHeaders(ie: InfoExtractor): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Client-ID': TWITCH_CLIENT_ID,
  };
  try {
    const cookies = ie._get_cookies('https://gql.twitch.tv');
    const auth = cookies['auth-token'] || cookies['auth_token'];
    if (auth) headers.Authorization = `OAuth ${auth}`;
  } catch {
    /* ignore */
  }
  return headers;
}

/** 对齐 yt-dlp TwitchBaseIE._prefer_source：chunked/Source 优先 */
function twitchPreferSource(formats: Format[]): Format[] {
  const source = formats.find((f) => String(f.format_id || '').toLowerCase() === 'source');
  if (source) {
    source.quality = 10;
    source.format_note = source.format_note || 'Source';
    return formats;
  }
  for (const f of formats) {
    if (/\/chunked\//i.test(String(f.url || ''))) {
      f.quality = 10;
      f.format_note = 'Source';
    }
  }
  return formats;
}

/**
 * 对齐 yt-dlp `_download_access_token`：裸 GraphQL query（非 PlaybackAccessToken_Template 数组）。
 * @see https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/twitch.py
 */
async function twitchDownloadAccessToken(
  ie: InfoExtractor,
  videoId: string,
  tokenKind: 'video' | 'stream',
  paramName: string,
  paramValue: string,
): Promise<{ value: string; signature: string }> {
  const method = `${tokenKind}PlaybackAccessToken`;
  const query = `{
              ${method}(
                ${paramName}: "${paramValue}",
                params: {
                  platform: "web",
                  playerBackend: "mediaplayer",
                  playerType: "site"
                }
              )
              {
                value
                signature
              }
            }`;
  const resp = await ie._download_json<{
    data?: Record<string, { value?: string; signature?: string } | null | undefined>;
    errors?: Array<{ message?: string }>;
  }>('https://gql.twitch.tv/gql', videoId, `Downloading ${tokenKind} access token GraphQL`, {
    method: 'POST',
    headers: twitchGqlHeaders(ie),
    data: JSON.stringify({ query }),
  });
  const tokenObj = resp?.data?.[method];
  const value = tokenObj?.value;
  const signature = tokenObj?.signature;
  if (!value || !signature) {
    const gqlErr = (resp?.errors || [])
      .map((e) => e?.message)
      .filter(Boolean)
      .join('; ');
    throw new ExtractorError(
      gqlErr
        ? `Unable to get Twitch access token: ${gqlErr}`
        : 'Unable to get Twitch access token',
      { expected: true },
    );
  }
  return { value, signature };
}

type TwitchGqlOp = {
  operationName: string;
  variables: Record<string, unknown>;
};

function twitchMakeVideoEntry(
  ie: InfoExtractor,
  node: Record<string, unknown>,
): VideoInfo | null {
  const videoId = node.id;
  if (!videoId) return null;
  return ie.url_result(
    `https://www.twitch.tv/videos/${videoId}`,
    'TwitchVod',
    `v${videoId}`,
    String(node.title || ''),
  );
}

async function twitchDownloadGql<T>(
  ie: InfoExtractor,
  videoId: string,
  ops: TwitchGqlOp[],
  note: string,
): Promise<T | null> {
  const payload = ops.map((op) => ({
    ...op,
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: TWITCH_GQL_HASHES[op.operationName],
      },
    },
  }));
  const resp = await ie._download_json<T>('https://gql.twitch.tv/gql', videoId, note, {
    method: 'POST',
    headers: twitchGqlHeaders(ie),
    data: JSON.stringify(payload),
    fatal: false,
  });
  return resp ?? null;
}

export class VimeoIE extends InfoExtractor {
  static IE_NAME = 'vimeo';
  static IE_DESC = 'Vimeo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|album\/\d+\/video\/|video\/)?(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Vimeo id', { expected: true });

    const referer = `https://vimeo.com/${id}`;
    const headers = { Referer: referer };
    const configUrl = `https://player.vimeo.com/video/${id}/config`;
    const cfg = await this._download_json<Record<string, unknown>>(
      configUrl,
      id,
      'Downloading Vimeo config',
      { headers, fatal: false },
    );
    if (!cfg) throw new ExtractorError('Unable to fetch Vimeo config', { expected: true });

    const video = (cfg.video || {}) as Record<string, unknown>;
    const request = (cfg.request || {}) as Record<string, unknown>;
    const configFiles = (video.files || request.files || {}) as Record<string, unknown>;
    const formats: Format[] = [];

    const progressive = (configFiles.progressive as Record<string, unknown>[]) || [];
    for (const f of progressive.filter((x) => x.url)) {
      formats.push({
        format_id: `http-${f.quality || f.id || formats.length}`,
        url: String(f.url),
        ext: 'mp4',
        protocol: 'https',
        width: Number(f.width) || null,
        height: Number(f.height) || null,
        fps: Number(f.fps) || null,
        tbr: Number(f.bitrate) || null,
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    }

    for (const filesType of ['hls', 'dash'] as const) {
      const cdns = (configFiles[filesType] as Record<string, Record<string, unknown>> | undefined)
        ?.cdns;
      if (!cdns) continue;
      for (const [name, cdnRaw] of Object.entries(cdns)) {
        const cdn = cdnRaw as Record<string, unknown>;
        let manifestUrl = String(cdn.url || cdn.avc_url || '');
        if (!manifestUrl) continue;
        const formatId = `${filesType}-${name}`;
        if (filesType === 'dash') {
          if (manifestUrl.includes('json=1')) {
            const resolved = await this._download_json<{ url?: string }>(
              manifestUrl,
              id,
              `Resolving ${name} dash manifest`,
              { headers, fatal: false },
            );
            if (resolved?.url) manifestUrl = resolved.url;
          }
          const mpdUrl = manifestUrl.replace('/master.json', '/master.mpd');
          formats.push(
            ...(await this._extract_mpd_formats(mpdUrl, id, formatId, undefined, false, { headers })),
          );
          if (!formats.some((f) => f.format_id?.startsWith(formatId))) {
            formats.push({
              format_id: formatId,
              url: mpdUrl,
              ext: 'mp4',
              protocol: 'https',
              vcodec: 'unknown',
              acodec: 'unknown',
              http_headers: headers,
            });
          }
        } else {
          formats.push(
            ...(await this._extract_m3u8_formats(
              manifestUrl,
              id,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              formatId,
              undefined,
              false,
              { headers },
            )),
          );
          if (!formats.some((f) => f.format_id?.startsWith(formatId))) {
            formats.push({
              format_id: formatId,
              url: manifestUrl,
              ext: 'mp4',
              protocol: 'm3u8_native',
              vcodec: 'unknown',
              acodec: 'unknown',
              http_headers: headers,
            });
          }
        }
      }
    }

    if (!formats.length) throw new ExtractorError('No Vimeo formats', { expected: true });

    return {
      id,
      title: String(video.title || id),
      duration: Number(video.duration) || null,
      thumbnail:
        String((video.thumbs as Record<string, string>)?.base || video.thumbnail_url || '') ||
        undefined,
      webpage_url: referer,
      original_url: url,
      formats: this._sort_formats(formats),
      extractor: 'vimeo',
      extractor_key: 'Vimeo',
      http_headers: headers,
    };
  }
}

export class TwitchVodIE extends InfoExtractor {
  static IE_NAME = 'twitch:vod';
  static IE_DESC = 'Twitch VODs';
  // 对齐 yt-dlp TwitchVodIE._VALID_URL（含 player.twitch.tv / schedule?vodID=）
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:www|go|m)\.)?twitch\.tv\/(?:[^/]+\/v(?:ideo)?|videos)\/|player\.twitch\.tv\/\?.*?\bvideo=v?|www\.twitch\.tv\/[^/]+\/schedule\?vodID=)(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Twitch VOD id', { expected: true });

    const gql = await this._download_json<{
      data?: { video?: Record<string, unknown> };
    }>('https://gql.twitch.tv/gql', id, 'Downloading Twitch GQL', {
      method: 'POST',
      headers: twitchGqlHeaders(this),
      data: JSON.stringify({
        query: `query { video(id: "${id}") { id title lengthSeconds previewThumbnailURL broadcastType publishedAt viewCount description owner { displayName login } } }`,
      }),
      fatal: false,
    });

    const video = gql?.data?.video;
    const { value: token, signature: sig } = await twitchDownloadAccessToken(
      this,
      id,
      'video',
      'id',
      id,
    );

    const p = Math.floor(1_000_000 + Math.random() * 9_000_000);
    const m3u8 =
      `https://usher.ttvnw.net/vod/${id}.m3u8` +
      `?allow_source=true&allow_audio_only=true&allow_spectre=true` +
      `&p=${p}&platform=web&player=twitchweb` +
      `&playlist_include_framerate=true&supported_codecs=av1,h265,h264` +
      `&sig=${encodeURIComponent(sig)}&token=${encodeURIComponent(token)}`;

    // Usher 返回 master；展开为各清晰度 media playlist，供 native HLS（无需 ffmpeg）
    let formats = await this._extract_m3u8_formats(
      m3u8,
      id,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
      'Downloading m3u8 information',
      true,
    );
    formats = twitchPreferSource(formats);
    if (!formats.length) {
      throw new ExtractorError('Failed to download Twitch VOD m3u8', { expected: true });
    }

    return {
      id: `v${id}`,
      title: String(video?.title || 'Untitled Broadcast'),
      description: video?.description != null ? String(video.description) : null,
      duration: Number(video?.lengthSeconds) || null,
      thumbnail: String(video?.previewThumbnailURL || '') || undefined,
      uploader: String(
        ((video?.owner as Record<string, unknown>)?.displayName as string) || '',
      ) || null,
      uploader_id: String(
        ((video?.owner as Record<string, unknown>)?.login as string) || '',
      ) || null,
      view_count: Number(video?.viewCount) || null,
      timestamp: video?.publishedAt
        ? Math.floor(Date.parse(String(video.publishedAt)) / 1000)
        : null,
      was_live: true,
      webpage_url: `https://www.twitch.tv/videos/${id}`,
      original_url: url,
      formats: this._sort_formats(formats),
      extractor: 'twitch:vod',
      extractor_key: 'TwitchVod',
    };
  }
}

/** Collection playlist — GQL CollectionSideBar → VOD urls. */
export class TwitchCollectionIE extends InfoExtractor {
  static IE_NAME = 'twitch:collection';
  static IE_DESC = 'Twitch collections';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|go|m)\.)?twitch\.tv\/collections\/(?<id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const collectionId = this._match_id(url);
    if (!collectionId) {
      throw new ExtractorError('Unable to extract Twitch collection id', { expected: true });
    }

    const page = await twitchDownloadGql<
      Array<{
        data?: {
          collection?: {
            title?: string;
            items?: { edges?: Array<{ node?: Record<string, unknown> }> };
          } | null;
        };
      }>
    >(
      this,
      collectionId,
      [{ operationName: 'CollectionSideBar', variables: { collectionID: collectionId } }],
      'Downloading Twitch collection GraphQL',
    );

    const collection = page?.[0]?.data?.collection;
    if (!collection) {
      throw new ExtractorError('Twitch collection not found', { expected: true });
    }

    const entries: VideoInfo[] = [];
    for (const edge of collection.items?.edges || []) {
      const node = edge?.node;
      if (!node || typeof node !== 'object') continue;
      const entry = twitchMakeVideoEntry(this, node);
      if (entry) entries.push(entry);
    }
    if (!entries.length) {
      throw new ExtractorError('Empty Twitch collection', { expected: true });
    }

    return this.playlist_result(entries, collectionId, String(collection.title || collectionId));
  }
}

/** Channel VOD listing — first GQL page of FilterableVideoTower_Videos. */
export class TwitchVideosIE extends InfoExtractor {
  static IE_NAME = 'twitch:videos';
  static IE_DESC = 'Twitch channel VODs';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|go|m)\.)?twitch\.tv\/(?<id>[^/]+)\/(?:videos|profile)(?:[/?#]|$)/i;

  static suitable(url: string): boolean {
    if (/\/(?:clips|videos\/all)(?:[/?#]|$)/i.test(url)) return false;
    if (/[?&]filter=(?:clips|collections)\b/i.test(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channel = (this._match_id(url) || '').toLowerCase();
    if (!channel) throw new ExtractorError('Unable to extract Twitch channel', { expected: true });

    let filter = 'all';
    let sort = 'time';
    try {
      const qs = new URL(url).searchParams;
      filter = qs.get('filter') || filter;
      sort = qs.get('sort') || sort;
    } catch {
      /* ignore malformed URL query */
    }

    const broadcastMap: Record<string, string | null> = {
      archives: 'ARCHIVE',
      highlights: 'HIGHLIGHT',
      uploads: 'UPLOAD',
      past_premieres: 'PAST_PREMIERE',
      all: null,
    };
    const labelMap: Record<string, string> = {
      archives: 'Past Broadcasts',
      highlights: 'Highlights',
      uploads: 'Uploads',
      past_premieres: 'Past Premieres',
      all: 'All Videos',
    };
    const sortMap: Record<string, string> = { time: 'Date', views: 'Popular' };
    const broadcastType = broadcastMap[filter] ?? null;
    const broadcastLabel = labelMap[filter] || labelMap.all;
    const sortLabel = sortMap[sort] || sortMap.time;

    const page = await twitchDownloadGql<
      Array<{
        data?: {
          user?: {
            id?: string;
            videos?: { edges?: Array<{ node?: Record<string, unknown>; cursor?: string }> };
          } | null;
        };
      }>
    >(
      this,
      channel,
      [
        {
          operationName: 'FilterableVideoTower_Videos',
          variables: {
            channelOwnerLogin: channel,
            broadcastType,
            videoSort: sort.toUpperCase(),
            limit: 100,
          },
        },
      ],
      'Downloading Twitch videos GraphQL',
    );

    const user = page?.[0]?.data?.user;
    if (!user?.id) {
      throw new ExtractorError(`Channel "${channel}" not found`, { expected: true });
    }

    const entries: VideoInfo[] = [];
    for (const edge of user.videos?.edges || []) {
      const node = edge?.node;
      if (!node || typeof node !== 'object') continue;
      const entry = twitchMakeVideoEntry(this, node);
      if (entry) entries.push(entry);
    }
    if (!entries.length) {
      throw new ExtractorError('No Twitch VODs on first page', { expected: true });
    }

    return this.playlist_result(
      entries,
      channel,
      `${channel} - ${broadcastLabel} sorted by ${sortLabel}`,
    );
  }
}

/** Live channel stream — aligned with TwitchStreamIE (GQL + usher HLS). */
export class TwitchStreamIE extends InfoExtractor {
  static IE_NAME = 'twitch:stream';
  static IE_DESC = 'Twitch live streams';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|go|m)\.)?twitch\.tv\/(?<id>[^/#?]+)(?:\/?(?:\?|#|$)|\/(?:about|schedule|home)?)(?:[?#].*)?$/i;

  static suitable(url: string): boolean {
    if (
      TwitchVodIE.suitable(url) ||
      TwitchClipsIE.suitable(url) ||
      TwitchCollectionIE.suitable(url) ||
      TwitchVideosIE.suitable(url) ||
      /twitch\.tv\/collections\//i.test(url) ||
      /twitch\.tv\/(?:videos|directory|downloads|jobs|p|settings|subscriptions|turbo|wallet)\b/i.test(
        url,
      ) ||
      /twitch\.tv\/[^/]+\/(?:videos|clips|collections|schedule)\b/i.test(url)
    ) {
      return false;
    }
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channel = (this._match_id(url) || '').toLowerCase();
    if (!channel) throw new ExtractorError('Unable to extract Twitch channel', { expected: true });

    const headers = twitchGqlHeaders(this);

    const gql = await this._download_json<
      Array<{
        data?: {
          user?: {
            id?: string;
            displayName?: string;
            stream?: {
              id?: string;
              type?: string;
              viewers?: number;
              createdAt?: string;
              title?: string;
            } | null;
            broadcastSettings?: { title?: string };
          } | null;
        };
      }>
    >('https://gql.twitch.tv/gql', channel, 'Downloading Twitch stream GraphQL', {
      method: 'POST',
      headers,
      data: JSON.stringify([
        {
          operationName: 'StreamMetadata',
          variables: { channelLogin: channel, includeIsDJ: true },
          query: `query StreamMetadata($channelLogin: String!) {
            user(login: $channelLogin) {
              id displayName
              stream { id type viewersCount createdAt title }
              broadcastSettings { title }
            }
          }`,
        },
      ]),
      fatal: false,
    });

    const user = Array.isArray(gql) ? gql[0]?.data?.user : null;
    if (!user) {
      throw new ExtractorError(`${channel} does not exist`, { expected: true });
    }
    const stream = user.stream;
    if (!stream) {
      throw new ExtractorError(`${channel} is offline`, { expected: true });
    }

    const { value: token, signature: sig } = await twitchDownloadAccessToken(
      this,
      channel,
      'stream',
      'channelName',
      channel,
    );

    const p = Math.floor(1_000_000 + Math.random() * 9_000_000);
    const m3u8 =
      `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8` +
      `?allow_source=true&allow_audio_only=true&allow_spectre=true` +
      `&p=${p}&platform=web&player=twitchweb` +
      `&playlist_include_framerate=true&supported_codecs=av1,h265,h264` +
      `&sig=${encodeURIComponent(sig)}&token=${encodeURIComponent(token)}`;

    const streamType = String(stream.type || 'live');
    const isLive = streamType === 'live';
    // 直播仍用 m3u8（ffmpeg 拉流）；录播/重播展开 media playlist 走 native
    const entryProto = isLive ? 'm3u8' : 'm3u8_native';
    let formats = await this._extract_m3u8_formats(
      m3u8,
      channel,
      'mp4',
      entryProto,
      undefined,
      undefined,
      'hls',
      'Downloading m3u8 information',
      true,
    );
    formats = twitchPreferSource(formats);
    if (!formats.length) {
      throw new ExtractorError('Failed to download Twitch stream m3u8', { expected: true });
    }

    const uploader = String(user.displayName || channel);
    let title = uploader;
    if (streamType === 'rerun' || streamType === 'live') title += ` (${streamType})`;
    const desc = String(user.broadcastSettings?.title || stream.title || '');

    return {
      id: String(stream.id || channel),
      title,
      description: desc || null,
      uploader,
      uploader_id: channel,
      view_count: Number((stream as { viewersCount?: number }).viewersCount ?? stream.viewers) || null,
      timestamp: stream.createdAt ? Math.floor(Date.parse(stream.createdAt) / 1000) : null,
      is_live: isLive,
      live_status: isLive ? 'is_live' : streamType,
      webpage_url: `https://www.twitch.tv/${channel}`,
      original_url: url,
      formats: this._sort_formats(formats),
      extractor: 'twitch:stream',
      extractor_key: 'TwitchStream',
    };
  }
}

/** Clips — clips.twitch.tv / twitch.tv/.../clip/ */
export class TwitchClipsIE extends InfoExtractor {
  static IE_NAME = 'twitch:clips';
  static IE_DESC = 'Twitch clips';
  static _VALID_URL =
    /https?:\/\/(?:clips\.twitch\.tv\/(?:embed\?.*?\bclip=|(?<slug_main>[^/?#&]+))|(?:(?:www|go|m)\.)?twitch\.tv\/(?:[^/]+\/)?clip\/(?<slug_alt>[^/?#&]+))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(TwitchClipsIE._VALID_URL)!;
    const slug = m.groups?.slug_main || m.groups?.slug_alt || this._match_id(url);
    if (!slug) throw new ExtractorError('Unable to extract Twitch clip slug', { expected: true });

    const gql = await this._download_json<{
      data?: {
        clip?: {
          id?: string;
          slug?: string;
          title?: string;
          durationSeconds?: number;
          thumbnailURL?: string;
          broadcaster?: { displayName?: string; login?: string };
          videoQualities?: Array<{ quality?: string; frameRate?: number; sourceURL?: string }>;
          playbackAccessToken?: { value?: string; signature?: string } | null;
        } | null;
      };
    }>('https://gql.twitch.tv/gql', slug, 'Downloading Twitch clip GraphQL', {
      method: 'POST',
      headers: twitchGqlHeaders(this),
      data: JSON.stringify({
        query: `query { clip(slug: "${slug}") {
          id slug title durationSeconds thumbnailURL
          broadcaster { displayName login }
          videoQualities { quality frameRate sourceURL }
          playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) {
            value signature
          }
        }}`,
      }),
      fatal: false,
    });

    const clip = gql?.data?.clip;
    if (!clip) throw new ExtractorError('Clip not found', { expected: true });

    const token = clip.playbackAccessToken?.value;
    const sig = clip.playbackAccessToken?.signature;
    const accessQ =
      token && sig
        ? `sig=${encodeURIComponent(sig)}&token=${encodeURIComponent(token)}`
        : '';

    const formats: Format[] = (clip.videoQualities || [])
      .filter((q) => q.sourceURL)
      .map((q) => {
        const base = String(q.sourceURL);
        const url = accessQ
          ? `${base}${base.includes('?') ? '&' : '?'}${accessQ}`
          : base;
        return {
          format_id: String(q.quality || 'source'),
          url,
          ext: 'mp4',
          protocol: 'https' as const,
          height: Number(q.quality) || null,
          fps: Number(q.frameRate) || null,
          vcodec: 'h264',
          acodec: 'aac',
        };
      });

    if (!formats.length) {
      throw new ExtractorError('No Twitch clip formats', { expected: true });
    }

    return {
      id: String(clip.id || slug),
      title: String(clip.title || slug),
      duration: Number(clip.durationSeconds) || null,
      thumbnail: clip.thumbnailURL || undefined,
      uploader: clip.broadcaster?.displayName || null,
      uploader_id: clip.broadcaster?.login || null,
      webpage_url: `https://clips.twitch.tv/${slug}`,
      original_url: url,
      formats,
      extractor: 'twitch:clips',
      extractor_key: 'TwitchClips',
    };
  }
}

export class SoundcloudIE extends InfoExtractor {
  static IE_NAME = 'soundcloud';
  static IE_DESC = 'Soundcloud';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?soundcloud\.com\/(?!(?:search|tags|groups)\/)(?<user>[^/]+)\/(?!(?:sets|tracks)\/)(?<id>[^/?#]+)|api\.soundcloud\.com\/(?:tracks|stream)\/(?<apiid>\d+))/i;

  private async resolveClientId(url: string): Promise<string> {
    const webpage = await this._download_webpage(url, 'sc', 'Downloading Soundcloud page', {
      fatal: false,
    });
    return (
      webpage?.match(/client_id\s*:\s*"([0-9a-zA-Z]{32})"/)?.[1] ||
      webpage?.match(/clientId\s*[:=]\s*"([0-9a-zA-Z]{32})"/)?.[1] ||
      'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX'
    );
  }

  private async extractSet(url: string): Promise<VideoInfo> {
    const m = url.match(
      /soundcloud\.com\/(?<user>[\w\d-]+)\/sets\/(?<slug>[^/?#]+)(?:\/(?<token>[^?/]+))?/i,
    );
    if (!m?.groups?.user) throw new ExtractorError('Unable to parse Soundcloud set URL', { expected: true });
    const { user, slug, token } = m.groups;
    const fullTitle = token ? `${user}/sets/${slug}/${token}` : `${user}/sets/${slug}`;
    const clientId = await this.resolveClientId(`https://soundcloud.com/${user}`);
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(`https://soundcloud.com/${fullTitle}`)}&client_id=${clientId}`;
    const playlist = await this._download_json<Record<string, unknown>>(
      resolveUrl,
      fullTitle,
      'Resolving Soundcloud set',
    );
    if (!playlist?.id) throw new ExtractorError('Unable to resolve Soundcloud set', { expected: true });

    const playlistId = String(playlist.id);
    let tracks = (playlist.tracks as Record<string, unknown>[]) || [];
    if (!tracks.length) {
      const listed = await this._download_json<Record<string, unknown>[]>(
        `https://api-v2.soundcloud.com/tracks?playlistId=${playlistId}&client_id=${clientId}${
          token ? `&playlistSecretToken=${encodeURIComponent(token)}` : ''
        }`,
        playlistId,
        'Downloading set tracks',
        { fatal: false },
      );
      tracks = Array.isArray(listed) ? listed : [];
    }

    const entries = tracks
      .filter((t) => t?.permalink_url)
      .map((t) =>
        this.url_result(String(t.permalink_url), 'Soundcloud', String(t.id || ''), String(t.title || '')),
      );
    if (!entries.length) throw new ExtractorError('Empty Soundcloud set', { expected: true });
    return this.playlist_result(entries, playlistId, String(playlist.title || fullTitle));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    if (/\/sets\//i.test(url)) return this.extractSet(url);

    const clientId = await this.resolveClientId(url);

    let apiUrl = '';
    const m = url.match(/api\.soundcloud\.com\/(?:tracks|stream)\/(\d+)/);
    if (m) {
      apiUrl = `https://api-v2.soundcloud.com/tracks/${m[1]}?client_id=${clientId}`;
    } else {
      const resolve = await this._download_json<{ id?: number; media?: unknown }>(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`,
        'sc',
        'Resolving Soundcloud URL',
        { fatal: false },
      );
      if (!resolve?.id) throw new ExtractorError('Unable to resolve Soundcloud URL', { expected: true });
      apiUrl = `https://api-v2.soundcloud.com/tracks/${resolve.id}?client_id=${clientId}`;
    }

    const track = await this._download_json<Record<string, unknown>>(
      apiUrl,
      'sc',
      'Downloading track JSON',
    );
    if (!track) throw new ExtractorError('No track data', { expected: true });

    const media = track.media as Record<string, unknown> | undefined;
    const transcodings = (media?.transcodings as Record<string, unknown>[]) || [];
    const formats: Format[] = [];
    for (const t of transcodings) {
      const format = t.format as Record<string, unknown> | undefined;
      const mime = String(format?.mime_type || '');
      const streamUrl = String(t.url || '');
      if (!streamUrl) continue;
      const stream = await this._download_json<{ url?: string }>(
        `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}client_id=${clientId}`,
        String(track.id),
        'Resolving stream',
        { fatal: false },
      );
      const u = stream?.url;
      if (!u) continue;
      formats.push({
        format_id: String(t.preset || formats.length),
        url: u,
        ext: mime.includes('ogg') ? 'ogg' : mime.includes('mp3') ? 'mp3' : 'm4a',
        protocol: u.includes('.m3u8') ? 'm3u8_native' : 'https',
        acodec: 'unknown',
        vcodec: 'none',
        format_note: String(t.quality || ''),
      });
    }

    if (!formats.length) throw new ExtractorError('No Soundcloud streams', { expected: true });

    return {
      id: String(track.id),
      title: String(track.title || track.id),
      duration: Number(track.duration) ? Number(track.duration) / 1000 : null,
      webpage_url: String(track.permalink_url || url),
      original_url: url,
      formats,
      thumbnail: String(
        (track.artwork_url as string) || (track.user as Record<string, string>)?.avatar_url || '',
      ) || undefined,
      uploader: String((track.user as Record<string, string>)?.username || '') || null,
      extractor: 'soundcloud',
      extractor_key: 'Soundcloud',
    };
  }
}
