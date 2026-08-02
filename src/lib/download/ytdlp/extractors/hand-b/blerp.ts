/**
 * BlerpIE — ported from yt-dlp blerp.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { stripOrNone } from './_helpers';

const GRAPHQL_QUERY = `query webBitePageGetBite($_id: MongoID!) {
    web {
        biteById(_id: $_id) {
            ...bitePageFrag
            __typename
        }
        __typename
    }
}

fragment bitePageFrag on Bite {
    _id
    title
    userKeywords
    keywords
    color
    visibility
    isPremium
    owned
    price
    extraReview
    isAudioExists
    image {
        filename
        original {
            url
            __typename
        }
        __typename
    }
    userReactions {
        _id
        reactions
        createdAt
        __typename
    }
    topReactions
    totalSaveCount
    saved
    blerpLibraryType
    license
    licenseMetaData
    playCount
    totalShareCount
    totalFavoriteCount
    totalAddedToBoardCount
    userCategory
    userAudioQuality
    audioCreationState
    transcription
    userTranscription
    description
    createdAt
    updatedAt
    author
    listingType
    ownerObject {
        _id
        username
        profileImage {
            filename
            original {
                url
                __typename
            }
            __typename
        }
        __typename
    }
    transcription
    favorited
    visibility
    isCurated
    sourceUrl
    audienceRating
    strictAudienceRating
    ownerId
    reportObject {
        reportedContentStatus
        __typename
    }
    giphy {
        mp4
        gif
        __typename
    }
    audio {
        filename
        original {
            url
            __typename
        }
        mp3 {
            url
            __typename
        }
        __typename
    }
    __typename
}
`;

export class BlerpIE extends InfoExtractor {
  static IE_NAME = 'blerp';
  static _VALID_URL = /https?:\/\/(?:www\.)?blerp\.com\/soundbites\/(?<id>[0-9a-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);

    const jsonResult = await this._download_json<{ data: { web: { biteById: Record<string, unknown> } } }>(
      'https://api.blerp.com/graphql',
      audioId,
      undefined,
      {
        method: 'POST',
        data: JSON.stringify({
          operationName: 'webBitePageGetBite',
          query: GRAPHQL_QUERY,
          variables: { _id: audioId },
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const biteJson = jsonResult.data.web.biteById;
    const owner = (biteJson.ownerObject as Record<string, unknown>) || {};
    const keywords = (traverse_obj(biteJson, ['userKeywords']) as unknown[]) || [];

    return {
      id: (biteJson._id as string) || audioId,
      url: (((biteJson.audio as Record<string, unknown>)?.mp3 as Record<string, unknown>)?.url as string) || '',
      title: (biteJson.title as string) || audioId,
      uploader: stripOrNone(owner.username) || undefined,
      uploader_id: stripOrNone(owner._id) || undefined,
      ext: 'mp3',
      tags: keywords.map((k) => stripOrNone(k)).filter((k): k is string => !!k),
    };
  }
}
