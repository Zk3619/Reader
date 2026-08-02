/**
 * Hand-written batch E (ebaumsworld → expressen) — auto-rebuilt by port/rebuild-hand-e-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { EbaumsWorldIE } from './ebaumsworld';
import { EbayIE } from './ebay';
import { EggheadBaseIE, EggheadCourseIE, EggheadLessonIE } from './egghead';
import { EggsIE, EggsArtistIE, EggsBaseIE } from './eggs';
import { ElementorEmbedIE } from './elementorembed';
import { ElonetIE } from './elonet';
import { ElPaisIE } from './elpais';
import { ElTreceTVIE } from './eltrecetv';
import { EmbedlyIE } from './embedly';
import { EpiconIE, EpiconSeriesIE } from './epicon';
import { EpidemicSoundIE } from './epidemicsound';
import { EplusIbIE } from './eplus';
import { EpochIE } from './epoch';
import { EpornerIE } from './eporner';
import { ErocastIE } from './erocast';
import { EroProfileIE, EroProfileAlbumIE } from './eroprofile';
import { ERRArhiivIE, ERRJupiterIE } from './err';
import { ERTFlixIE, ERTFlixBaseIE, ERTFlixCodenameIE, ERTWebtvEmbedIE } from './ertgr';
import { ESPNIE, ESPNArticleIE, ESPNCricInfoIE, FiveThirtyEightIE, WatchESPNIE } from './espn';
import { EttuTvIE } from './ettutv';
import { EuropaIE, EuroParlWebstreamIE } from './europa';
import { EuropeanTourIE } from './europeantour';
import { EurosportIE } from './eurosport';
import { EUScreenIE } from './euscreen';
import { ExpressenIE } from './expressen';

export type HandEEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_E_IES: HandEEntry[] = [
  { ie_key: 'EbaumsWorld', IE: EbaumsWorldIE },
  { ie_key: 'Ebay', IE: EbayIE },
  { ie_key: 'EggheadBase', IE: EggheadBaseIE },
  { ie_key: 'EggheadCourse', IE: EggheadCourseIE },
  { ie_key: 'EggheadLesson', IE: EggheadLessonIE },
  { ie_key: 'Eggs', IE: EggsIE },
  { ie_key: 'EggsArtist', IE: EggsArtistIE },
  { ie_key: 'EggsBase', IE: EggsBaseIE },
  { ie_key: 'ElementorEmbed', IE: ElementorEmbedIE },
  { ie_key: 'Elonet', IE: ElonetIE },
  { ie_key: 'ElPais', IE: ElPaisIE },
  { ie_key: 'ElTreceTV', IE: ElTreceTVIE },
  { ie_key: 'Embedly', IE: EmbedlyIE },
  { ie_key: 'Epicon', IE: EpiconIE },
  { ie_key: 'EpiconSeries', IE: EpiconSeriesIE },
  { ie_key: 'EpidemicSound', IE: EpidemicSoundIE },
  { ie_key: 'EplusIb', IE: EplusIbIE },
  { ie_key: 'Epoch', IE: EpochIE },
  { ie_key: 'Eporner', IE: EpornerIE },
  { ie_key: 'Erocast', IE: ErocastIE },
  { ie_key: 'EroProfile', IE: EroProfileIE },
  { ie_key: 'EroProfileAlbum', IE: EroProfileAlbumIE },
  { ie_key: 'ERRArhiiv', IE: ERRArhiivIE },
  { ie_key: 'ERRJupiter', IE: ERRJupiterIE },
  { ie_key: 'ERTFlix', IE: ERTFlixIE },
  { ie_key: 'ERTFlixBase', IE: ERTFlixBaseIE },
  { ie_key: 'ERTFlixCodename', IE: ERTFlixCodenameIE },
  { ie_key: 'ERTWebtvEmbed', IE: ERTWebtvEmbedIE },
  { ie_key: 'ESPN', IE: ESPNIE },
  { ie_key: 'ESPNArticle', IE: ESPNArticleIE },
  { ie_key: 'ESPNCricInfo', IE: ESPNCricInfoIE },
  { ie_key: 'EttuTv', IE: EttuTvIE },
  { ie_key: 'Europa', IE: EuropaIE },
  { ie_key: 'EuroParlWebstream', IE: EuroParlWebstreamIE },
  { ie_key: 'EuropeanTour', IE: EuropeanTourIE },
  { ie_key: 'Eurosport', IE: EurosportIE },
  { ie_key: 'EUScreen', IE: EUScreenIE },
  { ie_key: 'Expressen', IE: ExpressenIE },
  { ie_key: 'FiveThirtyEight', IE: FiveThirtyEightIE },
  { ie_key: 'WatchESPN', IE: WatchESPNIE },
];

export {
  EbaumsWorldIE,
  EbayIE,
  EggheadBaseIE,
  EggheadCourseIE,
  EggheadLessonIE,
  EggsIE,
  EggsArtistIE,
  EggsBaseIE,
  ElementorEmbedIE,
  ElonetIE,
  ElPaisIE,
  ElTreceTVIE,
  EmbedlyIE,
  EpiconIE,
  EpiconSeriesIE,
  EpidemicSoundIE,
  EplusIbIE,
  EpochIE,
  EpornerIE,
  ErocastIE,
  EroProfileIE,
  EroProfileAlbumIE,
  ERRArhiivIE,
  ERRJupiterIE,
  ERTFlixIE,
  ERTFlixBaseIE,
  ERTFlixCodenameIE,
  ERTWebtvEmbedIE,
  ESPNIE,
  ESPNArticleIE,
  ESPNCricInfoIE,
  EttuTvIE,
  EuropaIE,
  EuroParlWebstreamIE,
  EuropeanTourIE,
  EurosportIE,
  EUScreenIE,
  ExpressenIE,
  FiveThirtyEightIE,
  WatchESPNIE,
};
