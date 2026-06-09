/**
 * 从章节正文生成简易 EPUB（EPUB 2 / 3 兼容结构）
 */

import { zipSync, strToU8 } from 'fflate';

export type EpubChapterInput = {
  id: string;
  title: string;
  /** 已处理 HTML 或纯文本 */
  html: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapChapterHtml(title: string, body: string): string {
  const inner = body.includes('<')
    ? body
    : `<p>${escapeXml(body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>${escapeXml(title)}</title><meta charset="utf-8"/></head>
<body>${inner}</body>
</html>`;
}

export function buildEpubArchive(
  meta: { title: string; author?: string },
  chapters: EpubChapterInput[],
): Uint8Array {
  const uid = `urn:reader:export:${Date.now()}`;
  const entries: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
  };

  entries['META-INF/container.xml'] = strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navPoints: string[] = [];

  chapters.forEach((ch, i) => {
    const href = `chapter-${String(i + 1).padStart(4, '0')}.xhtml`;
    entries[`OEBPS/${href}`] = strToU8(wrapChapterHtml(ch.title, ch.html));
    manifestItems.push(
      `<item id="${ch.id}" href="${href}" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`<itemref idref="${ch.id}"/>`);
    navPoints.push(`<navPoint id="nav${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${href}"/>
    </navPoint>`);
  });

  entries['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:creator>${escapeXml(meta.author ?? '未知')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="BookId">${uid}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`);

  entries['OEBPS/toc.ncx'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${escapeXml(meta.title)}</text></docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`);

  return zipSync(entries, { level: 0 });
}
