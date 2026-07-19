/**
 * 五源评论 API（只读，对齐 lx comment.js；含嵌套回复 / 头像 / 地点）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { weapiPost } from '@/lib/media/audio/platform/api/weapi-crypto';
import { onlineFetchJson } from '@/lib/media/audio/online/online-http';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';
import { firstSuccess, safeCall } from '@/lib/media/audio/music-sdk/fallback';
import { md5Hex } from '@/lib/media/audio/sync/sync-crypto';
import { loadAuthSession } from '@/lib/media/audio/platform/auth/session';

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

/** 对齐 lx CommentFloor 数据形状（字段名沿用 Reader 现有命名） */
export interface MusicComment {
  id: string;
  user: string;
  content: string;
  /** 展示用时间文案 */
  time?: string;
  /** null 表示不展示赞数（被引用父评等） */
  likedCount?: number | null;
  avatar?: string | null;
  location?: string;
  images?: string[];
  reply?: MusicComment[];
}

export interface CommentPageResult {
  comments: MusicComment[];
  page: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const WY_EMOJIS: Array<[string, string]> = [
  ['大笑', '😃'],
  ['可爱', '😊'],
  ['憨笑', '☺️'],
  ['色', '😍'],
  ['亲亲', '😙'],
  ['惊恐', '😱'],
  ['流泪', '😭'],
  ['亲', '😚'],
  ['呆', '😳'],
  ['哀伤', '😔'],
  ['呲牙', '😁'],
  ['吐舌', '😝'],
  ['撇嘴', '😒'],
  ['怒', '😡'],
  ['奸笑', '😏'],
  ['汗', '😓'],
  ['痛苦', '😖'],
  ['惶恐', '😰'],
  ['生病', '😨'],
  ['口罩', '😷'],
  ['大哭', '😂'],
  ['晕', '😵'],
  ['发怒', '👿'],
  ['开心', '😄'],
  ['鬼脸', '😜'],
  ['皱眉', '😞'],
  ['流感', '😢'],
  ['爱心', '❤️'],
  ['心碎', '💔'],
  ['钟情', '💘'],
  ['星星', '⭐️'],
  ['生气', '💢'],
  ['便便', '💩'],
  ['强', '👍'],
  ['弱', '👎'],
  ['拜', '🙏'],
];

function applyWyEmoji(text: string): string {
  let out = text;
  for (const [name, emoji] of WY_EMOJIS) {
    out = out.split(`[${name}]`).join(emoji);
  }
  return out;
}

/** 对齐 lx dateFormat2：相对时间；无法解析则原样返回 */
export function formatCommentTime(input: string | number | null | undefined): string | undefined {
  if (input == null || input === '') return undefined;
  if (typeof input === 'string' && !/^\d+$/.test(input.trim())) {
    const parsed = Date.parse(input);
    if (!Number.isFinite(parsed)) return input;
    return formatCommentTimeMs(parsed);
  }
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return String(input);
  // < 1e12 视为秒级时间戳
  const ms = n < 1e12 ? n * 1000 : n;
  return formatCommentTimeMs(ms);
}

function formatCommentTimeMs(ms: number): string {
  const differ = Math.trunc((Date.now() - ms) / 1000);
  if (differ < 60) return `${Math.max(0, differ)} 秒前`;
  if (differ < 3600) return `${Math.trunc(differ / 60)} 分钟前`;
  if (differ < 86400) return `${Math.trunc(differ / 3600)} 小时前`;
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function comment(
  partial: Omit<MusicComment, 'reply'> & { reply?: MusicComment[] },
): MusicComment {
  return {
    ...partial,
    reply: partial.reply ?? [],
  };
}

/** 对齐 lx wy/comment.js cursorTools：最新评论分页依赖 cursor */
const wyCommentCursor = {
  cache: {} as Record<
    string,
    {
      page?: number;
      cursor?: number;
      prevCursor?: number;
      offset?: number;
      orderType?: number;
    }
  >,
  getCursor(id: string, page: number, limit: number) {
    let cacheData = this.cache[id];
    if (!cacheData) cacheData = this.cache[id] = {};
    let orderType: number | undefined;
    let cursor: number | undefined;
    let offset: number | undefined;
    if (page === 1) {
      cacheData.page = 1;
      cursor = cacheData.cursor = cacheData.prevCursor = Date.now();
      orderType = 1;
      offset = 0;
    } else if (cacheData.page) {
      cursor = cacheData.cursor;
      if (page > cacheData.page) {
        orderType = 1;
        offset = (page - cacheData.page - 1) * limit;
      } else if (page < cacheData.page) {
        orderType = 0;
        offset = (cacheData.page - page - 1) * limit;
      } else {
        cursor = cacheData.cursor = cacheData.prevCursor;
        offset = cacheData.offset;
        orderType = cacheData.orderType;
      }
    }
    return { orderType, cursor, offset };
  },
  setCursor(id: string, cursor: number, orderType: number | undefined, offset: number | undefined, page: number) {
    let cacheData = this.cache[id];
    if (!cacheData) cacheData = this.cache[id] = {};
    cacheData.prevCursor = cacheData.cursor;
    cacheData.cursor = cursor;
    cacheData.orderType = orderType;
    cacheData.offset = offset;
    cacheData.page = page;
  },
};

const WY_COMMENT_COOKIE = 'MUSIC_U=';
const WY_COMMENT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36';

type WyRaw = {
  commentId?: number;
  content?: string;
  time?: number;
  likedCount?: number;
  ipLocation?: { location?: string };
  user?: { nickname?: string; avatarUrl?: string; userId?: number };
  beReplied?: Array<{
    beRepliedCommentId?: number;
    content?: string;
    ipLocation?: { location?: string };
    user?: { nickname?: string; avatarUrl?: string; userId?: number };
  }>;
};

async function resolveWyCommentCookies(): Promise<string> {
  const auth = await loadAuthSession('netease');
  if (auth?.cookies?.trim()) return auth.cookies;
  return WY_COMMENT_COOKIE;
}

function mapWyComments(rawList: WyRaw[]): MusicComment[] {
  return rawList.map((item) => {
    const data = comment({
      id: String(item.commentId ?? ''),
      content: item.content ? applyWyEmoji(item.content) : '',
      time: item.time ? formatCommentTime(item.time) : undefined,
      location: item.ipLocation?.location,
      user: item.user?.nickname ?? '匿名',
      avatar: item.user?.avatarUrl ?? null,
      likedCount: item.likedCount ?? null,
    });
    const replyData = item.beReplied?.[0];
    if (!replyData) return data;
    // 对齐 lx：被回复内容作父节点，当前评论嵌套在 reply
    return comment({
      id: String(item.commentId ?? ''),
      content: replyData.content ? applyWyEmoji(replyData.content) : '',
      time: undefined,
      location: replyData.ipLocation?.location,
      user: replyData.user?.nickname ?? '匿名',
      avatar: replyData.user?.avatarUrl ?? null,
      likedCount: null,
      reply: [data],
    });
  });
}

function wyCommentHeaders(cookies: string): Record<string, string> {
  return {
    'User-Agent': WY_COMMENT_UA,
    Origin: 'https://music.163.com',
    Referer: 'https://music.163.com/',
    Cookie: cookies,
  };
}

/** 对齐 lx getHotComment（weapi） */
async function wyHotCommentsWeapi(
  rid: string,
  page: number,
  cookies: string,
): Promise<CommentPageResult | null> {
  const body = await weapiPost<{
    code?: number;
    hotComments?: WyRaw[];
    hasMore?: boolean;
    total?: number;
  }>(
    `v1/resource/hotcomments/${rid}`,
    {
      rid,
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * (page - 1),
      beforeTime: Date.now().toString(),
    },
    cookies,
    { userAgent: WY_COMMENT_UA },
  );
  if (body.code != null && body.code !== 200) return null;
  const comments = mapWyComments(body.hotComments ?? []);
  const total = body.total ?? comments.length;
  return {
    comments,
    page,
    hasMore: body.hasMore ?? page * PAGE_SIZE < total,
  };
}

/** weapi 被掐时空响应：同平台降级到 /api/v1（非跨源） */
async function wyHotCommentsApi(
  rid: string,
  page: number,
  cookies: string,
): Promise<CommentPageResult | null> {
  const offset = PAGE_SIZE * (page - 1);
  const body = await onlineFetchJson<{
    code?: number;
    hotComments?: WyRaw[];
    hasMore?: boolean;
    total?: number;
  }>(
    `https://music.163.com/api/v1/resource/hotcomments/${rid}?limit=${PAGE_SIZE}&offset=${offset}`,
    { headers: wyCommentHeaders(cookies) },
  );
  if (body.code != null && body.code !== 200) return null;
  const comments = mapWyComments(body.hotComments ?? []);
  const total = body.total ?? comments.length;
  return {
    comments,
    page,
    hasMore: body.hasMore ?? page * PAGE_SIZE < total,
  };
}

/** 对齐 lx getComment（weapi + cursor） */
async function wyLatestCommentsWeapi(
  songmid: string,
  rid: string,
  page: number,
  cookies: string,
): Promise<CommentPageResult | null> {
  const cursorInfo = wyCommentCursor.getCursor(songmid, page, PAGE_SIZE);
  const body = await weapiPost<{
    code?: number;
    data?: {
      comments?: WyRaw[];
      totalCount?: number;
      cursor?: number;
    };
  }>(
    'comment/resource/comments/get',
    {
      cursor: cursorInfo.cursor,
      offset: cursorInfo.offset,
      orderType: cursorInfo.orderType,
      pageNo: page,
      pageSize: PAGE_SIZE,
      rid,
      threadId: rid,
    },
    cookies,
    { userAgent: WY_COMMENT_UA },
  );
  if (body.code != null && body.code !== 200) return null;
  if (body.data?.cursor != null) {
    wyCommentCursor.setCursor(
      songmid,
      body.data.cursor,
      cursorInfo.orderType,
      cursorInfo.offset,
      page,
    );
  }
  const comments = mapWyComments(body.data?.comments ?? []);
  const total = body.data?.totalCount ?? comments.length;
  return {
    comments,
    page,
    hasMore: page * PAGE_SIZE < total,
  };
}

/** weapi 被掐时空响应：同平台降级到 /api/v1（非跨源） */
async function wyLatestCommentsApi(
  rid: string,
  page: number,
  cookies: string,
): Promise<CommentPageResult | null> {
  const offset = PAGE_SIZE * (page - 1);
  const body = await onlineFetchJson<{
    code?: number;
    comments?: WyRaw[];
    more?: boolean;
    total?: number;
  }>(
    `https://music.163.com/api/v1/resource/comments/${rid}?limit=${PAGE_SIZE}&offset=${offset}`,
    { headers: wyCommentHeaders(cookies) },
  );
  if (body.code != null && body.code !== 200) return null;
  const comments = mapWyComments(body.comments ?? []);
  const total = body.total ?? comments.length;
  return {
    comments,
    page,
    hasMore: body.more ?? page * PAGE_SIZE < total,
  };
}

async function wyComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const songmid = String(track.meta.songId ?? track.meta.songmid ?? '');
  if (!songmid) return { comments: [], page, hasMore: false };
  const rid = `R_SO_4_${songmid}`;
  const cookies = await resolveWyCommentCookies();

  // 仅网易云站内降级：weapi（对齐 lx）→ /api/v1；不跨酷我等其它源
  if (sort === 'hot') {
    const result = await firstSuccess([
      () => wyHotCommentsWeapi(rid, page, cookies),
      () => wyHotCommentsApi(rid, page, cookies),
    ]);
    if (!result) throw new Error('获取热门评论失败');
    return result;
  }

  const result = await firstSuccess([
    () => wyLatestCommentsWeapi(songmid, rid, page, cookies),
    () => wyLatestCommentsApi(rid, page, cookies),
  ]);
  if (!result) throw new Error('获取评论失败');
  return result;
}

async function kwComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const id = String(track.meta.songId ?? track.meta.songmid ?? '').replace(/^MUSIC_/, '');
  if (!id) return { comments: [], page, hasMore: false };
  const type = sort === 'hot' ? 'get_rec_comment' : 'get_comment';

