/** PalcoMP3BaseIE / PalcoMP3IE / PalcoMP3ArtistIE / PalcoMP3VideoIE — ported from yt-dlp palcomp3.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, try_get } from '../../utils';

export class PalcoMP3BaseIE extends InfoExtractor {
  static IE_NAME = 'palcomp3base';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _GQL_QUERY_TMPL = '{\n  artist(slug: "%s") {\n    %s\n  }\n}';
  protected _ARTIST_FIELDS_TMPL = 'music(slug: "%s") {\n      %s\n    }';
  protected _MUSIC_FIELDS = `duration
      hls
      mp3File
      musicID
      plays
      title`;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('PalcoMP3BaseIE is not a standalone extractor');
  }

  protected async _callApi(artistSlug: string, artistFields: string): Promise<Record<string, unknown>> {
    const query = `{ artist(slug: "${artistSlug}") { ${artistFields} } }`;
    const resp = await this._download_json<{ data: Record<string, unknown> }>(
      'https://www.palcomp3.com.br/graphql/',
      artistSlug,
      undefined,
      { query: { query } },
    );
    return (resp.data as Record<string, unknown>) || {};
  }

  protected _parseMusic(music: Record<string, unknown>): VideoInfo {
    const musicId = String(music.musicID ?? '');
    const formats: Format[] = [];
    const hlsUrl = str_or_none(music.hls);
    if (hlsUrl) {
      formats.push({ url: hlsUrl, format_id: 'hls', protocol: 'm3u8_native', ext: 'mp4' });
    }
    const mp3File = str_or_none(music.mp3File);
    if (mp3File) formats.push({ url: mp3File, format_id: 'mp3' });
    return {
      id: musicId,
      title: str_or_none(music.title) ?? undefined,
      formats,
      duration: int_or_none(music.duration) ?? undefined,
      view_count: int_or_none(music.plays) ?? undefined,
    };
  }
}

export class PalcoMP3IE extends PalcoMP3BaseIE {
  static IE_NAME = 'PalcoMP3:song';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?palcomp3\.com(?:\.br)?\/(?<artist>[^/]+)\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const artistSlug = m.groups?.artist!;
    const musicSlug = m.groups?.id!;
    const artistFields = `music(slug: "${musicSlug}") { ${this._MUSIC_FIELDS} }`;
    const data = await this._callApi(artistSlug, artistFields);
    const music = ((data.artist as Record<string, unknown>)?.music as Record<string, unknown>) || {};
    return this._parseMusic(music);
  }
}

export class PalcoMP3ArtistIE extends PalcoMP3BaseIE {
  static IE_NAME = 'PalcoMP3:artist';
  static _VALID_URL = /https?:\/\/(?:www\.)?palcomp3\.com(?:\.br)?\/(?<id>[^/?&#]+)/;
  protected override _ARTIST_FIELDS_TMPL = `artistID
    musics {
      nodes {
        duration
      hls
      mp3File
      musicID
      plays
      title
      }
    }
    name`;

  async _real_extract(url: string): Promise<VideoInfo> {
    const artistSlug = this._match_id(url);
    const data = await this._callApi(artistSlug, this._ARTIST_FIELDS_TMPL);
    const artist = (data.artist as Record<string, unknown>) || {};
    const nodes = (try_get(artist, (x) => (x.musics as Record<string, unknown>)?.nodes, (v) => Array.isArray(v)) ||
      []) as Record<string, unknown>[];
    const entries = nodes.map((music) => this._parseMusic(music));
    return this.playlist_result(entries, str_or_none(artist.artistID) ?? undefined, str_or_none(artist.name) ?? undefined);
  }
}

export class PalcoMP3VideoIE extends PalcoMP3BaseIE {
  static IE_NAME = 'PalcoMP3:video';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?palcomp3\.com(?:\.br)?\/(?<artist>[^/]+)\/(?<id>[^/?&#]+)\/?#clipe/;
  protected override _MUSIC_FIELDS = 'youtubeID';

  protected override _parseMusic(music: Record<string, unknown>): VideoInfo {
    const youtubeId = String(music.youtubeID ?? '');
    return this.url_result(youtubeId, 'Youtube', youtubeId);
  }
}
