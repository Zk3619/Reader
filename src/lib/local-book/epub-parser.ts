/**
 * EPUB文件解析器
 * 对应 legado 项目的 EpubFile.kt
 * 
 * 功能：
 * 1. 解析EPUB文件，提取元数据
 * 2. 获取章节列表
 * 3. 提取章节内容
 * 4. 处理图片资源
 * 
 * 注意：需要安装 epubjs 库
 * npm install epubjs
 */

import type { Book, BookChapter } from '@/types';

/**
 * EPUB解析结果
 */
export interface EpubParseResult {
  chapters: BookChapter[];
  metadata: {
    title?: string;
    creator?: string;
    description?: string;
    language?: string;
    publisher?: string;
  };
  coverUrl?: string;
}

/**
 * 辅助函数：设置章节的nextUrl变量
 */
function setChapterNextUrl(chapter: BookChapter, nextUrl: string) {
  try {
    const variableMap = chapter.variable ? JSON.parse(chapter.variable) : {};
    variableMap.nextUrl = nextUrl;
    chapter.variable = JSON.stringify(variableMap);
  } catch {
    chapter.variable = JSON.stringify({ nextUrl });
  }
}

/**
 * 从URL中提取fragmentId
 */
function extractFragmentId(url: string): string | undefined {
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    return url.substring(hashIndex + 1);
  }
  return undefined;
}

/**
 * 从URL中移除fragmentId
 */
function removeFragmentId(url: string): string {
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    return url.substring(0, hashIndex);
  }
  return url;
}

/**
 * 获取EPUB文件的章节列表
 */