  type KwRaw = {
    id?: string | number;
    u_name?: string;
    msg?: string;
    like_num?: number;
    time?: string;
    u_pic?: string;
    mpic?: string;
    child_comments?: KwRaw[];
  };

  const mapKw = (list: KwRaw[]): MusicComment[] =>
    list.map((c) =>
      comment({
        id: String(c.id ?? ''),
        user: c.u_name ?? '匿名',
        content: c.msg ?? '',
        likedCount: c.like_num ?? null,
        time: formatCommentTime(c.time),
        avatar: c.u_pic ?? null,
        images: c.mpic ? [decodeURIComponent(c.mpic)] : undefined,
        reply: c.child_comments
          ? c.child_comments.map((i) =>
              comment({
                id: String(i.id ?? ''),
                user: i.u_name ?? '匿名',
                content: i.msg ?? '',
                likedCount: i.like_num ?? null,
                time: formatCommentTime(i.time),
                avatar: i.u_pic ?? null,
                images: i.mpic ? [i.mpic] : undefined,
              }),
            )
          : [],
      }),
    );

  const body = await safeCall(() =>
    onlineFetchJson<{
      code?: string | number;
      comments?: KwRaw[];
      hot_comments?: KwRaw[];
      comments_counts?: number;
      hot_comments_counts?: number;
    }>(
      `http://ncomment.kuwo.cn/com.s?f=web&type=${type}&aapiver=1&prod=kwplayer_ar_10.5.2.0&digest=15&sid=${id}&start=${PAGE_SIZE * (page - 1)}&msgflag=1&count=${PAGE_SIZE}&newver=3&uid=0`,
      { headers: { 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)' } },
    ),
  );
  const list = (sort === 'hot' ? body?.hot_comments : body?.comments) ?? [];
  const comments = mapKw(list);
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

  type KgRaw = {
    id?: string | number;
    content?: string;
    user_name?: string;
    user_pic?: string;
    addtime?: string;
    location?: string;
    pcontent?: string;
    puser?: string;
    images?: Array<{ url?: string }>;
    like?: { count?: number; likenum?: number };
  };

  const body = await safeCall(() =>
    onlineFetchJson<{
      err_code?: number;
      list?: KgRaw[];
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

  const comments = (body?.list ?? []).map((item) => {
    const data = comment({
      id: String(item.id ?? ''),
      user: item.user_name ?? '匿名',
      content: item.content ?? '',
      time: formatCommentTime(item.addtime),
      avatar: item.user_pic ?? null,
      location: item.location,
      likedCount: item.like?.likenum ?? item.like?.count ?? null,
      images: item.images?.map((i) => i.url).filter((u): u is string => Boolean(u)),
    });
    // 对齐 lx：有 pcontent 时，被引用内容作父、当前评论作 reply
    if (!item.pcontent) return data;
    return comment({
      id: String(item.id ?? ''),
      user: item.puser ?? '匿名',
      content: item.pcontent,
      time: undefined,
      avatar: null,
      likedCount: null,
      reply: [data],
    });
  });

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
    type TxHot = {
      SeqNo?: string;
      CmId?: string;
      Content?: string;
      Nick?: string;
      PraiseNum?: number;
      PubTime?: string;
      Avatar?: string;
      Location?: string;
      Pic?: string;
      SubComments?: TxHot[];
    };
    const body = await safeCall(() =>
      onlineFetchJson<{
        code?: number;
        req?: {
          data?: {
            CommentList?: {
              Comments?: TxHot[];
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
    const mapHot = (item: TxHot): MusicComment =>
      comment({
        id: `${item.SeqNo ?? ''}_${item.CmId ?? ''}`,
        user: item.Nick ?? '匿名',
        content: (item.Content ?? '').replace(/\\n/g, '\n'),
        likedCount: item.PraiseNum ?? null,
        time: formatCommentTime(item.PubTime),
        avatar: item.Avatar ?? null,
        location: item.Location || undefined,
        images: item.Pic ? [item.Pic] : undefined,
        reply: (item.SubComments ?? []).map((c) =>
          comment({
            id: `sub_${c.SeqNo ?? ''}_${c.CmId ?? ''}`,
            user: c.Nick ?? '匿名',
            content: (c.Content ?? '').replace(/\\n/g, '\n'),
            likedCount: c.PraiseNum ?? null,
            time: formatCommentTime(c.PubTime),
            avatar: c.Avatar ?? null,
            images: c.Pic ? [c.Pic] : undefined,
          }),
        ),
      });
    const comments = list.map(mapHot);
    const total = body?.req?.data?.CommentList?.CommentCount ?? comments.length;
    return { comments, page, hasMore: page * PAGE_SIZE < total };
  }

  type TxNew = {
    rootcommentid?: string;
    commentid?: string;
    rootcommentcontent?: string;
    rootcommentnick?: string;
    nick?: string;
    praiseNum?: number;
    praisenum?: number;
    time?: number | string;
    avatarurl?: string;
    middlecommentcontent?: Array<{
      subcommentid?: string;
      subcommentcontent?: string;
      replynick?: string;
      avatarurl?: string;
      praisenum?: number;
      encrypt_replyuin?: string;
    }>;
  };

  const body = await txSignedRequest<{
    req?: { data?: { comment?: TxNew[] } };
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
  const comments = list.map((item, i) => {
    const isRoot = item.rootcommentid == item.commentid;
    const timeStr = isRoot ? formatCommentTime(item.time) : undefined;
    const middle = item.middlecommentcontent
      ? [...item.middlecommentcontent].reverse()
      : [];
    return comment({
      id: `${item.rootcommentid ?? i}_${item.commentid ?? i}`,
      user: (item.rootcommentnick ?? item.nick ?? '匿名').replace(/^@/, ''),
      content: (item.rootcommentcontent ?? '').replace(/\\n/g, '\n'),
      likedCount: item.praisenum ?? item.praiseNum ?? null,
      time: timeStr,
      avatar: item.avatarurl ?? null,
      reply: middle.map((c) =>
        comment({
          id: `sub_${item.rootcommentid ?? ''}_${c.subcommentid ?? ''}`,
          user: (c.replynick ?? '匿名').replace(/^@/, ''),
          content: (c.subcommentcontent ?? '').replace(/\\n/g, '\n'),
          likedCount: c.praisenum ?? null,
          time: c.subcommentid == item.commentid ? timeStr : undefined,
          avatar: c.avatarurl ?? null,
        }),
      ),
    });
  });
  return { comments, page, hasMore: list.length >= PAGE_SIZE };
}

async function mgComments(
  track: AudioTrack,
  page = 1,
  sort: CommentSort = 'latest',
): Promise<CommentPageResult> {
  const songId = String(track.meta.songId ?? track.meta.copyrightId ?? '');
  if (!songId) return { comments: [], page, hasMore: false };

  type MgReply = {
    replyId?: string;
    replyInfo?: string;
    replyTime?: string;
    user?: {
      nickName?: string;
      userName?: string;
      middleIcon?: string;
      bigIcon?: string;
      smallIcon?: string;
    };
  };
  type MgRaw = {
    commentId?: string;
    commentInfo?: string;
    commentTime?: string;
    userName?: string;
    praiseCount?: number;
    createTime?: string;
    user?: {
      nickName?: string;
      middleIcon?: string;
      bigIcon?: string;
      smallIcon?: string;
    };
    opNumItem?: { thumbNum?: number };
    replyComments?: MgReply[];
  };

  const mapMg = (list: MgRaw[]): MusicComment[] =>
    list.map((item) =>
      comment({
        id: String(item.commentId ?? ''),
        user: item.user?.nickName ?? item.userName ?? '匿名',
        content: item.commentInfo ?? '',
        likedCount: item.opNumItem?.thumbNum ?? item.praiseCount ?? null,
        time: formatCommentTime(item.commentTime ?? item.createTime),
        avatar:
          item.user?.middleIcon || item.user?.bigIcon || item.user?.smallIcon || null,
        reply: (item.replyComments ?? []).map((c) =>
          comment({
            id: String(c.replyId ?? ''),
            user: c.user?.nickName ?? c.user?.userName ?? '匿名',
            content: c.replyInfo ?? '',
            likedCount: null,
            time: formatCommentTime(c.replyTime),
            avatar:
              c.user?.middleIcon || c.user?.bigIcon || c.user?.smallIcon || null,
          }),
        ),
      }),
    );

  if (sort === 'hot') {
    const body = await safeCall(() =>
      onlineFetchJson<{
        data?: {
          comments?: MgRaw[];
          hotComments?: MgRaw[];
          commentCount?: number;
        };
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
    const list = body?.data?.hotComments ?? body?.data?.comments ?? [];
    if (list.length) {
      const comments = mapMg(list);
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
  const comments = (body?.commentList ?? []).map((c, i) =>
    comment({
      id: String((page - 1) * PAGE_SIZE + i),
      user: c.userName ?? '匿名',
      content: c.comment ?? '',
    }),
  );
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
