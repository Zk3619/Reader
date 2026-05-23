/**
 * 通过 URL 导入书籍
 * 支持下载在线书籍文件（.txt, .epub 等）并导入到书架
 * 参考 legado 项目的 LocalBook.saveBookFile 实现
 */

import { importLocalBookFromContent, detectFileTypeByContent } from '@/lib/local-book';
import { showAppToast } from '@/components/shared/AppToasts';
import { request } from '@/lib/http';

/**
 * 从 URL 导入书籍
 * @param url 书籍文件 URL（支持 http/https）
 * @param groupId 分组 ID（可选）
 * @returns 导入结果
 */
export async function importBookFromUrl(
  url: string,
  options?: {
    groupId?: number;
    fileName?: string;
    /** 批量导入时抑制单条 toast */
    quiet?: boolean;
  }
): Promise<{ success: boolean; bookName?: string; error?: string }> {
  try {
    // 验证 URL
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('无效的 URL，请使用 http:// 或 https:// 开头的链接');
    }

    // 如果没有提供文件名，从 URL 中提取
    let fileName = options?.fileName;
    if (!fileName) {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        fileName = pathname.split('/').pop() || 'book.txt';

        // 如果文件名没有扩展名，使用默认扩展名
        if (!fileName.includes('.')) {
          fileName = 'book.txt'; // 默认
        }
      } catch {
        fileName = 'book.txt'; // 默认文件名
      }
    }

    if (!options?.quiet) {
      showAppToast({
        title: '正在下载',
        description: '正在从 URL 下载书籍...',
        variant: 'default',
      });
    }

    // 下载文件（使用 HTTP 模块以绕过 CORS）
    const response = await request(url, {
      method: 'GET',
      timeout: 60000, // 60秒超时，书籍文件可能较大
    });

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }

    // 获取文件内容
    const arrayBuffer = await response.arrayBuffer();
    const content = new Uint8Array(arrayBuffer);

    if (content.length === 0) {
      throw new Error('下载的文件为空');
    }

    // 根据 Content-Type 或文件内容修正文件名
    const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
    const hasExtension = fileName.includes('.');
    const ext = hasExtension ? fileName.split('.').pop()?.toLowerCase() : '';
    const supportedExts = ['txt', 'epub', 'pdf', 'mobi', 'umd', 'azw3'];
    const hasValidExtension = ext && supportedExts.includes(ext);

    // 如果没有扩展名，或扩展名不在支持列表中，尝试修正
    if (!hasExtension || !hasValidExtension) {
      let detectedType: string | null = null;

      // 优先使用 Content-Type
      if (contentType.includes('epub') || contentType.includes('application/epub')) {
        detectedType = 'epub';
      } else if (contentType.includes('text/plain') || contentType.includes('text/html')) {
        detectedType = 'txt';
      } else if (contentType.includes('application/pdf')) {
        detectedType = 'pdf';
      } else {
        // 如果没有 Content-Type 或无法识别，通过文件内容检测
        detectedType = detectFileTypeByContent(arrayBuffer);
      }

      // 根据检测结果修正文件名
      if (detectedType === 'epub') {
        fileName = fileName.replace(/\.[^.]+$/, '') || 'book';
        fileName = fileName + '.epub';
      } else if (detectedType === 'txt') {
        fileName = fileName.replace(/\.[^.]+$/, '') || 'book';
        fileName = fileName + '.txt';
      } else if (detectedType === 'pdf') {
        fileName = fileName.replace(/\.[^.]+$/, '') || 'book';
        fileName = fileName + '.pdf';
      } else if (!hasExtension) {
        // 如果仍然无法检测，默认使用 .txt
        fileName = fileName + '.txt';
      } else {
        // 有扩展名但无法识别类型，强制改为 .txt（通常文本文件）
        fileName = fileName.replace(/\.[^.]+$/, '') || 'book';
        fileName = fileName + '.txt';
      }
    }

    // 导入书籍
    const result = await importLocalBookFromContent(
      url, // 使用 URL 作为 bookUrl
      fileName,
      content.buffer,
      { groupId: options?.groupId }
    );

    if (result) {
      if (!options?.quiet) {
        showAppToast({
          title: '导入成功',
          description: `已导入《${result.book.name}》，共 ${result.chapterCount} 章`,
          variant: 'success',
        });
      }

      return {
        success: true,
        bookName: result.book.name,
      };
    } else {
      throw new Error('导入失败');
    }
  } catch (error) {
    // 记录详细错误信息
    console.error('[URL导入] 导入失败:', error);

    let errorMessage = '未知错误';
    if (error instanceof Error) {
      errorMessage = error.message;
      // 如果是 HttpError，显示更详细的信息
      if ((error as any).status) {
        errorMessage = `HTTP ${(error as any).status}: ${errorMessage}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = String(error);
    }

    if (!options?.quiet) {
      showAppToast({
        title: '导入失败',
        description: errorMessage,
        variant: 'error',
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 批量从 URL 导入书籍
 * @param urls URL 列表（每行一个）
 * @param groupId 分组 ID（可选）
 */
export async function importBooksFromUrls(
  urls: string,
  options?: {
    groupId?: number;
  }
): Promise<{ success: number; failed: number; errors: string[] }> {
  const urlList = urls
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const url of urlList) {
    const result = await importBookFromUrl(url, { groupId: options?.groupId });
    if (result.success) {
      success++;
    } else {
      failed++;
      if (result.error) {
        errors.push(`${url}: ${result.error}`);
      }
    }
  }

  // 显示总结
  if (success > 0 || failed > 0) {
    showAppToast({
      title: "批量导入完成",
      description: `成功: ${success} 本，失败: ${failed} 本`,
      variant: success > 0 ? "success" : "error",
    });
  }

  return { success, failed, errors };
}
