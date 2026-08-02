/**
 * Hand-written batch H (harpodeon → hytale) — auto-rebuilt by port/rebuild-hand-h-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { HarpodeonIE } from './harpodeon';
import { HBOIE, HBOBaseIE } from './hbo';
import { HearThisAtIE } from './hearthisat';
import { HeiseIE } from './heise';
import { HellPornoIE } from './hellporno';
import { HGTVComShowIE } from './hgtv';
import { HiDiveIE } from './hidive';
import { HistoricFilmsIE } from './historicfilms';
import { HitRecordIE } from './hitrecord';
import { HollywoodReporterIE, HollywoodReporterPlaylistIE } from './hollywoodreporter';
import { HolodexIE } from './holodex';
import { HotNewHipHopIE } from './hotnewhiphop';
import { HotStarIE, HotStarBaseIE, HotStarPrefixIE, HotStarSeriesIE } from './hotstar';
import { HrefLiRedirectIE } from './hrefli';
import { HRFernsehenIE } from './hrfensehen';
import { HRTiIE, HRTiBaseIE, HRTiPlaylistIE } from './hrti';
import { HSEProductIE, HSEShowIE, HSEShowBaseIE } from './hse';
import { HuajiaoIE } from './huajiao';
import { HuffPostIE } from './huffpost';
import { HungamaIE, HungamaAlbumPlaylistIE, HungamaBaseIE, HungamaSongIE } from './hungama';
import { HuyaLiveIE, HuyaVideoIE } from './huya';
import { HypemIE } from './hypem';
import { MonsterSirenHypergryphMusicIE } from './hypergryph';
import { HytaleIE } from './hytale';

export type HandHEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_H_IES: HandHEntry[] = [
  { ie_key: 'Harpodeon', IE: HarpodeonIE },
  { ie_key: 'HBO', IE: HBOIE },
  { ie_key: 'HBOBase', IE: HBOBaseIE },
  { ie_key: 'HearThisAt', IE: HearThisAtIE },
  { ie_key: 'Heise', IE: HeiseIE },
  { ie_key: 'HellPorno', IE: HellPornoIE },
  { ie_key: 'HGTVComShow', IE: HGTVComShowIE },
  { ie_key: 'HiDive', IE: HiDiveIE },
  { ie_key: 'HistoricFilms', IE: HistoricFilmsIE },
  { ie_key: 'HitRecord', IE: HitRecordIE },
  { ie_key: 'HollywoodReporter', IE: HollywoodReporterIE },
  { ie_key: 'HollywoodReporterPlaylist', IE: HollywoodReporterPlaylistIE },
  { ie_key: 'Holodex', IE: HolodexIE },
  { ie_key: 'HotNewHipHop', IE: HotNewHipHopIE },
  { ie_key: 'HotStar', IE: HotStarIE },
  { ie_key: 'HotStarBase', IE: HotStarBaseIE },
  { ie_key: 'HotStarPrefix', IE: HotStarPrefixIE },
  { ie_key: 'HotStarSeries', IE: HotStarSeriesIE },
  { ie_key: 'HrefLiRedirect', IE: HrefLiRedirectIE },
  { ie_key: 'HRFernsehen', IE: HRFernsehenIE },
  { ie_key: 'HRTi', IE: HRTiIE },
  { ie_key: 'HRTiBase', IE: HRTiBaseIE },
  { ie_key: 'HRTiPlaylist', IE: HRTiPlaylistIE },
  { ie_key: 'HSEProduct', IE: HSEProductIE },
  { ie_key: 'HSEShow', IE: HSEShowIE },
  { ie_key: 'HSEShowBase', IE: HSEShowBaseIE },
  { ie_key: 'Huajiao', IE: HuajiaoIE },
  { ie_key: 'HuffPost', IE: HuffPostIE },
  { ie_key: 'Hungama', IE: HungamaIE },
  { ie_key: 'HungamaAlbumPlaylist', IE: HungamaAlbumPlaylistIE },
  { ie_key: 'HungamaBase', IE: HungamaBaseIE },
  { ie_key: 'HungamaSong', IE: HungamaSongIE },
  { ie_key: 'HuyaLive', IE: HuyaLiveIE },
  { ie_key: 'HuyaVideo', IE: HuyaVideoIE },
  { ie_key: 'Hypem', IE: HypemIE },
  { ie_key: 'Hytale', IE: HytaleIE },
  { ie_key: 'MonsterSirenHypergryphMusic', IE: MonsterSirenHypergryphMusicIE },
];

export {
  HarpodeonIE,
  HBOIE,
  HBOBaseIE,
  HearThisAtIE,
  HeiseIE,
  HellPornoIE,
  HGTVComShowIE,
  HiDiveIE,
  HistoricFilmsIE,
  HitRecordIE,
  HollywoodReporterIE,
  HollywoodReporterPlaylistIE,
  HolodexIE,
  HotNewHipHopIE,
  HotStarIE,
  HotStarBaseIE,
  HotStarPrefixIE,
  HotStarSeriesIE,
  HrefLiRedirectIE,
  HRFernsehenIE,
  HRTiIE,
  HRTiBaseIE,
  HRTiPlaylistIE,
  HSEProductIE,
  HSEShowIE,
  HSEShowBaseIE,
  HuajiaoIE,
  HuffPostIE,
  HungamaIE,
  HungamaAlbumPlaylistIE,
  HungamaBaseIE,
  HungamaSongIE,
  HuyaLiveIE,
  HuyaVideoIE,
  HypemIE,
  HytaleIE,
  MonsterSirenHypergryphMusicIE,
};
