// @ts-nocheck
/** VH1IE â€?ported from yt-dlp vh1.py (extends MTVServicesBaseIE) */

import { MTVServicesBaseIE } from '../hand-m/mtv';

export class VH1IE extends MTVServicesBaseIE {
  static IE_NAME = 'vh1.com';
  static _VALID_URL = /https?:\/\/(?:www\.)?vh1\.com\/(?:video-clips|episodes)\/(?<id>[\da-z]{6})/;
}
