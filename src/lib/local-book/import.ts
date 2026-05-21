/**
 * 本地书籍导入
 * 参考 legado：选择文件 → 解析 → 写入数据库 → 加入书架
 * 支持 Tauri（路径 + 直接读文件）与 Web（选文件 + IndexedDB 缓存）
 */

import { basename, join, normalize } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { getFileSystem, readFile, writeFile } from '@/lib/platform/filesystem';
import { settingsStore } from '@/stores/settings';
import {
  detectFileType,
  detectFileTypeByContent,
  isAndroidContentUri,
  getLocalChapterListWithMetadata,
  parseNameAuthor,
  formatBookName,
  formatBookAuthor,
} from '@/lib/local-book/index';
import type { Book, BookChapter } from '@/types';
import type { NewBookChapter } from '@/types/book-chapter';
import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';

/** 本地书 type：legado BookType 文本且本地 = 4 */
const LOCAL_BOOK_TYPE = 4;

/** 导入结果 */
export interface ImportResult {
  book: Book;
  chapterCount: number;
}

/**
 * 获取书籍存储目录路径
 */
export async function getBooksDirectory(): Promise<string> {
  const settings = settingsStore.state.app;
  if (settings.booksDirectory) {
    return settings.booksDirectory;
  }

  // 返回默认路径
  if (isTauri()) {
    try {
      const appDir = await getAppDataDir();
      return await join(appDir, 'Books');
    } catch (error) {
      console.error('获取默认书籍目录失败:', error);
      return 'Books';
    }
  }

  return 'Books';
}

/**
 * 复制文件到书籍目录
 * @param replaceFile 是否替换已存在的文件
 */
export async function copyFileToBooksDir(sourcePath: string, fileName: string, replaceFile: boolean = false): Promise<string> {
  const fs = await getFileSystem();
  const booksDir = await getBooksDirectory();

  // 确保目录存在
  try {
    await fs.mkdir(booksDir, true);
  } catch (error) {
    // 目录可能已存在，忽略错误
  }

  // 构建目标路径
  const targetPath = await join(booksDir, fileName);

  // 规范化路径进行比较
  const normalizedSource = await normalize(sourcePath);
  const normalizedTarget = await normalize(targetPath);

  // 如果源文件和目标文件是同一个文件，直接返回
  if (normalizedSource === normalizedTarget) {
    return targetPath;
  }

  // 如果目标文件已存在且需要替换，先删除它
  if (replaceFile) {
    try {
      const exists = await fs.exists(targetPath);
      if (exists) {
        await fs.remove(targetPath, false);
      }
    } catch (error) {
      // 删除失败不影响后续操作，writeFile 可能会覆盖
      console.warn('删除已存在文件失败，尝试直接覆盖:', error);
    }
  }

  // 读取源文件
  const content = await fs.readFile(sourcePath);

  // 写入目标文件
  await fs.writeFile(targetPath, content);

  return targetPath;
}

/**
 * 移动文件到书籍目录
 * @param replaceFile 是否替换已存在的文件
 */
export async function moveFileToBooksDir(sourcePath: string, fileName: string, replaceFile: boolean = false): Promise<string> {
  const fs = await getFileSystem();
  const booksDir = await getBooksDirectory();

  // 确保目录存在
  try {
    await fs.mkdir(booksDir, true);
  } catch (error) {
    // 目录可能已存在，忽略错误
  }

  // 构建目标路径
  const targetPath = await join(booksDir, fileName);

  // 规范化路径进行比较
  const normalizedSource = await normalize(sourcePath);
  const normalizedTarget = await normalize(targetPath);

  // 如果源文件和目标文件是同一个文件，直接返回
  if (normalizedSource === normalizedTarget) {
    return targetPath;
  }

  // 如果目标文件已存在且需要替换，先删除它
  if (replaceFile) {
    try {
      const exists = await fs.exists(targetPath);
      if (exists) {
        await fs.remove(targetPath, false);
      }
    } catch (error) {
      // 删除失败不影响后续操作，writeFile 可能会覆盖
      console.warn('删除已存在文件失败，尝试直接覆盖:', error);
    }
  }

  // 读取源文件
  const content = await fs.readFile(sourcePath);

  // 写入目标文件
  await fs.writeFile(targetPath, content);

  // 删除源文件
  try {
    await fs.remove(sourcePath, false);
  } catch (error) {
    console.warn('删除源文件失败，文件已复制:', error);
  }

  return targetPath;
}