export async function getEpubChapterList(
  book: Book,
  fileContent: ArrayBuffer
): Promise<EpubParseResult> {
  // 动态导入epubjs（如果未安装会报错，需要用户安装）
  const { default: ePub } = await import('epubjs');

  const bookInstance = ePub(fileContent);
  await bookInstance.ready;

  // 获取元数据
  const metadata = await bookInstance.loaded.metadata;
  const metadataObj = {
    title: metadata.title,
    creator: metadata.creator,
    description: metadata.description,
    language: metadata.language,
    publisher: metadata.publisher,
  };

  // 获取封面
  let coverUrl: string | undefined;
  try {
    const cover = await bookInstance.coverUrl();
    coverUrl = cover || undefined;
  } catch {
    // 无封面，忽略
  }

  // 获取目录
  const navigation = await bookInstance.loaded.navigation;
  const chapters: BookChapter[] = [];
  const contents = bookInstance.loaded.resources;

  if (navigation.toc && navigation.toc.length > 0) {
    // 使用NCX目录
    // 先处理卷首内容（第一章之前的内容）
    await parseFirstPage(bookInstance, navigation.toc, chapters, book.bookUrl, contents);
    // 然后处理目录
    parseTocRecursive(navigation.toc, chapters, book.bookUrl, 0);
  } else {
    // 回退到spine
    const spine = bookInstance.spine;
    let index = 0;
    let prevChapter: BookChapter | null = null;

    // epubjs的spine对象，尝试多种方式遍历
    let spineItems: any[] = [];
    const spineAny = spine as any;

    // 尝试获取spineItems
    if (spineAny.spineItems && Array.isArray(spineAny.spineItems)) {
      spineItems = spineAny.spineItems;
    } else if (spineAny.forEach) {
      // 如果有forEach方法，收集所有项
      spineAny.forEach((item: any) => {
        spineItems.push(item);
      });
    } else if (Array.isArray(spine)) {
      spineItems = spine;
    } else {
      // 尝试通过索引访问
      let i = 0;
      while (true) {
        try {
          const item = spineAny.get ? spineAny.get(i) : spineAny[i];
          if (!item) break;
          spineItems.push(item);
          i++;
        } catch {
          break;
        }
      }
    }

    // 遍历spine项
    for (const item of spineItems) {
      const href = item.href || item.url || '';
      if (!href) continue;

      let title = item.label || item.title || '';

      // 如果spine没有label，尝试从HTML中提取title
      if (!title) {
        try {
          const section = spine.get ? spine.get(href) : null;
          if (section) {
            const content = await section.load(bookInstance.load.bind(bookInstance));
            const contentString = typeof content === 'string'
              ? content
              : (content as unknown as Document).documentElement?.outerHTML || '';
            const parser = new DOMParser();
            const doc = parser.parseFromString(contentString, 'text/html');
            const titleElement = doc.querySelector('title');
            if (titleElement) {
              title = titleElement.textContent || '';
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }

      const chapter: BookChapter = {
        url: href,
        title: title || (index === 0 ? '封面' : `第${index + 1}章`),
        isVolume: false,
        baseUrl: book.bookUrl,
        bookUrl: book.bookUrl,
        index,
        isVip: false,
        isPay: false,
      };

      // 设置上一个章节的nextUrl
      if (prevChapter) {
        setChapterNextUrl(prevChapter, chapter.url);
      }

      chapters.push(chapter);
      prevChapter = chapter;
      index++;
    }
  }

  // 设置索引和nextUrl
  chapters.forEach((chapter, index) => {
    chapter.index = index;
    if (index < chapters.length - 1) {
      setChapterNextUrl(chapter, chapters[index + 1].url);
    } else {
      // 最后一章，nextUrl为空
      setChapterNextUrl(chapter, '');
    }
  });

  return {
    chapters,
    metadata: metadataObj,
    coverUrl,
  };
}

/**
 * 获取章节的nextUrl变量值
 */
function getChapterNextUrl(chapter: BookChapter): string {
  try {
    if (chapter.variable) {
      const variableMap = JSON.parse(chapter.variable);
      return variableMap.nextUrl || '';
    }
  } catch {
    // 忽略解析错误
  }
  return '';
}

/**
 * 获取EPUB章节内容
 */
export async function getEpubContent(
  _book: Book,
  chapter: BookChapter,
  fileContent: ArrayBuffer
): Promise<string | null> {
  const { default: ePub } = await import('epubjs');

  const bookInstance = ePub(fileContent);
  await bookInstance.ready;

  try {
    const contents = bookInstance.loaded.resources;
    if (!contents) {
      return null;
    }

    // 获取当前章节和下一章节的firstResourceHref（去除fragmentId）
    const currentChapterFirstResourceHref = removeFragmentId(chapter.url);
    const nextUrl = getChapterNextUrl(chapter);
    const nextChapterFirstResourceHref = nextUrl ? removeFragmentId(nextUrl) : '';
    const isLastChapter = !nextChapterFirstResourceHref;

    const startFragmentId = chapter.startFragmentId;
    const endFragmentId = chapter.endFragmentId;
    const includeNextChapterResource = !!endFragmentId;

    // 收集所有属于当前章节的元素
    const elements: Element[] = [];
    let findChapterFirstSource = false;
    const contentsList = Object.values(contents);

    // 遍历所有资源
    for (const res of contentsList) {
      if (!res.href) continue;

      if (!findChapterFirstSource) {
        // 还没找到当前章节的第一个资源
        if (currentChapterFirstResourceHref !== removeFragmentId(res.href)) {
          continue;
        }
        findChapterFirstSource = true;
        // 第一个xhtml文件
        const bodyElement = await getBodyElement(
          bookInstance,
          res,
          startFragmentId,
          endFragmentId
        );
        if (bodyElement) {
          elements.push(bodyElement);
        }
        // 不是最后章节 且 已经遍历到下一章节的内容时停止
        if (!isLastChapter && removeFragmentId(res.href) === nextChapterFirstResourceHref) {
          break;
        }
        continue;
      }

      // 已经找到当前章节的第一个资源
      if (removeFragmentId(res.href) !== nextChapterFirstResourceHref) {
        // 其余部分（属于当前章节）
        const bodyElement = await getBodyElement(bookInstance, res, null, null);
        if (bodyElement) {
          elements.push(bodyElement);
        }
      } else {
        // 下一章节的第一个xhtml
        if (includeNextChapterResource) {
          // 有Fragment 则添加到上一章节
          const bodyElement = await getBodyElement(bookInstance, res, null, endFragmentId);
          if (bodyElement) {
            elements.push(bodyElement);
          }
        }
        break;
      }
    }

    if (elements.length === 0) {
      return null;
    }

    // 合并所有元素
    const parser = new DOMParser();
    const combinedDoc = parser.parseFromString('<div></div>', 'text/html');
    const container = combinedDoc.body;

    for (const element of elements) {
      // 克隆元素并添加到容器
      const clonedElement = combinedDoc.importNode(element, true);
      container.appendChild(clonedElement);
    }

    // 处理内容
    // 移除title标签
    container.querySelectorAll('title').forEach(el => el.remove());
    // 移除隐藏元素
    container.querySelectorAll('[style*="display:none"]').forEach(el => el.remove());
    // 处理重复的封面图片
    container.querySelectorAll('img[src="cover.jpeg"]').forEach((img, i) => {
      if (i > 0) {
        img.remove();
      }
    });
    // 清理img标签，只保留src属性
    container.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        img.removeAttribute('style');
        img.removeAttribute('class');
        img.removeAttribute('id');
        // 只保留src属性
        img.setAttribute('src', src);
      }
    });
    // 移除ruby标签的rp和rt（如果需要）
    // 这里可以根据book配置来决定是否移除

    // 返回HTML内容
    return container.innerHTML;
  } catch (error) {
    console.error('获取EPUB章节内容失败:', error);
    return null;
  }
}

