/**
 * CraftsyIE — ported from yt-dlp craftsy.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`, 'i');
  const m = html.match(re);
  return m ? m[0] : null;
}

function getFirstTagAttrs(tag: string, html: string): Record<string, string> {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'i');
  const m = html.match(re);
  return m ? extract_attributes(m[1] || '') : {};
}

export class CraftsyIE extends InfoExtractor {
  static IE_NAME = 'craftsy';
  static _VALID_URL = /https?:\/\/www\.craftsy\.com\/class\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const videoPlayerTag = getElementHtmlByClass('class-video-player', webpage);
    let videoData: Record<string, unknown> = {};
    if (videoPlayerTag) {
      const attrs = extract_attributes(videoPlayerTag);
      const snapshot = attrs['wire:snapshot'];
      if (snapshot) {
        try {
          const parsed = JSON.parse(snapshot) as { data?: Record<string, unknown> };
          videoData = parsed.data || {};
        } catch {
          /* ignore */
        }
      }
    }
    const videoJs = getFirstTagAttrs('video-js', webpage);

    const hasAccess = videoData.userHasAccess;
    const rawLessons = Array.isArray(videoData.lessons) ? (videoData.lessons as unknown[]) : [];
    const lessons: Array<{ video_id: string; title?: string }> = [];
    for (const group of rawLessons) {
      if (!Array.isArray(group)) continue;
      for (const lesson of group as Array<Record<string, unknown>>) {
        if (lesson && lesson.video_id) lessons.push({ video_id: String(lesson.video_id), title: lesson.title as string });
      }
    }

    const previewId = videoJs['data-video-id'];
    if (previewId && !lessons.some((l) => l.video_id === previewId)) {
      if (!lessons.length && !hasAccess) {
        this.report_warning(
          'Only extracting preview. For the full class, pass cookies from an account that has access.',
        );
      }
      lessons.push({ video_id: previewId });
    }

    if (!lessons.length && !hasAccess) {
      this.raise_login_required('You do not have access to this class');
    }

    const accountId = (videoData.accountId as string) || videoJs['data-account'];

    const entries = lessons.map((lesson) =>
      this.url_result(
        `http://players.brightcove.net/${accountId}/default_default/index.html?videoId=${lesson.video_id}`,
        'BrightcoveNew',
        lesson.video_id,
        lesson.title,
      ),
    );

    return this.playlist_result(
      entries,
      videoId,
      this._html_search_meta(['og:title', 'twitter:title'], webpage) || undefined,
      this._html_search_meta(['og:description', 'description'], webpage) || undefined,
    );
  }
}
