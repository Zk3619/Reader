/** RtlNl* — ported from yt-dlp rtlnl.py (main paths) */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { extractM3u8FormatsAndSubtitles, protoRelative } from './_helpers';

export class RtlNlIE extends InfoExtractor {
  static IE_NAME = 'rtl.nl';
  static IE_DESC = 'rtl.nl and rtlxl.nl';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|static)\.)?(?:rtlxl\.nl\/(?:[^#]*\#!|programma)\/[^/]+\/|rtl\.nl\/(?:system\/videoplayer\/(?:[^/]+\/)+(?:video_)?embed\.html|embed)\b.+?\buuid=|video\/|embed\.rtl\.nl\/#uuid=)(?<id>[0-9a-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const uuid = this._match_id(url);
    const info = await this._download_json<Record<string, unknown>>(
      `http://www.rtl.nl/system/s4m/vfd/version=2/uuid=${uuid}/fmt=adaptive/`,
      uuid,
    );
    const material = ((info.material as Array<Record<string, unknown>>) || [])[0] || {};
    const abstracts = ((info.abstracts as Array<Record<string, unknown>>) || [])[0] || {};
    let title = abstracts.name as string;
    const subtitle = material.title as string | undefined;
    if (subtitle) title += ` - ${subtitle}`;
    const meta = (info.meta as Record<string, unknown>) || {};
    const m3u8Url = String(meta.videohost || 'http://manifest.us.rtl.nl') + String(material.videopath || '');
    const formats = (await extractM3u8FormatsAndSubtitles(this, m3u8Url, uuid, 'hls')).formats;
    const thumbnails: Thumbnail[] = [];
    for (const p of ['poster_base_url', 'thumb_base_url'] as const) {
      const base = meta[p] as string | undefined;
      if (!base) continue;
      thumbnails.push({
        url: protoRelative(base + uuid),
        width: int_or_none(this._search_regex(/\/sz=([0-9]+)/, base, 'thumbnail width', null, false)) ?? undefined,
        height:
          int_or_none(this._search_regex(/\/sz=[0-9]+x([0-9]+)/, base, 'thumbnail height', null, false)) ??
          undefined,
      });
    }
    return {
      id: uuid,
      title,
      formats,
      timestamp: material.original_date as number | undefined,
      description: material.synopsis as string | undefined,
      duration: parse_duration(material.duration as string) ?? undefined,
      thumbnails,
    };
  }
}

export class RTLLuBaseIE extends InfoExtractor {
  static IE_NAME = 'RTLLuBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _MEDIA_REGEX = {
    video: /<rtl-player\s[^>]*\bhls\s*=\s*"([^"]+)/,
    audio: /<rtl-audioplayer\s[^>]*\bsrc\s*=\s*"([^"]+)/,
    thumbnail: /<rtl-player\s[^>]*\bposter\s*=\s*"([^"]+)/,
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('RTLLuBaseIE is not a standalone extractor');
  }

  protected getMediaUrl(webpage: string, mediaType: keyof typeof RTLLuBaseIE._MEDIA_REGEX): string | null {
    return webpage.match(RTLLuBaseIE._MEDIA_REGEX[mediaType])?.[1] ?? null;
  }

  protected async getFormatsAndSubtitles(webpage: string, videoId: string) {
    const videoUrl = this.getMediaUrl(webpage, 'video');
    const audioUrl = this.getMediaUrl(webpage, 'audio');
    let formats = videoUrl ? (await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId)).formats : [];
    const subtitles = videoUrl ? (await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId)).subtitles : {};
    if (audioUrl) formats.push({ url: audioUrl, ext: 'mp3', format_id: 'mp3', vcodec: 'none' });
    return { formats, subtitles };
  }

  protected async _extractLu(url: string, videoId: string, isLive = false): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, videoId);
    const { formats, subtitles } = await this.getFormatsAndSubtitles(webpage, videoId);
    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      formats,
      subtitles,
      thumbnail:
        this.getMediaUrl(webpage, 'thumbnail') || this._og_search_thumbnail(webpage) || undefined,
      is_live: isLive,
    };
  }
}

export class RTLLuTeleVODIE extends RTLLuBaseIE {
  static IE_NAME = 'rtl.lu:tele-vod';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtl\.lu\/(?:tele\/(?<slug>[\w-]+)\/v\/|video\/)(?<id>\d+)(?:\.html)?/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractLu(url, this._match_id(url));
  }
}

export class RTLLuArticleIE extends RTLLuBaseIE {
  static IE_NAME = 'rtl.lu:article';
  static _VALID_URL = /https?:\/\/(?:(?:www|5minutes|today)\.)rtl\.lu\/(?:[\w-]+\/){2}a\/(?<id>\d+)\.html/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractLu(url, this._match_id(url));
  }
}

export class RTLLuLiveIE extends RTLLuBaseIE {
  static IE_NAME = 'rtl.lu:live';
  static _VALID_URL = /https?:\/\/www\.rtl\.lu\/(?:tele|radio)\/(?<id>live(?:-\d+)?|lauschteren)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this._extractLu(url, videoId, true);
  }
}

export class RTLLuRadioIE extends RTLLuBaseIE {
  static IE_NAME = 'rtl.lu:radio';
  static _VALID_URL = /https?:\/\/www\.rtl\.lu\/radio\/(?:[\w-]+)\/s\/(?<id>\d+)(?:\.html)?/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractLu(url, this._match_id(url));
  }
}
