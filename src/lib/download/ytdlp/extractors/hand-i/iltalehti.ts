/**
 * IltalehtiIE — ported from yt-dlp iltalehti.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, traverse_obj } from '../../utils';
import { playlistFromMatches } from './_helpers';

function collectJwplayerIds(info: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const articles = traverse_obj(info, ['state', 'articles']) as Record<string, unknown> | undefined;
  if (!articles || typeof articles !== 'object') return ids;

  for (const article of Object.values(articles)) {
    if (!article || typeof article !== 'object') continue;
    const items = (article as Record<string, unknown>).items as Record<string, unknown> | undefined;
    if (!items) continue;

    const mainProps = traverse_obj(items, ['main_media', 'properties']) as Record<string, unknown> | undefined;
    if (mainProps?.provider === 'jwplayer' && mainProps.id) ids.push(String(mainProps.id));

    const body = items.body;
    if (Array.isArray(body)) {
      for (const block of body) {
        const props = (block as Record<string, unknown>)?.properties as Record<string, unknown> | undefined;
        if (props?.provider === 'jwplayer' && props.id) ids.push(String(props.id));
      }
    }
  }
  return ids;
}

export class IltalehtiIE extends InfoExtractor {
  static IE_NAME = 'iltalehti';
  static _VALID_URL = /https?:\/\/(?:www\.)?iltalehti\.fi\/[^/?#]+\/a\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);

    const info = this._search_json<Record<string, unknown>>(
      /<script>\s*window\.App\s*=/,
      webpage,
      'json',
      articleId,
      { transform_source: js_to_json },
    )!;

    const videoIds = collectJwplayerIds(info);
    const title = traverse_obj(info, ['state', 'articles', { get_all: true }, 'items', 'canonical_title'], {
      get_all: false,
    }) as string | undefined;

    return playlistFromMatches(
      this,
      videoIds.map((id) => `jwplatform:${id}`),
      articleId,
      { title, ie: 'JWPlatform' },
    );
  }
}
