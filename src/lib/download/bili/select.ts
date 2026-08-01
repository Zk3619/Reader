/**
 * Popup 能力探测 + 默认选择（对照 BiliTools Popup.getSelect）
 */

import { getBiliDownloadConfigSync } from './config';
import { getDefaultQuality } from './error';
import { getAISummary, getSubtitle } from './extras';
import { getPlayUrl, streamUrlOf } from './play-url';
import { isBiliLoggedIn } from './session';
import type {
  MediaItem,
  MediaNfo,
  MediaType,
  PopupProvider,
  PopupSelect,
  StreamFormat,
} from './types';

const STREAM_TYPES: MediaType[] = ['video', 'bangumi', 'lesson', 'music'];

export async function probePopupProvider(
  item: MediaItem,
  nfo: MediaNfo,
  fmt?: StreamFormat,
): Promise<PopupProvider> {
  const cfg = getBiliDownloadConfigSync();
  const streamFmt = fmt ?? cfg.default.fmt;
  const isOpus = item.type === 'opus';
  const isMusic = item.type === 'music';
  const canStream = STREAM_TYPES.includes(item.type);

  let video: PopupProvider['video'];
  let audio: PopupProvider['audio'];
  let codec: StreamFormat | undefined;

  if (canStream) {
    const play = await getPlayUrl(item, item.type, streamFmt);
    video = play.video;
    audio = play.audio;
    codec = play.codec;
  }

  let subtitles: { id: string; name: string }[] = [];
  let aiSummary = false;
  if (!isOpus && !isMusic && item.aid && item.cid && isBiliLoggedIn()) {
    try {
      const subs = await getSubtitle(item);
      if (Array.isArray(subs)) {
        subtitles = subs.map((s) => ({ id: s.lan, name: s.lan_doc || s.lan }));
      }
    } catch {
      /* ignore */
    }
    try {
      aiSummary = (await getAISummary(item, { check: true })) === true;
    } catch {
      aiSummary = false;
    }
  }

  return {
    video,
    audio,
    codec,
    misc: {
      opusContent: isOpus,
      opusImages: isOpus,
      aiSummary,
      subtitles,
    },
    nfo: {
      album: Boolean(nfo.showtitle),
      single: !isOpus,
    },
    danmaku:
      !isOpus && !isMusic && item.cid
        ? ['live', ...(isBiliLoggedIn() ? ['history'] : [])]
        : [],
    thumb: nfo.thumbs.map((t) => t.id),
  };
}

export function buildDefaultSelect(
  provider: PopupProvider,
  overrides?: Partial<PopupSelect>,
): PopupSelect {
  const cfg = getBiliDownloadConfigSync();
  const videoIds = (provider.video ?? []).map((v) => v.id);
  const audioIds = (provider.audio ?? []).map((v) => v.id);
  const encIds = [
    ...new Set(
      (provider.video ?? [])
        .map((v) => v.codecid)
        .filter((x): x is number => typeof x === 'number'),
    ),
  ];
  const hasDash = provider.codec === 'dash' || Boolean(provider.audio?.length);
  return {
    res: getDefaultQuality(videoIds, cfg.default.res),
    abr: getDefaultQuality(audioIds, cfg.default.abr),
    enc: getDefaultQuality(encIds.length ? encIds : [7, 12, 13], cfg.default.enc),
    fmt: provider.codec ?? cfg.default.fmt,
    misc: {
      opusContent: provider.misc.opusContent,
      opusImages: provider.misc.opusImages,
      aiSummary: false,
      subtitles: false,
    },
    nfo: { album: false, single: false },
    danmaku: { live: false, history: false },
    thumb: provider.thumb.slice(0, 1),
    media: {
      video: !hasDash,
      audio: isAudioOnly(provider),
      audioVideo: hasDash,
    },
    ...overrides,
  };
}

function isAudioOnly(provider: PopupProvider): boolean {
  return Boolean(provider.audio?.length) && !provider.video?.length;
}

export function resolveSelectedStreams(
  provider: PopupProvider,
  select: PopupSelect,
): { videoUrl?: string; audioUrl?: string; res?: number; abr?: number; enc?: number } {
  const videos = provider.video ?? [];
  const audios = provider.audio ?? [];
  let video = videos.find((v) => v.id === select.res);
  if (select.enc != null) {
    const encMatch = videos.find(
      (v) => v.id === select.res && (v.codecid == null || v.codecid === select.enc),
    );
    if (encMatch) video = encMatch;
  }
  if (!video && videos.length) {
    video = [...videos].sort((a, b) => b.id - a.id)[0];
  }
  let audio = audios.find((a) => a.id === select.abr);
  if (!audio && audios.length) {
    audio = [...audios].sort((a, b) => b.id - a.id)[0];
  }
  return {
    videoUrl: video ? streamUrlOf(video) : undefined,
    audioUrl: audio ? streamUrlOf(audio) : undefined,
    res: video?.id,
    abr: audio?.id,
    enc: video?.codecid,
  };
}
