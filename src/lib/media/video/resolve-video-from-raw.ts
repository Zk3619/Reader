/**
 * 将章节正文解析为可播放视频地址（供播放与预加载共用）
 */

import {
  createMpdBlobPlaybackUrl,
  isMpdManifestText,
  parseParsedVideoUrls,
} from '@/lib/media/video/parsed-video-url';
import { resolveVideoPlaybackList } from '@/lib/media/video/resolve-video-playback';
import type { Book, BookChapter, BookSource } from '@/types';

export type ResolveVideoFromRawResult =
  | {
      ok: true;
      urls: string[];
      primaryUrl: string;
      revoke: () => void;
    }
  | {
      ok: false;
      empty: boolean;
      jsRule: boolean;
      message: string;
    };

export async function resolveVideoFromRawContent(
  raw: string,
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): Promise<ResolveVideoFromRawResult> {
  const trimmed = raw?.trim() ?? '';

  if (isMpdManifestText(trimmed)) {
    const { src, revoke } = createMpdBlobPlaybackUrl(trimmed);
    return { ok: true, urls: [src], primaryUrl: src, revoke };
  }

  const parsed = parseParsedVideoUrls(raw);
  if (parsed.length === 0) {
    if (!trimmed) {
      return { ok: false, empty: true, jsRule: false, message: '正文为空' };
    }
    return {
      ok: false,
      empty: false,
      jsRule: trimmed.startsWith('@js:'),
      message: trimmed.startsWith('@js:')
        ? '视频地址需由书源规则解析，当前未得到有效播放链接'
        : '未识别到可播放的视频地址',
    };
  }

  const { urls, revokeAll } = await resolveVideoPlaybackList(parsed, options);
  if (urls.length === 0) {
    return {
      ok: false,
      empty: false,
      jsRule: false,
      message: '视频已解析但无法播放（CDN 403 或网络错误），请刷新或重新登录书源',
    };
  }

  return {
    ok: true,
    urls,
    primaryUrl: urls[0] ?? '',
    revoke: revokeAll,
  };
}
