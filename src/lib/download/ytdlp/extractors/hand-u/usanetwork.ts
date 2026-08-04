// @ts-nocheck
/** USANetworkIE â€?ported from yt-dlp usanetwork.py (extends NBCIE) */

import { NBCIE } from '../hand-n/nbc';

export class USANetworkIE extends NBCIE {
  static IE_NAME = 'usanetwork';
  static _VALID_URL =
    /https?(?<permalink>:\/\/(?:www\.)?usanetwork\.com\/(?:[^/]+\/videos?|movies?)\/(?:[^/]+\/)?(?<id>\d+))/;
}
