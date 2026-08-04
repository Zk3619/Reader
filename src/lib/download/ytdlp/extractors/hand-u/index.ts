// @ts-nocheck
/**
 * Hand-written batch U (udemy â†?ustudio) â€?auto-rebuilt by port/rebuild-hand-u-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { UdemyIE, UdemyCourseIE } from './udemy';
import { UDNEmbedIE } from './udn';
import { UFCTVIE } from './ufctv';
import { UkColumnIE } from './ukcolumn';
import { UlizaPlayerIE, UlizaPortalIE } from './uliza';
import { UMGDeIE } from './umg';
import { UnistraIE } from './unistra';
import { UnitedNationsWebTvIE } from './unitednations';
import { UnityIE } from './unity';
import { KnownDRMIE, KnownLiabilityIE, KnownPiracyIE } from './unsupported';
import { UOLIE } from './uol';
import { UplynkIE, UplynkBaseIE, UplynkPreplayIE } from './uplynk';
import { UrortIE } from './urort';
import { URPlayIE } from './urplay';
import { USANetworkIE } from './usanetwork';
import { USATodayIE } from './usatoday';
import { UstreamIE, UstreamChannelIE } from './ustream';
import { UstudioIE, UstudioEmbedIE } from './ustudio';

export type HandUEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_U_IES: HandUEntry[] = [
  { ie_key: 'KnownDRM', IE: KnownDRMIE },
  { ie_key: 'KnownLiability', IE: KnownLiabilityIE },
  { ie_key: 'KnownPiracy', IE: KnownPiracyIE },
  { ie_key: 'Udemy', IE: UdemyIE },
  { ie_key: 'UdemyCourse', IE: UdemyCourseIE },
  { ie_key: 'UDNEmbed', IE: UDNEmbedIE },
  { ie_key: 'UFCTV', IE: UFCTVIE },
  { ie_key: 'UkColumn', IE: UkColumnIE },
  { ie_key: 'UlizaPlayer', IE: UlizaPlayerIE },
  { ie_key: 'UlizaPortal', IE: UlizaPortalIE },
  { ie_key: 'UMGDe', IE: UMGDeIE },
  { ie_key: 'Unistra', IE: UnistraIE },
  { ie_key: 'UnitedNationsWebTv', IE: UnitedNationsWebTvIE },
  { ie_key: 'Unity', IE: UnityIE },
  { ie_key: 'UOL', IE: UOLIE },
  { ie_key: 'Uplynk', IE: UplynkIE },
  { ie_key: 'UplynkBase', IE: UplynkBaseIE },
  { ie_key: 'UplynkPreplay', IE: UplynkPreplayIE },
  { ie_key: 'Urort', IE: UrortIE },
  { ie_key: 'URPlay', IE: URPlayIE },
  { ie_key: 'USANetwork', IE: USANetworkIE },
  { ie_key: 'USAToday', IE: USATodayIE },
  { ie_key: 'Ustream', IE: UstreamIE },
  { ie_key: 'UstreamChannel', IE: UstreamChannelIE },
  { ie_key: 'Ustudio', IE: UstudioIE },
  { ie_key: 'UstudioEmbed', IE: UstudioEmbedIE },
];

export {
  KnownDRMIE,
  KnownLiabilityIE,
  KnownPiracyIE,
  UdemyIE,
  UdemyCourseIE,
  UDNEmbedIE,
  UFCTVIE,
  UkColumnIE,
  UlizaPlayerIE,
  UlizaPortalIE,
  UMGDeIE,
  UnistraIE,
  UnitedNationsWebTvIE,
  UnityIE,
  UOLIE,
  UplynkIE,
  UplynkBaseIE,
  UplynkPreplayIE,
  UrortIE,
  URPlayIE,
  USANetworkIE,
  USATodayIE,
  UstreamIE,
  UstreamChannelIE,
  UstudioIE,
  UstudioEmbedIE,
};
