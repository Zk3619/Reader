/** MediaWorksNZVODIE — ported from yt-dlp mediaworksnz.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, str_or_none, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class MediaWorksNZVODIE extends InfoExtractor {
  static IE_NAME = 'mediaworksnz';
  static _VALID_URL =
    /https?:\/\/vodupload-api\.mediaworks\.nz\/library\/asset\/published\/(?<id>[A-Za-z0-9-]+)/;

  static *_extractEmbedUrls(_url: string, webpage: string): Generator<string> {
    for (const m of webpage.matchAll(
      /<div\s+\bid=["']Player-Attributes-JWID[^>]+\bdata-request-url=["']https?:\/\/vodupload-api\.mediaworks\.nz\/library\/asset\/published\/["'][^>]+\bdata-asset-id=["'](?<id>[A-Za-z0-9-]+)["']/gi,
    )) {
      yield `https://vodupload-api.mediaworks.nz/library/asset/published/${m.groups!.id}`;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const asset = ((await this._download_json<Record<string, unknown>>(url, videoId)).asset as Record<string, unknown>) || {};
    if (asset.drm && asset.drm !== 'NonDRM') this.report_warning(`DRM protected: ${videoId}`);
    if (asset.type && asset.type !== 'video') {
      this.report_warning(`Unknown content type: ${asset.type}`);
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(asset.streamingUrl ?? ''),
      videoId,
    );

    const audioUrl = str_or_none(asset.palyoutPathAudio) || str_or_none(asset.playoutpathaudio);
    if (audioUrl) {
      const audioFormats = await this._extract_m3u8_formats(audioUrl, videoId, 'mp3', 'm3u8_native', undefined, undefined, 'audio', undefined, false);
      for (const af of audioFormats) {
        af.vcodec = af.vcodec || 'none';
        af.acodec = af.acodec || 'aac';
        formats.push(af);
      }
    }

    return {
      id: videoId,
      title: str_or_none(asset.title) ?? undefined,
      description: str_or_none(asset.description) ?? undefined,
      duration: float_or_none(asset.duration) ?? undefined,
      timestamp: unified_timestamp(asset.dateadded) ?? undefined,
      channel: str_or_none(asset.brand) ?? undefined,
      thumbnails: ((asset.thumbnails as string[]) || []).map((u) => ({ url: u })),
      formats,
      subtitles,
    };
  }
}
