/** SouthPark* IE classes — ported from yt-dlp southpark.py (extend MTVServicesBaseIE) */

import { MTVServicesBaseIE } from '../hand-m/mtv';

export class SouthParkIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.cc.com';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark(?:\.cc|studios)\.com\/(?:video-clips|episodes|collections)\/(?<id>[^?#]+)/;
}

export class SouthParkEsIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.cc.com:español';
  static _VALID_URL = /https?:\/\/(?:www\.)?southpark\.cc\.com\/es\/episodios\/(?<id>[^?#]+)/;
}

export class SouthParkDeIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.de';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark\.de\/(?:en\/)?(?:videoclip|collections|episodes|video-clips|folgen)\/(?<id>[^?#]+)/;
  static _GEO_COUNTRIES = ['DE'];
  static _GEO_BYPASS = true;
}

export class SouthParkLatIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.lat';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark\.lat\/(?:en\/)?(?:video-clips|collections|episodes|episodios)\/(?<id>[^?#]+)/;
}

export class SouthParkDkIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.nl';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark\.nl\/(?:en\/)?(?:video-clips|collections|episodes|afleveringen)\/(?<id>[^?#]+)/;
}

export class SouthParkComBrIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.com.br';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark\.com\.br\/(?:en\/)?(?:video-clips|collections|episodes|episodios)\/(?<id>[^?#]+)/;
}

export class SouthParkCoUkIE extends MTVServicesBaseIE {
  static IE_NAME = 'southpark.co.uk';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?southpark\.co\.uk\/(?:en\/)?(?:video-clips|collections|episodes|episodes)\/(?<id>[^?#]+)/;
}
