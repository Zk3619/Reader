/**
 * KukuluLiveIE — ported from yt-dlp kukululive.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  filter_dict,
  get_element_by_id,
  int_or_none,
  join_nonempty,
  js_to_json,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

function parseQueryString(qs: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    const key = decodeURIComponent(k || '');
    const val = decodeURIComponent(v);
    (out[key] ||= []).push(val);
  }
  return out;
}

function qualityPriority(quality: string | undefined): number {
  const order = ['low', 'h264', 'high'];
  const idx = order.indexOf(quality || '');
  return idx >= 0 ? order.length - idx : 0;
}

export class KukuluLiveIE extends InfoExtractor {
  static IE_NAME = 'kukululive';
  static _VALID_URL = /https?:\/\/live\.erinn\.biz\/live\.php\?h(?<id>\d+)/;

  protected async _getQualityMeta(
    videoId: string,
    desc: string,
    code: string,
    forceH264?: string,
  ): Promise<Record<string, string[]>> {
    const qs = await this._download_webpage(
      'https://live.erinn.biz/live.player.fplayer.php',
      videoId,
      `Downloading ${desc} quality metadata`,
      {
        fatal: false,
        query: filter_dict({
          hash: videoId,
          action: `get${code}liveByAjax`,
          force_h264: forceH264,
        }) as Record<string, string>,
      },
    );
    return parseQueryString(qs);
  }

  protected _addQualityFormats(formats: Format[], qualityMeta: Record<string, string[]>): void {
    const vcodec = qualityMeta.vcodec?.[0];
    const quality = qualityMeta.now_quality?.[0];
    const priority = qualityPriority(quality);

    const hlsAddr = url_or_none(qualityMeta.hlsaddr?.[0]);
    if (hlsAddr) {
      formats.push({
        format_id: quality || 'hls',
        url: hlsAddr,
        ext: 'mp4',
        vcodec: vcodec ?? undefined,
        quality: priority,
      });
    }

    const audioAddr = url_or_none(qualityMeta.hlsaddr_audioonly?.[0]);
    if (audioAddr) {
      formats.push({
        format_id: join_nonempty(quality, 'audioonly'),
        url: audioAddr,
        ext: 'm4a',
        vcodec: 'none',
        quality: priority,
      });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const html = await this._download_webpage(url, videoId);

    if (html.includes('>タイムシフトが見つかりませんでした。<')) {
      throw new ExtractorError('This stream has expired', { expected: true });
    }

    const normalizedHtml = html.replace(/<SPAN/gi, '<span').replace(/SPAN>/gi, 'span>');
    const title = clean_html(get_element_by_id('livetitle', normalizedHtml) || '') || undefined;
    const description = this._html_search_meta('Description', html, undefined, false) ?? undefined;
    const thumbnail =
      this._html_search_meta(['og:image', 'twitter:image'], html, undefined, false) ?? undefined;

    const isLive = !!this._search_regex(/(var\s+timeshift\s*=\s*false)/, html, 'is livestream', null, false);

    if (isLive) {
      const formats: Format[] = [];
      for (const [desc, code] of [
        ['high', 'Z'],
        ['low', 'ForceLow'],
      ] as const) {
        const qualityMeta = await this._getQualityMeta(videoId, desc, code);
        this._addQualityFormats(formats, qualityMeta);
        if (desc === 'high' && qualityMeta.vcodec?.[0] === 'HEVC') {
          this._addQualityFormats(
            formats,
            await this._getQualityMeta(videoId, desc, code, '1'),
          );
        }
      }

      return {
        id: videoId,
        title,
        description,
        thumbnail,
        is_live: true,
        formats,
      };
    }

    const playerHtml = await this._download_webpage(
      'https://live.erinn.biz/live.timeshift.fplayer.php',
      videoId,
      'Downloading player html',
      { fatal: false, query: { hash: videoId } },
    );

    const sources = (
      this._search_json<Array<Record<string, unknown>>>(
        /var\s+fplayer_source\s*=/,
        playerHtml,
        'stream data',
        videoId,
        { contains: true, transform_source: js_to_json },
      ) || []
    ).filter((v) => v.file);

    const buildEntry = (segment: Record<string, unknown>, idx: number, playlist: boolean): VideoInfo => ({
      id: playlist ? `${videoId}_${idx}` : videoId,
      title: playlist && title ? `${title} (Part ${idx})` : title,
      description,
      timestamp: int_or_none(segment.time_start) ?? undefined,
      thumbnail,
      formats: [
        {
          url: urljoin('https://live.erinn.biz', String(segment.file ?? '')),
          ext: 'mp4',
          protocol: 'm3u8_native',
          format_id: 'hls',
        },
      ],
    });

    if (sources.length === 1) {
      return buildEntry(sources[0]!, 1, false);
    }

    const entries = sources.map((seg, i) => buildEntry(seg, i + 1, true));
    return this.playlist_result(entries, videoId, title, description);
  }
}
