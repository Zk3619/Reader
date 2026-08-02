/**
 * NationalGeographicTVIE — ported from yt-dlp nationalgeographic.py
 */

import { FOXIE } from '../hand-f/fox';

export class NationalGeographicTVIE extends FOXIE {
  static IE_NAME = 'nationalgeographictv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nationalgeographic\.com\/tv\/watch\/(?<id>[\da-fA-F]+)/;

  protected _HOME_PAGE_URL = 'https://www.nationalgeographic.com/tv/';
  protected _API_KEY = '238bb0a0c2aba67922c48709ce0c06fd';
}
