/**
 * CTVNewsIE — ported from yt-dlp ctvnews.py
 * Delegates to a synthetic `9c9media:ctvnews_web:{clipId}` URL since the
 * NineCNineMedia extractor isn't ported in this batch; this yields a
 * `url_result` pointing at the underlying 9c9media asset id for downstream
 * resolution once/if that extractor lands.
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';
import { orderedSet } from './_helpers';

const BASE_REGEX = 'https?://(?:[^.]+\\.)?ctvnews\\.ca/';
const VIDEO_ID_RE = '(?<id>\\d{5,})';
const PLAYLIST_ID_RE = '(?<id>\\d\\.\\d{5,})';

export class CTVNewsIE extends InfoExtractor {
  static IE_NAME = 'CTVNews';
  static _VALID_URL = [
    new RegExp(`${BASE_REGEX}video/c${VIDEO_ID_RE}`),
    new RegExp(`${BASE_REGEX}video(?:-gallery)?/?\\?clipId=${VIDEO_ID_RE}`),
    new RegExp(`${BASE_REGEX}video/?\\?(?:playlist|bin)Id=${PLAYLIST_ID_RE}`),
    new RegExp(`${BASE_REGEX}(?!video/)[^?#]*?${PLAYLIST_ID_RE}/?(?:$|[?#])`),
    new RegExp(`${BASE_REGEX}(?!video/)[^?#]+\\?binId=${PLAYLIST_ID_RE}`),
  ];

  private _ninecninemediaUrlResult(clipId: string): VideoInfo {
    return this.url_result(`9c9media:ctvnews_web:${clipId}`, 'NineCNineMedia', clipId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let pageId = this._match_id(url);

    const fragment = new URL(url).hash.replace(/^#/, '');
    if (new RegExp(`^${VIDEO_ID_RE}$`).test(fragment)) {
      pageId = fragment;
    }

    if (new RegExp(`^${VIDEO_ID_RE}$`).test(pageId)) {
      return this._ninecninemediaUrlResult(pageId);
    }

    let webpage = await this._download_webpage(`https://www.ctvnews.ca/${pageId}`, pageId, undefined, {
      query: { ot: 'example.AjaxPageLayout.ot', maxItemsPerPage: '1000000' },
    });
    let clipIds = orderedSet([...webpage.matchAll(/clip\.id\s*=\s*(\d+);/g)].map((m) => m[1]!));

    if (!clipIds.length) {
      webpage = await this._download_webpage(url, pageId);
      if (webpage.includes('getAuthStates("')) {
        const authStates = this._search_regex(/getAuthStates\("([\d+,]+)"/, webpage, 'clip ids');
        clipIds = (authStates || '').split(',').filter(Boolean);
      } else {
        const containerMatch = /<jasper-player-container\b[^>]*>/i.exec(webpage);
        if (containerMatch) {
          const attrs = extract_attributes(containerMatch[0]);
          const axisIdsRaw = attrs['axis-ids'];
          if (axisIdsRaw) {
            try {
              const parsed = JSON.parse(axisIdsRaw) as Array<{ axisId?: unknown }>;
              clipIds = parsed.map((x) => String(x.axisId)).filter(Boolean);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    const entries = clipIds.map((id) => this._ninecninemediaUrlResult(id));
    return this.playlist_result(entries, pageId);
  }
}