/**
 * 从路径或 Content URI 中提取文件名
 * 对于 Android Content URI，尝试从 URI 中解码文件名
 * 
 * @param path 文件路径或 Content URI
 * @param content 文件内容（用于通过魔数检测类型）
 * @returns 文件名
 */
function extractFileName(path: string, content: ArrayBuffer): string {
  // 1. 尝试从传统路径中提取
  const pathFileName = path.replace(/^.*[/\\]/, '');

  // 2. 检查是否是有效的文件名（包含扩展名）
  const fileType = detectFileType(pathFileName);
  if (fileType) {
    return pathFileName;
  }

  // 3. 如果是 Android Content URI，尝试从 URI 中解码
  if (isAndroidContentUri(path)) {
    // 尝试从 URI 中提取文件名（某些 Content Provider 会在路径中包含文件名）
    // 例如：content://com.android.externalstorage.documents/document/primary%3ADownload%2F书籍.txt
    const decoded = decodeURIComponent(path);
    const match = decoded.match(/[/\\:]([^/\\:]+\.(txt|epub|pdf|mobi|azw3|umd))$/i);
    if (match) {
      return match[1];
    }

    // 如果无法从 URI 中提取，通过文件内容魔数检测类型
    const contentType = detectFileTypeByContent(content);
    if (contentType) {
      // 生成一个基于时间戳的临时文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      return `本地书籍_${timestamp}.${contentType}`;
    }
  }

  // 4. 最后的回退：如果都无法识别，尝试通过内容检测
  const contentType = detectFileTypeByContent(content);
  if (contentType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `本地书籍_${timestamp}.${contentType}`;
  }

  // 5. 实在无法识别，返回原始文件名
  return pathFileName;
}

/**
 * 打开文件选择器并返回文件路径
 * 
 * Tauri 桌面端：系统对话框，返回真实路径
 * Tauri Android：系统对话框返回 Content URI
 * Web：input/File System Access，返回 local::uuid，内容写入 IndexedDB
 * 
 * 注意：对于 Android Content URI，需要先读取内容（因为权限可能失效），
 * 但对于普通文件路径，可以先操作文件再读取内容，更高效。
 */
export async function pickLocalBookFile(): Promise<
  { bookUrl: string; fileName: string; content?: ArrayBuffer } | null
> {
  if (isTauri()) {
    const path = await openDialog({
      multiple: false,
      filters: [
        { name: 'TXT', extensions: ['txt'] },
        { name: 'EPUB', extensions: ['epub'] },
      ],
    });
    if (path === null || typeof path !== 'string') return null;

    // 检查是否是 Android Content URI
    if (isAndroidContentUri(path)) {
      // Android Content URI：权限可能随时失效，必须先读取内容
      const fs = await getFileSystem();
      const content = await fs.readFile(path);
      const fileName = extractFileName(path, content);
      return { bookUrl: path, fileName, content };
    }

    // 普通文件路径：先不读取内容，让后续流程先操作文件再读取
    // 需要先读取少量内容来检测文件名（通过文件扩展名）
    const fs = await getFileSystem();
    // 只读取前几个字节用于文件名检测
    const header = await fs.readFile(path);
    const headerSlice = header.slice(0, 1024); // 只读取前1KB用于检测
    const fileName = extractFileName(path, headerSlice);

    return { bookUrl: path, fileName };
  }

  // Web：input 选文件，内容写入 IndexedDB（path 用 local::uuid）
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.epub,text/plain,application/epub+zip';
    input.onchange = () => resolve((input.files && input.files[0]) || null);
    input.click();
  });
  if (!file) return null;
  const content = await file.arrayBuffer();
  const bookUrl = `local::${crypto.randomUUID()}`;
  await writeFile(bookUrl, content);
  return { bookUrl, fileName: file.name, content };
}

/**
 * 从已得到的路径与内容导入一本本地书
 */
