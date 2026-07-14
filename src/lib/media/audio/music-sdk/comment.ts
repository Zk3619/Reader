/**
 * 五源评论 API（只读，对齐 lx comment.js；hot 走独立热评接口）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';
import { safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { md5Hex } from '@/lib/media/audio/sync/sync-crypto';

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

function kgSignatureParams(params: string): string {
  const keyparam = 'OIlwieks28dk2k092lksi2UIkp';
  const paramList = params.split('&').sort();
  return md5Hex(`${keyparam}${paramList.join('')}${keyparam}`);
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
  if (sort === 'hot') {
    const body = await weapiPost<{
      hotComments?: Array<{
        commentId?: number;
        content?: string;
        likedCount?: number;
        user?: { nickname?: string };
      }>;
      hasMore?: boolean;
      total?: number;
    }>(`v1/resource/hotcomments/R_SO_4_${id}`, {
      rid: `R_SO_4_${id}`,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      beforeTime: 0,
    });
    const comments = (body.hotComments ?? []).map((c) => ({
      id: String(c.commentId ?? ''),
      user: c.user?.nickname ?? '匿名',
      content: c.content ?? '',
      likedCount: c.likedCount,
    }));
    const total = body.total ?? comments.length;
    return {
      comments,
      page,
      hasMore: body.hasMore ?? page * PAGE_SIZE < total,
    };
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

async function kwComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const id = String(track.meta.songId ?? track.meta.songmid ?? '').replace(/^MUSIC_/, '');
  if (!id) return { comments: [], page, hasMore: false };
  const type = sort === 'hot' ? 'get_rec_comment' : 'get_comment';
  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string | number;
      comments?: Array<{ id?: string | number; u_name?: string; msg?: string; like_num?: number; time?: string }>;
      hot_comments?: Array<{ id?: string | number; u_name?: string; msg?: string; like_num?: number; time?: string }>;
      comments_counts?: number;
      hot_comments_counts?: number;
    }>(
      `http://ncomment.kuwo.cn/com.s?f=web&type=${type}&aapiver=1&prod=kwplayer_ar_10.5.2.0&digest=15&sid=${id}&start=${PAGE_SIZE * (page - 1)}&msgflag=1&count=${PAGE_SIZE}&newver=3&uid=0`,
      { headers: { 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)' } },
    ),
  );
  const list = (sort === 'hot' ? body?.hot_comments : body?.comments) ?? [];
  const comments = list.map((c) => ({
    id: String(c.id ?? ''),
    user: c.u_name ?? '匿名',
    content: c.msg ?? '',
    likedCount: c.like_num,
    time: c.time,
  }));
  const total = Number(
    (sort === 'hot' ? body?.hot_comments_counts : body?.comments_counts) ?? comments.length,
  );
  return { comments, page, hasMore: page * PAGE_SIZE < total };
}

async function kgComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const hash = String(track.meta.hash ?? '');
  if (!hash) return { comments: [], page, hasMore: false };
  const timestamp = Date.now();
  const params =
    `dfid=0&mid=16249512204336365674023395779019&clienttime=${timestamp}&uuid=0&extdata=${hash}` +
    `&appid=1005&code=fc4be23b4e972707f36b8a828a93ba8a&schash=${hash}&clientver=11409&p=${page}` +
    `&clienttoken=&pagesize=${PAGE_SIZE}&ver=10&kugouid=0`;
  const path = sort === 'hot' ? 'topliked' : 'newest';
  const body = await safeCall(() =>
    onlineFetchJson<{
      err_code?: number;
      list?: Array<{ id?: string | number; content?: string; user_name?: string; addtime?: string; like?: { count?: number } }>;
      count?: number;
    }>(`http://m.comment.service.kugou.com/r/v1/rank/${path}?${params}&signature=${kgSignatureParams(params)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
      },
    }),
  );
  if (body?.err_code !== 0 && body?.err_code != null) {
    return { comments: [], page, hasMore: false };
  }
  const comments = (body?.list ?? []).map((c) => ({
    id: String(c.id ?? ''),
    user: c.user_name ?? '匿名',
    content: c.content ?? '',
    time: c.addtime,
    likedCount: c.like?.count,
  }));
  const total = body?.count ?? comments.length;
  return { comments, page, hasMore: page * PAGE_SIZE < total };
}

async function txComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const songId = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!songId) return { comments: [], page, hasMore: false };

  if (sort === 'hot') {
    const body = await safeCall(() =>
      onlineFetchJson<{
        code?: number;
        req?: {
          data?: {
            CommentList?: {
              Comments?: Array<{
                CommentId?: string;
                Content?: string;
                Nick?: string;
                PraiseNum?: number;
                Time?: string;
              }>;
              CommentCount?: number;
            };
          };
        };
      }>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: 'https://y.qq.com/',
        },
        body: JSON.stringify({
          comm: {
            cv: 4747474,
            ct: 24,
            format: 'json',
            inCharset: 'utf-8',
            outCharset: 'utf-8',
            notice: 0,
            platform: 'yqq.json',
            needNewCode: 1,
            uin: 0,
          },
          req: {
            module: 'music.globalComment.CommentRead',
            method: 'GetHotCommentList',
            param: {
              BizType: 1,
              BizId: String(songId),
              LastCommentSeqNo: '',
              PageSize: PAGE_SIZE,
              PageNum: page - 1,
              HotType: 1,
              WithAirborne: 0,
              PicEnable: 1,
            },
          },
        }),
      }),
    );
    const list = body?.req?.data?.CommentList?.Comments ?? [];
    const comments = list.map((c) => ({
      id: String(c.CommentId ?? ''),
      user: c.Nick ?? '匿名',
      content: c.Content ?? '',
      likedCount: c.PraiseNum,
      time: c.Time,
    }));
    const total = body?.req?.data?.CommentList?.CommentCount ?? comments.length;
    return { comments, page, hasMore: page * PAGE_SIZE < total };
  }

  const body = await txSignedRequest<{
    req?: { data?: { comment?: Array<{ rootcommentcontent?: string; nick?: string; praiseNum?: number }> } };
  }>({
    comm: { ct: 11, cv: 14090508 },
    req: {
      module: 'music.globalComment.CommentRead',
      method: 'GetNewCommentList',
      param: {
        BizType: 1,
        BizId: songId,
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
    likedCount: c.praiseNum,
  }));
  return { comments, page, hasMore: list.length >= PAGE_SIZE };
}

async function mgComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const songId = String(track.meta.songId ?? track.meta.copyrightId ?? '');
  if (!songId) return { comments: [], page, hasMore: false };

  if (sort === 'hot') {
    const body = await safeCall(() =>
      onlineFetchJson<{
        data?: {
          comments?: Array<{
            commentId?: string;
            commentInfo?: string;
            userName?: string;
            praiseCount?: number;
            createTime?: string;
          }>;
          commentCount?: number;
        };
        commentList?: Array<{ comment?: string; userName?: string }>;
        totalCount?: number;
      }>(
        `https://app.c.nf.migu.cn/MIGUM3.0/user/comment/stack/v1.0?pageSize=${PAGE_SIZE}&queryType=2&resourceId=${songId}&resourceType=2&hotCommentStart=${(page - 1) * PAGE_SIZE}`,
        {
          headers: {
            channel: '0146921',
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36',
          },
        },
      ),
    );
    const list = body?.data?.comments ?? [];
    if (list.length) {
      const comments = list.map((c) => ({
        id: String(c.commentId ?? ''),
        user: c.userName ?? '匿名',
        content: c.commentInfo ?? '',
        likedCount: c.praiseCount,
        time: c.createTime,
      }));
      const total = body?.data?.commentCount ?? comments.length;
      return { comments, page, hasMore: page * PAGE_SIZE < total };
    }
  }

  const body = await safeCall(() =>
    onlineFetchJson<{
      commentList?: Array<{ comment?: string; userName?: string }>;
      totalCount?: number;
    }>(
      `https://app.c.nf.migu.cn/v1.0/content/queryComment.do?resourceId=${songId}&resourceType=2&pageIndex=${page}&pageSize=${PAGE_SIZE}`,
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
      return kwComments(track, page, sort);
    case 'kg':
      return kgComments(track, page, sort);
    case 'tx':
      return txComments(track, page, sort);
    case 'mg':
      return mgComments(track, page, sort);
    default:
      return { comments: [], page, hasMore: false };
  }
}
