/**
 * Hand-written batch M (maariv → mzaalo) — auto-rebuilt by port/rebuild-hand-m-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { MaarivIE } from './maariv';
import { MagellanTVIE } from './magellantv';
import { MagentaMusikIE } from './magentamusik';
import { MailRuIE, MailRuMusicIE, MailRuMusicSearchIE, MailRuMusicSearchBaseIE } from './mailru';
import { MainStreamingIE } from './mainstreaming';
import { MangomoloBaseIE, MangomoloLiveIE, MangomoloVideoIE } from './mangomolo';
import { ManyVidsIE } from './manyvids';
import { MaoriTVIE } from './maoritv';
import { MarkizaIE, MarkizaPageIE } from './markiza';
import { MassengeschmackTVIE } from './massengeschmacktv';
import { MastersIE } from './masters';
import { MatchiTVIE } from './matchitv';
import { MatchTVIE } from './matchtv';
import { MaveIE, MaveBaseIE, MaveChannelIE } from './mave';
import { MBNIE } from './mbn';
import { MDRIE } from './mdr';
import { MedalTVIE } from './medaltv';
import { MediaiteIE } from './mediaite';
import { MediaKlikkIE } from './mediaklikk';
import { MedialaanIE, MedialaanBaseIE } from './medialaan';
import { MediasetIE, MediasetShowIE } from './mediaset';
import { MediasiteIE, MediasiteCatalogIE, MediasiteNamedCatalogIE } from './mediasite';
import { MediaStreamIE, MediaStreamBaseIE, WinSportsVideoIE } from './mediastream';
import { MediaWorksNZVODIE } from './mediaworksnz';
import { MediciIE } from './medici';
import { MegaphoneIE } from './megaphone';
import { MegaTVComIE, MegaTVComBaseIE, MegaTVComEmbedIE } from './megatvcom';
import { MeipaiIE } from './meipai';
import { MelonVODIE } from './melonvod';
import { MetacriticIE } from './metacritic';
import { MGTVIE } from './mgtv';
import { MicrosoftBuildIE, MicrosoftEmbedIE, MicrosoftLearnEpisodeIE, MicrosoftLearnPlaylistIE, MicrosoftLearnSessionIE, MicrosoftMediusIE, MicrosoftMediusBaseIE } from './microsoftembed';
import { MindsIE, MindsBaseIE, MindsChannelIE, MindsGroupIE } from './minds';
import { Mir24TvIE } from './mir24tv';
import { MirrativIE, MirrativBaseIE, MirrativUserIE } from './mirrativ';
import { MirrorCoUKIE } from './mirrorcouk';
import { OCWMITIE, TechTVMITIE } from './mit';
import { MixchIE, MixchArchiveIE, MixchMovieIE } from './mixch';
import { MixcloudIE, MixcloudBaseIE, MixcloudPlaylistIE, MixcloudUserIE } from './mixcloud';
import { MixlrIE, MixlrRecoringIE } from './mixlr';
import { MLBIE, MLBArticleIE, MLBBaseIE, MLBTVIE, MLBVideoIE } from './mlb';
import { MLSSoccerIE } from './mlssoccer';
import { MochaVideoIE } from './mocha';
import { MojevideoIE } from './mojevideo';
import { MonstercatIE } from './monstercat';
import { MotorsportIE } from './motorsport';
import { MoviepilotIE } from './moviepilot';
import { MovingImageIE } from './movingimage';
import { MSNIE } from './msn';
import { MTVIE, MTVServicesBaseIE } from './mtv';
import { MuenchenTVIE } from './muenchentv';
import { MurrtubeIE, MurrtubeUserIE } from './murrtube';
import { MuseAIIE } from './museai';
import { MuseScoreIE } from './musescore';
import { MuxIE } from './mux';
import { Mx3IE, Mx3BaseIE, Mx3NeoIE, Mx3VolksmusikIE } from './mx3';
import { MxplayerIE, MxplayerBaseIE, MxplayerRedirectIE, MxplayerSeasonIE, MxplayerShowIE } from './mxplayer';
import { MySpaceIE, MySpaceAlbumIE } from './myspace';
import { MySpassIE } from './myspass';
import { MyVideoGeIE } from './myvideoge';
import { MyVidsterIE } from './myvidster';
import { MzaaloIE } from './mzaalo';

export type HandMEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_M_IES: HandMEntry[] = [
  { ie_key: 'Maariv', IE: MaarivIE },
  { ie_key: 'MagellanTV', IE: MagellanTVIE },
  { ie_key: 'MagentaMusik', IE: MagentaMusikIE },
  { ie_key: 'MailRu', IE: MailRuIE },
  { ie_key: 'MailRuMusic', IE: MailRuMusicIE },
  { ie_key: 'MailRuMusicSearch', IE: MailRuMusicSearchIE },
  { ie_key: 'MailRuMusicSearchBase', IE: MailRuMusicSearchBaseIE },
  { ie_key: 'MainStreaming', IE: MainStreamingIE },
  { ie_key: 'MangomoloBase', IE: MangomoloBaseIE },
  { ie_key: 'MangomoloLive', IE: MangomoloLiveIE },
  { ie_key: 'MangomoloVideo', IE: MangomoloVideoIE },
  { ie_key: 'ManyVids', IE: ManyVidsIE },
  { ie_key: 'MaoriTV', IE: MaoriTVIE },
  { ie_key: 'Markiza', IE: MarkizaIE },
  { ie_key: 'MarkizaPage', IE: MarkizaPageIE },
  { ie_key: 'MassengeschmackTV', IE: MassengeschmackTVIE },
  { ie_key: 'Masters', IE: MastersIE },
  { ie_key: 'MatchiTV', IE: MatchiTVIE },
  { ie_key: 'MatchTV', IE: MatchTVIE },
  { ie_key: 'Mave', IE: MaveIE },
  { ie_key: 'MaveBase', IE: MaveBaseIE },
  { ie_key: 'MaveChannel', IE: MaveChannelIE },
  { ie_key: 'MBN', IE: MBNIE },
  { ie_key: 'MDR', IE: MDRIE },
  { ie_key: 'MedalTV', IE: MedalTVIE },
  { ie_key: 'Mediaite', IE: MediaiteIE },
  { ie_key: 'MediaKlikk', IE: MediaKlikkIE },
  { ie_key: 'Medialaan', IE: MedialaanIE },
  { ie_key: 'MedialaanBase', IE: MedialaanBaseIE },
  { ie_key: 'Mediaset', IE: MediasetIE },
  { ie_key: 'MediasetShow', IE: MediasetShowIE },
  { ie_key: 'Mediasite', IE: MediasiteIE },
  { ie_key: 'MediasiteCatalog', IE: MediasiteCatalogIE },
  { ie_key: 'MediasiteNamedCatalog', IE: MediasiteNamedCatalogIE },
  { ie_key: 'MediaStream', IE: MediaStreamIE },
  { ie_key: 'MediaStreamBase', IE: MediaStreamBaseIE },
  { ie_key: 'MediaWorksNZVOD', IE: MediaWorksNZVODIE },
  { ie_key: 'Medici', IE: MediciIE },
  { ie_key: 'Megaphone', IE: MegaphoneIE },
  { ie_key: 'MegaTVCom', IE: MegaTVComIE },
  { ie_key: 'MegaTVComBase', IE: MegaTVComBaseIE },
  { ie_key: 'MegaTVComEmbed', IE: MegaTVComEmbedIE },
  { ie_key: 'Meipai', IE: MeipaiIE },
  { ie_key: 'MelonVOD', IE: MelonVODIE },
  { ie_key: 'Metacritic', IE: MetacriticIE },
  { ie_key: 'MGTV', IE: MGTVIE },
  { ie_key: 'MicrosoftBuild', IE: MicrosoftBuildIE },
  { ie_key: 'MicrosoftEmbed', IE: MicrosoftEmbedIE },
  { ie_key: 'MicrosoftLearnEpisode', IE: MicrosoftLearnEpisodeIE },
  { ie_key: 'MicrosoftLearnPlaylist', IE: MicrosoftLearnPlaylistIE },
  { ie_key: 'MicrosoftLearnSession', IE: MicrosoftLearnSessionIE },
  { ie_key: 'MicrosoftMedius', IE: MicrosoftMediusIE },
  { ie_key: 'MicrosoftMediusBase', IE: MicrosoftMediusBaseIE },
  { ie_key: 'Minds', IE: MindsIE },
  { ie_key: 'MindsBase', IE: MindsBaseIE },
  { ie_key: 'MindsChannel', IE: MindsChannelIE },
  { ie_key: 'MindsGroup', IE: MindsGroupIE },
  { ie_key: 'Mir24Tv', IE: Mir24TvIE },
  { ie_key: 'Mirrativ', IE: MirrativIE },
  { ie_key: 'MirrativBase', IE: MirrativBaseIE },
  { ie_key: 'MirrativUser', IE: MirrativUserIE },
  { ie_key: 'MirrorCoUK', IE: MirrorCoUKIE },
  { ie_key: 'Mixch', IE: MixchIE },
  { ie_key: 'MixchArchive', IE: MixchArchiveIE },
  { ie_key: 'MixchMovie', IE: MixchMovieIE },
  { ie_key: 'Mixcloud', IE: MixcloudIE },
  { ie_key: 'MixcloudBase', IE: MixcloudBaseIE },
  { ie_key: 'MixcloudPlaylist', IE: MixcloudPlaylistIE },
  { ie_key: 'MixcloudUser', IE: MixcloudUserIE },
  { ie_key: 'Mixlr', IE: MixlrIE },
  { ie_key: 'MixlrRecoring', IE: MixlrRecoringIE },
  { ie_key: 'MLB', IE: MLBIE },
  { ie_key: 'MLBArticle', IE: MLBArticleIE },
  { ie_key: 'MLBBase', IE: MLBBaseIE },
  { ie_key: 'MLBTV', IE: MLBTVIE },
  { ie_key: 'MLBVideo', IE: MLBVideoIE },
  { ie_key: 'MLSSoccer', IE: MLSSoccerIE },
  { ie_key: 'MochaVideo', IE: MochaVideoIE },
  { ie_key: 'Mojevideo', IE: MojevideoIE },
  { ie_key: 'Monstercat', IE: MonstercatIE },
  { ie_key: 'Motorsport', IE: MotorsportIE },
  { ie_key: 'Moviepilot', IE: MoviepilotIE },
  { ie_key: 'MovingImage', IE: MovingImageIE },
  { ie_key: 'MSN', IE: MSNIE },
  { ie_key: 'MTV', IE: MTVIE },
  { ie_key: 'MTVServicesBase', IE: MTVServicesBaseIE },
  { ie_key: 'MuenchenTV', IE: MuenchenTVIE },
  { ie_key: 'Murrtube', IE: MurrtubeIE },
  { ie_key: 'MurrtubeUser', IE: MurrtubeUserIE },
  { ie_key: 'MuseAI', IE: MuseAIIE },
  { ie_key: 'MuseScore', IE: MuseScoreIE },
  { ie_key: 'Mux', IE: MuxIE },
  { ie_key: 'Mx3', IE: Mx3IE },
  { ie_key: 'Mx3Base', IE: Mx3BaseIE },
  { ie_key: 'Mx3Neo', IE: Mx3NeoIE },
  { ie_key: 'Mx3Volksmusik', IE: Mx3VolksmusikIE },
  { ie_key: 'Mxplayer', IE: MxplayerIE },
  { ie_key: 'MxplayerBase', IE: MxplayerBaseIE },
  { ie_key: 'MxplayerRedirect', IE: MxplayerRedirectIE },
  { ie_key: 'MxplayerSeason', IE: MxplayerSeasonIE },
  { ie_key: 'MxplayerShow', IE: MxplayerShowIE },
  { ie_key: 'MySpace', IE: MySpaceIE },
  { ie_key: 'MySpaceAlbum', IE: MySpaceAlbumIE },
  { ie_key: 'MySpass', IE: MySpassIE },
  { ie_key: 'MyVideoGe', IE: MyVideoGeIE },
  { ie_key: 'MyVidster', IE: MyVidsterIE },
  { ie_key: 'Mzaalo', IE: MzaaloIE },
  { ie_key: 'OCWMIT', IE: OCWMITIE },
  { ie_key: 'TechTVMIT', IE: TechTVMITIE },
  { ie_key: 'WinSportsVideo', IE: WinSportsVideoIE },
];

export {
  MaarivIE,
  MagellanTVIE,
  MagentaMusikIE,
  MailRuIE,
  MailRuMusicIE,
  MailRuMusicSearchIE,
  MailRuMusicSearchBaseIE,
  MainStreamingIE,
  MangomoloBaseIE,
  MangomoloLiveIE,
  MangomoloVideoIE,
  ManyVidsIE,
  MaoriTVIE,
  MarkizaIE,
  MarkizaPageIE,
  MassengeschmackTVIE,
  MastersIE,
  MatchiTVIE,
  MatchTVIE,
  MaveIE,
  MaveBaseIE,
  MaveChannelIE,
  MBNIE,
  MDRIE,
  MedalTVIE,
  MediaiteIE,
  MediaKlikkIE,
  MedialaanIE,
  MedialaanBaseIE,
  MediasetIE,
  MediasetShowIE,
  MediasiteIE,
  MediasiteCatalogIE,
  MediasiteNamedCatalogIE,
  MediaStreamIE,
  MediaStreamBaseIE,
  MediaWorksNZVODIE,
  MediciIE,
  MegaphoneIE,
  MegaTVComIE,
  MegaTVComBaseIE,
  MegaTVComEmbedIE,
  MeipaiIE,
  MelonVODIE,
  MetacriticIE,
  MGTVIE,
  MicrosoftBuildIE,
  MicrosoftEmbedIE,
  MicrosoftLearnEpisodeIE,
  MicrosoftLearnPlaylistIE,
  MicrosoftLearnSessionIE,
  MicrosoftMediusIE,
  MicrosoftMediusBaseIE,
  MindsIE,
  MindsBaseIE,
  MindsChannelIE,
  MindsGroupIE,
  Mir24TvIE,
  MirrativIE,
  MirrativBaseIE,
  MirrativUserIE,
  MirrorCoUKIE,
  MixchIE,
  MixchArchiveIE,
  MixchMovieIE,
  MixcloudIE,
  MixcloudBaseIE,
  MixcloudPlaylistIE,
  MixcloudUserIE,
  MixlrIE,
  MixlrRecoringIE,
  MLBIE,
  MLBArticleIE,
  MLBBaseIE,
  MLBTVIE,
  MLBVideoIE,
  MLSSoccerIE,
  MochaVideoIE,
  MojevideoIE,
  MonstercatIE,
  MotorsportIE,
  MoviepilotIE,
  MovingImageIE,
  MSNIE,
  MTVIE,
  MTVServicesBaseIE,
  MuenchenTVIE,
  MurrtubeIE,
  MurrtubeUserIE,
  MuseAIIE,
  MuseScoreIE,
  MuxIE,
  Mx3IE,
  Mx3BaseIE,
  Mx3NeoIE,
  Mx3VolksmusikIE,
  MxplayerIE,
  MxplayerBaseIE,
  MxplayerRedirectIE,
  MxplayerSeasonIE,
  MxplayerShowIE,
  MySpaceIE,
  MySpaceAlbumIE,
  MySpassIE,
  MyVideoGeIE,
  MyVidsterIE,
  MzaaloIE,
  OCWMITIE,
  TechTVMITIE,
  WinSportsVideoIE,
};
