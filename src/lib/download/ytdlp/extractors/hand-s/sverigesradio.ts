/** SverigesRadioBaseIE / SverigesRadioPublicationIE / SverigesRadioEpisodeIE — ported from yt-dlp sverigesradio.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  get_element_by_class,
  get_element_by_id,
  int_or_none,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';

abstract class SverigesRadioBaseImpl extends InfoExtractor {
  protected static _AUDIO_TYPE: string;

  protected async _realExtractImpl(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let audioId: string | undefined = m.groups!.id;
    const displayId = m.groups!.slug || audioId;
    if (!audioId) {
      const webpage = await this._download_webpage(url, String(displayId));
      const btnHtml = get_element_by_class('audio-button', webpage);
      audioId =
        (traverse_obj(extract_attributes(btnHtml || ''), ['data-audio-id', 'data-publication-id'], {
          get_all: false,
        }) as string | undefined) ||
        (this._parse_json<{ pageId?: string }>(get_element_by_id('gtm-metadata', webpage) || '{}', String(displayId))
          ?.pageId as string | undefined);
    }
    if (!audioId) throw new Error('Unable to extract audio id');
    const Ctor = this.constructor as typeof SverigesRadioBaseImpl;
    const query = { id: audioId, type: Ctor._AUDIO_TYPE };
    const item = (
      await this._download_json<{ items?: Record<string, unknown>[] }>(
        'https://sverigesradio.se/sida/playerajax/audiometadata',
        String(audioId),
        'Downloading audio JSON metadata',
        { query },
      )
    ).items?.[0]!;
    const urls: string[] = [];
    const formats: Format[] = [];
    const qualities = ['low', 'medium', 'high'];
    const extToCodec: Record<string, string> = { mp3: 'mp3', m4a: 'aac' };
    const codingFormatToAbr: Record<number, number> = { 5: 128, 11: 192, 12: 32, 13: 96 };
    for (const quality of qualities) {
      const audioUrlData =
        (await this._download_json<Record<string, unknown>>(
          'https://sverigesradio.se/sida/playerajax/getaudiourl',
          String(audioId),
          `Downloading ${quality} format JSON metadata`,
          { fatal: false, query: { ...query, format: 'iis', quality } },
        )) || {};
      const audioUrl = audioUrlData.audioUrl as string | undefined;
      if (!audioUrl || urls.includes(audioUrl)) continue;
      urls.push(audioUrl);
      const ext = determine_ext(audioUrl);
      const codingFormat = audioUrlData.codingFormat as number | undefined;
      const abr =
        int_or_none(this._search_regex(/_a(\d+)\.m4a/, audioUrl, 'audio bitrate', null, false)) ||
        (codingFormat != null ? codingFormatToAbr[codingFormat] : undefined);
      formats.push({
        abr,
        acodec: extToCodec[ext],
        ext,
        format_id: str_or_none(codingFormat) || ext,
        vcodec: 'none',
        url: audioUrl,
      });
    }
    return {
      id: String(audioId),
      formats,
      title: traverse_obj(item, ['subtitle']) as string | undefined,
      series: traverse_obj(item, ['title']) as string | undefined,
      duration: int_or_none(item.duration) ?? undefined,
      thumbnail: url_or_none(item.displayimageurl) || undefined,
      description: (item.description as string) || undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._realExtractImpl(url);
  }
}

export class SverigesRadioPublicationIE extends SverigesRadioBaseImpl {
  static IE_NAME = 'sverigesradio:publication';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?sverigesradio\.se\/(?:sida\/)?(?:artikel|gruppsida)(?:\.aspx\?.*?\bartikel=(?<id>[0-9]+)|\/(?<slug>[\w-]+))/;
  protected static _AUDIO_TYPE = 'publication';
}

export class SverigesRadioEpisodeIE extends SverigesRadioBaseImpl {
  static IE_NAME = 'sverigesradio:episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?sverigesradio\.se\/(?:sida\/)?avsnitt\/(?:(?<id>\d+)|(?<slug>[\w-]+))(?:$|[#?])/;
  protected static _AUDIO_TYPE = 'episode';
}
