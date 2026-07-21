/**
 * MOBI/AZW3 → EPUB（导入前转换，阅读层仍走 EPUB 引擎）
 */

import { initKf8File, initMobiFile, type Kf8, type Mobi } from '@lingo-reader/mobi-parser';
import { zipSync, strToU8 } from 'fflate';
import { MOBI_CONVERT_FAILED_MESSAGE } from '@/lib/local-book/local-book-messages';

export { mobiSourceToEpubFileName } from '@/lib/local-book/mobi-file-name';

type OpenedBook = { kind: 'kf8'; book: Kf8 } | { kind: 'mobi'; book: Mobi };

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function guessExt(mime: string, fallback = 'bin'): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webp')) return 'webp';
  if (m.includes('svg')) return 'svg';
  if (m.includes('css')) return 'css';
  return fallback;
}

async function openMobiBook(bytes: ArrayBuffer, fileName: string): Promise<OpenedBook> {
  const file = new File([bytes], fileName || 'book.mobi', {
    type: 'application/x-mobipocket-ebook',
  });
  try {
    const kf8 = await initKf8File(file);
    if (kf8.getSpine().length > 0) {
      return { kind: 'kf8', book: kf8 };
    }
    kf8.destroy();
  } catch {
    // fall through to classic MOBI
  }
  const mobi = await initMobiFile(file);
  if (mobi.getSpine().length <= 0) {
    mobi.destroy();
    throw new Error('未解析到章节');
  }
  return { kind: 'mobi', book: mobi };
}

async function collectBlobResources(
  html: string,
  resourceMap: Map<string, { href: string; mediaType: string }>,
  files: Record<string, Uint8Array>,
  counter: { n: number },
): Promise<string> {
  const blobRe = /(blob:[^"'\s)]+)/g;
  const urls = [...new Set(html.match(blobRe) ?? [])];
  let next = html;
  for (const url of urls) {
    let mapped = resourceMap.get(url);
    if (!mapped) {
      try {
        const res = await fetch(url);
        const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = guessExt(mime);
        const id = `res-${String(++counter.n).padStart(3, '0')}`;
        const href = `Images/${id}.${ext}`;
        files[`OEBPS/${href}`] = buf;
        mapped = { href, mediaType: mime };
        resourceMap.set(url, mapped);
      } catch {
        continue;
      }
    }
    next = next.split(url).join(`../${mapped.href}`);
  }
  return next;
}

function wrapXhtml(title: string, bodyHtml: string): string {
  const body = bodyHtml.includes('<body')
    ? bodyHtml
    : `<body>${bodyHtml}</body>`;
  const inner = body.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh">
<head>
  <meta charset="utf-8" />
  <title>${xmlEscape(title)}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/style.css" />
</head>
<body>
${inner}
</body>
</html>`;
}

/**
 * 将 MOBI/AZW3 字节转为 EPUB 字节。失败抛出带中文说明的 Error。
 */
export async function convertMobiBytesToEpub(
  bytes: ArrayBuffer,
  fileName = 'book.mobi',
): Promise<ArrayBuffer> {
  let opened: OpenedBook | null = null;
  try {
    opened = await openMobiBook(bytes, fileName);
    const { book } = opened;
    const meta = book.getMetadata();
    const title = (meta.title || fileName.replace(/\.(mobi|azw3?)$/i, '') || '未命名').trim();
    const author = (Array.isArray(meta.author) ? meta.author[0] : meta.author) || '未知作者';
    const language = (Array.isArray(meta.language) ? meta.language[0] : meta.language) || 'zh';
    const spine = book.getSpine();

    const files: Record<string, Uint8Array> = {
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
      'OEBPS/Styles/style.css': strToU8(`body{font-family:serif;line-height:1.6;margin:1em;}
img{max-width:100%;height:auto;}`),
    };

    const resourceMap = new Map<string, { href: string; mediaType: string }>();
    const counter = { n: 0 };
    const chapterEntries: { id: string; href: string; title: string }[] = [];

    for (let i = 0; i < spine.length; i++) {
      const chapter = spine[i]!;
      const loaded = book.loadChapter(chapter.id);
      if (!loaded?.html) continue;
      const chapterTitle = `第 ${chapterEntries.length + 1} 章`;
      const rewritten = await collectBlobResources(loaded.html, resourceMap, files, counter);
      const href = `Text/chapter-${String(chapterEntries.length + 1).padStart(3, '0')}.xhtml`;
      files[`OEBPS/${href}`] = strToU8(wrapXhtml(chapterTitle, rewritten));
      chapterEntries.push({
        id: `chap-${chapterEntries.length + 1}`,
        href,
        title: chapterTitle,
      });
    }

    if (chapterEntries.length === 0) {
      throw new Error('正文为空');
    }

    const coverUrl = book.getCoverImage();
    let coverHref: string | undefined;
    if (coverUrl) {
      try {
        const res = await fetch(coverUrl);
        const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
        const buf = new Uint8Array(await res.arrayBuffer());
        coverHref = `Images/cover.${guessExt(mime, 'jpg')}`;
        files[`OEBPS/${coverHref}`] = buf;
        resourceMap.set(coverUrl, { href: coverHref, mediaType: mime });
      } catch {
        // ignore cover failure
      }
    }

    const manifestItems = [
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="Styles/style.css" media-type="text/css"/>`,
      ...chapterEntries.map(
        (c) =>
          `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`,
      ),
      ...[...resourceMap.values()].map((r, idx) => {
        const id = r.href === coverHref ? 'cover-image' : `res-${idx + 1}`;
        return `<item id="${id}" href="${r.href}" media-type="${xmlEscape(r.mediaType)}"/>`;
      }),
    ];

    const spineItems = chapterEntries.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ');

    files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(String(author))}</dc:creator>
    <dc:language>${xmlEscape(String(language))}</dc:language>
    <dc:identifier id="BookId">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    ${coverHref ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`);

    const navPoints = chapterEntries
      .map(
        (c, i) => `    <navPoint id="${c.id}" playOrder="${i + 1}">
      <navLabel><text>${xmlEscape(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`,
      )
      .join('\n');

    files['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${crypto.randomUUID()}"/>
  </head>
  <docTitle><text>${xmlEscape(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);

    const zipped = zipSync(
      {
        mimetype: [strToU8('application/epub+zip'), { level: 0 }],
        'META-INF/container.xml': files['META-INF/container.xml']!,
        'OEBPS/Styles/style.css': files['OEBPS/Styles/style.css']!,
        ...Object.fromEntries(
          Object.entries(files).filter(
            ([k]) =>
              k !== 'mimetype' &&
              k !== 'META-INF/container.xml' &&
              k !== 'OEBPS/Styles/style.css',
          ),
        ),
      },
      { level: 6 },
    );
    const out = new Uint8Array(zipped);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`${MOBI_CONVERT_FAILED_MESSAGE}（${detail}）`);
  } finally {
    opened?.book.destroy();
  }
}