/**
 * 获取资源对应的body元素
 */
async function getBodyElement(
  bookInstance: any,
  res: any,
  startFragmentId: string | null | undefined,
  endFragmentId: string | null | undefined
): Promise<Element | null> {
  try {
    // 处理titlepage.xhtml和cover
    if (res.href.includes('titlepage.xhtml') || res.href.includes('cover')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<img src="cover.jpeg" />', 'text/html');
      return doc.body;
    }

    // 获取资源内容
    const resAny = res as any;
    if (!resAny.load) {
      return null;
    }
    const data = await resAny.load(bookInstance.load.bind(bookInstance));
    const contentString = typeof data === 'string'
      ? data
      : (data as unknown as Document).documentElement?.outerHTML || '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(contentString, 'text/html');
    let bodyElement = doc.body;

    if (!bodyElement) {
      return null;
    }

    // 移除脚本和样式
    bodyElement.querySelectorAll('script, style').forEach(el => el.remove());

    // 处理fragmentId
    let bodyString = bodyElement.outerHTML;
    const originBodyString = bodyString;

    if (startFragmentId) {
      const startElement = bodyElement.querySelector(`#${startFragmentId}`);
      if (startElement) {
        const tagStart = startElement.outerHTML.substring(0, startElement.outerHTML.indexOf('\n') || startElement.outerHTML.length);
        bodyString = tagStart + bodyString.substring(bodyString.indexOf(tagStart) + tagStart.length);
      }
    }

    if (endFragmentId && endFragmentId !== startFragmentId) {
      const endElement = bodyElement.querySelector(`#${endFragmentId}`);
      if (endElement) {
        const tagStart = endElement.outerHTML.substring(0, endElement.outerHTML.indexOf('\n') || endElement.outerHTML.length);
        bodyString = bodyString.substring(0, bodyString.indexOf(tagStart));
      }
    }

    // 如果截取过，重新解析
    if (bodyString !== originBodyString) {
      const newDoc = parser.parseFromString(bodyString, 'text/html');
      bodyElement = newDoc.body;
    }

    // 处理SVG的image标签转换为img标签
    bodyElement.querySelectorAll('image').forEach(image => {
      const xlinkHref = image.getAttribute('xlink:href') || image.getAttribute('href');
      if (xlinkHref) {
        const img = doc.createElement('img');
        img.setAttribute('src', xlinkHref);
        image.replaceWith(img);
      }
    });

    // 处理图片路径：将相对路径转换为绝对路径
    bodyElement.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        try {
          // 使用URL解析相对路径
          const baseHref = decodeURIComponent(res.href);
          const resolvedHref = new URL(src, new URL(baseHref, 'file:///')).href;
          img.setAttribute('src', resolvedHref);
        } catch (e) {
          // URL解析失败，尝试简单拼接
          try {
            const basePath = res.href.substring(0, res.href.lastIndexOf('/') + 1);
            img.setAttribute('src', basePath + src);
          } catch {
            // 保持原样
          }
        }
      }
    });

    return bodyElement;
  } catch (error) {
    console.error('获取body元素失败:', error);
    return null;
  }
}

/**
 * 处理卷首内容（第一章之前的内容，如封面、扉页等）
 */
