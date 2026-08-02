/**
 * FloatplaneBase / Floatplane / FloatplaneChannelBase / FloatplaneChannel ??yt-dlp floatplane.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  float_or_none,
  int_or_none,
  join_nonempty,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

export class FloatplaneBaseIE extends InfoExtractor {
  static IE_NAME = 'floatplanebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _BASE_URL = 'https://www.floatplane.com';
  static _HEADERS = {
    Origin: 'https://www.floatplane.com',
    Referer: 'https://www.floatplane.com/',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const Ctor = this.constructor as typeof FloatplaneBaseIE;
    const postData = await this._download_json<Record<string, unknown>>(
      `${Ctor._BASE_URL}/api/v3/content/post`,
      postId,
      'Downloading post data',
      { query: { id: postId }, headers: Ctor._HEADERS },
    );

    const hasVideo = traverse_obj(postData, ['metadata', 'hasVideo']);
    const hasAudio = traverse_obj(postData, ['metadata', 'hasAudio']);
    if (!hasVideo && !hasAudio) {
      throw new ExtractorError('Post does not contain a video or audio track', { expected: true });
    }

    const creator = (postData.creator as Record<string, unknown>) || {};
    const channel = (postData.channel as Record<string, unknown>) || {};
    const uploaderUrl = creator.urlname
      ? `${Ctor._BASE_URL}/channel/${creator.urlname}/home`
      : undefined;

    const commonInfo: Partial<VideoInfo> = {
      uploader_url: uploaderUrl,
      channel_url: uploaderUrl ? urljoin(`${uploaderUrl}/`, String(channel.urlname ?? '')) : undefined,
      availability: 'subscriber_only',
      uploader: creator.title as string | undefined,
      uploader_id: creator.id != null ? String(creator.id) : undefined,
      channel: channel.title as string | undefined,
      channel_id: channel.id != null ? String(channel.id) : undefined,
      release_timestamp: parseIso8601(postData.releaseDate) ?? undefined,
    };

    const items: VideoInfo[] = [];
    for (const key of ['videoAttachments', 'audioAttachments'] as const) {
      const attachments = (postData[key] as Array<Record<string, unknown>>) || [];
      for (const media of attachments) {
        const mediaId = String(media.id ?? '');
        const mediaTyp = (media.type as string | undefined) || 'video';
        const stream = await this._download_json<Record<string, unknown>>(
          `${Ctor._BASE_URL}/api/v3/delivery/info`,
          mediaId,
          `Downloading ${mediaTyp} stream data`,
          { query: { scenario: 'onDemand', entityId: mediaId }, headers: Ctor._HEADERS },
        );
        const origins = ((stream.groups as Array<Record<string, unknown>> | undefined)?.[0]?.origins ||
          []) as Array<Record<string, unknown>>;
        let cdnBaseUrl: string | undefined;
        for (const origin of origins) {
          const u = url_or_none(origin.url);
          if (u) {
            cdnBaseUrl = u;
            break;
          }
        }
        if (!cdnBaseUrl) continue;

        const metadata = await this._download_json<Record<string, unknown>>(
          `${Ctor._BASE_URL}/api/v3/content/${mediaTyp}`,
          mediaId,
          `Downloading ${mediaTyp} metadata`,
          { query: { id: mediaId }, headers: Ctor._HEADERS, fatal: false },
        );

        const formats: Format[] = [];
        const variants = (traverse_obj(stream, ['groups', 0, 'variants']) as Array<Record<string, unknown>>) || [];
        for (const variant of variants) {
          if (!variant.url) continue;
          const formatUrl = urljoin(cdnBaseUrl, String(variant.url));
          formats.push({
            url: formatUrl,
            ext: determine_ext(formatUrl.split('/chunk.m3u8')[0]!, 'mp4'),
            format_id: (traverse_obj(variant, ['name', String]) as string | undefined) || `fmt-${formats.length}`,
            format_note: traverse_obj(variant, ['label', String]) as string | undefined,
            width: int_or_none(traverse_obj(variant, ['meta', 'video', 'width'])) ?? undefined,
            height: int_or_none(traverse_obj(variant, ['meta', 'video', 'height'])) ?? undefined,
            vcodec: traverse_obj(variant, ['meta', 'video', 'codec', String]) as string | undefined,
            acodec: traverse_obj(variant, ['meta', 'audio', 'codec', String]) as string | undefined,
            fps: float_or_none(traverse_obj(variant, ['meta', 'video', 'fps'])) ?? undefined,
          });
        }

        const subtitles: Record<string, Subtitle[]> = {};
        const automaticCaptions: Record<string, Subtitle[]> = {};
        for (const subData of (metadata.textTracks as Array<Record<string, unknown>>) || []) {
          const src = url_or_none(subData.src);
          if (!src) continue;
          const lang = (subData.language as string | undefined) || 'en';
          const entry = { url: src, ext: 'vtt' };
          if (subData.generated) (automaticCaptions[lang] ||= []).push(entry);
          else (subtitles[lang] ||= []).push(entry);
        }

        const thumb = (metadata.thumbnail as Record<string, unknown> | undefined)?.path;
        items.push({
          ...commonInfo,
          id: mediaId,
          title: metadata.title as string | undefined,
          duration: int_or_none(metadata.duration) ?? undefined,
          thumbnail: url_or_none(thumb) ?? undefined,
          formats,
          subtitles,
          automatic_captions: automaticCaptions,
        });
      }
    }

    const postInfo: VideoInfo = {
      ...commonInfo,
      id: postId,
      display_id: postId,
      title: postData.title as string | undefined,
      description: clean_html(String(postData.text ?? '')) ?? undefined,
      like_count: int_or_none(postData.likes) ?? undefined,
      dislike_count: int_or_none(postData.dislikes) ?? undefined,
      comment_count: int_or_none(postData.comments) ?? undefined,
      thumbnail: url_or_none((postData.thumbnail as Record<string, unknown> | undefined)?.path) ?? undefined,
      http_headers: Ctor._HEADERS,
    };

    if (items.length > 1) return this.playlist_result(items, postId, postInfo.title, postInfo.description);
    return { ...postInfo, ...items[0]! };
  }
}


export class FloatplaneIE extends FloatplaneBaseIE {
  static IE_NAME = 'floatplane';
  static _VALID_URL = /https?:\/\/(?:(?:www|beta)\.)?floatplane\.com\/post\/(?<id>\w+)/;

  async _real_initialize(): Promise<void> {
    const cookies = await this._get_cookies(FloatplaneBaseIE._BASE_URL);
    if (!cookies['sails.sid']) this.raise_login_required();
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    return super._real_extract(url);
  }
}

export class FloatplaneChannelBaseIE extends InfoExtractor {
  static IE_NAME = 'floatplanechannelbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _BASE_URL = 'https://www.floatplane.com';
  static _PAGE_SIZE = 20;
  static _RESULT_IE = 'Floatplane';

  protected async _fetchPage(
    displayId: string,
    creatorId: string,
    channelId: string | undefined,
    page: number,
  ): Promise<VideoInfo[]> {
    const query: Record<string, string> = {
      id: creatorId,
      limit: String((this.constructor as typeof FloatplaneChannelBaseIE)._PAGE_SIZE),
      fetchAfter: String(page * (this.constructor as typeof FloatplaneChannelBaseIE)._PAGE_SIZE),
    };
    if (channelId) query.channel = channelId;
    const Ctor = this.constructor as typeof FloatplaneChannelBaseIE;
    const pageData = await this._download_json<Array<Record<string, unknown>>>(
      `${Ctor._BASE_URL}/api/v3/content/creator`,
      displayId,
      `Downloading page ${page + 1}`,
      { query },
    );
    return (pageData || []).map((post) =>
      this.url_result(
        `${Ctor._BASE_URL}/post/${post.id}`,
        Ctor._RESULT_IE,
        String(post.id ?? ''),
        post.title as string | undefined,
      ),
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const creator = m.groups!.id!;
    const channel = m.groups!.channel;
    const displayId = join_nonempty(creator, channel);
    const Ctor = this.constructor as typeof FloatplaneChannelBaseIE;

    const creatorData = (
      await this._download_json<Array<Record<string, unknown>>>(
        `${Ctor._BASE_URL}/api/v3/creator/named`,
        displayId,
        undefined,
        { query: { 'creatorURL[0]': creator } },
      )
    )[0]!;

    const channelData =
      ((creatorData.channels as Array<Record<string, unknown>>) || []).find(
        (c) => c.urlname === channel,
      ) || {};

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 50; page++) {
      const batch = await this._fetchPage(
        displayId,
        String(creatorData.id ?? ''),
        channelData.id != null ? String(channelData.id) : undefined,
        page,
      );
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < Ctor._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      displayId,
      (channelData.title as string | undefined) || (creatorData.title as string | undefined),
      (channelData.about as string | undefined) || (creatorData.about as string | undefined),
    );
  }
}

export class FloatplaneChannelIE extends FloatplaneChannelBaseIE {
  static IE_NAME = 'floatplanechannel';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|beta)\.)?floatplane\.com\/channel\/(?<id>[\w-]+)\/home(?:\/(?<channel>[\w-]+))?/;
}