export async function importLocalBookFromContent(
  bookUrl: string,
  fileName: string,
  content: ArrayBuffer,
  options?: { groupId?: number }
): Promise<ImportResult> {
  // 首先尝试通过文件名检测类型
  let fileType = detectFileType(fileName);

  // 如果无法通过文件名检测，尝试通过文件内容检测
  if (!fileType) {
    fileType = detectFileTypeByContent(content);
  }

  if (fileType !== 'txt' && fileType !== 'epub') {
    const ext = fileName.split('.').pop();
    const typeInfo = fileType ? fileType : ext ? ext : '未知';
    throw new Error(`暂不支持格式：${typeInfo}，仅支持 .txt 与 .epub`);
  }

  // 如果 bookUrl 是 HTTP URL，需要保存到本地存储
  let finalBookUrl = bookUrl;
  const isHttpUrl = bookUrl.startsWith('http://') || bookUrl.startsWith('https://');
  let savedFilePath: string | null = null; // 保存初始文件路径，用于后续重命名

  if (isHttpUrl) {
    if (isTauri()) {
      // Tauri 环境：保存到用户选择的书籍目录，使用实际文件名
      const booksDir = await getBooksDirectory();
      const fs = await getFileSystem();

      // 确保目录存在
      try {
        await fs.mkdir(booksDir, true);
      } catch (error) {
        // 目录可能已存在，忽略错误
      }

      // 构建目标路径（使用实际文件名和扩展名）
      finalBookUrl = await join(booksDir, fileName);
      savedFilePath = finalBookUrl; // 保存初始路径

      // 保存文件内容
      await fs.writeFile(finalBookUrl, content);
    } else {
      // Web 环境：使用虚拟路径（local::uuid 格式），保存到 IndexedDB
      finalBookUrl = `local::${crypto.randomUUID()}`;
      await writeFile(finalBookUrl, content);
    }
  }

  const { name: parsedName, author: parsedAuthor } = parseNameAuthor(fileName);
  const name = formatBookName(parsedName) || '未知书名';
  const author = formatBookAuthor(parsedAuthor) || '未知作者';

  const now = Date.now();
  const bookStub: Book = {
    bookUrl: finalBookUrl,
    tocUrl: finalBookUrl,
    origin: 'local',
    originName: fileName,
    name,
    author,
    type: LOCAL_BOOK_TYPE,
    group: options?.groupId ?? 0,
    latestChapterTime: now,
    lastCheckTime: now,
    lastCheckCount: 0,
    totalChapterNum: 0,
    durChapterIndex: 0,
    durChapterPos: 0,
    durChapterTime: now,
    canUpdate: false,
    order: 0,
    originOrder: 0,
    syncTime: 0,
  } as Book;

  let chapters: BookChapter[];

  const listResult = await getLocalChapterListWithMetadata(bookStub, content);
  chapters = listResult.chapters;

  // console.log('[导入] 解析结果:', {
  //   title: listResult.title,
  //   author: listResult.author,
  //   chaptersCount: chapters.length,
  //   charset: listResult.charset,
  //   firstChapterTitle: chapters[0]?.title,
  // });

  // 使用 formatBookName 格式化书名，移除书名号等符号
  let parsedTitle: string | undefined;
  if (listResult.title) {
    parsedTitle = formatBookName(listResult.title) || listResult.title;
    bookStub.name = parsedTitle;
  }
  if (listResult.author) {
    bookStub.author = formatBookAuthor(listResult.author) || listResult.author;
  }
  if (listResult.intro) bookStub.intro = listResult.intro;
  if (listResult.coverUrl) bookStub.coverUrl = listResult.coverUrl;
  // 保存字符集信息，用于正确解码文件内容
  if (listResult.charset) {
    bookStub.charset = listResult.charset;
  }

  bookStub.totalChapterNum = chapters.length;
  bookStub.latestChapterTitle = chapters.length > 0 ? chapters[chapters.length - 1]?.title : undefined;

  // 如果是从 URL 导入的，且解析出了书名，根据书名重命名文件
  // 使用 parsedTitle 而不是 bookStub.name，确保使用解析出的书名
  if (isHttpUrl && isTauri() && savedFilePath && parsedTitle && parsedTitle !== '未知书名' && parsedTitle !== name) {
    try {
      const fs = await getFileSystem();
      const booksDir = await getBooksDirectory();
      // 从已保存的文件路径中提取扩展名（更可靠）
      const savedFileName = await basename(savedFilePath);
      const ext = savedFileName.includes('.') ? savedFileName.split('.').pop() || 'txt' : 'txt';

      // 使用解析出的书名（parsedTitle）而不是 bookStub.name
      const titleToUse = parsedTitle || bookStub.name;

      // 移除书名中的书名号等符号，只保留实际书名
      let cleanName = titleToUse
        .replace(/[《》]/g, '') // 移除书名号
        .replace(/[<>:"/\\|?*]/g, '') // 移除 Windows 非法字符
        .trim();

      // 如果清理后为空，使用原书名（只移除非法字符）
      if (!cleanName) {
        cleanName = titleToUse.replace(/[<>:"/\\|?*]/g, '').trim() || 'book';
      }

      // console.log('[导入] 准备重命名:', {
      //   originalName: name,
      //   parsedTitle,
      //   titleToUse,
      //   cleanName,
      //   chaptersCount: chapters.length
      // });

      const newFileName = `${cleanName}.${ext}`;
      let newFilePath = await join(booksDir, newFileName);

      // 检查新文件名是否已存在（只有当文件名不同时才检查）
      // 如果原文件名已经是正确的，不需要重命名
      const currentFileName = await basename(savedFilePath);
      if (currentFileName !== newFileName && await fs.exists(newFilePath)) {
        // 如果已存在，添加时间戳
        const timestamp = Date.now();
        const uniqueFileName = `${cleanName}_${timestamp}.${ext}`;
        newFilePath = await join(booksDir, uniqueFileName);
        // console.log('[导入] 文件名冲突，使用时间戳:', uniqueFileName);
      }

      // 重命名文件（如果路径不同）
      if (savedFilePath !== newFilePath) {
        // console.log('[导入] 开始重命名文件:', { from: savedFilePath, to: newFilePath, bookName: bookStub.name });

        // Tauri 文件系统插件没有直接的 rename，使用复制+删除的方式
        const oldContent = await fs.readFile(savedFilePath);
        await fs.writeFile(newFilePath, oldContent);
        await fs.remove(savedFilePath);

        finalBookUrl = newFilePath;
        bookStub.bookUrl = finalBookUrl;
        bookStub.tocUrl = finalBookUrl;
        bookStub.originName = newFileName;

        // console.log('[导入] 文件重命名成功:', { finalBookUrl, originName: bookStub.originName });
      }
    } catch (error) {
      console.error('[导入] 根据书名重命名文件失败:', error);
    }
  }

  const exists = await booksDb.hasBook(finalBookUrl);
  if (exists) {
    await booksDb.deleteBook(finalBookUrl);
    await chaptersDb.deleteChaptersByBook(finalBookUrl);
  }

  await booksDb.insertBook({
    bookUrl: bookStub.bookUrl,
    tocUrl: bookStub.tocUrl,
    origin: bookStub.origin,
    originName: bookStub.originName,
    name: bookStub.name,
    author: bookStub.author,
    kind: bookStub.kind,
    intro: bookStub.intro,
    coverUrl: bookStub.coverUrl,
    charset: bookStub.charset ?? undefined,
    type: LOCAL_BOOK_TYPE,
  });

  const newChapters: NewBookChapter[] = chapters.map((ch) => ({
    url: ch.url,
    title: ch.title,
    bookUrl: finalBookUrl,
    index: ch.index,
    baseUrl: ch.baseUrl,
    isVolume: ch.isVolume,
    isVip: ch.isVip,
    isPay: ch.isPay,
    tag: ch.tag,
    wordCount: ch.wordCount,
    variable: ch.variable,
  }));

  await chaptersDb.insertChapters(newChapters);

  for (const ch of chapters) {
    if (ch.start != null || ch.end != null) {
      await chaptersDb.updateChapter(ch);
    }
  }

  const book = await booksDb.getBook(finalBookUrl);
  if (!book) throw new Error('导入后无法读取书籍记录');

  return { book, chapterCount: chapters.length };
}

/**
 * 选择并导入一本本地书（选文件 + 解析 + 入库）
 * 
 * @param options 导入选项
 * @param options.groupId 分组ID
 * @param options.action 导入操作：copy（复制）或 move（移动），如果不提供则使用用户偏好或弹窗选择
 * @param options.skipDialogs 跳过所有弹窗（用于测试或程序化调用）
 */
export async function importLocalBook(options?: {
  groupId?: number;
  action?: 'copy' | 'move';
  skipDialogs?: boolean;
}): Promise<ImportResult | null> {
  // 检查是否需要显示首次导入目录选择弹窗
  if (!options?.skipDialogs && isTauri()) {
    const settings = settingsStore.state.app;
    if (!settings.booksDirectorySet) {
      // 返回一个 Promise，等待用户选择目录
      // 这个逻辑会在调用处通过弹窗组件处理
      throw new Error('NEED_DIRECTORY_SELECTION');
    }
  }

  const picked = await pickLocalBookFile();
  if (!picked) return null;

  // 确定导入操作
  // 移动端和桌面端都需要复制/移动操作，因为：
  // 1. Android Content URI 权限是临时的，必须复制到应用目录
  // 2. 桌面端用户选择的文件可能在不同位置，需要统一管理
  let action: 'copy' | 'move' | null = options?.action || null;

  if (!action && isTauri()) {
    // Tauri 环境（桌面端和移动端）都需要操作选择
    const settings = settingsStore.state.app;
    if (settings.rememberImportAction && settings.importBookAction) {
      action = settings.importBookAction;
    } else if (!options?.skipDialogs) {
      // 需要弹窗选择，返回特殊错误码
      throw new Error('NEED_ACTION_SELECTION');
    } else {
      // 默认复制
      action = 'copy';
    }
  }

  // 执行文件操作（复制/移动），然后读取内容
  let finalBookUrl = picked.bookUrl;
  let finalContent: ArrayBuffer;

  if (action && isTauri()) {
    // Tauri 环境：先执行文件操作，再读取内容
    if (isAndroidContentUri(picked.bookUrl) || picked.bookUrl.startsWith('local::')) {
      // Android Content URI 或虚拟路径：内容已经在内存中
      // 将内容保存到书籍目录
      const booksDir = await getBooksDirectory();
      const fs = await getFileSystem();

      // 确保目录存在
      try {
        await fs.mkdir(booksDir, true);
      } catch (error) {
        // 目录可能已存在，忽略错误
      }

      // 构建目标路径
      const targetPath = await join(booksDir, picked.fileName);

      // 写入文件到书籍目录
      if (picked.content) {
        await fs.writeFile(targetPath, picked.content);
        finalBookUrl = targetPath;
        finalContent = picked.content; // 使用已读取的内容
      } else {
        throw new Error('Android Content URI 必须预先读取内容');
      }
    } else {
      // 普通文件路径：先复制/移动文件，再读取内容（更高效）
      if (action === 'copy') {
        finalBookUrl = await copyFileToBooksDir(picked.bookUrl, picked.fileName);
      } else if (action === 'move') {
        finalBookUrl = await moveFileToBooksDir(picked.bookUrl, picked.fileName);
      }

      // 从目标位置读取文件内容
      const fs = await getFileSystem();
      finalContent = await fs.readFile(finalBookUrl);
    }
  } else {
    // Web 端或没有操作：使用已有内容或读取文件
    if (picked.content) {
      finalContent = picked.content;
    } else {
      const fs = await getFileSystem();
      finalContent = await fs.readFile(finalBookUrl);
    }
  }

  return importLocalBookFromContent(
    finalBookUrl,
    picked.fileName,
    finalContent,
    { groupId: options?.groupId }
  );
}

/**
 * 读取本地书籍文件内容（用于阅读器加载章节）
 * Tauri：bookUrl 为路径，直接 readFile
 * Web：bookUrl 为 local::uuid，从 IndexedDB 读取
 */
export async function readLocalBookContent(bookUrl: string): Promise<ArrayBuffer> {
  return readFile(bookUrl);
}
