/** PelotonIE / PelotonLiveIE — ported from yt-dlp peloton.py (login simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class PelotonIE extends InfoExtractor {
  static IE_NAME = 'peloton';
  static _VALID_URL = /https?:\/\/members\.onepeloton\.com\/classes\/player\/(?<id>[a-f0-9]+)/;

  protected async _getToken(videoId: string): Promise<string> {
    const subscription = await this._download_json<{ token?: string }>(
      'https://api.onepeloton.com/api/subscription/stream',
      videoId,
      'Downloading token',
      { data: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } },
    );
    if (!subscription.token) throw new ExtractorError('Missing subscription token', { expected: true });
    return subscription.token;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    try {
      await this._download_webpage('https://api.onepeloton.com/api/started_client_session', videoId, 'Starting session');
    } catch {
      this.raise_login_required();
    }

    const metadata = await this._download_json<{ ride?: Record<string, unknown>; segments?: { segment_list?: unknown[] }; instructor_cues?: unknown }>(
      `https://api.onepeloton.com/api/ride/${videoId}/details?stream_source=multichannel`,
      videoId,
    );
    const ride = metadata.ride;
    if (!ride) throw new ExtractorError('Missing stream metadata', { expected: true });
    const token = await this._getToken(videoId);
    const encodedToken = encodeURIComponent(token);

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    let isLive = false;

    if (ride.content_format === 'audio') {
      formats = [{
        url: `${ride.vod_stream_url}?hdnea=${encodedToken}`,
        ext: 'm4a',
        format_id: 'audio',
        vcodec: 'none',
      }];
    } else {
      let manifestUrl: string;
      if (ride.vod_stream_url) {
        const captions = ((ride.captions as string[]) || []).map((c) => c.replace(/^([a-z]+)-([A-Z]+)$/, '$1')).join(',');
        manifestUrl = `https://members.onepeloton.com/.netlify/functions/m3u8-proxy?displayLanguage=en&acceptedSubtitles=${encodeURIComponent(captions)}&url=${encodeURIComponent(`${ride.vod_stream_url}?hdnea=${encodedToken}`)}`;
      } else if (ride.live_stream_url) {
        manifestUrl = `${ride.live_stream_url}?hdnea=${encodedToken}`;
        isLive = true;
      } else {
        throw new ExtractorError('Missing video URL', { expected: true });
      }
      const res = await extractM3u8FormatsAndSubtitles(this, manifestUrl, videoId, 'hls');
      formats = res.formats;
      subtitles = res.subtitles;
    }

    if (metadata.instructor_cues) {
      subtitles.cues = [{ data: JSON.stringify(metadata.instructor_cues), ext: 'json' }];
    }

    const category = str_or_none(ride.fitness_discipline_display_name);
    const chapters = ((metadata.segments?.segment_list as Array<Record<string, unknown>>) || []).map((segment) => ({
      start_time: segment.start_time_offset as number,
      end_time: (segment.start_time_offset as number) + (segment.length as number),
      title: str_or_none(segment.name) ?? undefined,
    }));

    return {
      id: videoId,
      title: str_or_none(ride.title) ?? undefined,
      formats,
      thumbnail: url_or_none(ride.image_url) ?? undefined,
      description: str_or_none(ride.description) ?? undefined,
      creator: traverse_obj(ride, ['instructor', 'name']) as string | undefined,
      release_timestamp: int_or_none(ride.original_air_time) ?? undefined,
      timestamp: int_or_none(ride.original_air_time) ?? undefined,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      duration: float_or_none(ride.length) ?? undefined,
      categories: category ? [category] : undefined,
      tags: ((ride.equipment_tags as Array<{ name?: string }>) || []).map((t) => t.name).filter(Boolean) as string[],
      is_live: isLive,
      chapters: chapters.length ? chapters : undefined,
    };
  }
}

export class PelotonLiveIE extends InfoExtractor {
  static IE_NAME = 'peloton:live';
  static _VALID_URL = /https?:\/\/members\.onepeloton\.com\/player\/live\/(?<id>[a-f0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const workoutId = this._match_id(url);
    const peloton = await this._download_json<Record<string, unknown>>(`https://api.onepeloton.com/api/peloton/${workoutId}`, workoutId);
    const rideId = str_or_none(peloton.ride_id);
    if (!rideId) throw new ExtractorError('Missing video ID', { expected: true });
    if (!peloton.is_live || peloton.is_encore || peloton.status !== 'PRE_START') {
      return this.url_result(`https://members.onepeloton.com/classes/player/${rideId}`, 'peloton', rideId);
    }
    throw new ExtractorError('Ride has not started', { expected: true });
  }
}
