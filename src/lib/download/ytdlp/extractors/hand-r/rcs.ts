/** RCS* — ported from yt-dlp rcs.py (main paths) */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, urljoin } from './_helpers';

export class RCSBaseIE extends InfoExtractor {
  static IE_NAME = 'RCSBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('RCSBaseIE is not a standalone extractor');
  }

  protected *_getVideoSrc(video: Record<string, unknown>): Generator<{ type: string; url: string; bitrate?: number }> {
    for (const source of traverse_obj(video, ['mediaProfile', 'mediaFile', 'all']) as Array<Record<string, unknown>>) {
      if (!source.mimeType) continue;
      let srcUrl = String(source.value || '');
      srcUrl = srcUrl
        .replace('media2vam.corriere.it.edgesuite.net', 'media2vam-corriere-it.akamaized.net')
        .replace('http://', 'https://');
      const type = determine_ext(String(source.mimeType), 'mp4');
      yield { type, url: srcUrl, bitrate: source.bitrate as number | undefined };
    }
  }

  protected async _createFormats(sources: Generator<{ type: string; url: string; bitrate?: number }>, videoId: string): Promise<Format[]> {
    const formats: Format[] = [];
    for (const source of sources) {
      if (source.type === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, source.url.replace('.csmil', '.urlset'), videoId, 'hls')).formats);
      } else {
        formats.push({
          url: source.url,
          format_id: source.bitrate ? `${source.type}-${source.bitrate}` : source.type,
          ext: source.type,
          tbr: source.bitrate,
        });
      }
    }
    return formats;
  }

  protected async _extractFromVideoData(videoData: Record<string, unknown>, videoId: string, webpage?: string): Promise<VideoInfo> {
    return {
      id: videoId,
      title: (videoData.title as string) || this._og_search_title(webpage || '') || videoId,
      description: (videoData.description as string) || this._og_search_description(webpage || '') || undefined,
      uploader: (videoData.provider as string) || undefined,
      formats: await this._createFormats(this._getVideoSrc(videoData), videoId),
    };
  }
}

export class RCSEmbedsIE extends RCSBaseIE {
  static IE_NAME = 'RCSEmbeds';
  static _VALID_URL =
    /https?:\/\/(?<vid>video)\.(?:(?:corriere\w+\.)?corriere|(?:gazzanet\.)?gazzetta|rcs)\.it\/video-embed\/(?<id>[^/=&?]+?)(?:$|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoData = this._search_json(/var\s+videoData\s*=\s*/, webpage, 'video data', videoId) as Record<string, unknown>;
    return this._extractFromVideoData(videoData, videoId, webpage);
  }
}

export class RCSIE extends RCSBaseIE {
  static IE_NAME = 'RCS';
  static _VALID_URL =
    /https?:\/\/(?<vid>video|viaggi)\.(?:(?:corrieredelmezzogiorno\.|corrieredelveneto\.|corrieredibologna\.|corrierefiorentino\.)?corriere\.it|(?:gazzanet\.)?gazzetta\.it)\/(?!video-embed\/)[^?#]+?\/(?<id>[^/?]+)(?=\?|\/|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoData = this._search_json(/var\s+videoData\s*=\s*/, webpage, 'video data', videoId) as Record<string, unknown>;
    return this._extractFromVideoData(videoData, videoId, webpage);
  }
}

export class RCSVariousIE extends RCSBaseIE {
  static IE_NAME = 'RCSVarious';
  static _VALID_URL =
    /https?:\/\/(?:(?:video\.)?(?:rcs|corriere|gazzetta)\.it|(?:www\.)?(?:iodonna|living|style|oggi)\.it)\/[^?#]+\/(?<id>[\w-]+-\d{10})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const embedUrl = webpage.match(/src="((?:https?:)?\/\/video\.[^"]+\/video-embed\/[^"]+)"/)?.[1];
    if (embedUrl) return this.url_result(urljoin(url, embedUrl), 'RCSEmbeds', videoId);
    const videoData = this._search_json(/var\s+videoData\s*=\s*/, webpage, 'video data', videoId, { fatal: false }) as Record<string, unknown>;
    if (videoData) return this._extractFromVideoData(videoData, videoId, webpage);
    return this.url_result(`https://video.rcs.it/video-embed/${videoId}`, 'RCSEmbeds', videoId);
  }
}
