/**
 * Damtomo family — ported from yt-dlp damtomo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, unified_strdate } from '../../utils';
import { xmlTagText } from './_helpers';

export class DamtomoBaseIE extends InfoExtractor {
  static IE_NAME = 'damtomobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected static _WEBPAGE_URL_TMPL = '';
  protected static _DKML_XML_URL = '';
  protected static _DKML_XML_NS = '';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const C = this.constructor as typeof DamtomoBaseIE;
    const { webpage, finalUrl } = await this._download_webpage_with_url(
      C._WEBPAGE_URL_TMPL.replace('%s', videoId),
      videoId,
    );

    if (finalUrl === 'https://www.clubdam.com/sorry/') {
      throw new ExtractorError('You are rate-limited. Try again later.', { expected: true });
    }
    if (webpage.includes('<h2>')) {
      const errMatch = /<h2>([^<]+)<\/h2>/.exec(webpage);
      if (errMatch?.[1]?.includes('\u4e88\u671f')) {
        throw new ExtractorError('There is an error on server-side. Try again later.', { expected: true });
      }
    }

    const description = this._search_regex(
      /<div id="public_comment">\s*<p>\s*([^<]*?)\s*<\/p>/m,
      webpage,
      'description',
      null,
      false,
    );
    const uploaderId = this._search_regex(
      /<a href="https:\/\/www\.clubdam\.com\/app\/damtomo\/member\/info\/Profile\.do\?damtomoId=([^"]+)"/,
      webpage,
      'uploader_id',
      null,
      false,
    );

    const dataDict: Record<string, string> = {};
    for (const mobj of webpage.matchAll(/<(p|div)\s+class="([^" ]+?)">([\s\S]+?)<\/\1>/g)) {
      const cls = mobj[2];
      const value = mobj[3];
      if (cls && value) dataDict[cls] = clean_html(value)?.replace(/\s+/g, ' ') || '';
    }

    dataDict.user_name = (dataDict.user_name || '').replace(/\s*\u3055\u3093\s*$/, '');
    const title = dataDict.song_title;

    let streamXml = await this._download_webpage(C._DKML_XML_URL.replace('%s', videoId), videoId);
    streamXml = streamXml.replace(/\s*encoding="[^"]+?"/g, '');
    const m3u8Url = xmlTagText(streamXml, 'streamingUrl');
    if (!m3u8Url) throw new ExtractorError('Failed to obtain m3u8 URL');

    const formats = await this._extract_m3u8_formats(m3u8Url.trim(), videoId, 'mp4');

    return {
      id: videoId,
      title,
      uploader_id: uploaderId ?? undefined,
      description: description ?? undefined,
      uploader: dataDict.user_name || undefined,
      upload_date: unified_strdate(
        this._search_regex(/(\d{4}\/\d{2}\/\d{2})/, dataDict.date || '', 'upload_date', null, false),
      ) ?? undefined,
      view_count: int_or_none(this._search_regex(/(\d+)/, dataDict.audience || '', 'view_count', null, false)) ?? undefined,
      like_count: int_or_none(this._search_regex(/(\d+)/, dataDict.nice || '', 'like_count', null, false)) ?? undefined,
      track: title,
      artist: dataDict.song_artist || undefined,
      formats,
    };
  }

  protected async _download_webpage_with_url(
    pageUrl: string,
    videoId: string,
  ): Promise<{ webpage: string; finalUrl: string }> {
    const webpage = await this._download_webpage(pageUrl, videoId);
    return { webpage, finalUrl: pageUrl };
  }
}

export class DamtomoVideoIE extends DamtomoBaseIE {
  static IE_NAME = 'damtomo:video';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?clubdam\.com\/app\/damtomo\/(?:SP\/)?karaokeMovie\/StreamingDkm\.do\?karaokeMovieId=(?<id>\d+)/;
  protected static _WEBPAGE_URL_TMPL =
    'https://www.clubdam.com/app/damtomo/karaokeMovie/StreamingDkm.do?karaokeMovieId=%s';
  protected static _DKML_XML_URL =
    'https://www.clubdam.com/app/damtomo/karaokeMovie/GetStreamingDkmUrlXML.do?movieSelectFlg=2&karaokeMovieId=%s';
  protected static _DKML_XML_NS =
    'https://www.clubdam.com/app/damtomo/karaokeMovie/GetStreamingDkmUrlXML';
}

export class DamtomoRecordIE extends DamtomoBaseIE {
  static IE_NAME = 'damtomo:record';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?clubdam\.com\/app\/damtomo\/(?:SP\/)?karaokePost\/StreamingKrk\.do\?karaokeContributeId=(?<id>\d+)/;
  protected static _WEBPAGE_URL_TMPL =
    'https://www.clubdam.com/app/damtomo/karaokePost/StreamingKrk.do?karaokeContributeId=%s';
  protected static _DKML_XML_URL =
    'https://www.clubdam.com/app/damtomo/karaokePost/GetStreamingKrkUrlXML.do?karaokeContributeId=%s';
  protected static _DKML_XML_NS =
    'https://www.clubdam.com/app/damtomo/karaokePost/GetStreamingKrkUrlXML';
}
