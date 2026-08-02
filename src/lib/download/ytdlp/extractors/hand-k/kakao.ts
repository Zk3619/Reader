/**
 * KakaoIE — ported from yt-dlp kakao.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { stripOrNone } from './_helpers';

export class KakaoIE extends InfoExtractor {
  static IE_NAME = 'kakao';
  static _VALID_URL =
    /https?:\/\/(?:play-)?tv\.kakao\.com\/(?:channel\/\d+|embed\/player)\/cliplink\/(?<id>\d+|[^?#&]+@my)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiBase = `http://tv.kakao.com/api/v1/ft/playmeta/cliplink/${videoId}/`;
    const cdnApiBase = `https://tv.kakao.com/katz/v1/ft/cliplink/${videoId}/readyNplay?`;

    const query: Record<string, string> = {
      player: 'monet_html5',
      referer: url,
      uuid: '',
      service: 'kakao_tv',
      section: '',
      dteType: 'PC',
      fields: [
        '-*', 'tid', 'clipLink', 'displayTitle', 'clip', 'title',
        'description', 'channelId', 'createTime', 'duration', 'playCount',
        'likeCount', 'commentCount', 'tagList', 'channel', 'name',
        'clipChapterThumbnailList', 'thumbnailUrl', 'timeInSec', 'isDefault',
        'videoOutputList', 'width', 'height', 'kbps', 'profile', 'label',
      ].join(','),
    };

    const apiJson = await this._download_json<Record<string, unknown>>(apiBase, videoId, 'Downloading video info');
    const clipLink = apiJson.clipLink as Record<string, unknown>;
    const clip = clipLink.clip as Record<string, unknown>;

    const title = (clip.title as string | undefined) || (clipLink.displayTitle as string | undefined);

    const formats: Format[] = [];
    for (const fmt of (clip.videoOutputList as Array<Record<string, unknown>>) || []) {
      const profileName = fmt.profile as string | undefined;
      if (!profileName || profileName === 'AUDIO') continue;

      query.profile = profileName;
      query.fields = '-*,code,message,url';

      let fmtUrlJson: Record<string, unknown>;
      try {
        fmtUrlJson = await this._download_json<Record<string, unknown>>(
          cdnApiBase,
          videoId,
          `Downloading video URL for profile ${profileName}`,
          { query },
        );
      } catch (e) {
        const msg = (e as Error).message || '';
        if (/403/.test(msg) && /GeoBlocked/i.test(msg)) {
          this.raise_geo_restricted();
        }
        throw e;
      }

      const fmtUrl = url_or_none(traverse_obj(fmtUrlJson, ['videoLocation', 'url']));
      if (!fmtUrl) continue;

      formats.push({
        url: fmtUrl,
        format_id: profileName,
        width: int_or_none(fmt.width) ?? undefined,
        height: int_or_none(fmt.height) ?? undefined,
        format_note: str_or_none(fmt.label) ?? undefined,
        filesize: int_or_none(fmt.filesize) ?? undefined,
        tbr: int_or_none(fmt.kbps) ?? undefined,
      });
    }

    const thumbs: Thumbnail[] = [];
    for (const thumb of (clip.clipChapterThumbnailList as Array<Record<string, unknown>>) || []) {
      const thumbUrl = url_or_none(thumb.thumbnailUrl);
      if (!thumbUrl) continue;
      thumbs.push({
        url: thumbUrl,
        id: str_or_none(thumb.timeInSec) ?? undefined,
        preference: thumb.isDefault ? -1 : 0,
      });
    }
    const topThumbnail = url_or_none(clip.thumbnailUrl);
    if (topThumbnail) thumbs.push({ url: topThumbnail, preference: 10 });

    return {
      id: videoId,
      title: title ?? undefined,
      description: stripOrNone(clip.description) ?? undefined,
      uploader: str_or_none(traverse_obj(clipLink, ['channel', 'name'])) ?? undefined,
      uploader_id: str_or_none(clipLink.channelId) ?? undefined,
      thumbnails: thumbs,
      timestamp: unified_timestamp(clipLink.createTime) ?? undefined,
      duration: int_or_none(clip.duration) ?? undefined,
      view_count: int_or_none(clip.playCount) ?? undefined,
      like_count: int_or_none(clip.likeCount) ?? undefined,
      comment_count: int_or_none(clip.commentCount) ?? undefined,
      formats,
      tags: (clip.tagList as string[] | undefined) || undefined,
    };
  }
}
