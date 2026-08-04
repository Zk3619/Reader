// @ts-nocheck
/**
 * Hand-written batch V (varzesh3 â†?vtv, skip existing Vimeo) â€?auto-rebuilt by port/rebuild-hand-v-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { Varzesh3IE } from './varzesh3';
import { Vbox7IE } from './vbox7';
import { VeoIE } from './veo';
import { VevoIE, VevoBaseIE, VevoPlaylistIE } from './vevo';
import { BTArticleIE, BTVestlendingenIE, VGTVIE } from './vgtv';
import { VH1IE } from './vh1';
import { ViceIE, ViceArticleIE, ViceBaseIE, ViceShowIE } from './vice';
import { ViddlerIE } from './viddler';
import { VideaIE } from './videa';
import { VideocampusSachsenIE, ViMPPlaylistIE } from './videocampus_sachsen';
import { VideoKenPlayerIE } from './videoken';
import { VideoPressIE } from './videopress';
import { VidflexIE } from './vidflex';
import { VidioIE, VidioBaseIE, VidioLiveIE, VidioPremierIE } from './vidio';
import { VidLiiIE } from './vidlii';
import { VidlyIE } from './vidly';
import { VidyardIE, VidyardBaseIE } from './vidyard';
import { ViewLiftIE, ViewLiftBaseIE, ViewLiftEmbedIE } from './viewlift';
import { ViideaIE } from './viidea';
import { VHXEmbedIE, VimeoAlbumIE, VimeoChannelIE, VimeoEventIE, VimeoGroupsIE, VimeoLikesIE, VimeoOndemandIE, VimeoProIE, VimeoReviewIE, VimeoUserIE, VimeoWatchLaterIE } from './vimeo';
import { ViouslyIE } from './viously';
import { ViqeoIE } from './viqeo';
import { VisirIE } from './visir';
import { ViuIE, ViuBaseIE, ViuOTTIE, ViuOTTIndonesiaIE, ViuOTTIndonesiaBaseIE, ViuPlaylistIE } from './viu';
import { VKIE, VKBaseIE, VKPlayIE, VKPlayBaseIE, VKPlayLiveIE, VKUserVideosIE, VKWallPostIE } from './vk';
import { VocarooIE } from './vocaroo';
import { VODPlatformIE } from './vodplatform';
import { VoicyIE, VoicyBaseIE, VoicyChannelIE } from './voicy';
import { VolejTVIE, VolejTVBaseIE, VolejTVCategoryPlaylistIE, VolejTVClubPlaylistIE, VolejTVPlaylistBaseIE } from './volejtv';
import { VoxMediaIE, VoxMediaVolumeIE } from './voxmedia';
import { VrSquareIE, VrSquareChannelIE, VrSquarePlaylistBaseIE, VrSquareSearchIE, VrSquareSectionIE } from './vrsquare';
import { DagelijkseKostIE, Radio1BeIE, VRTIE, VRTBaseIE, VrtNUIE } from './vrt';
import { VTMIE } from './vtm';
import { VTVIE, VTVGoIE } from './vtv';

export type HandVEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_V_IES: HandVEntry[] = [
  { ie_key: 'BTArticle', IE: BTArticleIE },
  { ie_key: 'BTVestlendingen', IE: BTVestlendingenIE },
  { ie_key: 'DagelijkseKost', IE: DagelijkseKostIE },
  { ie_key: 'Radio1Be', IE: Radio1BeIE },
  { ie_key: 'Varzesh3', IE: Varzesh3IE },
  { ie_key: 'Vbox7', IE: Vbox7IE },
  { ie_key: 'Veo', IE: VeoIE },
  { ie_key: 'Vevo', IE: VevoIE },
  { ie_key: 'VevoBase', IE: VevoBaseIE },
  { ie_key: 'VevoPlaylist', IE: VevoPlaylistIE },
  { ie_key: 'VGTV', IE: VGTVIE },
  { ie_key: 'VH1', IE: VH1IE },
  { ie_key: 'VHXEmbed', IE: VHXEmbedIE },
  { ie_key: 'Vice', IE: ViceIE },
  { ie_key: 'ViceArticle', IE: ViceArticleIE },
  { ie_key: 'ViceBase', IE: ViceBaseIE },
  { ie_key: 'ViceShow', IE: ViceShowIE },
  { ie_key: 'Viddler', IE: ViddlerIE },
  { ie_key: 'Videa', IE: VideaIE },
  { ie_key: 'VideocampusSachsen', IE: VideocampusSachsenIE },
  { ie_key: 'VideoKenPlayer', IE: VideoKenPlayerIE },
  { ie_key: 'VideoPress', IE: VideoPressIE },
  { ie_key: 'Vidflex', IE: VidflexIE },
  { ie_key: 'Vidio', IE: VidioIE },
  { ie_key: 'VidioBase', IE: VidioBaseIE },
  { ie_key: 'VidioLive', IE: VidioLiveIE },
  { ie_key: 'VidioPremier', IE: VidioPremierIE },
  { ie_key: 'VidLii', IE: VidLiiIE },
  { ie_key: 'Vidly', IE: VidlyIE },
  { ie_key: 'Vidyard', IE: VidyardIE },
  { ie_key: 'VidyardBase', IE: VidyardBaseIE },
  { ie_key: 'ViewLift', IE: ViewLiftIE },
  { ie_key: 'ViewLiftBase', IE: ViewLiftBaseIE },
  { ie_key: 'ViewLiftEmbed', IE: ViewLiftEmbedIE },
  { ie_key: 'Viidea', IE: ViideaIE },
  { ie_key: 'VimeoAlbum', IE: VimeoAlbumIE },
  { ie_key: 'VimeoChannel', IE: VimeoChannelIE },
  { ie_key: 'VimeoEvent', IE: VimeoEventIE },
  { ie_key: 'VimeoGroups', IE: VimeoGroupsIE },
  { ie_key: 'VimeoLikes', IE: VimeoLikesIE },
  { ie_key: 'VimeoOndemand', IE: VimeoOndemandIE },
  { ie_key: 'VimeoPro', IE: VimeoProIE },
  { ie_key: 'VimeoReview', IE: VimeoReviewIE },
  { ie_key: 'VimeoUser', IE: VimeoUserIE },
  { ie_key: 'VimeoWatchLater', IE: VimeoWatchLaterIE },
  { ie_key: 'ViMPPlaylist', IE: ViMPPlaylistIE },
  { ie_key: 'Viously', IE: ViouslyIE },
  { ie_key: 'Viqeo', IE: ViqeoIE },
  { ie_key: 'Visir', IE: VisirIE },
  { ie_key: 'Viu', IE: ViuIE },
  { ie_key: 'ViuBase', IE: ViuBaseIE },
  { ie_key: 'ViuOTT', IE: ViuOTTIE },
  { ie_key: 'ViuOTTIndonesia', IE: ViuOTTIndonesiaIE },
  { ie_key: 'ViuOTTIndonesiaBase', IE: ViuOTTIndonesiaBaseIE },
  { ie_key: 'ViuPlaylist', IE: ViuPlaylistIE },
  { ie_key: 'VK', IE: VKIE },
  { ie_key: 'VKBase', IE: VKBaseIE },
  { ie_key: 'VKPlay', IE: VKPlayIE },
  { ie_key: 'VKPlayBase', IE: VKPlayBaseIE },
  { ie_key: 'VKPlayLive', IE: VKPlayLiveIE },
  { ie_key: 'VKUserVideos', IE: VKUserVideosIE },
  { ie_key: 'VKWallPost', IE: VKWallPostIE },
  { ie_key: 'Vocaroo', IE: VocarooIE },
  { ie_key: 'VODPlatform', IE: VODPlatformIE },
  { ie_key: 'Voicy', IE: VoicyIE },
  { ie_key: 'VoicyBase', IE: VoicyBaseIE },
  { ie_key: 'VoicyChannel', IE: VoicyChannelIE },
  { ie_key: 'VolejTV', IE: VolejTVIE },
  { ie_key: 'VolejTVBase', IE: VolejTVBaseIE },
  { ie_key: 'VolejTVCategoryPlaylist', IE: VolejTVCategoryPlaylistIE },
  { ie_key: 'VolejTVClubPlaylist', IE: VolejTVClubPlaylistIE },
  { ie_key: 'VolejTVPlaylistBase', IE: VolejTVPlaylistBaseIE },
  { ie_key: 'VoxMedia', IE: VoxMediaIE },
  { ie_key: 'VoxMediaVolume', IE: VoxMediaVolumeIE },
  { ie_key: 'VrSquare', IE: VrSquareIE },
  { ie_key: 'VrSquareChannel', IE: VrSquareChannelIE },
  { ie_key: 'VrSquarePlaylistBase', IE: VrSquarePlaylistBaseIE },
  { ie_key: 'VrSquareSearch', IE: VrSquareSearchIE },
  { ie_key: 'VrSquareSection', IE: VrSquareSectionIE },
  { ie_key: 'VRT', IE: VRTIE },
  { ie_key: 'VRTBase', IE: VRTBaseIE },
  { ie_key: 'VrtNU', IE: VrtNUIE },
  { ie_key: 'VTM', IE: VTMIE },
  { ie_key: 'VTV', IE: VTVIE },
  { ie_key: 'VTVGo', IE: VTVGoIE },
];

export {
  BTArticleIE,
  BTVestlendingenIE,
  DagelijkseKostIE,
  Radio1BeIE,
  Varzesh3IE,
  Vbox7IE,
  VeoIE,
  VevoIE,
  VevoBaseIE,
  VevoPlaylistIE,
  VGTVIE,
  VH1IE,
  VHXEmbedIE,
  ViceIE,
  ViceArticleIE,
  ViceBaseIE,
  ViceShowIE,
  ViddlerIE,
  VideaIE,
  VideocampusSachsenIE,
  VideoKenPlayerIE,
  VideoPressIE,
  VidflexIE,
  VidioIE,
  VidioBaseIE,
  VidioLiveIE,
  VidioPremierIE,
  VidLiiIE,
  VidlyIE,
  VidyardIE,
  VidyardBaseIE,
  ViewLiftIE,
  ViewLiftBaseIE,
  ViewLiftEmbedIE,
  ViideaIE,
  VimeoAlbumIE,
  VimeoChannelIE,
  VimeoEventIE,
  VimeoGroupsIE,
  VimeoLikesIE,
  VimeoOndemandIE,
  VimeoProIE,
  VimeoReviewIE,
  VimeoUserIE,
  VimeoWatchLaterIE,
  ViMPPlaylistIE,
  ViouslyIE,
  ViqeoIE,
  VisirIE,
  ViuIE,
  ViuBaseIE,
  ViuOTTIE,
  ViuOTTIndonesiaIE,
  ViuOTTIndonesiaBaseIE,
  ViuPlaylistIE,
  VKIE,
  VKBaseIE,
  VKPlayIE,
  VKPlayBaseIE,
  VKPlayLiveIE,
  VKUserVideosIE,
  VKWallPostIE,
  VocarooIE,
  VODPlatformIE,
  VoicyIE,
  VoicyBaseIE,
  VoicyChannelIE,
  VolejTVIE,
  VolejTVBaseIE,
  VolejTVCategoryPlaylistIE,
  VolejTVClubPlaylistIE,
  VolejTVPlaylistBaseIE,
  VoxMediaIE,
  VoxMediaVolumeIE,
  VrSquareIE,
  VrSquareChannelIE,
  VrSquarePlaylistBaseIE,
  VrSquareSearchIE,
  VrSquareSectionIE,
  VRTIE,
  VRTBaseIE,
  VrtNUIE,
  VTMIE,
  VTVIE,
  VTVGoIE,
};
