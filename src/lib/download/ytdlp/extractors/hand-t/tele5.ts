/** Tele5IE — ported from yt-dlp tele5.py */

import type { VideoInfo } from '../../types';
import { str_or_none } from '../../utils';
import { DiscoveryPlusBaseIE } from '../hand-d/dplay';

export class Tele5IE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'tele5';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tele5\.de\/(?<parent_slug>[\w-]+)\/(?<slug_a>[\w-]+)(?:\/(?<slug_b>[\w-]+))?/;

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm}`;
    headers['x-disco-client'] = 'Alps:HyogaPlayer:0.0.0';
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const parentSlug = m.groups!.parent_slug!;
    const slugA = m.groups!.slug_a!;
    const slugB = m.groups!.slug_b;
    const playlistId = [parentSlug, slugA, slugB].filter((x): x is string => !!x).join('-');

    const query: Record<string, string> = {
      include: 'default',
      'filter[environment]': 'tele5',
      v: '2',
    };
    let endpoint: string;
    if (!slugB) {
      endpoint = `page/${slugA}`;
      query.parent_slug = parentSlug;
    } else {
      endpoint = `shows/${slugA}`;
      query['filter[video.slug]'] = slugB;
    }

    const cmsData = await this._download_json<Record<string, unknown>>(
      `https://public.aurora.enhanced.live/site/${endpoint}/`,
      playlistId,
      undefined,
      { query },
    );

    const videoIds = [
      ...new Set(
        ((cmsData.blocks as Array<Record<string, unknown>>) || [])
          .map((b) => str_or_none(b.videoId))
          .filter(Boolean) as string[],
      ),
    ];

    const entries: VideoInfo[] = [];
    for (const vid of videoIds) {
      entries.push(await this._getDiscoApiInfo(url, vid, 'eu1-prod.disco-api.com', 'dmaxde', 'DE'));
    }
    return this.playlist_result(entries, playlistId);
  }
}
