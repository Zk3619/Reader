/** RadioDeIE — ported from yt-dlp radiode.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class RadioDeIE extends InfoExtractor {
  static IE_NAME = 'radio.de';
  static _VALID_URL = /https?:\/\/(?<id>.+?)\.(?:radio\.(?:de|at|fr|pt|es|pl|it)|rad\.io)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const radioId = this._match_id(url);
    const webpage = await this._download_webpage(url, radioId);
    const jscode = this._search_regex(
      /'components\/station\/stationService':\s*\{\s*'?station'?:\s*(\{[\s\S]*?\s*\}),\n/,
      webpage,
      'broadcast',
    );
    const broadcast = this._parse_json(jscode, radioId) as Record<string, unknown>;
    const title = broadcast.name as string;
    const description =
      (broadcast.description as string | undefined) || (broadcast.shortDescription as string | undefined);
    const thumbnail =
      (broadcast.picture4Url as string | undefined) ||
      (broadcast.picture4TransUrl as string | undefined) ||
      (broadcast.logo100x100 as string | undefined);

    const formats: Format[] = [];
    for (const [idx, stream] of ((broadcast.streamUrls as Array<Record<string, unknown>>) || []).entries()) {
      const ext = String(stream.streamContentFormat || 'mp3').toLowerCase();
      formats.push({
        url: stream.streamUrl as string,
        format_id: ext || String(idx),
        ext,
        acodec: stream.streamContentFormat as string | undefined,
        abr: stream.bitRate as number | undefined,
        asr: stream.sampleRate as number | undefined,
      });
    }

    return {
      id: radioId,
      title,
      description,
      thumbnail,
      is_live: true,
      formats,
    };
  }
}
