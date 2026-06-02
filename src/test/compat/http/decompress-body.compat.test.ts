import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { maybeDecompressHttpBody } from '@/lib/http/decompress-body';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/shengxuxu-explore.html');

describe('maybeDecompressHttpBody', () => {
  it('gunzips body with magic bytes but no Content-Encoding', () => {
    const html = readFileSync(FIXTURE, 'utf8');
    const gz = gzipSync(new TextEncoder().encode(html));
    const out = maybeDecompressHttpBody(gz, null);
    expect(new TextDecoder().decode(out)).toContain('librarylist');
  });

  it('decodeBookSourceResponseBytes handles gzipped html', async () => {
    const html = readFileSync(FIXTURE, 'utf8');
    const gz = gzipSync(new TextEncoder().encode(html));
    const text = await decodeBookSourceResponseBytes(gz);
    expect(text).toContain('<!DOCTYPE');
    expect(text).toContain('librarylist');
  });
});
