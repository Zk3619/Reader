/**
 * InfoQIE — ported from yt-dlp infoq.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, update_url_query } from '../../utils';
import { hiddenInputs, htmlExtractTitle } from './_helpers';

export class InfoQIE extends InfoExtractor {
  static IE_NAME = 'infoq';
  static _VALID_URL = /https?:\/\/(?:www\.)?infoq\.com\/(?:[^/]+\/)+(?<id>[^/]+)/;

  protected _extractRtmpVideo(webpage: string): Format[] {
    const videoUrl = 'rtmpe://videof.infoq.com/cfx/st/';
    const encodedId = this._search_regex(/jsclassref\s*=\s*'([^']*)'/, webpage, 'encoded id', null, false);
    if (!encodedId) return [];
    const realId = decodeURIComponent(atob(encodedId));
    const playpath = `mp4:${realId}`;
    return [
      {
        format_id: 'rtmp_video',
        url: videoUrl,
        ext: determine_ext(playpath, 'mp4') || 'mp4',
        play_path: playpath,
      },
    ];
  }

  protected _extractCfAuth(webpage: string): Record<string, string> {
    const policy = this._search_regex(/InfoQConstants\.scp\s*=\s*'([^']+)'/, webpage, 'policy')!;
    const signature = this._search_regex(/InfoQConstants\.scs\s*=\s*'([^']+)'/, webpage, 'signature')!;
    const keyPairId = this._search_regex(/InfoQConstants\.sck\s*=\s*'([^']+)'/, webpage, 'key-pair-id')!;
    return { Policy: policy, Signature: signature, 'Key-Pair-Id': keyPairId };
  }

  protected _extractHttpVideo(webpage: string): Format[] {
    const httpVideoUrl = this._search_regex(/P\.s\s*=\s*'([^']+)'/, webpage, 'video URL')!;
    return [
      {
        format_id: 'http_video',
        url: update_url_query(httpVideoUrl, this._extractCfAuth(webpage)),
        http_headers: { Referer: 'https://www.infoq.com/' },
      },
    ];
  }

  protected _extractHttpAudio(webpage: string): Format[] {
    const formMatch = webpage.match(/<form[^>]+id=["']mp3Form["'][^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch?.[1]) return [];
    const inputs = hiddenInputs(formMatch[1]);
    const httpAudioUrlRaw = inputs.filename;
    if (!httpAudioUrlRaw) return [];

    const httpAudioUrl = update_url_query(
      new URL(httpAudioUrlRaw, 'http://ress.infoq.com/downloads/mp3downloads/').toString(),
      this._extractCfAuth(webpage),
    );

    return [
      {
        format_id: 'http_audio',
        url: httpAudioUrl,
        vcodec: 'none',
      },
    ];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats: Format[] = [
      ...this._extractRtmpVideo(webpage),
      ...this._extractHttpVideo(webpage),
      ...this._extractHttpAudio(webpage),
    ];

    return {
      id: videoId,
      title: htmlExtractTitle(webpage) ?? videoId,
      description: this._html_search_meta('description', webpage, 'description') ?? undefined,
      formats,
    };
  }
}
