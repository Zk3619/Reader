/**
 * Bilibili Cheese (付费课程) — aligned with bilibili.py BilibiliCheeseIE / Season.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { VideoInfo } from '../types';
import { BILI_HEADERS, BILI_UA, parseBiliPlayFormats } from './bilibili-shared';
import { extractBiliSubtitles } from './bilibili-subs';
import { BilibiliBaseIE } from './bilibili-base';

/** Base for the cheese (付费课程) family — episode/season fetch logic lives in the module functions below. */
export class BilibiliCheeseBaseIE extends BilibiliBaseIE {
  static IE_NAME = 'bilibilicheesebase';
}

type SeasonInfo = {
  title?: string;
  subtitle?: string;
  up_info?: { uname?: string; mid?: number };
  episodes?: Array<{
    id?: number;
    aid?: number;
    cid?: number;
    title?: string;
    subtitle?: string;
    index?: number;
    cover?: string;
    duration?: number;
    release_date?: number;
    play?: number;
    playable?: boolean;
    episode_can_view?: boolean;
    ep_status?: number;
  }>;
};

async function downloadSeasonInfo(
  ie: InfoExtractor,
  queryKey: 'ep_id' | 'season_id',
  videoId: string,
): Promise<SeasonInfo> {
  const j = await ie._download_json<{ data?: SeasonInfo }>(
    `https://api.bilibili.com/pugv/view/web/season?${queryKey}=${videoId}`,
    videoId,
    'Downloading cheese season info',
    { headers: { ...BILI_HEADERS, 'User-Agent': BILI_UA }, fatal: false },
  );
  return j?.data || {};
}

async function extractCheeseEpisode(
  ie: InfoExtractor,
  seasonInfo: SeasonInfo,
  epId: string,
  reportWarning: (msg: string) => void,
): Promise<VideoInfo> {
  const episode = (seasonInfo.episodes || []).find((e) => String(e.id) === epId);
  if (!episode) {
    throw new ExtractorError('Cheese episode not found in season', { expected: true });
  }
  if (episode.ep_status === -1) {
    throw new ExtractorError('This course episode is not yet available.', { expected: true });
  }
  if (episode.playable === false) {
    ie.raise_login_required('You need to purchase the course to download this episode');
  }

  const aid = episode.aid;
  const cid = episode.cid;
  if (!aid || !cid) {
    throw new ExtractorError('Unable to extract cheese aid/cid', { expected: true });
  }

  const play = await ie._download_json<{ data?: Record<string, unknown> }>(
    'https://api.bilibili.com/pugv/player/web/playurl',
    epId,
    'Downloading cheese playinfo',
    {
      headers: { ...BILI_HEADERS, 'User-Agent': BILI_UA },
      fatal: false,
      query: {
        avid: String(aid),
        cid: String(cid),
        ep_id: epId,
        fnval: '16',
        fourk: '1',
      },
    },
  );

  const formats = parseBiliPlayFormats((play?.data || {}) as Record<string, unknown>, {
    ...BILI_HEADERS,
    Referer: `https://www.bilibili.com/cheese/play/ep${epId}`,
  });
  if (!formats.length) {
    throw new ExtractorError('No cheese formats (may need purchase / login)', { expected: true });
  }

  const index = episode.index != null ? String(episode.index) : '';
  const epTitle = String(episode.title || '');
  const title = [index, epTitle].filter(Boolean).join(' - ') || `ep${epId}`;

  let subtitles: VideoInfo['subtitles'];
  try {
    subtitles = await extractBiliSubtitles(
      ie._download_json.bind(ie),
      reportWarning,
      String(aid),
      cid,
      String(aid),
    );
  } catch {
    subtitles = {
      danmaku: [{ ext: 'xml', url: `https://comment.bilibili.com/${cid}.xml` }],
    };
  }

  return {
    id: epId,
    episode_id: epId,
    title,
    alt_title: episode.subtitle || null,
    episode: epTitle || null,
    episode_number: Number(episode.index) || null,
    duration: Number(episode.duration) || null,
    thumbnail: episode.cover || null,
    timestamp: Number(episode.release_date) || null,
    view_count: Number(episode.play) || null,
    uploader: seasonInfo.up_info?.uname || null,
    uploader_id: seasonInfo.up_info?.mid != null ? String(seasonInfo.up_info.mid) : null,
    formats,
    subtitles,
    webpage_url: `https://www.bilibili.com/cheese/play/ep${epId}`,
    extractor: 'BilibiliCheese',
    extractor_key: 'BilibiliCheese',
    http_headers: { ...BILI_HEADERS, Referer: `https://www.bilibili.com/cheese/play/ep${epId}` },
  };
}

export class BilibiliCheeseIE extends InfoExtractor {
  static IE_NAME = 'BilibiliCheese';
  static IE_DESC = 'Bilibili cheese course episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/cheese\/play\/ep(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/cheese/play/ep229832', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const epId = this._match_id(url);
    if (!epId) throw new ExtractorError('Unable to extract cheese ep id', { expected: true });
    const season = await downloadSeasonInfo(this, 'ep_id', epId);
    return extractCheeseEpisode(this, season, epId, (msg) => this.report_warning(msg));
  }
}

export class BilibiliCheeseSeasonIE extends InfoExtractor {
  static IE_NAME = 'BilibiliCheeseSeason';
  static IE_DESC = 'Bilibili cheese course season';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/cheese\/play\/ss(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/cheese/play/ss5918', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const seasonId = this._match_id(url);
    if (!seasonId) throw new ExtractorError('Unable to extract cheese season id', { expected: true });
    const season = await downloadSeasonInfo(this, 'season_id', seasonId);
    const eps = (season.episodes || []).filter(
      (e) => e.id != null && (e.episode_can_view !== false || e.playable !== false),
    );
    const entries = eps.map((e) =>
      this.url_result(
        `https://www.bilibili.com/cheese/play/ep${e.id}`,
        'BilibiliCheese',
        String(e.id),
        [e.index, e.title].filter(Boolean).join(' - ') || String(e.id),
      ),
    );
    if (!entries.length) {
      throw new ExtractorError('Cheese season has no viewable episodes', { expected: true });
    }
    return this.playlist_result(
      entries,
      seasonId,
      season.title || `ss${seasonId}`,
      season.subtitle || null,
    );
  }
}
