/** SenIE — ported from yt-dlp sen.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class SenIE extends InfoExtractor {
  static IE_NAME = 'sen';
  static _VALID_URL = /https?:\/\/(?:www\.)?sen\.com\/video\/(?<id>[0-9a-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiData = await this._download_json<Record<string, unknown>>(
      `https://api.sen.com/content/public/video/${videoId}`,
      videoId,
    );
    const nodes = ((apiData.data as Record<string, unknown>)?.nodes as Array<Record<string, unknown>>) || [];
    const playerNode = nodes.find((n) => n.id === 'player');
    const detailsNode = nodes.find((n) => n.id === 'details');
    const m3u8Url =
      url_or_none((playerNode?.video as Record<string, unknown>)?.url) ||
      `https://vod.sen.com/videos/${videoId}/manifest.m3u8`;
    const { formats } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
    const content = (detailsNode?.content as Record<string, unknown>) || {};
    const titleObj = content.title as Record<string, unknown> | undefined;
    const descArr = content.descriptions as Array<Record<string, unknown>> | undefined;
    const badges = content.badges as Array<Record<string, unknown>> | undefined;

    return {
      id: videoId,
      formats,
      title: titleObj?.text as string | undefined,
      description: descArr?.[0]?.text as string | undefined,
      tags: badges?.map((b) => String(b.text ?? '')).filter(Boolean),
    };
  }
}
