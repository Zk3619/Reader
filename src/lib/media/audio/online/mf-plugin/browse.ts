/**
 * MusicFree 发现能力桥接（歌单/榜单/推荐/评论 → Hub 可消费结构）
 */

import {
  listEnabledMfPlugins,
  listMfPlugins,
  mfGetAlbumInfo,
  mfGetArtistWorks,
  mfGetMusicComments,
  mfGetMusicSheetInfo,
  mfGetRecommendSheetTags,
  mfGetRecommendSheetsByTag,
  mfGetTopListDetail,
  mfGetTopLists,
  mfImportMusicSheet,
  pluginHasMethod,
} from '@/lib/media/audio/online/mf-plugin';
import {
  mfSourceKey,
  parseMfPluginId,
  type MfSheetItem,
} from '@/lib/media/audio/online/mf-plugin/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type {
  CommentPageResult,
  MusicComment,
} from '@/lib/media/audio/music-sdk/comment';

function formatMfCommentTime(input: string | number | null | undefined): string | undefined {
  if (input == null || input === '') return undefined;
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return String(input);
  const ms = n < 1e12 ? n * 1000 : n;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(input);
  }
}
export function listMfPluginsWithAbility(
  method:
    | 'getRecommendSheetTags'
    | 'getTopLists'
    | 'getMusicSheetInfo'
    | 'getMusicComments'
    | 'getAlbumInfo'
    | 'getArtistWorks'
    | 'importMusicSheet',
) {
  return listEnabledMfPlugins().filter((p) => p.supportedMethods.includes(method));
}

export async function browseMfRecommendTags(pluginId: string) {
  return mfGetRecommendSheetTags(pluginId);
}

export async function browseMfRecommendSheets(
  pluginId: string,
  tagId: string,
  page = 1,
) {
  return mfGetRecommendSheetsByTag(pluginId, { id: tagId }, page);
}

export async function browseMfSheetDetail(
  pluginId: string,
  sheet: MfSheetItem,
  page = 1,
) {
  return mfGetMusicSheetInfo(pluginId, sheet, page);
}

export async function browseMfTopLists(pluginId: string) {
  const groups = await mfGetTopLists(pluginId);
  return groups.flatMap((g) =>
    (g.data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.title ?? item.id),
      bangId: String(item.id),
      source: mfSourceKey(pluginId),
      mfPluginId: pluginId,
      mfSheetItem: item,
      group: g.title,
    })),
  );
}

export async function browseMfTopListDetail(
  pluginId: string,
  sheet: MfSheetItem,
  page = 1,
) {
  return mfGetTopListDetail(pluginId, sheet, page);
}

export async function browseMfAlbum(
  pluginId: string,
  album: { id: string; platform?: string; [k: string]: unknown },
  page = 1,
) {
  return mfGetAlbumInfo(pluginId, album as never, page);
}

export async function browseMfArtistWorks(
  pluginId: string,
  artist: { id: string; platform?: string; [k: string]: unknown },
  page = 1,
) {
  return mfGetArtistWorks(pluginId, artist as never, page, 'music');
}

export async function importMfSheetByUrl(pluginId: string, urlLike: string) {
  return mfImportMusicSheet(pluginId, urlLike);
}

/** 尝试用任一支持 importMusicSheet 的插件导入 */
export async function importMfSheetWithAnyPlugin(urlLike: string): Promise<AudioTrack[]> {
  for (const p of listMfPluginsWithAbility('importMusicSheet')) {
    try {
      const tracks = await mfImportMusicSheet(p.id, urlLike);
      if (tracks.length) return tracks;
    } catch {
      // try next
    }
  }
  return [];
}

export async function fetchMfComments(
  track: AudioTrack,
  page = 1,
): Promise<CommentPageResult> {
  const pluginId =
    parseMfPluginId(String(track.source)) ||
    (typeof track.meta.mfPluginId === 'string' ? track.meta.mfPluginId : null);
  if (!pluginId || !pluginHasMethod(pluginId, 'getMusicComments')) {
    return { comments: [], page, hasMore: false };
  }
  const result = await mfGetMusicComments(pluginId, track, page);
  const comments: MusicComment[] = (result.data ?? []).map((c, i) => ({
    id: String(c.id ?? `${page}-${i}`),
    user: String(c.nickName ?? '用户'),
    content: String(c.comment ?? ''),
    time: formatMfCommentTime(c.createAt),
    likedCount: c.like,
    avatar: c.avatar ?? null,
    location: c.location,
    reply: Array.isArray(c.replies)
      ? c.replies.map((r, j) => ({
          id: String(r.id ?? `${page}-${i}-${j}`),
          user: String(r.nickName ?? '用户'),
          content: String(r.comment ?? ''),
          time: formatMfCommentTime(r.createAt),
          likedCount: r.like,
          avatar: r.avatar ?? null,
        }))
      : undefined,
  }));
  return {
    comments,
    page,
    hasMore: result.isEnd === false,
  };
}

export function listMfDiscoverySources(): Array<{ id: string; name: string; sourceKey: string }> {
  return listMfPlugins()
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sourceKey: mfSourceKey(p.id),
    }));
}
