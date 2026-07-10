/**
 * 五源评论 API（只读，对齐 lx comment.js）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';

async function txSignedRequest<T>(payload: Record<string, unknown>): Promise<T | null> {
  const bodyText = JSON.stringify(payload);
  const sign = zzcSign(bodyText);
  return safeCall(() =>
    onlineFetchJson<T>(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'QQMusic 14090508(android 12)',
      },
      body: bodyText,
    }),
  );
}

export type CommentSort = 'hot' | 'latest';

export interface MusicComment {
  id: string;
  user: string;
  content: string;
  time?: string;
  likedCount?: number;
}

export interface CommentPageResult {
  comments: MusicComment[];
  page: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

async function wyComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const id = String(track.meta.songId ?? '');
  if (!id) return { comments: [], page, hasMore: false };
  if (sort === 'hot' && page === 1) {
    const body = await weapiPost<{
      hotComments?: Array<{
        commentId?: number;
        content?: string;
        likedCount?: number;
        user?: { nickname?: string };
      }>;
    }>(`v1/resource/hotcomments/R_SO_4_${id}`, {});
    const comments = (body.hotComments ?? []).map((c) => ({
      id: String(c.commentId ?? ''),
      user: c.user?.nickname ?? '匿名',
      content: c.content ?? '',
      likedCount: c.likedCount,
    }));
    return { comments, page, hasMore: false };
  }
  const body = await weapiPost<{
    comments?: Array<{
      commentId?: number;
      content?: string;
      time?: number;
      likedCount?: number;
      user?: { nickname?: string };
    }>;
    total?: number;
  }>('comment/music/get', { rid: id, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  const comments = (body.comments ?? []).map((c) => ({
    id: String(c.commentId ?? ''),
    user: c.user?.nickname ?? '匿名',
    content: c.content ?? '',
    likedCount: c.likedCount,
  }));
  const total = body.total ?? comments.length;
  return {
    comments,
    page,
    hasMore: page * PAGE_SIZE < total,
  };
}

async function kwComments(track: AudioTrack, page = 1): Promise<CommentPageResult> {
  const id = String(track.meta.songId ?? '');
  if (!id) return { comments: [], page, hasMore: false };
  const body = await safeCall(() =>
    onlineFetchJson<{
      content?: string;
      children?: Array<{ u_name?: string; msg?: string }>;
    }>(`https://www.kuwo.cn/api/www/music/musicComment?mid=${id}&page=${page}&rows=${PAGE_SIZE}`),
  );
  const list = body?.children ?? [];
  const comments = list.map((c, i) => ({
    id: String((page - 1) * PAGE_SIZE + i),
    user: c.u_name ?? '匿名',
    content: c.msg ?? '',
  }));
  return { comments, page, hasMore: list.length >= PAGE_SIZE };
}

async function kgComments(track: AudioTrack, page = 1): Promise<CommentPageResult> {
  const hash = String(track.meta.hash ?? '');
  if (!hash) return { comments: [], page, hasMore: false };
  const body = await safeCall(() =>
    onlineFetchJson<{
      list?: Array<{ content?: string; user_name?: string; addtime?: string }>;
      total?: number;
    }>(
      `https://mcomment.kugou.com/index?r=comments/getcommentwithlike&code=client_musics&hash=${hash}&page=${page}&pagesize=${PAGE_SIZE}`,
    ),
  );
  const comments = (body?.list ?? []).map((c, i) => ({
    id: String((page - 1) * PAGE_SIZE + i),
    user: c.user_name ?? '匿名',
    content: c.content ?? '',
    time: c.addtime,
  }));
  const total = body?.total ?? comments.length;
  return {
    comments,
    page,
    hasMore: page * PAGE_SIZE < total,
  };
}

async function txComments(track: AudioTrack, page = 1): Promise<CommentPageResult> {
  const songmid = String(track.meta.songmid ?? track.meta.songId ?? '');
  if (!songmid) return { comments: [], page, hasMore: false };
  const body = await txSignedRequest<{
    req?: { data?: { comment?: Array<{ rootcommentcontent?: string; nick?: string }> } };
  }>({
    comm: { ct: 11, cv: 14090508 },
    req: {
      module: 'music.globalComment.CommentRead',
      method: 'GetNewCommentList',
      param: {
        BizType: 1,
        BizId: songmid,
        LastCommentSeqNo: page > 1 ? String((page - 1) * PAGE_SIZE) : '',
        PageSize: PAGE_SIZE,
        PageNum: page,
      },
    },
  });
  const list = body?.req?.data?.comment ?? [];
  const comments = list.map((c, i) => ({
    id: String((page - 1) * PAGE_SIZE + i),
    user: c.nick ?? '匿名',
    content: c.rootcommentcontent ?? '',
  }));
  return { comments, page, hasMore: list.length >= PAGE_SIZE };
}

async function mgComments(track: AudioTrack, page = 1): Promise<CommentPageResult> {
  const copyrightId = String(track.meta.copyrightId ?? track.meta.songId ?? '');
  if (!copyrightId) return { comments: [], page, hasMore: false };
  const body = await safeCall(() =>
    onlineFetchJson<{
      commentList?: Array<{ comment?: string; userName?: string }>;
      totalCount?: number;
    }>(
      `https://app.c.nf.migu.cn/v1.0/content/queryComment.do?resourceId=${copyrightId}&resourceType=2&pageIndex=${page}&pageSize=${PAGE_SIZE}`,
    ),
  );
  const comments = (body?.commentList ?? []).map((c, i) => ({
    id: String((page - 1) * PAGE_SIZE + i),
    user: c.userName ?? '匿名',
    content: c.comment ?? '',
  }));
  const total = body?.totalCount ?? comments.length;
  return {
    comments,
    page,
    hasMore: page * PAGE_SIZE < total,
  };
}

export async function fetchTrackComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  switch (track.source as AudioTrackSource) {
    case 'wy':
      return wyComments(track, page, sort);
    case 'kw':
      return kwComments(track, page);
    case 'kg':
      return kgComments(track, page);
    case 'tx':
      return txComments(track, page);
    case 'mg':
      return mgComments(track, page);
    default:
      return { comments: [], page, hasMore: false };
  }
}
