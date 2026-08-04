/**
 * Auto-fix Python inline regex flags in hand-* TS regex literals:
 *   /(?s)foo(.+?)bar/  →  /foo([\s\S]+?)bar/
 *   /(?is)foo(.+?)bar/ →  /foo([\s\S]+?)bar/i
 *   /(?i)foo/          →  /foo/i
 *
 * Only rewrites RegExp literals that START with (?flags). Conservative.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/lib/download/ytdlp/extractors');
let filesChanged = 0;
let replacements = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === 'generated') continue;
      walk(p);
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (!p.includes(`${path.sep}hand-`)) continue;

    let text = fs.readFileSync(p, 'utf8');
    const orig = text;

    // Match /(?FLAGS)BODY/FLAGS?  where FLAGS are only s/i/m/x combo
    text = text.replace(
      /\/\(\?([simx]{1,4})\)((?:\\.|[^\\/\[\n]|\[(?:\\.|[^\]])*\])*)\/([gimsuy]*)/g,
      (full, pyFlags, body, jsFlags) => {
        let newBody = body;
        let newFlags = jsFlags || '';
        if (pyFlags.includes('s')) {
          // Make . match newlines by converting . to [\s\S] outside char classes — crude but OK for our ports
          newBody = newBody.replace(/(\[[^\]]*])|\./g, (m, cls) => (cls ? cls : '[\\s\\S]'));
        }
        if (pyFlags.includes('i') && !newFlags.includes('i')) newFlags += 'i';
        if (pyFlags.includes('m') && !newFlags.includes('m')) newFlags += 'm';
        // x (verbose) ignored
        replacements++;
        return `/${newBody}/${newFlags}`;
      },
    );

    if (text !== orig) {
      fs.writeFileSync(p, text, 'utf8');
      filesChanged++;
      console.log('fixed', path.relative(process.cwd(), p).replace(/\\/g, '/'));
    }
  }
}

walk(root);
console.log(JSON.stringify({ filesChanged, replacements }, null, 2));
