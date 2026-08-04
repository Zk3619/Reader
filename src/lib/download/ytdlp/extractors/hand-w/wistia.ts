// @ts-nocheck
/** WistiaBaseIE / WistiaIE / WistiaPlaylistIE / WistiaChannelIE â€?ported from yt-dlp wistia.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  filter_dict,
  float_or_none,
  int_or_none,
  parse_qs,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';

const VALID_ID = '(?<id>[a-z0-9]{10})';
const VALID_URL_BASE = 'https?://(?:\\w+\\.)?wistia\\.(?:net|com)/(?:embed/)?';
const EMBED_BASE_URL = 'http://fast.wistia.net/embed/';

function b64DecodeUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export class WistiaBaseIE extends InfoExtractor {
  static IE_NAME = 'wistia:base';
  static _VALID_URL = false as const;
  static _VALID_ID_REGEX = /[a-z0-9]{10}/;
  static _EMBED_BASE_URL = EMBED_BASE_URL;

  protected async _downloadEmbedConfig(
    configType: string,
    configId: string,
    referer: string,
  ): Promise<Record<string, unknown>> {
    const baseUrl = `${EMBED_BASE_URL}${configType}/${configId}`;
    const videoPassword = (this.params as Record<string, unknown>).videopassword as
      | string
      | undefined;
    const embedConfig = await this._download_json<Record<string, unknown>>(
      `${baseUrl}.json`,
      configId,
      undefined,
      {
        headers: {
          Referer: referer.startsWith('http') ? referer : baseUrl,
        },
        query: filter_dict({ password: videoPassword }) as Record<string, string>,
      },
    );

    const error = traverse_obj(embedConfig, ['error']);
    if (error) {
      throw new ExtractorError(`Error while getting the playlist: ${error}`, { expected: true });
    }

    const media = (embedConfig.media as Record<string, unknown>) || {};
    const embedOpts =
      (media.embed_options as Record<string, unknown>) ||
      (media.embedOptions as Record<string, unknown>) ||
      {};
    const plugin = (embedOpts.plugin as Record<string, unknown>) || {};
    const pwdPlugin = (plugin.passwordProtectedVideo as Record<string, unknown>) || {};
    if (pwdPlugin.on === 'true') {
      if (videoPassword) {
        throw new ExtractorError('Invalid video password', { expected: true });
      }
      throw new ExtractorError(
        'This content is password-protected. Use the --video-password option',
        { expected: true },
      );
    }

    return embedConfig;
  }

  protected async _getRealExt(url: string): Promise<string> {
    let ext = determine_ext(url, 'bin');
    if (ext === 'bin') {
      const urlh = await this._request_webpage(url, undefined, 'Checking media extension', {
        fatal: false,
      });
      if (urlh) {
        const ct = urlh.headers['content-type'] || urlh.headers['Content-Type'] || '';
        const fromCt = ct.split('/')[1]?.split(';')[0];
        if (fromCt) ext = fromCt;
      }
    }
    return ext === 'mov' ? 'mp4' : ext;
  }

  protected async _extractMedia(embedConfig: Record<string, unknown>): Promise<VideoInfo> {
    const data = embedConfig.media as Record<string, unknown>;
    const videoId = String(data.hashedId);
    const title = String(data.name || videoId);

    const formats: Format[] = [];
    const thumbnails: Thumbnail[] = [];

    for (const a of (data.assets as Array<Record<string, unknown>>) || []) {
      const aurl = a.url as string | undefined;
      if (!aurl) continue;
      const astatus = a.status;
      const atype = a.type as string | undefined;
      if ((astatus != null && astatus !== 2) || atype === 'preview' || atype === 'storyboard') {
        continue;
      }
      if (atype === 'still' || atype === 'still_image') {
        thumbnails.push({
          url: aurl.replace('.bin', `.${await this._getRealExt(aurl)}`),
          width: int_or_none(a.width) ?? undefined,
          height: int_or_none(a.height) ?? undefined,
          filesize: int_or_none(a.size) ?? undefined,
        });
        continue;
      }

      const aext = (a.ext as string) || (await this._getRealExt(aurl));
      const displayName = a.display_name as string | undefined;
      let formatId = atype || 'http';
      if (atype && atype.endsWith('_video') && displayName) {
        formatId = `${atype.slice(0, -6)}-${displayName}`;
      }
      const f: Format = {
        format_id: formatId,
        url: aurl,
        tbr: int_or_none(a.bitrate) || undefined,
        quality: atype === 'original' ? 1 : undefined,
      };
      if (displayName === 'Audio') {
        f.vcodec = 'none';
      } else {
        f.width = int_or_none(a.width) ?? undefined;
        f.height = int_or_none(a.height) ?? undefined;
        f.vcodec = (a.codec as string) || undefined;
      }
      if (a.container === 'm3u8' || aext === 'm3u8') {
        formats.push({
          ...f,
          ext: 'ts',
          format_id: String(f.format_id).replace('hls-', 'ts-'),
          url: f.url!.replace('.bin', '.ts'),
        });
        f.ext = 'mp4';
        f.protocol = 'm3u8_native';
      } else {
        f.container = (a.container as string) || undefined;
        f.ext = aext;
        f.filesize = int_or_none(a.size) ?? undefined;
      }
      formats.push(f);
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const caption of (data.captions as Array<Record<string, unknown>>) || []) {
      const language = caption.language as string | undefined;
      if (!language) continue;
      (subtitles[language] ||= []).push({
        url: `${EMBED_BASE_URL}captions/${videoId}.vtt?language=${language}`,
      });
    }

    return {
      id: videoId,
      title,
      description: (data.seoDescription as string) || undefined,
      formats,
      thumbnails,
      duration: float_or_none(data.duration) ?? undefined,
      timestamp: int_or_none(data.createdAt) ?? undefined,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }

  protected static _extractWistiaAsyncEmbed(
    webpage: string,
  ): Array<{ type: string; id: string }> {
    const out: Array<{ type: string; id: string }> = [];
    const re =
      /<(?:div|section)[^>]+class=(["'])(?:(?!\1).)*?(?<type>wistia[a-z_0-9]+)\s*\bwistia_async_(?<id>[a-z0-9]{10})\b(?:(?!\1).)*?\1/gi;
    for (const m of webpage.matchAll(re)) {
      if (m.groups?.type && m.groups?.id) {
        out.push({ type: m.groups.type, id: m.groups.id });
      }
    }
    return out;
  }

  protected static _extractUrlMediaId(url: string): string | null {
    let decoded = url;
    try {
      decoded = decodeURIComponent(url.replace(/\+/g, ' '));
    } catch {
      /* keep original */
    }
    const m = /(?:wmediaid|wvideo(?:id)?)]?=(?<id>[a-z0-9]{10})/.exec(decoded);
    return m?.groups?.id || null;
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WistiaBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WistiaIE extends WistiaBaseIE {
  static IE_NAME = 'wistia';
  static _VALID_URL = new RegExp(
    `(?:wistia:|${VALID_URL_BASE}(?:iframe|medias)/)${VALID_ID}`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const embedConfig = await this._downloadEmbedConfig('medias', videoId, url);
    return this._extractMedia(embedConfig);
  }

  static _extractEmbedUrls(url: string, webpage: string): string[] {
    const urls: string[] = [];
    const embedRe =
      /<(?:meta[^>]+?content|(?:iframe|script)[^>]+?src)=["'](?<url>(?:https?:)?\/\/(?:fast\.)?wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/[a-z0-9]{10})/gi;
    for (const m of webpage.matchAll(embedRe)) {
      if (m.groups?.url) urls.push(m.groups.url);
    }
    for (const match of WistiaBaseIE._extractWistiaAsyncEmbed(webpage)) {
      if (match.type !== 'wistia_channel') urls.push(`wistia:${match.id}`);
    }
    for (const m of webpage.matchAll(
      /(?:data-wistia-?id=["']|Wistia\.embed\(["']|id=["']wistia_)(?<id>[a-z0-9]{10})/gi,
    )) {
      if (m.groups?.id) urls.push(`wistia:${m.groups.id}`);
    }
    const channelEmbeds = WistiaChannelIE._extractEmbedUrls(url, webpage);
    if (!channelEmbeds.length) {
      const mediaId = WistiaBaseIE._extractUrlMediaId(url);
      if (mediaId) urls.push(`wistia:${mediaId}`);
    }
    return urls;
  }
}

export class WistiaPlaylistIE extends WistiaBaseIE {
  static IE_NAME = 'wistia:playlist';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}playlists/${VALID_ID}`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const playlist = await this._downloadEmbedConfig('playlists', playlistId, url);

    const entries: VideoInfo[] = [];
    const root = playlist as unknown;
    const first = Array.isArray(root) ? root[0] : root;
    const medias =
      (first && typeof first === 'object'
        ? (first as Record<string, unknown>).medias
        : undefined) || [];
    for (const media of (medias as Array<Record<string, unknown>>) || []) {
      const embedConfig = media.embed_config as Record<string, unknown> | undefined;
      if (!embedConfig) continue;
      entries.push(await this._extractMedia(embedConfig));
    }

    return this.playlist_result(entries, playlistId);
  }
}

export class WistiaChannelIE extends WistiaBaseIE {
  static IE_NAME = 'wistia:channel';
  static _VALID_URL = new RegExp(
    `(?:wistiachannel:|${VALID_URL_BASE}channel/)${VALID_ID}`,
  );

  protected _yesPlaylist(
    playlistId: string,
    mediaId: string | null,
    playlistLabel = 'channel',
  ): boolean {
    if (this.params.noplaylist && mediaId) {
      this.to_screen(
        `Downloading just the video ${mediaId} because of --no-playlist`,
      );
      void playlistId;
      void playlistLabel;
      return false;
    }
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const mediaId = WistiaBaseIE._extractUrlMediaId(url);
    if (!this._yesPlaylist(channelId, mediaId, 'channel') && mediaId) {
      return this.url_result(`wistia:${mediaId}`, 'Wistia');
    }

    let data: Record<string, unknown>;
    try {
      data = await this._downloadEmbedConfig('channel', channelId, url);
    } catch (e) {
      this.report_warning(
        'Failed to download channel data from API, falling back to webpage.',
      );
      void e;
      const webpage = await this._download_webpage(
        `https://fast.wistia.net/embed/channel/${channelId}`,
        channelId,
      );
      const encoded = this._search_regex(
        new RegExp(`wchanneljsonp-${channelId}'\\]\\s*=[^"]*"([A-Za-z0-9=/]*)`),
        webpage,
        'jsonp',
      )!;
      data =
        this._parse_json<Record<string, unknown>>(encoded, channelId, (x) => {
          const decoded = b64DecodeUtf8(x);
          try {
            return decodeURIComponent(decoded.replace(/\+/g, '%20'));
          } catch {
            return decoded.replace(/\+/g, ' ');
          }
        }) || {};
    }

    const series =
      ((traverse_obj(data, ['series', 0]) as Record<string, unknown>) || {}) as Record<
        string,
        unknown
      >;

    const entries: VideoInfo[] = [];
    const sections = (series.sections as Array<Record<string, unknown>>) || [];
    for (const section of sections) {
      for (const key of ['videos', 'episodes'] as const) {
        for (const video of (section[key] as Array<Record<string, unknown>>) || []) {
          const hashedId = video.hashedId as string | undefined;
          if (!hashedId) continue;
          entries.push(
            this.url_result(
              `wistia:${hashedId}`,
              'Wistia',
              hashedId,
              video.name != null ? String(video.name) : undefined,
            ),
          );
        }
      }
    }

    return this.playlist_result(
      entries,
      channelId,
      series.title != null ? String(series.title) : undefined,
      series.description != null ? String(series.description) : undefined,
    );
  }

  static _extractEmbedUrls(url: string, webpage: string): string[] {
    const urls: string[] = [];
    for (const match of WistiaBaseIE._extractWistiaAsyncEmbed(webpage)) {
      if (match.type === 'wistia_channel') {
        urls.push(update_url_query(`wistiachannel:${match.id}`, parse_qs(url)));
      }
    }
    return urls;
  }
}
