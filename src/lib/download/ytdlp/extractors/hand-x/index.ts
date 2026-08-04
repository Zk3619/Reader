// @ts-nocheck
/**
 * Hand-written batch X (xboxclips â†?xxxymovies, skip XiaoHongShu) â€?auto-rebuilt by port/rebuild-hand-x-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { XboxClipsIE } from './xboxclips';
import { XHamsterIE, XHamsterEmbedIE, XHamsterUserIE } from './xhamster';
import { XimalayaIE, XimalayaAlbumIE, XimalayaBaseIE } from './ximalaya';
import { XinpianchangIE } from './xinpianchang';
import { XMinusIE } from './xminus';
import { XNXXIE } from './xnxx';
import { XVideosIE, XVideosQuickiesIE } from './xvideos';
import { XXXYMoviesIE } from './xxxymovies';

export type HandXEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_X_IES: HandXEntry[] = [
  { ie_key: 'XboxClips', IE: XboxClipsIE },
  { ie_key: 'XHamster', IE: XHamsterIE },
  { ie_key: 'XHamsterEmbed', IE: XHamsterEmbedIE },
  { ie_key: 'XHamsterUser', IE: XHamsterUserIE },
  { ie_key: 'Ximalaya', IE: XimalayaIE },
  { ie_key: 'XimalayaAlbum', IE: XimalayaAlbumIE },
  { ie_key: 'XimalayaBase', IE: XimalayaBaseIE },
  { ie_key: 'Xinpianchang', IE: XinpianchangIE },
  { ie_key: 'XMinus', IE: XMinusIE },
  { ie_key: 'XNXX', IE: XNXXIE },
  { ie_key: 'XVideos', IE: XVideosIE },
  { ie_key: 'XVideosQuickies', IE: XVideosQuickiesIE },
  { ie_key: 'XXXYMovies', IE: XXXYMoviesIE },
];

export {
  XboxClipsIE,
  XHamsterIE,
  XHamsterEmbedIE,
  XHamsterUserIE,
  XimalayaIE,
  XimalayaAlbumIE,
  XimalayaBaseIE,
  XinpianchangIE,
  XMinusIE,
  XNXXIE,
  XVideosIE,
  XVideosQuickiesIE,
  XXXYMoviesIE,
};
