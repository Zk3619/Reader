/** ProjectVeritasIE — ported from yt-dlp projectveritas.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, unified_strdate } from '../../utils';

export class ProjectVeritasIE extends InfoExtractor {
  static IE_NAME = 'projectveritas';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?projectveritas\.com\/(?<type>news|video)\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups?.id ?? '';
    const videoType = m.groups?.type ?? '';
    const apiUrl = `https://www.projectveritas.com/page-data/${videoType}/${videoId}/page-data.json`;
    const dataJson = (await this._download_json<{ result?: { data?: Record<string, unknown> } }>(apiUrl, videoId))
      .result?.data || {};
    const mainData =
      (traverse_obj(dataJson, 'video') as Record<string, unknown>) ||
      (traverse_obj(dataJson, 'post') as Record<string, unknown>) ||
      {};
    videoId = String(mainData.id ?? videoId);
    const thumbnail = traverse_obj(mainData, ['image', 'ogImage', 'src']) as string | undefined;
    let asset = traverse_obj(mainData, 'muxAsset') as Record<string, unknown> | undefined;
    if (!asset) {
      const content = traverse_obj(mainData, ['body', 'json', 'content']) as Array<Record<string, unknown>> | undefined;
      for (const block of content || []) {
        const fields = traverse_obj(block, ['data', 'target', 'fields']) as Record<string, unknown> | undefined;
        if (fields?.muxAsset && typeof fields.muxAsset === 'object') {
          asset = fields.muxAsset as Record<string, unknown>;
          break;
        }
      }
    }
    if (!asset) throw new ExtractorError('No video on the provided url.', { expected: true });

    const playbackId =
      (asset.playbackId as string) ||
      ((asset['en-US'] as Record<string, unknown>)?.playbackId as string);
    const formats = await this._extract_m3u8_formats(
      `https://stream.mux.com/${playbackId}.m3u8`,
      videoId,
    );

    return {
      id: videoId,
      title: String(mainData.title ?? ''),
      upload_date: unified_strdate(mainData.date) ?? undefined,
      thumbnail: thumbnail?.replace(/^\/\//, '') ?? undefined,
      formats,
    };
  }
}
