/** SaucePlus family â€?ported from yt-dlp sauceplus.py (Floatplane main path) */

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

export class SaucePlusBaseIE extends InfoExtractor {
  static IE_NAME = 'sauceplus:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _BASE_URL = 'https://www.sauceplus.com';
  static _HEADERS = {
    Origin: 'https://www.sauceplus.com',
    Referer: 'https://www.sauceplus.com/',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const postData = await this._download_json<Record<string, unknown>>(
      `${SaucePlusBaseIE._BASE_URL}/api/v3/content/post`,
      postId,
      'Downloading post data',
      { query: { id: postId }, headers: SaucePlusBaseIE._HEADERS },
    );

    const hasVideo = traverse_obj(postData, ['metadata', 'hasVideo']);
    const hasAudio = traverse_obj(postData, ['metadata', 'hasAudio']);
    if (!hasVideo && !hasAudio) {
      throw new ExtractorError('Post does not contain a video or audio track', { expected: true });
    }

    const creator = (postData.creator as Record<string, unknown>) || {};
    const channel = (postData.channel as Record<string, unknown>) || {};
    const uploaderUrl = creator.urlname
      ? `${SaucePlusBaseIE._BASE_URL}/channel/${creator.urlname}/home`
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
      for (const media of (postData[key] as Array<Record<string, unknown>>) || []) {
        const mediaId = String(media.id ?? '');
        const mediaTyp = (media.type as string | undefined) || 'video';
        const stream = await this._download_json<Record<string, unknown>>(
          `${SaucePlusBaseIE._BASE_URL}/api/v3/delivery/info`,
          mediaId,
          `Downloading ${mediaTyp} stream data`,
          { query: { scenario: 'onDemand', entityId: mediaId }, headers: SaucePlusBaseIE._HEADERS },
        );
        const origins = ((stream.groups as Array<Record<string, unknown>> | undefined)?.[0]?.origins ||
          []) as Array<Record<string, unknown>>;
        const cdnBaseUrl = origins.map((o) => url_or_none(o.url)).find(Boolean);
        if (!cdnBaseUrl) continue;

        const metadata = await this._download_json<Record<string, unknown>>(
          `${SaucePlusBaseIE._BASE_URL}/api/v3/content/${mediaTyp}`,
          mediaId,
          `Downloading ${mediaTyp} metadata`,
          { query: { id: mediaId }, headers: SaucePlusBaseIE._HEADERS, fatal: false },
        );

        const formats: Format[] = [];
        for (const variant of (traverse_obj(stream, ['groups', 0, 'variants']) as Array<Record<string, unknown>>) || []) {
          if (!variant.url) continue;
          const formatUrl = urljoin(cdnBaseUrl, String(variant.url));
          formats.push({
            url: formatUrl,
            ext: determine_ext(formatUrl.split('/chunk.m3u8')[0]!, 'mp4'),
            format_id: String(variant.name || `fmt-${formats.length}`),
            format_note: variant.label as string | undefined,
            width: int_or_none(traverse_obj(variant, ['meta', 'video', 'width'])) ?? undefined,
            height: int_or_none(traverse_obj(variant, ['meta', 'video', 'height'])) ?? undefined,
            vcodec: traverse_obj(variant, ['meta', 'video', 'codec']) as string | undefined,
            acodec: traverse_obj(variant, ['meta', 'audio', 'codec']) as string | undefined,
            fps: float_or_none(traverse_obj(variant, ['meta', 'video', 'fps'])) ?? undefined,
          });
        }

        const subtitles: Record<string, Subtitle[]> = {};
        for (const subData of (metadata.textTracks as Array<Record<string, unknown>>) || []) {
          const src = url_or_none(subData.src);
          if (!src) continue;
          const lang = (subData.language as string | undefined) || 'en';
          const entry = { url: src, ext: 'vtt' as const };
          if (subData.generated) (subtitles[lang] ||= []).push(entry);
          else (subtitles[lang] ||= []).push(entry);
        }

        items.push({
          ...commonInfo,
          id: mediaId,
          title: metadata.title as string | undefined,
          duration: int_or_none(metadata.duration) ?? undefined,
          thumbnail: url_or_none((metadata.thumbnail as Record<string, unknown> | undefined)?.path) ?? undefined,
          formats,
          subtitles,
        });
      }
    }

    const postInfo: VideoInfo = {
      ...commonInfo,
      id: postId,
      display_id: postId,
      title: postData.title as string | undefined,
      description: clean_html(String(postData.text ?? '')) || undefined,
      like_count: int_or_none(postData.likes) ?? undefined,
      dislike_count: int_or_none(postData.dislikes) ?? undefined,
      comment_count: int_or_none(postData.comments) ?? undefined,
      thumbnail: url_or_none((postData.thumbnail as Record<string, unknown> | undefined)?.path) ?? undefined,
      http_headers: SaucePlusBaseIE._HEADERS,
    };

    if (items.length > 1) return this.playlist_result(items, postId, postInfo.title, postInfo.description);
    return { ...postInfo, ...items[0]! };
  }
}

export class SaucePlusIE extends SaucePlusBaseIE {
  static IE_NAME = 'sauceplus';
  static IE_DESC = 'Sauce+';
  static _VALID_URL = /https?:\/\/(?:(?:www|beta)\.)?sauceplus\.com\/post\/(?<id>\w+)/;

  async _real_initialize(): Promise<void> {
    const cookies = this._get_cookies(SaucePlusBaseIE._BASE_URL);
    if (!cookies['__Host-sp-sess']) this.raise_login_required();
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    return super._real_extract(url);
  }
}

export class SaucePlusChannelIE extends InfoExtractor {
  static IE_NAME = 'sauceplus:channel';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|beta)\.)?sauceplus\.com\/channel\/(?<id>[\w-]+)\/home(?:\/(?<channel>[\w-]+))?/;
  static _BASE_URL = 'https://www.sauceplus.com';
  static _PAGE_SIZE = 20;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const creator = m.groups!.id!;
    const channel = m.groups!.channel;
    const displayId = join_nonempty(creator, channel) || creator;

    const creatorData = (
      await this._download_json<Array<Record<string, unknown>>>(
        `${SaucePlusChannelIE._BASE_URL}/api/v3/creator/named`,
        displayId,
        undefined,
        { query: { 'creatorURL[0]': creator } },
      )
    )[0]!;

    const channelData =
      ((creatorData.channels as Array<Record<string, unknown>>) || []).find((c) => c.urlname === channel) || {};

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 50; page++) {
      const query: Record<string, string> = {
        id: String(creatorData.id ?? ''),
        limit: String(SaucePlusChannelIE._PAGE_SIZE),
        fetchAfter: String(page * SaucePlusChannelIE._PAGE_SIZE),
      };
      if (channelData.id != null) query.channel = String(channelData.id);
      const pageData = await this._download_json<Array<Record<string, unknown>>>(
        `${SaucePlusChannelIE._BASE_URL}/api/v3/content/creator`,
        displayId,
        `Downloading page ${page + 1}`,
        { query },
      );
      if (!pageData?.length) break;
      entries.push(
        ...pageData.map((post) =>
          this.url_result(
            `${SaucePlusChannelIE._BASE_URL}/post/${post.id}`,
            'sauceplus',
            String(post.id ?? ''),
            post.title as string | undefined,
          ),
        ),
      );
      if (pageData.length < SaucePlusChannelIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      displayId,
      (channelData.title as string | undefined) || (creatorData.title as string | undefined),
      (channelData.about as string | undefined) || (creatorData.about as string | undefined),
    );
  }
}
