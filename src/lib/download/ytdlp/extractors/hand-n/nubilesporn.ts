/** NubilesPornIE — ported from yt-dlp nubilesporn.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, float_or_none, int_or_none, unified_timestamp } from '../../utils';
import { format_field, hiddenInputs, parseHtml5MediaEntries, urlencodePostdata } from './_helpers';

export class NubilesPornIE extends InfoExtractor {
  static IE_NAME = 'NubilesPorn';
  static _NETRC_MACHINE = 'nubiles-porn';
  static _VALID_URL =
    /https:\/\/members\.nubiles-porn\.com\/video\/watch\/(?<id>\d+)(?:\/(?<display_id>[\w-]+-s(?<season>\d+)e(?<episode>\d+)))?/;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginWebpage = await this._download_webpage('https://nubiles-porn.com/login', 'login');
    const inputs = hiddenInputs(loginWebpage);
    inputs.username = username;
    inputs.password = password;
    await this._download_json('https://nubiles-porn.com/authentication/login', undefined, undefined, {
      method: 'POST',
      data: urlencodePostdata(inputs),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      fatal: false,
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const videoId = m?.groups?.id ?? this._match_id(url);
    const page = await this._download_webpage(url, videoId);
    const wrapperMatch = page.match(/class="watch-page-video-wrapper"[\s\S]*?<\/div>/i);
    const wrapper = wrapperMatch?.[0] || page;
    const mediaEntries = await parseHtml5MediaEntries(this, url, wrapper, videoId);
    const mediaInfo = mediaEntries[0] || { formats: [] };

    const siteLink = page.match(/\/video\/website\/(?<id>\d+)[^>]*>(?<name>\w+)\.com/i);
    const channelId = siteLink?.groups?.id;
    const channelName = siteLink?.groups?.name;

    return {
      id: videoId,
      title: page.match(/<h2>([^<]+)<\/h2>/i)?.[1] || videoId,
      formats: mediaInfo.formats,
      display_id: m?.groups?.display_id ?? undefined,
      thumbnail: mediaInfo.formats?.[0]?.url,
      description: clean_html(page.match(/class="content-pane-description"[^>]*>([\s\S]*?)<\//i)?.[1]),
      timestamp: unified_timestamp(page.match(/class="date"[^>]*>([^<]+)/i)?.[1]) ?? undefined,
      channel: channelName ? channelName.replace(/([^A-Z]+)([A-Z]+)/g, '$1 $2') : undefined,
      channel_id: channelId,
      channel_url: format_field({ id: channelId }, 'id', 'https://members.nubiles-porn.com/video/website/%s') ?? undefined,
      like_count: int_or_none(page.match(/id="likecount"[^>]*>([^<]+)/i)?.[1]) ?? undefined,
      average_rating: float_or_none(page.match(/class="score"[^>]*>([^<]+)/i)?.[1]) ?? undefined,
      age_limit: 18,
      availability: 'needs_auth',
      series: channelName,
      series_id: channelId,
      season_number: int_or_none(m?.groups?.season) ?? undefined,
      episode_number: int_or_none(m?.groups?.episode) ?? undefined,
    };
  }
}
