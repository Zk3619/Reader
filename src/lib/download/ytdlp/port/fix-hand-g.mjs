#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extractors/hand-g');
const helperImport = "import { extractM3u8FormatsAndSubtitles, urlencodePostdata, urljoin, htmlExtractTitle, stripOrNone } from './_helpers';";

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.ts') || f === 'index.ts' || f === '_helpers.ts') continue;
  let t = fs.readFileSync(path.join(dir, f), 'utf8');
  const orig = t;

  t = t.replace(/await this\._extract_m3u8_formats_and_subtitles\(/g, 'await extractM3u8FormatsAndSubtitles(this, ');
  t = t.replace(/this\._extract_m3u8_formats_and_subtitles\(/g, 'extractM3u8FormatsAndSubtitles(this, ');
  t = t.replace(/\[(formats|fmts), (subtitles|subs)\] = await extractM3u8FormatsAndSubtitles/g, '({ formats: $1, subtitles: $2 } = await extractM3u8FormatsAndSubtitles');
  t = t.replace(/urlencode_postdata/g, 'urlencodePostdata');
  t = t.replace(/strip_or_none/g, 'stripOrNone');
  t = t.replace(/this\._generic_id\(/g, 'genericId(');
  t = t.replace(/this\._generic_title\(/g, 'genericTitle(this, ');
  t = t.replace(/this\._proto_relative_url\(/g, 'protoRelative(');
  t = t.replace(/this\._html_extract_title\(/g, 'htmlExtractTitle(');
  t = t.replace(/this\._json_ld\(/g, 'this._search_json_ld(');
  t = t.replace(/this\._get_login_info\(/g, 'this._get_login_info?.(');
  t = t.replace(/this\.report_drm\(/g, 'this.report_warning(\'DRM protected: ');
  t = t.replace(/this\._extract_mpd_formats_and_subtitles\(/g, 'extractMpdFormatsAndSubtitles(this, ');
  t = t.replace(/this\._extract_f4m_formats\(/g, 'this._extract_mpd_formats(');
  t = t.replace(/this\._extract_akamai_formats\(/g, 'this._extract_m3u8_formats(');
  t = t.replace(/\(\?P<(\w+)>/g, '(?<$1>');
  t = t.replace(/from '\.\.\/\.\.\/utils';\s*\n\s*import \{ urlencodePostdata \} from '\.\/_helpers';/g, "from '../../utils';\nimport { urlencodePostdata } from './_helpers';");

  if (t.includes('extractM3u8FormatsAndSubtitles') || t.includes('genericId') || t.includes('urlencodePostdata') || t.includes('htmlExtractTitle') || t.includes('extractMpdFormatsAndSubtitles')) {
    if (!t.includes("from './_helpers'")) {
      t = t.replace(/(import type \{ VideoInfo \} from '\.\.\/\.\.\/types';)/, `$1\n${helperImport}`);
    } else if (!t.includes('extractM3u8FormatsAndSubtitles') && t.includes("from './_helpers'")) {
      t = t.replace(/import \{([^}]+)\} from '\.\/_helpers';/, (m, inner) => {
        const names = new Set(inner.split(',').map((s) => s.trim()).filter(Boolean));
        for (const n of ['extractM3u8FormatsAndSubtitles', 'urlencodePostdata', 'urljoin', 'htmlExtractTitle', 'stripOrNone']) {
          if (t.includes(n) && !names.has(n)) names.add(n);
        }
        return `import { ${[...names].join(', ')} } from './_helpers';`;
      });
    }
  }

  if (t !== orig) fs.writeFileSync(path.join(dir, f), t);
}
console.log('fix-hand-g done');
