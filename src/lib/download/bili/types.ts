/**
 * B 站下载域类型（对照 BiliTools 1.4.7 shared.d.ts）
 */

export const QualityMap = {
  res: [6, 16, 32, 64, 80, 112, 116, 120, 125, 126, 127] as const,
  abr: [30216, 30228, 30232, 30280, 30250, 30380, 30251, 30252] as const,
  enc: [7, 12, 13] as const,
  fmt: ['dash', 'mp4', 'flv'] as const,
};

export const RES_LABEL: Record<number, string> = {
  6: '240P',
  16: '360P',
  32: '480P',
  64: '720P',
  80: '1080P',
  112: '1080P+',
  116: '1080P60',
  120: '4K',
  125: 'HDR',
  126: '杜比视界',
  127: '8K',
};

export const ABR_LABEL: Record<number, string> = {
  30216: '64K',
  30228: '132K',
  30232: '192K',
  30280: '320K',
  30250: '杜比全景声',
  30380: '320K+',
  30251: 'Hi-Res',
  30252: 'FLAC',
};

export const ENC_LABEL: Record<number, string> = {
  7: 'AVC',
  12: 'HEVC',
  13: 'AV1',
};

export const NamingTemplates = {
  series: {
    general: ['showtitle', 'container'] as const,
    down: ['pubtime', 'downtime', 'upper', 'upperid'] as const,
    ids: ['aid', 'sid', 'fid', 'cid', 'bvid', 'epid', 'ssid', 'opid'] as const,
  },
  item: {
    general: ['showtitle', 'title', 'container', 'mediaType'] as const,
    down: ['index', 'pubtime', 'downtime', 'upper', 'upperid'] as const,
    ids: ['aid', 'sid', 'fid', 'cid', 'bvid', 'epid', 'ssid', 'opid'] as const,
  },
  file: {
    general: ['showtitle', 'title', 'container', 'mediaType', 'taskType'] as const,
    down: ['index', 'pubtime', 'downtime', 'upper', 'upperid'] as const,
    ids: ['aid', 'sid', 'fid', 'cid', 'bvid', 'epid', 'ssid', 'opid'] as const,
    stream: ['res', 'abr', 'enc', 'fmt'] as const,
  },
};

export type StreamFormat = 'dash' | 'mp4' | 'flv';

export type MediaType =
  | 'video'
  | 'bangumi'
  | 'music'
  | 'musicList'
  | 'lesson'
  | 'watchLater'
  | 'favorite'
  | 'opus'
  | 'opusList'
  | 'userVideo'
  | 'userOpus'
  | 'userAudio';

export type TaskType =
  | 'opusContent'
  | 'opusImages'
  | 'aiSummary'
  | 'subtitles'
  | 'albumNfo'
  | 'singleNfo'
  | 'liveDanmaku'
  | 'historyDanmaku'
  | 'thumb'
  | 'video'
  | 'audio'
  | 'audioVideo';

export interface PopupSelect {
  res?: number;
  abr?: number;
  enc?: number;
  fmt: StreamFormat;
  misc: {
    opusContent: boolean;
    opusImages: boolean;
    aiSummary: boolean;
    subtitles: false | string;
  };
  nfo: {
    album: boolean;
    single: boolean;
  };
  danmaku: {
    live: boolean;
    history: false | string;
  };
  thumb: string[];
  media: {
    video: boolean;
    audio: boolean;
    audioVideo: boolean;
  };
}

export interface PlayUrlResult {
  id: number;
  md5?: string;
  size?: number;
  codecid?: number;
  baseUrl?: string;
  base_url?: string;
  backupUrl?: string[];
  backup_url?: string[];
}

export interface PlayUrlProvider {
  video?: PlayUrlResult[];
  audio?: PlayUrlResult[];
  codec: StreamFormat;
}

export interface PopupProvider {
  video?: PlayUrlResult[];
  audio?: PlayUrlResult[];
  codec?: StreamFormat;
  misc: {
    opusContent: boolean;
    opusImages: boolean;
    aiSummary: boolean;
    subtitles: { id: string; name: string }[];
  };
  nfo: {
    album: boolean;
    single: boolean;
  };
  danmaku: string[];
  thumb: string[];
}

export interface MediaItem {
  title: string;
  cover: string;
  desc: string;
  duration: number;
  pubtime: number;
  isTarget: boolean;
  type: MediaType;
  url: string;
  aid?: number;
  sid?: number;
  fid?: number;
  cid?: number;
  bvid?: string;
  epid?: number;
  ssid?: number;
  opid?: string;
  rlid?: number;
  index: number;
}

export interface MediaNfo {
  showtitle?: string;
  intro?: string;
  tags: string[];
  url: string;
  stat: {
    play?: number;
    danmaku?: number;
    reply?: number;
    like?: number;
    coin?: number;
    favorite?: number;
    share?: number;
  };
  thumbs: { id: string; url: string }[];
  premiered?: number;
  upper?: {
    name: string;
    mid: number;
    avatar: string;
  };
  credits?: {
    actors: { role: string; name: string }[];
    staff: { role: string; name: string }[];
  };
}

export interface EdgeChoice {
  id: number;
  option: string;
  x?: number;
  y?: number;
}

export interface EdgeStory {
  edge_id: number;
  title: string;
  cid: number;
  cover?: string;
}

export interface EdgeVar {
  name: string;
  value: number | string;
}

export interface MediaEdge {
  graph_version: number;
  edge_id: number;
  list: EdgeStory[];
  choices?: EdgeChoice[];
  vars: EdgeVar[];
}

export interface MediaInfo {
  type: MediaType;
  id: string;
  pn?: boolean;
  nfo: MediaNfo;
  edge?: MediaEdge;
  offset?: string;
  sections?: {
    target: number;
    tabs: { id: number; name: string }[];
  };
  list: MediaItem[];
}

export interface ParseIdResult {
  id: string;
  type?: MediaType;
  target?: number;
}

export interface BiliUserProfile {
  mid: number;
  name: string;
  avatar: string;
  desc?: string;
  level?: number;
  isLogin: boolean;
  cookieSource?: string;
}

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  video: '视频',
  bangumi: '番剧',
  lesson: '课程',
  music: '音频',
  musicList: '歌单',
  watchLater: '稍后再看',
  favorite: '收藏夹',
  opus: '图文',
  opusList: '图文合集',
  userVideo: 'UP 视频',
  userOpus: 'UP 图文',
  userAudio: 'UP 音频',
};
