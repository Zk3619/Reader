/** S4CIE / S4CSeriesIE — ported from yt-dlp s4c.py */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { str_or_none, traverse_obj, unified_strdate, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class S4CIE extends InfoExtractor {
  static IE_NAME = 's4c';
  static _VALID_URL = /https?:\/\/(?:www\.)?s4c\.cymru\/clic\/programme\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const details = await this._download_json<Record<string, unknown>>(
      `https://www.s4c.cymru/df/full_prog_details?lang=e&programme_id=${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );

    const playerConfig = await this._download_json<Record<string, unknown>>(
      'https://player-api.s4c-cdn.co.uk/player-configuration/prod',
      videoId,
      'Downloading player config JSON',
      {
        query: {
          programme_id: videoId,
          signed: '0',
          lang: 'en',
          mode: 'od',
          appId: 'clic',
          streamName: '',
        },
      },
    );

    const subtitles: Record<string, Subtitle[]> = {};
    const subList = (playerConfig.subtitles as Record<string, unknown> | undefined) || {};
    for (const subRaw of Object.values(subList)) {
      const sub = subRaw as Record<string, unknown>;
      const subUrl = url_or_none(sub['0']);
      if (!subUrl) continue;
      const lang = String(sub['3'] ?? 'en');
      (subtitles[lang] ||= []).push({ url: subUrl, name: sub['1'] as string | undefined, ext: 'vtt' });
    }

    const region = playerConfig.application === 's4chttpl' ? 'UK' : 'WW';
    const streamJson = await this._download_json<{ hls?: string }>(
      'https://player-api.s4c-cdn.co.uk/streaming-urls/prod',
      videoId,
      'Downloading streaming urls JSON',
      {
        query: {
          mode: 'od',
          application: 'clic',
          region,
          extra: 'false',
          thirdParty: 'false',
          filename: String(playerConfig.filename ?? ''),
        },
      },
    );
    const { formats } = await extractM3u8FormatsAndSubtitles(this, streamJson.hls!, videoId, 'hls');

    const meta = traverse_obj(details, ['full_prog_details', 0]) as Record<string, unknown> | undefined;
    const title =
      str_or_none(meta?.programme_title) || str_or_none(meta?.series_title) || videoId;
    const seriesTitle = str_or_none(meta?.series_title);

    return {
      id: videoId,
      formats,
      subtitles,
      thumbnail: url_or_none(playerConfig.poster),
      title,
      description: str_or_none(meta?.full_billing)?.trim(),
      duration: meta?.duration != null ? Number(meta.duration) * 60 : undefined,
      upload_date: unified_strdate(meta?.clic_aired) ?? undefined,
      release_date: unified_strdate(meta?.last_tx) ?? undefined,
      series: seriesTitle || undefined,
      series_id: str_or_none(meta?.series_id) || undefined,
    };
  }
}

export class S4CSeriesIE extends InfoExtractor {
  static IE_NAME = 's4c:series';
  static _VALID_URL = /https?:\/\/(?:www\.)?s4c\.cymru\/clic\/series\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const seriesDetails = await this._download_json<Record<string, unknown>>(
      'https://www.s4c.cymru/df/series_details',
      seriesId,
      'Downloading series details JSON',
      { query: { lang: 'e', series_id: seriesId, show_prog_in_series: 'Y' } },
    );
    const episodeIds = ((seriesDetails.other_progs_in_series as Array<Record<string, unknown>>) || []).map(
      (e) => e.id,
    );
    const entries = episodeIds
      .filter((id) => id != null)
      .map((id) =>
        this.url_result(`https://www.s4c.cymru/clic/programme/${id}`, 'S4C', String(id)),
      );
    return this.playlist_result(
      entries,
      seriesId,
      str_or_none(traverse_obj(seriesDetails, ['full_prog_details', 0, 'series_title'])) || undefined,
    );
  }
}
