/** ParlviewIE — ported from yt-dlp parlview.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, str_or_none, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class ParlviewIE extends InfoExtractor {
  static IE_NAME = 'parlview';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?aph\.gov\.au\/News_and_Events\/Watch_Read_Listen\/ParlView\/video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoDetails = (
      await this._download_json<{ videoDetails: Record<string, unknown> }>(
        `https://vodapi.aph.gov.au/api/search/parlview/${videoId}`,
        videoId,
      )
    ).videoDetails;

    const files = (videoDetails.files as Record<string, unknown>) || {};
    const file = (files.file as Record<string, unknown>) || {};
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, String(file.url ?? ''), videoId, 'hls');

    const durationRaw = str_or_none(file.duration);
    const durationMatch = durationRaw ? /^(\d+:\d+:\d+):\d+$/.exec(durationRaw) : null;
    const title =
      str_or_none(videoDetails.parlViewTitle) ||
      str_or_none(videoDetails.title) ||
      undefined;

    return {
      id: videoId,
      formats,
      subtitles,
      title,
      description: str_or_none(videoDetails.parlViewDescription) ?? undefined,
      duration: durationMatch ? parse_duration(durationMatch[1]!) ?? undefined : undefined,
      timestamp: parseIso8601(videoDetails.recordingFrom) ?? undefined,
      thumbnail: url_or_none(videoDetails.thumbUrl) ?? undefined,
    };
  }
}
