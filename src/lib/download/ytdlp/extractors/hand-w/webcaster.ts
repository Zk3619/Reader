// @ts-nocheck
/** WebcasterIE / WebcasterFeedIE â€?ported from yt-dlp webcaster.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { xmlChildText } from './_helpers';

function joinParts(...parts: Array<string | null | undefined>): string {
  return parts.filter((x) => typeof x === 'string' && x.length).join('_');
}

function joinDash(...parts: Array<string | null | undefined>): string {
  return parts.filter((x) => typeof x === 'string' && x.length).join('-');
}

export class WebcasterIE extends InfoExtractor {
  static IE_NAME = 'Webcaster';
  static _VALID_URL =
    /https?:\/\/bl\.webcaster\.pro\/(?:quote|media)\/start\/free_(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_webpage(url, videoId);

    const title = xmlChildText(video, 'event_name');
    if (!title) {
      throw new ExtractorError('Unable to extract event name', { expected: true });
    }

    const formats: Format[] = [];
    for (const formatId of [null, 'noise'] as const) {
      const trackTag = joinParts('track', formatId || undefined);
      const iphone = video.match(/<iphone>([\s\S]*?)<\/iphone>/i)?.[1] || '';
      const trackRe = new RegExp(
        `<${trackTag}\\b([^>]*)>([\\s\\S]*?)</${trackTag}>|<${trackTag}\\b([^/]*)/>`,
        'gi',
      );
      let m: RegExpExecArray | null;
      while ((m = trackRe.exec(iphone))) {
        const attrs = m[1] || m[3] || '';
        const trackUrl = (m[2] || '').trim() || null;
        if (!trackUrl) continue;
        if (determine_ext(trackUrl) === 'm3u8') {
          const m3u8Formats = await this._extract_m3u8_formats(
            trackUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            joinDash('hls', formatId || undefined),
            undefined,
            false,
          );
          const titleAttr = /title=["']([^"']*)["']/.exec(attrs)?.[1];
          for (const f of m3u8Formats) {
            f.source_preference = formatId === 'noise' ? 0 : 1;
            f.format_note = titleAttr;
          }
          formats.push(...m3u8Formats);
        }
      }
    }

    return {
      id: videoId,
      title,
      thumbnail: xmlChildText(video, 'image') || undefined,
      formats,
    };
  }
}

export class WebcasterFeedIE extends InfoExtractor {
  static IE_NAME = 'Webcaster:feed';
  static _VALID_URL = /https?:\/\/bl\.webcaster\.pro\/feed\/start\/free_(?<id>[^/]+)/;
  static _EMBED_REGEX = [
    /<(?:object|a[^>]+class=["']webcaster-player["'])[^>]+data(?:-config)?=(["']).*?config=(?<url>https?:\/\/bl\.webcaster\.pro\/feed\/start\/free_.*?)(?:[?&]|\1)/,
  ];

  /** Best-effort webpage scan (runtime may not auto-call this yet). */
  async _extractFromWebpage(_url: string, webpage: string): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];

    for (const re of WebcasterFeedIE._EMBED_REGEX) {
      for (const m of webpage.matchAll(new RegExp(re.source, 'gi'))) {
        const embedUrl = m.groups?.url;
        if (embedUrl) results.push(this.url_result(embedUrl, 'Webcaster:feed'));
      }
    }

    const videoUrl = this._og_search_video_url(webpage);
    if (videoUrl) {
      const mobj = /config=(?<url>https?:\/\/bl\.webcaster\.pro\/feed\/start\/free_[^?&=]+)/.exec(
        videoUrl,
      );
      if (mobj?.groups?.url) {
        results.push(this.url_result(mobj.groups.url, 'Webcaster:feed'));
      }
    }

    return results;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const feed = await this._download_webpage(url, videoId);

    const videoUrl = xmlChildText(feed, 'video_hd') || xmlChildText(feed, 'video');
    if (!videoUrl) {
      throw new ExtractorError('Unable to extract video url', { expected: true });
    }

    return this.url_result(videoUrl, 'Webcaster');
  }
}
