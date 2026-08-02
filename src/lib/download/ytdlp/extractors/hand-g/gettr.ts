/**
 * GettrBaseIE / GettrIE / GettrStreamingIE — ported from yt-dlp gettr.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles, urljoin } from './_helpers';
import {
  bool_or_none,
  dict_get,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  try_get,
  url_or_none,
} from '../../utils';

export class GettrBaseIE extends InfoExtractor {
  static IE_NAME = 'gettrbase';
  static _VALID_URL: RegExp | string | false | null = false;

  static _MEDIA_BASE_URL = 'https://media.gettr.com/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('GettrBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(path: string, videoId: string, opts?: Record<string, unknown>) {
    const data = await this._download_json<{ result: Record<string, unknown> }>(
      urljoin('https://api.gettr.com/u/', path),
      videoId,
      undefined,
      opts,
    );
    return data.result;
  }
}

export class GettrIE extends GettrBaseIE {
  static IE_NAME = 'gettr';
  static _VALID_URL = /https?:\/\/(?:www\.)?gettr\.com\/post\/(?<id>[a-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const webpage = await this._download_webpage(url, postId);
    const apiData = await this._callApi(`post/${postId}?incl="poststats|userinfo"`, postId);

    const postData = (apiData.data as Record<string, unknown>) || {};
    const userData =
      (try_get(apiData, [(x) => (x.aux as Record<string, unknown>)?.uinf as Record<string, Record<string, unknown>>, (u) => u[postData.uid as string]]) as
        | Record<string, unknown>
        | undefined) || {};

    const vid = postData.vid as string | undefined;
    const ovid = postData.ovid as string | undefined;

    if (postData.p_type === 'stream') {
      return this.url_result(`https://gettr.com/streaming/${postId}`, 'GettrStreaming', postId);
    }

    if (!ovid && !vid) {
      const embedUrl = url_or_none(postData.prevsrc);
      const sharedPostId = str_or_none(
        traverse_obj(apiData, ['aux', 'shrdpst', '_id']) ||
          traverse_obj(postData, ['rpstIds', 0]),
      );
      if (embedUrl) return this.url_result(embedUrl);
      if (sharedPostId) return this.url_result(`https://gettr.com/post/${sharedPostId}`, 'Gettr', sharedPostId);
      throw new ExtractorError("There's no video in this post.", { expected: true });
    }

    let title = str_or_none(postData.txt) || this._og_search_description(webpage) || undefined;
    const description = title;
    const uploader =
      str_or_none(userData.nickname) ||
      this._search_regex(/^(.+?) on GETTR/, this._og_search_title(webpage) || '', 'uploader', null, false, 1) ||
      undefined;
    if (uploader && title) title = `${uploader} - ${title}`;

    let formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    if (vid) {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, urljoin(GettrBaseIE._MEDIA_BASE_URL, vid), postId, 'hls'));
    }
    if (ovid) {
      (formats ||= []).push({
        url: urljoin(GettrBaseIE._MEDIA_BASE_URL, ovid),
        format_id: 'ovid',
        ext: 'mp4',
        width: int_or_none(postData.vid_wid) ?? undefined,
        height: int_or_none(postData.vid_hgt) ?? undefined,
      });
    }

    return {
      id: postId,
      title,
      description,
      formats,
      subtitles,
      uploader,
      uploader_id:
        str_or_none(dict_get(userData as Record<string, unknown>, ['_id', 'username'])) ||
        str_or_none(postData.uid) ||
        undefined,
      thumbnail:
        url_or_none(urljoin(GettrBaseIE._MEDIA_BASE_URL, String(postData.main ?? ''))) ||
        this._html_search_meta(['og:image', 'image'], webpage, 'thumbnail', false) ||
        undefined,
      timestamp: float_or_none(dict_get(postData as Record<string, unknown>, ['cdate', 'udate']), 1000) ?? undefined,
      duration: float_or_none(postData.vid_dur) ?? undefined,
      tags: (postData.htgs as string[]) || undefined,
    };
  }
}

export class GettrStreamingIE extends GettrBaseIE {
  static IE_NAME = 'gettrstreaming';
  static _VALID_URL = /https?:\/\/(?:www\.)?gettr\.com\/streaming\/(?<id>[a-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._callApi(`live/join/${videoId}`, videoId, { data: '{}' });

    const liveInfo = (videoInfo.broadcast as Record<string, unknown>) || {};
    const liveUrl = url_or_none(liveInfo.url);

    let formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    if (liveUrl) {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, liveUrl, videoId, 'hls'));
    }

    const imgs = (try_get(videoInfo, [(x) => (x.postData as Record<string, unknown>)?.imgs as unknown[]]) as string[]) || [];
    return {
      id: videoId,
      title: try_get(videoInfo, [(x) => (x.postData as Record<string, unknown>)?.ttl as string]) || undefined,
      description: try_get(videoInfo, [(x) => (x.postData as Record<string, unknown>)?.dsc as string]) || undefined,
      formats,
      subtitles,
      thumbnails: imgs.map((thumbnail) => ({ url: urljoin(GettrBaseIE._MEDIA_BASE_URL, thumbnail) })),
      uploader: try_get(videoInfo, [(x) => (x.liveHostInfo as Record<string, unknown>)?.nickname as string]) || undefined,
      uploader_id: try_get(videoInfo, [(x) => (x.liveHostInfo as Record<string, unknown>)?._id as string]) || undefined,
      view_count: int_or_none(liveInfo.viewsCount) ?? undefined,
      timestamp: float_or_none(liveInfo.startAt, 1000) ?? undefined,
      duration: float_or_none(liveInfo.duration, 1000) ?? undefined,
      is_live: bool_or_none(liveInfo.isLive) ?? undefined,
    };
  }
}
