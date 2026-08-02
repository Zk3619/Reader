/**
 * DeuxMIE / DeuxMNewsIE — ported from yt-dlp deuxm.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { url_or_none } from '../../utils';

export class DeuxMIE extends InfoExtractor {
  static IE_NAME = '2m';
  static _VALID_URL = /https?:\/\/(?:www\.)?2m\.ma\/[^/]+\/replay\/single\/(?<id>([\w.]{1,24})+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<{ response: { News: Record<string, unknown> } }>(
      `https://2m.ma/api/watchDetail/${videoId}`,
      videoId,
    );
    const video = data.response.News;
    return {
      id: videoId,
      title: (video.titre as string) ?? undefined,
      url: String(video.url ?? ''),
      description: (video.description as string) ?? undefined,
      thumbnail: url_or_none(video.image) ?? undefined,
    };
  }
}

export class DeuxMNewsIE extends InfoExtractor {
  static IE_NAME = '2m:news';
  static _VALID_URL = /https?:\/\/(?:www\.)?2m\.ma\/(?<lang>\w+)\/news\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const articleName = m.groups!.id!;
    const lang = m.groups!.lang!;
    const data = await this._download_json<{ response: { article: Record<string, unknown>[] } }>(
      `https://2m.ma/api/articlesByUrl?lang=${lang}&url=/news/${articleName}`,
      articleName,
    );
    const video = data.response.article[0]!;
    const images = video.image;
    const imageUrl = Array.isArray(images) ? images[0] : images;
    return {
      id: String(video.id ?? articleName),
      title: (video.title as string) ?? undefined,
      url: String(imageUrl ?? ''),
      description: (video.content as string) ?? undefined,
      thumbnail: url_or_none(video.cover) ?? undefined,
    };
  }
}
