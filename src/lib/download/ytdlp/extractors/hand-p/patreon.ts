/** PatreonBaseIE / PatreonIE / PatreonCampaignIE — ported from yt-dlp patreon.py (comments/login simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

const KNOWN_EXTENSIONS = new Set(['mp4', 'mp3', 'm4a', 'webm', 'mkv', 'flv', 'mov', 'wav', 'aac', 'vtt']);

export class PatreonBaseIE extends InfoExtractor {
  static IE_NAME = 'patreonbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PatreonBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    ep: string,
    itemId: string,
    query: Record<string, unknown> = {},
    note?: string,
  ): Promise<Record<string, unknown>> {
    return this._download_json(`https://www.patreon.com/api/${ep}`, itemId, note || 'Downloading API JSON', {
      query: { ...query, 'json-api-version': '1.0' },
      headers: { referer: 'https://www.patreon.com/' },
    });
  }
}

export class PatreonIE extends PatreonBaseIE {
  static IE_NAME = 'patreon';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?patreon\.com\/(?:creation\?hid=|(?:[^/?#]+\/)?posts\/(?:[\w-]+-)?)(?<id>\d+)/;

  protected async _extractFromMediaApi(mediaId: string): Promise<VideoInfo | null> {
    const resp = await this._callApi(`media/${mediaId}`, mediaId, {}, undefined);
    const attributes = traverse_obj(resp, ['data', 'attributes']) as Record<string, unknown> | undefined;
    if (!attributes) return null;

    const info: VideoInfo = {
      id: mediaId,
      title: str_or_none(attributes.file_name)?.replace(/\.[^.]+$/, '') ?? undefined,
      timestamp: parseIso8601(attributes.created_at) ?? undefined,
      duration: float_or_none(traverse_obj(attributes, ['display', 'duration'])) ?? undefined,
    };

    const playbackUrl = url_or_none(
      traverse_obj(attributes, ['display', 'url']) || traverse_obj(attributes, ['display', 'viewer_playback_data', 'url']),
    );
    const downloadUrl = url_or_none(attributes.download_url);
    const headers = { referer: 'https://www.patreon.com/' };

    if (playbackUrl && mimetype2ext(str_or_none(attributes.mimetype)) === 'm3u8') {
      const res = await extractM3u8FormatsAndSubtitles(this, playbackUrl, mediaId, 'hls');
      info.formats = res.formats.map((f) => ({ ...f, http_headers: headers }));
      info.subtitles = res.subtitles;
      const transcriptUrl = url_or_none(traverse_obj(attributes, ['display', 'transcript_url']));
      if (transcriptUrl) {
        info.subtitles = info.subtitles || {};
        info.subtitles.en = [{ url: transcriptUrl, ext: 'vtt' }];
      }
    } else if (playbackUrl || downloadUrl) {
      info.formats = [{ url: playbackUrl || downloadUrl!, format_id: 'direct', vcodec: attributes.media_type !== 'video' ? 'none' : undefined }];
    }

    return info.formats?.length ? info : null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const post = await this._callApi(`posts/${videoId}`, videoId, {
      'fields[media]': 'download_url,mimetype,size_bytes,file_name',
      'fields[post]': 'comment_count,content,content_teaser_text,cleaned_teaser_text,embed,image,like_count,post_file,published_at,title,current_user_can_view',
      'fields[user]': 'full_name,url',
      'fields[post_tag]': 'value',
      'fields[campaign]': 'url,name,patron_count',
      'json-api-use-default-includes': 'false',
      include: 'audio,user,user_defined_tags,campaign,attachments_media',
    });

    const attributes = (post.data as Record<string, unknown>)?.attributes as Record<string, unknown>;
    const info: VideoInfo = {
      id: videoId,
      title: str_or_none(attributes?.title)?.trim() ?? undefined,
      description:
        clean_html(
          str_or_none(attributes?.content) ||
            str_or_none(attributes?.content_teaser_text) ||
            str_or_none(attributes?.cleaned_teaser_text),
        ) ?? undefined,
      thumbnail:
        (url_or_none(traverse_obj(attributes, ['image', 'large_url'])) ||
          url_or_none(traverse_obj(attributes, ['image', 'url']))) ??
        undefined,
      timestamp: parseIso8601(attributes?.published_at) ?? undefined,
      like_count: int_or_none(attributes?.like_count) ?? undefined,
      comment_count: int_or_none(attributes?.comment_count) ?? undefined,
    };

    const entries: VideoInfo[] = [];
    const seenMedia = new Set<string>();
    let idx = 0;

    for (const include of (post.included as Array<Record<string, unknown>>) || []) {
      if (include.type === 'media') {
        const mediaAttrs = (include.attributes as Record<string, unknown>) || {};
        const downloadUrl = url_or_none(mediaAttrs.download_url);
        const ext = determine_ext(downloadUrl || '');
        const sizeBytes = int_or_none(mediaAttrs.size_bytes);
        if (downloadUrl && KNOWN_EXTENSIONS.has(ext) && sizeBytes != null) {
          idx += 1;
          entries.push({
            id: `${videoId}-${idx}`,
            ext,
            filesize: sizeBytes,
            url: downloadUrl,
            format_id: ext,
            alt_title: str_or_none(mediaAttrs.file_name) ?? undefined,
          });
        }
        const mediaId = str_or_none(include.id);
        if (mediaId) seenMedia.add(mediaId);
      } else if (include.type === 'user') {
        const userAttrs = (include.attributes as Record<string, unknown>) || {};
        info.uploader = str_or_none(userAttrs.full_name) ?? undefined;
        info.uploader_id = str_or_none(include.id) ?? undefined;
        info.uploader_url = url_or_none(userAttrs.url) ?? undefined;
      } else if (include.type === 'post_tag') {
        const tag = str_or_none((include.attributes as Record<string, unknown>)?.value);
        if (tag) info.tags = [...(info.tags || []), tag];
      } else if (include.type === 'campaign') {
        const campAttrs = (include.attributes as Record<string, unknown>) || {};
        info.channel = str_or_none(campAttrs.title) ?? undefined;
        info.channel_id = str_or_none(include.id) ?? undefined;
        info.channel_url = url_or_none(campAttrs.url) ?? undefined;
        info.channel_follower_count = int_or_none(campAttrs.patron_count) ?? undefined;
      }
    }

    const embed = (attributes?.embed as Record<string, unknown>) || {};
    const embedUrl = url_or_none(embed.url);
    if (embedUrl) {
      let target = embedUrl;
      const vimeoMatch = /\/\/vimeo\.com\/(\d+)(?:\/([\da-f]+))?/.exec(embedUrl);
      if (vimeoMatch) {
        target = `https://player.vimeo.com/video/${vimeoMatch[1]}${vimeoMatch[2] ? `?h=${vimeoMatch[2]}` : ''}`;
      }
      entries.push({ id: videoId, _type: 'url_transparent', url: target, ie_key: vimeoMatch ? 'Vimeo' : undefined });
    }

    const postFile = (attributes?.post_file as Record<string, unknown>) || {};
    if (postFile.url) {
      const name = str_or_none(postFile.name);
      const ext = determine_ext(name || String(postFile.url));
      if (KNOWN_EXTENSIONS.has(ext)) {
        entries.push({ id: videoId, ext, url: String(postFile.url), format_id: ext });
      } else if (name === 'video' || determine_ext(String(postFile.url)) === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, String(postFile.url), videoId, 'hls');
        entries.push({ id: videoId, formats: res.formats, subtitles: res.subtitles });
      }
      const mediaId = str_or_none(postFile.media_id);
      if (mediaId) seenMedia.add(mediaId);
    }

    const canView = attributes?.current_user_can_view;
    if (!entries.length && canView === false) {
      this.raise_no_formats('You do not have access to this post', true);
    }
    if (!entries.length) {
      this.raise_no_formats('No supported media found in this post', true);
    }

    if (entries.length === 1) {
      return { ...info, ...entries[0], id: videoId };
    }
    for (const entry of entries) Object.assign(entry, info);
    return this.playlist_result(entries, videoId, info.title ?? undefined);
  }
}

export class PatreonCampaignIE extends PatreonBaseIE {
  static IE_NAME = 'patreon:campaign';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?patreon\.com\/(?:m|api\/campaigns)\/(?<campaign_id>\d+)|(?:cw?\/)?(?<vanity>(?!creation[?/]|posts\/|rss[?/])[\w-]+)(?:\/posts)?\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const campaignId = m.groups?.campaign_id;
    const vanity = m.groups?.vanity;
    const query = campaignId
      ? { 'fields[campaign]': 'creation_name,url,patron_count,summary', include: 'creator' }
      : { 'filter[campaign]': vanity, 'fields[campaign]': 'creation_name,url,patron_count,summary', include: 'creator' };
    const ep = campaignId ? `campaigns/${campaignId}` : 'campaigns';
    const resp = await this._callApi(ep, campaignId || vanity || url, query);
    const data = (resp.data as Record<string, unknown>) || {};
    const attrs = (data.attributes as Record<string, unknown>) || {};
    const id = str_or_none(data.id) || campaignId || vanity || '';

    const postsResp = await this._callApi(`campaigns/${id}/posts`, id, {
      'fields[post]': 'title,url,published_at',
      'page[count]': 100,
    });
    const entries = ((postsResp.data as Array<Record<string, unknown>>) || []).map((post) => {
      const postAttrs = (post.attributes as Record<string, unknown>) || {};
      const postId = str_or_none(post.id);
      return this.url_result(
        str_or_none(postAttrs.url) || `https://www.patreon.com/posts/${postId}`,
        'patreon',
        postId ?? undefined,
        str_or_none(postAttrs.title) ?? undefined,
      );
    });

    return this.playlist_result(entries, id, str_or_none(attrs.creation_name) ?? undefined, clean_html(str_or_none(attrs.summary)) ?? undefined);
  }
}
