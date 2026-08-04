// @ts-nocheck
/** UFCTVIE â€?ported from yt-dlp ufctv.py */

import { ImgGamingBaseIE } from '../hand-i/imggaming';

export class UFCTVIE extends ImgGamingBaseIE {
  static IE_NAME = 'ufctv';
  static _NETRC_MACHINE = 'ufctv';
  static _VALID_URL =
    /https?:\/\/(?<domain>(?:(?:app|www)\.)?(?:ufc\.tv|(?:ufc)?fightpass\.com)|ufcfightpass\.img(?:dge|gaming)\.com)\/(?<type>live|playlist|video)\/(?<id>\d+)(?:\?.*?\bplaylistId=(?<playlist_id>\d+))?/;

  protected _REALM = 'ufc';
}
