/**
 * CanalplusIE — ported from yt-dlp canalplus.py (mycanal.fr and piwiplus.fr)
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, unified_strdate } from '../../utils';
import { qualityRank } from './_helpers';

const SITE_ID_MAP: Record<string, string> = {
  mycanal: 'cplus',
  piwiplus: 'teletoon',
};

export class CanalplusIE extends InfoExtractor {
  static IE_NAME = 'canalplus';
  static IE_DESC = 'mycanal.fr and piwiplus.fr';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<site>mycanal|piwiplus)\.fr\/(?:[^/]+\/)*(?<display_id>[^?/]+)(?:\.html\?.*\bvid=|\/p\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const displayId = m.groups!.display_id!;
    const videoId = m.groups!.id!;

    const siteId = SITE_ID_MAP[site]!;
    const infoUrl = `http://service.canal-plus.com/video/rest/getVideosLiees/${siteId}/${videoId}?format=json`;
    let videoData = await this._download_json<Record<string, unknown> | Record<string, unknown>[]>(
      infoUrl,
      videoId,
      'Downloading video JSON',
    );

    if (Array.isArray(videoData)) {
      videoData = videoData.find((v) => v.ID === videoId) as Record<string, unknown>;
    }
    const media = videoData.MEDIA as Record<string, unknown>;
    const infos = videoData.INFOS as Record<string, unknown>;

    const preference = qualityRank(['MOBILE', 'BAS_DEBIT', 'HAUT_DEBIT', 'HD']);

    const formats: Format[] = [];
    for (const [formatId, formatUrl] of Object.entries((media.VIDEOS as Record<string, string>) || {})) {
      if (!formatUrl) continue;
      if (formatId === 'HLS') {
        formats.push(
          ...(await this._extract_m3u8_formats(formatUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, formatId, undefined, false)),
        );
      } else if (formatId === 'HDS') {
        // f4m (HDS) not supported by this runtime; skip.
        continue;
      } else {
        formats.push({
          url: `${formatUrl}?secret=pqzerjlsmdkjfoiuerhsdlfknaes`,
          format_id: formatId,
          quality: preference(formatId),
        });
      }
    }

    const thumbnails: Thumbnail[] = Object.entries((media.images as Record<string, string>) || {}).map(
      ([imageId, imageUrl]) => ({ id: imageId, url: imageUrl }),
    );

    const titrage = infos.TITRAGE as Record<string, string>;

    return {
      id: videoId,
      display_id: displayId,
      title: `${titrage.TITRE} - ${titrage.SOUS_TITRE}`,
      upload_date: unified_strdate((infos.PUBLICATION as Record<string, unknown> | undefined)?.DATE) || undefined,
      thumbnails,
      description: (infos.DESCRIPTION as string) || undefined,
      duration: int_or_none(infos.DURATION) ?? undefined,
      view_count: int_or_none(infos.NB_VUES) ?? undefined,
      like_count: int_or_none(infos.NB_LIKES) ?? undefined,
      comment_count: int_or_none(infos.NB_COMMENTS) ?? undefined,
      formats,
    };
  }
}
