/**
 * Built-in extractors registration + generated stub registry.
 */

import { registerExtractor, markRegistryLoaded } from '../registry';
import type { ExtractorEntry } from '../types';
import { InfoExtractor } from '../common';
import { GenericIE } from './generic';
import { YoutubeIE } from './youtube';
import { BilibiliIE } from './bilibili';
import { buildGeneratedExtractorEntries } from './generated-registry';

type IEConstructor = {
  new (): InfoExtractor;
  IE_NAME: string;
  _VALID_URL?: RegExp | string | false | null;
};

function entryFromIE(IE: IEConstructor, ie_key: string): ExtractorEntry {
  const valid = IE._VALID_URL ?? null;
  return {
    ie_key,
    ie_name: IE.IE_NAME,
    valid_url:
      valid instanceof RegExp
        ? valid.source
        : typeof valid === 'string'
          ? valid
          : valid === false
            ? false
            : null,
    valid_url_re: valid instanceof RegExp ? valid : undefined,
    implemented: true,
    create: () => new IE(),
  };
}

/** Concrete implementations — registered first (higher priority than stubs). */
export function registerBuiltinExtractors(): void {
  // Site-specific before generic
  registerExtractor(entryFromIE(YoutubeIE, 'Youtube'));
  registerExtractor(entryFromIE(BilibiliIE, 'BiliBili'));

  // Generated stubs for the full yt-dlp surface
  for (const entry of buildGeneratedExtractorEntries()) {
    registerExtractor(entry);
  }

  // Generic always last among matchers (registry skips it until end)
  registerExtractor(entryFromIE(GenericIE, 'Generic'));

  markRegistryLoaded();
}

// Auto-register on import
registerBuiltinExtractors();

export { GenericIE, YoutubeIE, BilibiliIE };
export { GENERATED_EXTRACTOR_DEFS, buildGeneratedExtractorEntries } from './generated-registry';
