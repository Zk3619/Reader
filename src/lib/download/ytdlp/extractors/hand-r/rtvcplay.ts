/** RTVCPlay* — ported from yt-dlp rtvcplay.py (main paths) */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, determine_ext, js_to_json, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class RTVCPlayBaseIE extends InfoExtractor {
  static IE_NAME = 'RTVCPlayBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _BASE_VALID_URL = 'https?:\\/\\/(?:www\\.)?rtvcplay\\.co';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('RTVCPlayBaseIE is not a standalone extractor');
  }

  protected _extractPlayerConfig(webpage: string, videoId: string): Record<string, unknown> {
    return this._search_json(
      /<script\b[^>]*>[^<]*(?:var|let|const)\s+config\s*=/,
      webpage.replace(/"\s*\+\s*"/g, ''),
      'player_config',
      videoId,
      { transform_source: js_to_json },
    ) as Record<string, unknown>;
  }

  protected async _extractFormatsAndSubtitlesPlayerConfig(playerConfig: Record<string, unknown>, videoId: string) {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const source of traverse_obj(playerConfig, ['sources', 'all']) as Array<Record<string, unknown>>) {
      const srcUrl = url_or_none(source.url as string);
      if (!srcUrl) continue;
      const ext = determine_ext(srcUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, videoId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else {
        formats.push({ url: srcUrl, ext, format_id: ext || 'http' });
      }
    }
    return { formats, subtitles };
  }
}

export class RTVCPlayIE extends RTVCPlayBaseIE {
  static IE_NAME = 'RTVCPlay';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtvcplay\.co\/(?<category>(?!embed)[^/]+)\/(?:[^?#]+\/)?(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const category = m.groups!.category!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, videoId);
    const playerConfig = this._extractPlayerConfig(webpage, videoId);
    const { formats, subtitles } = await this._extractFormatsAndSubtitlesPlayerConfig(playerConfig, videoId);
    const assetId = traverse_obj(playerConfig, ['rtvcplay', 'assetid']) as string | undefined;
    const metadata = assetId
      ? await this._download_json<Record<string, unknown>>(
          `https://cms.rtvcplay.co/api/v1/video/asset-id/${assetId}`,
          videoId,
          undefined,
          { fatal: false },
        )
      : {};
    return {
      id: videoId,
      formats,
      subtitles,
      title: (metadata.title as string) || this._og_search_title(webpage) || undefined,
      description: clean_html(metadata.description as string) || this._og_search_description(webpage) || undefined,
      thumbnail: traverse_obj(metadata, ['image', 0, 'thumbnail', 'path']) as string | undefined,
      is_live: category === 'en-vivo',
    };
  }
}

export class RTVCPlayEmbedIE extends RTVCPlayBaseIE {
  static IE_NAME = 'RTVCPlayEmbed';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtvcplay\.co\/embed\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playerConfig = this._extractPlayerConfig(webpage, videoId);
    const { formats, subtitles } = await this._extractFormatsAndSubtitlesPlayerConfig(playerConfig, videoId);
    const assetId = traverse_obj(playerConfig, ['rtvcplay', 'assetid']) as string | undefined;
    const metadata = assetId
      ? await this._download_json<Record<string, unknown>>(
          `https://cms.rtvcplay.co/api/v1/video/asset-id/${assetId}`,
          videoId,
          undefined,
          { fatal: false },
        )
      : {};
    return {
      id: videoId,
      formats,
      subtitles,
      title: metadata.title as string | undefined,
      description: metadata.description as string | undefined,
      thumbnail: traverse_obj(metadata, ['image', 'all', 'thumbnail', 'path']) as string | undefined,
    };
  }
}

export class RTVCKalturaIE extends RTVCPlayBaseIE {
  static IE_NAME = 'RTVCKaltura';
  static _VALID_URL = /https?:\/\/media\.rtvc\.gov\.co\/kalturartvc\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playerConfig = this._extractPlayerConfig(webpage, videoId);
    const { formats, subtitles } = await this._extractFormatsAndSubtitlesPlayerConfig(playerConfig, videoId);
    const channelId = traverse_obj(playerConfig, ['rtvcplay', 'channelId']) as string | undefined;
    const metadata = channelId
      ? await this._download_json<Record<string, unknown>>(
          `https://cms.rtvcplay.co/api/v1/taxonomy_term/streaming/${channelId}`,
          videoId,
          undefined,
          { fatal: false },
        )
      : {};
    const hlsUrl = traverse_obj(metadata, ['channel', 'hls']) as string | undefined;
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId);
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    return {
      id: videoId,
      formats,
      subtitles,
      title: traverse_obj(metadata, ['channel', 'name']) as string | undefined,
      description: traverse_obj(metadata, ['channel', 'description']) as string | undefined,
      is_live: true,
    };
  }
}
