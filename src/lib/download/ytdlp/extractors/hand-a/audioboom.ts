/**
 * AudioBoomIE — aligned with yt-dlp audioboom.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, float_or_none, unescapeHTML } from '../../utils';
import { videoInfoFromDirectUrl } from './helpers';

export class AudioBoomIE extends InfoExtractor {
  static IE_NAME = 'audioboom';
  static _VALID_URL = /https?:\/\/(?:www\.)?audioboom\.com\/(?:boos|posts)\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://audioboom.com/posts/${videoId}`, videoId);

    const clipStore = this._search_json<Record<string, unknown>>(
      /data-react-class="V5DetailPagePlayer"\s*data-react-props=["']/,
      webpage,
      'clip store',
      videoId,
      { fatal: false, transform_source: unescapeHTML },
    );
    const clip = ((clipStore?.clips as Record<string, unknown>[]) || [])[0] || {};

    const audioUrl =
      (clip.clipURLPriorToLoading != null ? String(clip.clipURLPriorToLoading) : '') ||
      this._og_search_property('audio', webpage, 'audio url') ||
      '';

    return videoInfoFromDirectUrl(videoId, audioUrl, {
      title:
        (clip.title != null ? String(clip.title) : '') ||
        this._html_search_meta(['og:title', 'og:audio:title', 'audio_title'], webpage) ||
        videoId,
      description:
        clean_html(clip.description != null ? String(clip.description) : null) ||
        clean_html(clip.formattedDescription != null ? String(clip.formattedDescription) : null) ||
        this._og_search_description(webpage),
      duration:
        float_or_none(clip.duration) ??
        float_or_none(this._html_search_meta('weibo:audio:duration', webpage)) ??
        undefined,
      uploader:
        (clip.author != null ? String(clip.author) : '') ||
        this._html_search_meta(['og:audio:artist', 'twitter:audio:artist_name', 'audio_artist'], webpage, 'uploader') ||
        undefined,
      uploader_url:
        (clip.author_url != null ? String(clip.author_url) : '') ||
        this._search_regex(
          /<div class="avatar shrink-0">\s*<a href="(http[^"]+)"/,
          webpage,
          'uploader url',
          null,
          false,
          1,
        ) ||
        undefined,
      vcodec: 'none',
      ext: 'mp3',
      webpage_url: url,
      original_url: url,
      extractor: 'audioboom',
      extractor_key: 'AudioBoom',
    });
  }
}
