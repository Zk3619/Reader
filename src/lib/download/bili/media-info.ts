/**
 * getMediaInfo — 12 种 MediaType 真实 API（对照 BiliTools media/data.ts）
 */

import { BiliError, getPublicImages } from './error';
import { tryFetch } from './http';
import { getEdgeInfo, getPlayerInfo, getUserInfo } from './extras';
import { getOpusDetails } from './opus';
import { fetchBiliUserProfile } from './session';
import type { MediaInfo, MediaItem, MediaType } from './types';

function mapBangumiStaffs(
  staffs: [string, string][],
): { role: string; name: string }[] {
  const map: Record<string, string> = {
    原作: 'writer',
    剧本统筹: 'writer',
    编剧: 'writer',
    导演: 'director',
    系列导演: 'director',
    动画制作: 'studio',
    出品: 'studio',
    音乐制作: 'studio',
    音响制作: 'studio',
  };
  return staffs.flatMap(([role, names]) => {
    const mapped = map[role.trim()];
    if (!mapped) return [];
    return names
      .split(/(?:\u2014\u2014|\u2014|\uFF0F|\u3001)/)
      .map((name) => ({ role: mapped, name: name.trim() }));
  });
}

function mapMusicStaffs(
  staffs: [number, string][],
): { role: string; name: string }[] {
  const map: Record<number, string> = {
    1: 'artist',
    2: 'lyricist',
    3: 'composer',
    4: 'arranger',
    5: 'mixer',
    9: 'engineer',
    10: 'performer',
    11: 'instrument',
  };
  return staffs.flatMap(([type, names]) => {
    const mapped = map[type];
    if (!mapped) return [];
    return names
      .split(/[\uFF0F\u3001]+|\s+/u)
      .map((name) => ({ role: mapped, name: name.trim() }));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

export async function getMediaInfo(
  id: string,
  type: MediaType,
  options?: { pn?: number; offset?: string; target?: number },
): Promise<MediaInfo> {
  let url = 'https://api.bilibili.com';
  let params: Record<string, string | number | undefined> = {};
  const idType = id.slice(0, 2).toLowerCase();
  const idNum = id.match(/\d+/)?.[0]?.toString();

  switch (type) {
    case 'video':
      url += '/x/web-interface/view';
      params = idType === 'bv' ? { bvid: id } : { aid: idNum };
      break;
    case 'bangumi':
      url += '/pgc/view/web/season';
      if (idType === 'md') {
        const body = (await tryFetch(
          'https://api.bilibili.com/pgc/review/user',
          { params: { media_id: idNum } },
        )) as AnyRec;
        params = { season_id: body.result.media.season_id };
      } else {
        params = idType === 'ss' ? { season_id: idNum } : { ep_id: idNum };
      }
      break;
    case 'lesson':
      url += '/pugv/view/web/season';
      params = idType === 'ss' ? { season_id: idNum } : { ep_id: idNum };
      break;
    case 'music':
      url = 'https://www.bilibili.com/audio/music-service-c/web/song/info';
      params = { sid: idNum };
      break;
    case 'musicList':
      url = 'https://www.bilibili.com/audio/music-service-c/web/menu/info';
      params = { sid: idNum };
      break;
    case 'watchLater':
      url += '/x/v2/history/toview/web';
      params = { ps: 20, pn: options?.pn ?? 1 };
      break;
    case 'favorite':
      url += '/x/v3/fav/folder/created/list-all';
      params = { up_mid: idNum };
      break;
    case 'opus':
      url += '/x/polymer/web-dynamic/v1/forward/preview';
      if (idType === 'cv') {
        const jump = (await tryFetch(`https://www.bilibili.com/read/${id}`, {
          type: 'url',
        })) as string;
        params = { id: jump.match(/\/opus\/(\d+)/)?.[1] };
      } else {
        params = { id };
      }
      break;
    case 'opusList':
      url += '/x/article/list/web/articles';
      params = { id: idNum };
      break;
    case 'userVideo':
      url += '/x/polymer/web-space/home/seasons_series';
      params = { mid: idNum, page_size: 10, page_num: options?.pn ?? 1 };
      break;
    case 'userOpus':
      url += '/x/polymer/web-dynamic/v1/opus/feed/space';
      params = {
        host_mid: idNum,
        page: 1,
        offset: options?.offset ?? '',
        type: 'all',
      };
      break;
    case 'userAudio':
      url += '/audio/music-service/web/song/upper';
      params = { uid: idNum, ps: 42, pn: options?.pn ?? 1 };
      break;
  }

  const body = (await tryFetch(url, { params })) as AnyRec;

  if (type === 'video') {
    const link = 'https://www.bilibili.com/video/';
    const data = body.data;
    const map = (ep: AnyRec, index: number): MediaItem => ({
      title: ep.title,
      cover: ep.arc.pic,
      desc: ep.arc.desc,
      url: link + ep.bvid,
      aid: ep.aid,
      bvid: ep.bvid,
      cid: ep.cid,
      duration: ep.page.duration,
      pubtime: ep.arc.pubdate,
      type: 'video',
      isTarget: ep.aid === data.aid,
      index,
    });
    const pageMap = (page: AnyRec, index: number): MediaItem => ({
      title: page.part || data.title,
      cover: data.pic,
      desc: data.desc,
      url: link + data.bvid,
      aid: data.aid,
      bvid: data.bvid,
      cid: page.cid,
      duration: page.duration,
      pubtime: page.ctime ?? data.pubdate,
      type: 'video',
      isTarget: index === 0,
      index,
    });
    let sections: MediaInfo['sections'];
    let edge: MediaInfo['edge'];
    let list: MediaItem[] =
      data.pages?.map(pageMap) ??
      [
        {
          title: data.title,
          cover: data.pic,
          desc: data.desc,
          url: link + data.bvid,
          aid: data.aid,
          bvid: data.bvid,
          cid: data.cid,
          duration: data.duration,
          pubtime: data.pubdate,
          type: 'video',
          isTarget: true,
          index: 0,
        },
      ];
    if (data.ugc_season) {
      const ep = data.ugc_season.sections
        .flatMap((v: AnyRec) => v.episodes)
        .find((v: AnyRec) =>
          options?.target ? v.id === options.target : v.aid === data.aid,
        );
      if (!ep) throw new BiliError(`No ugc ep for aid ${data.aid}`);
      if ((data.pages?.length ?? 0) > 1) {
        const section = data.ugc_season.sections.find(
          (v: AnyRec) => v.id === ep.section_id,
        );
        if (!section) throw new BiliError('No ugc section');
        list = ep.pages.map(pageMap);
        sections = {
          target: ep.id,
          tabs: section.episodes.map((v: AnyRec) => ({
            id: v.id,
            name: v.title,
          })),
        };
      } else {
        const section_id = options?.target ?? ep.section_id;
        const section = data.ugc_season.sections.find(
          (v: AnyRec) => v.id === section_id,
        );
        if (!section) throw new BiliError('No ugc section');
        list = section.episodes.map(map);
        sections = {
          target: section_id,
          tabs: data.ugc_season.sections.map((v: AnyRec) => ({
            id: v.id,
            name: v.title,
          })),
        };
      }
    }
    if (data.rights?.is_stein_gate) {
      const player = await getPlayerInfo(data.aid, data.cid);
      const graph_version = (player.interaction as AnyRec).graph_version;
      const edgeInfo = (await getEdgeInfo(data.aid, graph_version)) as AnyRec;
      edge = {
        edge_id: 1,
        graph_version,
        list: edgeInfo.story_list,
        choices: edgeInfo.edges?.questions?.[0]?.choices,
        vars: edgeInfo.hidden_vars,
      };
    }
    const tagsResp = (await tryFetch(
      'https://api.bilibili.com/x/tag/archive/tags',
      { params },
    )) as AnyRec;
    return {
      type,
      id,
      nfo: {
        showtitle: data.ugc_season?.title ?? data.title,
        intro: data.desc,
        tags: (tagsResp.data ?? []).map((v: AnyRec) => v.tag_name),
        url: link + data.bvid,
        stat: {
          play: data.stat.view,
          danmaku: data.stat.danmaku,
          reply: data.stat.reply,
          like: data.stat.like,
          coin: data.stat.coin,
          favorite: data.stat.favorite,
          share: data.stat.share,
        },
        thumbs: [
          ...getPublicImages(data),
          ...getPublicImages(data.ugc_season, 'ugc_season'),
        ],
        premiered: data.pubdate,
        upper: {
          name: data.owner.name,
          mid: data.owner.mid,
          avatar: data.owner.face,
        },
      },
      edge,
      sections,
      list,
    };
  }

  if (type === 'bangumi') {
    const data = body.result;
    const season = data.seasons?.find(
      (v: AnyRec) => v.season_id === data.season_id,
    );
    const map = (ep: AnyRec, index: number): MediaItem => ({
      title: ep.show_title ?? ep.title ?? '',
      cover: ep.cover,
      desc: data.evaluate,
      url: ep.share_url,
      aid: ep.aid,
      bvid: ep.bvid,
      cid: ep.cid,
      epid: ep.ep_id,
      ssid: data.season_id,
      duration: ep.duration / 1000,
      pubtime: ep.pub_time,
      type: 'bangumi',
      isTarget: idNum === String(ep.id),
      index,
    });
    const list =
      data.section
        ?.find((v: AnyRec) => v.id === (options?.target ?? data.positive?.id))
        ?.episodes.map(map) ?? data.episodes.map(map);
    return {
      type,
      id,
      nfo: {
        showtitle: data.season_title,
        intro: data.evaluate,
        tags: data.styles ?? [],
        url: data.share_url,
        stat: {
          play: data.stat.views,
          danmaku: data.stat.danmakus,
          reply: data.stat.reply,
          like: data.stat.likes,
          coin: data.stat.coins,
          favorite: data.stat.favorite,
          share: data.stat.share,
        },
        thumbs: [
          ...getPublicImages(data),
          ...getPublicImages(season, 'season'),
        ],
        premiered: data.episodes?.[0]?.pub_time,
        upper: data.up_info
          ? {
              name: data.up_info.uname,
              mid: data.up_info.mid,
              avatar: data.up_info.avatar,
            }
          : undefined,
        credits: {
          actors: (data.actors ?? '')
            .split('\n')
            .filter(Boolean)
            .map((actor: string) => {
              const [role, name] = actor.split(
                /(?:\u2014\u2014|\u2014|\uFF0F|\u3001)/,
              );
              return { name: name ?? '', role: role ?? '' };
            }),
          staff: mapBangumiStaffs(
            (data.staff ?? '')
              .split('\n')
              .filter(Boolean)
              .map((staff: string) => {
                const [name, role] = staff.split(
                  /(?:\u2014\u2014|\u2014|\uFF0F|\u3001)/,
                );
                return [name, role] as [string, string];
              }),
          ),
        },
      },
      sections: {
        target: data.positive?.id,
        tabs: [
          { id: data.positive?.id, name: data.positive?.title },
          ...(data.section ?? []).map((v: AnyRec) => ({
            id: v.id,
            name: v.title,
          })),
        ],
      },
      list,
    };
  }

  if (type === 'lesson') {
    const data = body.data;
    return {
      type,
      id,
      nfo: {
        showtitle: data.title,
        intro: `${data.subtitle}\n${data.faq?.title ?? ''}\n${data.faq?.content ?? ''}`,
        tags: [],
        url: data.share_url,
        stat: { play: data.stat?.play },
        thumbs: [
          ...getPublicImages(data),
          ...(data.brief?.img ?? []).map((v: AnyRec, i: number) => ({
            id: 'brief-' + (i + 1),
            url: v.url,
          })),
        ],
        premiered: data.episodes?.[0]?.release_date,
        upper: {
          avatar: data.up_info.avatar,
          name: data.up_info.uname,
          mid: data.up_info.mid,
        },
      },
      list: data.episodes.map(
        (ep: AnyRec, index: number): MediaItem => ({
          title: ep.title,
          cover: ep.cover,
          desc: data.subtitle,
          url: data.share_url,
          aid: ep.aid,
          cid: ep.cid,
          epid: ep.id,
          ssid: data.season_id,
          duration: ep.duration,
          pubtime: ep.release_date,
          type: 'lesson',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'music') {
    const data = body.data;
    const link = `https://www.bilibili.com/audio/au${data.id}`;
    const tagsResp = (await tryFetch(
      'https://www.bilibili.com/audio/music-service-c/web/tag/song',
      { params },
    )) as AnyRec;
    const upperResp = (await tryFetch(
      'https://www.bilibili.com/audio/music-service-c/web/user/info',
      { params: { uid: data.uid } },
    )) as AnyRec;
    const membersResp = (await tryFetch(
      'https://www.bilibili.com/audio/music-service-c/web/member/song',
      { params },
    )) as AnyRec;
    const user = upperResp.data;
    return {
      type,
      id,
      nfo: {
        showtitle: data.title,
        intro: data.intro,
        tags: (tagsResp.data ?? []).map((v: AnyRec) => v.info),
        url: link,
        stat: {
          play: data.statistic.play,
          reply: data.statistic.comment,
          favorite: data.statistic.collect,
          share: data.statistic.share,
        },
        thumbs: getPublicImages(data),
        premiered: data.passtime,
        upper: {
          name: user.uname,
          mid: user.uid,
          avatar: user.avater ?? user.avatar ?? '',
        },
        credits: {
          actors: [],
          staff: mapMusicStaffs(
            (membersResp.data ?? []).map((member: AnyRec) => [
              member.type,
              member.list.map((v: AnyRec) => v.name.trim()).join('\uFF0F'),
            ]),
          ),
        },
      },
      list: [
        {
          title: data.title,
          cover: data.cover,
          desc: data.intro,
          url: link,
          aid: data.aid,
          sid: data.id,
          bvid: data.bvid,
          cid: data.cid,
          duration: data.duration,
          pubtime: data.passtime,
          type: 'music',
          isTarget: true,
          index: 0,
        },
      ],
    };
  }

  if (type === 'musicList') {
    const link = 'https://www.bilibili.com/audio/';
    const data = body.data;
    const listInfo = (await tryFetch(
      'https://www.bilibili.com/audio/music-service-c/web/song/of-menu',
      { params: { pn: options?.pn ?? 1, ps: 20, sid: data.menuId } },
    )) as AnyRec;
    return {
      type,
      id,
      pn: true,
      nfo: {
        showtitle: data.title,
        intro: data.intro,
        tags: [],
        url: link + `am${data.menuId}`,
        stat: {
          play: data.statistic.play,
          reply: data.statistic.comment,
          favorite: data.statistic.collect,
          share: data.statistic.share,
        },
        thumbs: getPublicImages(data),
        premiered: data.ctime * 1000,
        upper: { name: data.uname, mid: data.uid, avatar: '' },
      },
      list: (listInfo.data?.data ?? []).map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.cover,
          desc: data.intro,
          url: link + `au${item.id}`,
          aid: item.aid,
          sid: item.id,
          bvid: item.bvid,
          cid: item.cid,
          duration: item.duration,
          pubtime: item.passtime,
          type: 'music',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'watchLater') {
    const data = body.data;
    const user = await fetchBiliUserProfile();
    return {
      type,
      id,
      pn: true,
      nfo: {
        tags: [],
        stat: {},
        url: 'https://www.bilibili.com/watchlater/list',
        upper: {
          name: user.name,
          mid: user.mid,
          avatar: user.avatar,
        },
        thumbs: data.list?.length ? getPublicImages(data.list[0]) : [],
      },
      list: (data.list ?? []).map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.pic,
          desc: item.desc,
          url: `https://www.bilibili.com/video/${item.bvid}`,
          aid: item.aid,
          bvid: item.bvid,
          duration: item.duration,
          pubtime: item.pubdate,
          type: 'video',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'favorite') {
    const favoriteList = body.data?.list ?? [];
    const target = options?.target ?? favoriteList[0]?.id;
    const listBody = (await tryFetch(
      'https://api.bilibili.com/x/v3/fav/resource/list',
      {
        params: {
          media_id: target,
          pn: options?.pn ?? 1,
          ps: 36,
          platform: 'web',
        },
      },
    )) as AnyRec;
    const { info, medias } = listBody.data;
    const typeMap: Record<number, MediaType> = {
      2: 'video',
      12: 'music',
      24: 'bangumi',
    };
    return {
      type,
      id,
      pn: true,
      nfo: {
        showtitle: info.title,
        intro: info.intro,
        tags: [],
        url: `https://space.bilibili.com/${info.upper.mid}/favlist`,
        stat: {
          play: info.cnt_info.play,
          like: info.cnt_info.thumb_up,
          favorite: info.cnt_info.collect,
          share: info.cnt_info.share,
        },
        thumbs: getPublicImages(info),
        premiered: info.ctime * 1000,
        upper: {
          avatar: info.upper.face,
          name: info.upper.name,
          mid: info.upper.mid,
        },
      },
      sections: {
        target,
        tabs: favoriteList.map((v: AnyRec) => ({ id: v.id, name: v.title })),
      },
      list: (medias ?? []).map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.cover,
          desc: info.intro,
          url: `https://www.bilibili.com/video/${item.bvid}`,
          aid: item.id,
          fid: info.id,
          bvid: item.bvid,
          duration: item.duration,
          pubtime: item.pubtime,
          type: typeMap[item.type] ?? 'video',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'opus') {
    const { common_card, user, id: opid } = body.data.item;
    const details = await getOpusDetails(String(opid ?? id));
    const title = common_card.nodes?.find(
      (v: AnyRec) => v.type === 'RICH_TEXT_NODE_TYPE_TEXT',
    )?.text;
    if (!title) throw new BiliError('No title found for opus ' + id);
    const opusUrl = `https://www.bilibili.com/opus/${opid}`;
    return {
      type,
      id,
      nfo: {
        showtitle: title,
        intro: title,
        tags: [],
        url: opusUrl,
        stat: {
          reply: details.stat.reply,
          favorite: details.stat.favorite,
          share: details.stat.share,
          like: details.stat.like,
        },
        upper: await getUserInfo(user.mid),
        thumbs: getPublicImages(common_card),
      },
      list: [
        {
          title,
          cover: common_card.cover ?? '',
          desc: title,
          url: opusUrl,
          opid: String(opid),
          duration: 0,
          pubtime: 0,
          type: 'opus',
          isTarget: true,
          index: 0,
        },
      ],
    };
  }

  if (type === 'opusList') {
    const { list, articles, author } = body.data;
    const listUrl = `https://www.bilibili.com/read/readlist/rl${list.id}`;
    return {
      type,
      id,
      nfo: {
        showtitle: list.name,
        intro: list.summary,
        tags: articles?.[0]?.categories?.map((v: AnyRec) => v.name) ?? [],
        url: listUrl,
        stat: { play: list.read },
        upper: {
          name: author.name,
          mid: author.mid,
          avatar: author.face,
        },
        thumbs: [{ id: 'cover', url: list.image_url }],
      },
      list: (articles ?? []).map(
        (v: AnyRec, index: number): MediaItem => ({
          title: v.title,
          cover: v.image_urls?.[0] ?? '',
          desc: v.summary,
          url: `https://www.bilibili.com/opus/${v.dyn_id_str}`,
          opid: v.dyn_id_str,
          rlid: list.id,
          duration: 0,
          pubtime: v.publish_time,
          type: 'opus',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'userVideo') {
    const { seasons_list = [], series_list = [] } =
      body.data?.items_lists ?? {};
    const upper = await getUserInfo(idNum);
    let sections: MediaInfo['sections'];
    let nfo: MediaInfo['nfo'];
    let list: MediaItem[];
    if (seasons_list.length || series_list.length) {
      let target = options?.target;
      let archives: AnyRec[];
      let meta: AnyRec;
      if (seasons_list.length) {
        if (!target) target = seasons_list[0].meta.season_id;
        const listBody = (await tryFetch(
          'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list',
          { params: { ...params, season_id: target } },
        )) as AnyRec;
        sections = {
          target: target!,
          tabs: seasons_list.map((v: AnyRec) => ({
            id: v.meta.season_id,
            name: v.meta.name,
          })),
        };
        archives = listBody.data.archives;
        meta = seasons_list.find(
          (v: AnyRec) => v.meta.season_id === target,
        )?.meta;
      } else {
        if (!target) target = series_list[0].meta.series_id;
        const listBody = (await tryFetch(
          'https://api.bilibili.com/x/series/archives',
          { params: { ...params, series_id: target } },
        )) as AnyRec;
        sections = {
          target: target!,
          tabs: series_list.map((v: AnyRec) => ({
            id: v.meta.series_id,
            name: v.meta.name,
          })),
        };
        archives = listBody.data.archives;
        meta = series_list.find(
          (v: AnyRec) => v.meta.series_id === target,
        )?.meta;
      }
      if (!meta) throw new BiliError(`No meta for target ${target}`);
      nfo = {
        showtitle: meta.name,
        intro: meta.description,
        tags: [],
        url: `https://space.bilibili.com/${upper.mid}/lists/${target}`,
        stat: {},
        upper,
        thumbs: getPublicImages(meta),
        premiered: meta.ptime,
      };
      list = archives.map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.pic,
          desc: meta.description,
          url: `https://www.bilibili.com/video/${item.bvid}`,
          aid: item.aid,
          bvid: item.bvid,
          duration: item.duration,
          pubtime: item.pubdate,
          type: 'video',
          isTarget: index === 0,
          index,
        }),
      );
    } else {
      const listBody = (await tryFetch(
        'https://api.bilibili.com/x/space/wbi/arc/search',
        {
          params: { mid: idNum, ps: 25, pn: options?.pn ?? 1 },
          auth: 'wbi',
        },
      )) as AnyRec;
      const { vlist } = listBody.data.list;
      nfo = {
        tags: [],
        stat: {},
        url: `https://space.bilibili.com/${upper.mid}/upload/video`,
        upper,
        thumbs: getPublicImages(vlist?.[0]),
      };
      list = (vlist ?? []).map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.pic,
          desc: item.description,
          url: `https://www.bilibili.com/video/${item.bvid}`,
          aid: item.aid,
          bvid: item.bvid,
          duration: String(item.length)
            .split(':')
            .reduce((h: number, s: string) => h * 60 + Number(s), 0),
          pubtime: item.created,
          type: 'video',
          isTarget: index === 0,
          index,
        }),
      );
    }
    return { type, id, pn: true, sections, nfo, list };
  }

  if (type === 'userOpus') {
    const { items, offset } = body.data;
    const upper = await getUserInfo(idNum);
    const spaceUrl = `https://space.bilibili.com/${upper.mid}/upload/opus`;
    const cover = items?.[0]?.cover;
    return {
      type,
      id,
      pn: true,
      offset,
      nfo: {
        tags: [],
        stat: {},
        upper,
        url: spaceUrl,
        thumbs: cover ? [{ id: 'cover', url: cover.url }] : [],
      },
      list: (items ?? []).map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.content,
          cover: item.cover?.url ?? '',
          desc: item.content,
          url: spaceUrl,
          opid: item.opus_id,
          duration: 0,
          pubtime: 0,
          type: 'opus',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  if (type === 'userAudio') {
    const data = body.data?.data ?? [];
    const upper = await getUserInfo(idNum);
    return {
      type,
      id,
      pn: true,
      nfo: {
        tags: [],
        stat: {},
        url: `https://space.bilibili.com/${upper.mid}/upload/audio`,
        upper,
        thumbs: getPublicImages(data[0]),
      },
      list: data.map(
        (item: AnyRec, index: number): MediaItem => ({
          title: item.title,
          cover: item.cover,
          desc: item.title,
          url: `https://www.bilibili.com/audio/au${item.id}`,
          aid: item.aid,
          sid: item.id,
          bvid: item.bvid,
          cid: item.cid,
          duration: item.duration,
          pubtime: item.passtime,
          type: 'music',
          isTarget: index === 0,
          index,
        }),
      ),
    };
  }

  throw new BiliError('No type named ' + type);
}
