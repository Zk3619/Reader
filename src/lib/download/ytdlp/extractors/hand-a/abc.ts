// @ts-nocheck
/**
 * ABCIE / ABCIViewIE / ABCIViewShowSeriesIE — aligned with yt-dlp abc.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  js_to_json,
  str_or_none,
  traverse_obj,
  try_get,
  unescapeHTML,
  update_url_query,
  url_or_none,
} from '../../utils';

function parseIso8601(dateStr: unknown, sep = 'T'): number | null {
  if (dateStr == null) return null;
  const s = String(dateStr).replace(sep, 'T');
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ABCIE extends InfoExtractor {
  static IE_NAME = 'abc.net.au';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?abc\.net\.au\/(?:news|btn|listen)\/(?:[^/?#]+\/){1,4}(?<id>\d{5,})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    let urlsInfo: unknown;
    let youtube = false;
    let video = false;

    const audioM = webpage.match(
      /<a\s+href="(?<url>[^"]+)"\s+data-duration="\d+"\s+title="Download audio directly">/,
    );
    if (audioM?.groups?.url) {
      urlsInfo = { url: audioM.groups.url };
    } else {
      let mobj =
        webpage.match(
          /<a href="(?<url>http:\/\/www\.youtube\.com\/watch\?v=[^"]+)"><span><strong>External Link:<\/strong>/,
        ) ||
        webpage.match(
          /<iframe width="100%" src="(?<url>\/\/www\.youtube-nocookie\.com\/embed\/[^?"]+)/,
        );

      if (!mobj) {
        mobj = webpage.match(
          /(?<type>)"(?:sources|files|renditions)":\s*(?<json_data>\[[^\]]+\])/,
        );
        if (!mobj) {
          mobj = webpage.match(
            /inline(?<type>Video|Audio|YouTube)Data\.push\((?<json_data>[^)]+)\);/,
          );
        }
        if (!mobj) {
          const expired = this._search_regex(
            /class="expired-(?:video|audio)"[\s\S]+?<span>(.+?)<\/span>/,
            webpage,
            'expired',
            null,
            false,
          );
          if (expired) {
            throw new ExtractorError(`${ABCIE.IE_NAME} said: ${expired}`, { expected: true });
          }
          throw new ExtractorError('Unable to extract video urls', { expected: true });
        }

        urlsInfo = this._parse_json(mobj.groups!.json_data!, videoId, js_to_json);
        youtube = mobj.groups!.type === 'YouTube';
        video =
          mobj.groups!.type === 'Video' ||
          traverse_obj(urlsInfo, [0, ['contentType', 'MIMEType']], { get_all: false }) ===
            'video/mp4';
      } else {
        urlsInfo = mobj.groups;
        youtube = true;
        video = true;
      }
    }

    const urlList = Array.isArray(urlsInfo) ? urlsInfo : [urlsInfo];

    if (youtube) {
      return this.playlist_result(
        urlList.map((u) => this.url_result(String((u as Record<string, unknown>).url || ''))),
        videoId,
      );
    }

    const formats: Format[] = [];
    for (const raw of urlList) {
      const urlInfo = raw as Record<string, unknown>;
      const mediaUrl = String(urlInfo.url || '');
      if (!mediaUrl) continue;

      let height = int_or_none(urlInfo.height);
      let bitrate = int_or_none(urlInfo.bitrate);
      let width = int_or_none(urlInfo.width);
      let formatId: string | undefined;

      const urlM = mediaUrl.match(/_(?:(?<height>\d+)|(?<bitrate>\d+)k)\.mp4$/);
      if (urlM?.groups) {
        if (urlM.groups.height) {
          height = height ?? int_or_none(urlM.groups.height);
          width = width ?? int_or_none(urlInfo.label);
        } else if (urlM.groups.bitrate) {
          bitrate = bitrate ?? int_or_none(urlM.groups.bitrate);
          formatId = str_or_none(urlInfo.label) || undefined;
        }
      }

      formats.push({
        url: mediaUrl,
        format_id: formatId || `direct-${formats.length}`,
        vcodec: video ? str_or_none(urlInfo.codec) || 'unknown' : 'none',
        width,
        height,
        tbr: bitrate,
        filesize: int_or_none(urlInfo.filesize),
      });
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) || videoId,
      formats,
      description: this._og_search_description(webpage),
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: ABCIE.IE_NAME,
      extractor_key: 'ABC',
    };
  }
}

export class ABCIViewIE extends InfoExtractor {
  static IE_NAME = 'abc.net.au:iview';
  static _VALID_URL = /https?:\/\/iview\.abc\.net\.au\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoParams = await this._download_json<Record<string, unknown>>(
      `https://iview.abc.net.au/api/programs/${videoId}`,
      videoId,
    );

    const title = unescapeHTML(
      String(videoParams.title || videoParams.seriesTitle || videoId),
    );
    const playlist = (videoParams.playlist as Record<string, unknown>[]) || [];
    const stream = playlist.find((s) => s.type === 'program' || s.type === 'livestream');
    if (!stream) throw new ExtractorError('No iview stream found', { expected: true });

    const houseNumber = String(videoParams.episodeHouseNumber || videoId);
    const ts = Math.trunc(Date.now() / 1000);
    const path = `/auth/hls/sign?ts=${ts}&hn=${houseNumber}&d=android-tablet`;
    const sig = await hmacSha256Hex('android.content.res.Resources', path);
    const token = await this._download_webpage(
      `http://iview.abc.net.au${path}&sig=${sig}`,
      videoId,
    );

    const tokenizeUrl = (u: string) => update_url_query(u, { hdnea: token.trim() });

    let formats: Format[] = [];
    const streams = (stream.streams as Record<string, Record<string, string>>)?.hls || {};
    for (const sd of ['1080', '720', 'sd', 'sd-low']) {
      const sdUrl = streams[sd];
      if (!sdUrl) continue;
      formats = await this._extract_m3u8_formats(
        tokenizeUrl(sdUrl),
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      if (formats.length) break;
    }

    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};
    const srcVtt = try_get(stream, (x: Record<string, unknown>) => {
      const caps = x.captions as Record<string, string> | undefined;
      return caps?.['src-vtt'];
    }) as string | null;
    if (srcVtt) {
      subtitles.en = [{ url: srcVtt, ext: 'vtt' }];
    }

    const seasonNumber = int_or_none(
      this._search_regex(/\bSeries\s+(\d+)\b/, title, 'season number', null, false),
    );
    const episodeNumber = int_or_none(
      this._search_regex(/\bEp\s+(\d+)\b/, title, 'episode number', null, false),
    );
    const episode =
      this._search_regex(
        /^(?:Series\s+\d+)?\s*(?:Ep\s+\d+)?\s*(.*)$/,
        title,
        'episode',
        '',
        false,
      ) || null;

    return {
      id: videoId,
      title,
      description: str_or_none(videoParams.description),
      thumbnail: str_or_none(videoParams.thumbnail) || undefined,
      duration: int_or_none(videoParams.eventDuration),
      timestamp: parseIso8601(videoParams.pubDate, ' '),
      series: unescapeHTML(String(videoParams.seriesTitle || '')) || undefined,
      series_id: String(videoParams.seriesHouseNumber || videoId.slice(0, 7)),
      season_number: seasonNumber,
      episode_number: episodeNumber,
      episode_id: houseNumber,
      episode: episode || undefined,
      uploader_id: str_or_none(videoParams.channel) || undefined,
      formats,
      subtitles,
      is_live: videoParams.livestream === '1',
      webpage_url: url,
      original_url: url,
      extractor: ABCIViewIE.IE_NAME,
      extractor_key: 'ABCIView',
    };
  }
}

export class ABCIViewShowSeriesIE extends InfoExtractor {
  static IE_NAME = 'abc.net.au:iview:showseries';
  static _VALID_URL = /https?:\/\/iview\.abc\.net\.au\/show\/(?<id>[^/]+)(?:\/series\/\d+)?$/i;

  _yes_playlist(playlistId: string, hasHighlight: boolean, videoLabel = 'videos'): boolean {
    if (this.params.noplaylist) {
      if (hasHighlight) {
        this.to_screen(`Downloading just ${videoLabel} because of --no-playlist`);
      }
      return false;
    }
    void playlistId;
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const webpage = await this._download_webpage(url, showId);
    const initialState = this._search_json<Record<string, unknown>>(
      /window\.__INITIAL_STATE__\s*=\s*['"]/,
      webpage,
      'initial state',
      showId,
      {
        end_pattern: /['"]\s*;/,
        transform_source: (x) =>
          JSON.parse(JSON.stringify(x)).replace(/\\u([0-9a-fA-F]{4})/g, (_: unknown, h: string) =>
            String.fromCharCode(parseInt(h, 16)),
          ),
      },
    );
    const videoData = traverse_obj(initialState, ['route', 'pageData', '_embedded']) as Record<
      string,
      unknown
    >;

    const highlight = try_get(videoData, (x: Record<string, unknown>) => {
      const hv = x.highlightVideo as Record<string, string> | undefined;
      return hv?.shareUrl;
    }) as string | undefined;

    if (!this._yes_playlist(showId, !!highlight, 'highlight video') && highlight) {
      return this.url_result(highlight, 'ABCIView');
    }

    const series = videoData.selectedSeries as Record<string, unknown>;
    const urls: string[] = [];
    const embedded = traverse_obj(series, ['_embedded', 'videoEpisodes']) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    if (Array.isArray(embedded)) {
      for (const block of embedded) {
        const items = (block as Record<string, unknown>).items as
          | Record<string, unknown>[]
          | undefined;
        for (const ep of items || []) {
          const u = url_or_none(ep.shareUrl);
          if (u) urls.push(u);
        }
      }
    } else if (embedded && typeof embedded === 'object') {
      const items = (embedded as Record<string, unknown>).items as
        | Record<string, unknown>[]
        | undefined;
      for (const ep of items || []) {
        const u = url_or_none(ep.shareUrl);
        if (u) urls.push(u);
      }
    }

    const seriesTitle = String(series.showTitle || series.displayTitle || '') || undefined;
    const seasonTitle = String(series.title || series.displaySubtitle || '') || undefined;
    const thumbFromSeries = str_or_none(series.thumbnail);
    const images = series.images as Record<string, unknown>[] | undefined;
    const thumbFromImages = images?.find((img) => img.name === 'seriesThumbnail')?.url as
      | string
      | undefined;

    const playlist = this.playlist_result(
      urls.map((u) => this.url_result(u, 'ABCIView')),
      String(series.id || showId),
      seasonTitle,
      str_or_none(series.description),
    );
    return {
      ...playlist,
      series: seriesTitle,
      season: seasonTitle,
      thumbnail: thumbFromSeries || str_or_none(thumbFromImages) || undefined,
      extractor: ABCIViewShowSeriesIE.IE_NAME,
      extractor_key: 'ABCIViewShowSeries',
    };
  }
}
