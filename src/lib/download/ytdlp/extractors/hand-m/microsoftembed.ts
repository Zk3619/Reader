/**
 * Microsoft family — ported from yt-dlp microsoftembed.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  extractSmilMediaUrls,
  parseIso8601,
  url_basename,
} from './_helpers';

function parseResolution(url: string): { width?: number; height?: number } {
  const m = url.match(/(\d+)x(\d+)/i) || url.match(/_(\d+)p/i);
  if (!m) return {};
  if (m.length >= 3) return { width: Number(m[1]), height: Number(m[2]) };
  return { height: Number(m[1]) };
}

async function extractIsmFormats(
  ie: InfoExtractor,
  ismUrl: string,
  videoId: string,
  fatal = true,
): Promise<Format[]> {
  try {
    const manifest = await ie._download_webpage(ismUrl, videoId, undefined, { fatal: false });
    if (!manifest) return fatal ? [] : [{ url: ismUrl, format_id: 'ism' }];
    const urls = extractSmilMediaUrls(manifest);
    if (!urls.length) return [{ url: ismUrl, format_id: 'ism' }];
    return urls.map((u, i) => ({
      url: u,
      format_id: `ism-${i}`,
      ext: u.includes('.ism') ? 'ismv' : undefined,
    }));
  } catch {
    if (fatal) throw new ExtractorError(`Failed to extract ISM formats from ${ismUrl}`);
    return [];
  }
}

export class MicrosoftMediusBaseIE extends InfoExtractor {
  static IE_NAME = 'microsoftmediusbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MicrosoftMediusBaseIE is not a standalone extractor', { expected: true });
  }

  protected _subToDict(subtitleList: Array<Record<string, unknown>>): Record<string, Subtitle[]> {
    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of subtitleList) {
      const tag = str_or_none(sub.tag) || 'und';
      const entry = { ...sub };
      delete entry.tag;
      if (!entry.ext) entry.ext = 'vtt';
      if (!subtitles[tag]) subtitles[tag] = [];
      subtitles[tag]!.push(entry as unknown as Subtitle);
    }
    return subtitles;
  }

  protected async _extractIsm(ismUrl: string, videoId: string, fatal = true): Promise<Format[]> {
    const formats = await extractIsmFormats(this, ismUrl, videoId, fatal);
    for (const fmt of formats) {
      if (fmt.language && fmt.language !== 'eng' && !String(fmt.format_id).includes('English')) {
        fmt.language_preference = -10;
      }
    }
    return formats;
  }
}

export class MicrosoftEmbedIE extends InfoExtractor {
  static IE_NAME = 'microsoftembed';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?microsoft\.com\/(?:[^/]+\/)?videoplayer\/embed\/(?<id>[a-z0-9A-Z]+)/;
  static _API_URL = 'https://prod-video-cms-rt-microsoft-com.akamaized.net/vhs/api/videos/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      MicrosoftEmbedIE._API_URL + videoId,
      videoId,
    );

    const formats: Format[] = [];
    const streams = (metadata.streams as Record<string, Record<string, unknown>>) || {};
    for (const [sourceType, source] of Object.entries(streams)) {
      const sourceUrl = str_or_none(source.url);
      if (!sourceUrl) continue;
      if (sourceType === 'smooth_Streaming') {
        formats.push(...(await extractIsmFormats(this, sourceUrl, videoId, false)));
      } else if (sourceType === 'apple_HTTP_Live_Streaming') {
        formats.push(
          ...(await this._extract_m3u8_formats(sourceUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (sourceType === 'mPEG_DASH') {
        formats.push(...(await this._extract_mpd_formats(sourceUrl, videoId, 'dash', undefined, false)));
      } else {
        formats.push({
          format_id: sourceType,
          url: sourceUrl,
          height: int_or_none(source.heightPixels) ?? undefined,
          width: int_or_none(source.widthPixels) ?? undefined,
        });
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const captions = (metadata.captions as Record<string, Record<string, unknown>>) || {};
    for (const [lang, data] of Object.entries(captions)) {
      const subUrl = url_or_none(data.url);
      if (!subUrl) continue;
      subtitles[lang] = [{ url: subUrl, ext: 'vtt' }];
    }

    const snippet = (metadata.snippet as Record<string, unknown>) || {};
    const thumbsRaw = (snippet.thumbnails as Array<Record<string, unknown>>) || [];
    const seen = new Set<string>();
    const thumbnails: Thumbnail[] = [];
    for (const thumb of thumbsRaw) {
      const u = url_or_none(thumb.url);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      thumbnails.push({
        url: u,
        width: int_or_none(thumb.width) ?? undefined,
        height: int_or_none(thumb.height) ?? undefined,
      });
    }

    return {
      id: videoId,
      title: str_or_none(snippet.title) ?? undefined,
      timestamp: unified_timestamp(snippet.activeStartDate) ?? undefined,
      age_limit: int_or_none(snippet.minimumAge) ?? 0,
      formats,
      subtitles,
      thumbnails,
    };
  }
}

export class MicrosoftMediusIE extends MicrosoftMediusBaseIE {
  static IE_NAME = 'microsoftmedius';
  static _VALID_URL =
    /https?:\/\/medius\.microsoft\.com\/Embed\/(?:Video\?id=|video-nc\/|VideoDetails\/)(?<id>[\da-f-]+)/;

  protected _extractSubtitle(webpage: string, videoId: string): Record<string, Subtitle[]> {
    let captions =
      traverse_obj(
        this._search_json<{ languageList?: Array<Record<string, unknown>> }>(
          /const\s+captionsConfiguration\s*=/,
          webpage,
          'captions',
          videoId,
          { default: null },
        ),
        ['languageList'],
      ) || [];

    if (!Array.isArray(captions) || !captions.length) {
      captions = [...webpage.matchAll(/var\s+file\s+=\s+\{[^}]+\'(https:\/\/[^\']+\.vtt\?[^\']+)/g)].map(
        (m) => ({
          url: m[1],
          tag: url_basename(m[1]!).split('.vtt')[0]?.split('_').slice(-1)[0],
        }),
      );
    } else {
      captions = captions
        .filter((c) => url_or_none((c as Record<string, unknown>).src))
        .map((c) => {
          const rec = c as Record<string, unknown>;
          return {
            url: rec.src,
            tag: str_or_none(rec.srclang) || 'und',
            name: str_or_none(rec.kind),
          };
        });
    }

    return this._subToDict(captions as Array<Record<string, unknown>>);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `https://medius.microsoft.com/Embed/video-nc/${videoId}`,
      videoId,
    );
    const ismUrl = this._search_regex(/StreamUrl\s*=\s*"([^"]+manifest)"/, webpage, 'ism url')!;

    return {
      id: videoId,
      title: this._og_search_title(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      formats: await this._extractIsm(ismUrl, videoId),
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      subtitles: this._extractSubtitle(webpage, videoId),
    };
  }
}

export class MicrosoftLearnPlaylistIE extends InfoExtractor {
  static IE_NAME = 'microsoftlearnplaylist';
  static _VALID_URL =
    /https?:\/\/learn\.microsoft\.com\/(?:[\w-]+\/)?(?<type>shows|events)\/(?<id>[\w-]+)\/?(?:[?#]|$)/;

  protected async *_entries(urlBase: string, videoId: string): AsyncGenerator<VideoInfo> {
    let skip = 0;
    while (true) {
      const playlistInfo = await this._download_json<{ results?: Array<{ url?: string }>; count?: number }>(
        urlBase,
        videoId,
        `Downloading entries ${skip}`,
        { query: { locale: 'en-us', $skip: String(skip) } },
      );
      const urlPaths = ((playlistInfo.results || []).map((r) => r.url).filter(Boolean) as string[]) || [];
      for (const urlPath of urlPaths) {
        yield this.url_result(`https://learn.microsoft.com/en-us${urlPath}`);
      }
      skip += urlPaths.length;
      if (skip >= (playlistInfo.count || 0) || !urlPaths.length) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups?.id ?? '';
    const playlistType = m.groups?.type ?? '';
    const webpage = await this._download_webpage(url, playlistId);
    const subType = playlistType === 'shows' ? 'episodes' : 'sessions';
    const urlBase = `https://learn.microsoft.com/api/contentbrowser/search/${playlistType}/${playlistId}/${subType}`;
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(urlBase, playlistId)) entries.push(entry);
    return this.playlist_result(entries, playlistId, this._og_search_title(webpage) || undefined, this._og_search_description(webpage) || undefined);
  }
}

export class MicrosoftLearnEpisodeIE extends MicrosoftMediusBaseIE {
  static IE_NAME = 'microsoftlearnepisode';
  static _VALID_URL =
    /https?:\/\/learn\.microsoft\.com\/(?:[\w-]+\/)?shows\/[\w-]+\/(?<id>[^?#/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const entryId = this._html_search_meta('entryId', webpage, 'entryId', true)!;
    const videoInfo = await this._download_json<Record<string, unknown>>(
      `https://learn.microsoft.com/api/video/public/v1/entries/${entryId}`,
      videoId,
    );
    const publicVideo = (videoInfo.publicVideo as Record<string, unknown>) || {};

    const formats: Format[] = [];
    const ismUrl = url_or_none(publicVideo.adaptiveVideoUrl);
    if (ismUrl) formats.push(...(await this._extractIsm(ismUrl, videoId, false)));
    const hlsUrl = url_or_none(publicVideo.adaptiveVideoHLSUrl);
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
    }
    const mpdUrl = url_or_none(publicVideo.adaptiveVideoDashUrl);
    if (mpdUrl) {
      const res = await extractMpdFormatsAndSubtitles(this, mpdUrl, videoId, 'dash');
      formats.push(...res.formats);
    }
    for (const key of ['low', 'medium', 'high'] as const) {
      const videoUrl = url_or_none(publicVideo[`${key}QualityVideoUrl`]);
      if (videoUrl) {
        formats.push({
          url: videoUrl,
          format_id: `video-http-${key}`,
          acodec: 'none',
          ...parseResolution(videoUrl),
        });
      }
    }
    const audioUrl = url_or_none(publicVideo.audioUrl);
    if (audioUrl) formats.push({ url: audioUrl, format_id: 'audio-http', vcodec: 'none' });

    const captionList = ((publicVideo.captions as Array<Record<string, unknown>>) || [])
      .filter((c) => url_or_none(c.url))
      .map((c) => ({ tag: str_or_none(c.language) || 'und', url: c.url }));

    const thumbSizes = (publicVideo.thumbnailOtherSizes as Array<{ url?: string }>) || [];

    return {
      id: entryId,
      formats,
      subtitles: this._subToDict(captionList as Array<Record<string, unknown>>),
      title: this._og_search_title(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      timestamp: parseIso8601(videoInfo.createTime) ?? undefined,
      thumbnails: thumbSizes.map((t) => ({ url: url_or_none(t.url) })).filter((t) => t.url) as Thumbnail[],
    };
  }
}

export class MicrosoftLearnSessionIE extends InfoExtractor {
  static IE_NAME = 'microsoftlearnsession';
  static _VALID_URL =
    /https?:\/\/learn\.microsoft\.com\/(?:[\w-]+\/)?events\/[\w-]+\/(?<id>[^?#/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const externalUrl = this._html_search_meta('externalVideoUrl', webpage, 'videoUrl', true)!;

    return {
      ...this.url_result(externalUrl, 'microsoftmedius', videoId, this._og_search_title(webpage) || undefined),
      _type: 'url_transparent',
      title: this._og_search_title(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      timestamp: parseIso8601(this._html_search_meta('startDate', webpage, 'startDate')) ?? undefined,
    };
  }
}

export class MicrosoftBuildIE extends InfoExtractor {
  static IE_NAME = 'microsoftbuild';
  static _VALID_URL = [
    /https?:\/\/build\.microsoft\.com\/[\w-]+\/sessions\/(?<id>[\da-f-]+)/,
    /https?:\/\/build\.microsoft\.com\/[\w-]+\/(?<id>sessions)\/?(?:[?#]|$)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videos = await this._download_json<Array<Record<string, unknown>>>(
      'https://api-v2.build.microsoft.com/api/session/all/en-US',
      videoId,
      'Downloading video info',
    );

    const entries = videos.map((videoInfo) => {
      const onDemand = str_or_none(videoInfo.onDemand);
      return {
        ...this.url_result(onDemand || '', 'microsoftmedius', str_or_none(videoInfo.sessionId) ?? undefined, str_or_none(videoInfo.title) ?? undefined),
        title: str_or_none(videoInfo.title) ?? undefined,
        description: str_or_none(videoInfo.description) ?? undefined,
        timestamp: parseIso8601(videoInfo.startDateTime) ?? undefined,
      };
    });

    if (videoId === 'sessions') {
      return this.playlist_result(entries, videoId);
    }
    return entries.find((e) => e.id === videoId) || entries[0]!;
  }
}