async function parseFirstPage(
  bookInstance: any,
  tocItems: Array<{ label: string; href: string; children?: any[] }>,
  chapters: BookChapter[],
  bookUrl: string,
  contents: any
): Promise<void> {
  if (!tocItems || tocItems.length === 0) return;

  // 找到第一个有resource的TOC项
  const firstRef = findFirstRefWithResource(tocItems);
  if (!firstRef) return;

  const firstRefHref = removeFragmentId(firstRef.href);
  const contentsList = contents ? Object.values(contents) as any[] : [];

  // 遍历contents，找到第一个匹配的resource之前的所有HTML资源
  for (const contentItem of contentsList) {
    const content = contentItem as any;
    if (!content || !content.href) continue;

    // 只处理HTML资源
    const mediaType = (content.mediaType || '') as string;
    if (!mediaType.includes('html') && !mediaType.includes('xhtml')) {
      continue;
    }

    // 如果已经到达第一章，停止
    if (removeFragmentId(content.href) === firstRefHref) {
      break;
    }

    // 创建卷首章节
    let title = '--卷首--';
    try {
      const spine = bookInstance.spine as any;
      const section = spine.get ? spine.get(content.href) : null;
      if (section) {
        const htmlContent = await section.load(bookInstance.load.bind(bookInstance));
        const contentString = typeof htmlContent === 'string'
          ? htmlContent
          : (htmlContent as unknown as Document).documentElement?.outerHTML || '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentString, 'text/html');
        const titleElement = doc.querySelector('title');
        if (titleElement && titleElement.textContent?.trim()) {
          title = titleElement.textContent.trim();
        }
      }
    } catch (e) {
      // 忽略错误
    }

    const chapter: BookChapter = {
      url: content.href,
      title,
      isVolume: false,
      baseUrl: bookUrl,
      bookUrl,
      index: chapters.length,
      isVip: false,
      isPay: false,
      startFragmentId: extractFragmentId(content.href),
    };

    // 设置上一个章节的endFragmentId和nextUrl
    if (chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      lastChapter.endFragmentId = chapter.startFragmentId;
      setChapterNextUrl(lastChapter, chapter.url);
    }

    chapters.push(chapter);
  }
}

/**
 * 递归查找第一个有resource的TOC项
 */
function findFirstRefWithResource(
  tocItems: Array<{ label: string; href: string; children?: any[] }>
): { label: string; href: string } | null {
  for (const item of tocItems) {
    if (item.href) {
      return item;
    }
    if (item.children && item.children.length > 0) {
      const found = findFirstRefWithResource(item.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 递归解析目录
 */
function parseTocRecursive(
  tocItems: Array<{ label: string; href: string; children?: Array<{ label: string; href: string }> }>,
  chapters: BookChapter[],
  bookUrl: string,
  startIndex: number
): number {
  let currentIndex = startIndex;

  for (const item of tocItems) {
    if (!item.href) {
      // 如果没有href，只处理子目录
      if (item.children && item.children.length > 0) {
        currentIndex = parseTocRecursive(item.children, chapters, bookUrl, currentIndex);
      }
      continue;
    }

    const chapter: BookChapter = {
      url: item.href,
      title: item.label.trim() || `第${currentIndex + 1}章`,
      isVolume: false,
      baseUrl: bookUrl,
      bookUrl,
      index: currentIndex,
      isVip: false,
      isPay: false,
      startFragmentId: extractFragmentId(item.href),
    };

    // 检查是否是卷（通常标题包含"卷"字）
    if (/^第?[零一二三四五六七八九十百千万0-9]*[卷部篇]/u.test(chapter.title)) {
      chapter.isVolume = true;
    }

    // 设置上一个章节的endFragmentId和nextUrl
    if (chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      lastChapter.endFragmentId = chapter.startFragmentId;
      setChapterNextUrl(lastChapter, chapter.url);
    }

    chapters.push(chapter);
    currentIndex++;

    // 递归处理子目录
    if (item.children && item.children.length > 0) {
      // 标记当前章节为卷
      chapter.isVolume = true;
      currentIndex = parseTocRecursive(item.children, chapters, bookUrl, currentIndex);
    }
  }

  return currentIndex;
}

/**
 * 获取EPUB图片资源
 */
export async function getEpubImage(
  _book: Book,
  href: string,
  fileContent: ArrayBuffer
): Promise<ArrayBuffer | null> {
  const { default: ePub } = await import('epubjs');

  const bookInstance = ePub(fileContent);
  await bookInstance.ready;

  try {
    const resources = bookInstance.resources as any;
    const resource = resources.get ? resources.get(href) : null;
    if (!resource) {
      return null;
    }

    const resourceAny = resource as any;
    if (!resourceAny.load) {
      return null;
    }
    const data = await resourceAny.load(bookInstance.load.bind(bookInstance));
    // 如果data是Blob，转换为ArrayBuffer
    if (data instanceof Blob) {
      return await data.arrayBuffer();
    }
    // 如果已经是ArrayBuffer，直接返回
    if (data instanceof ArrayBuffer) {
      return data;
    }
    // 其他情况，尝试转换
    return data as ArrayBuffer;
  } catch (error) {
    console.error('获取EPUB图片失败:', error);
    return null;
  }
}
