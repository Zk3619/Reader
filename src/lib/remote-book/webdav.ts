/**
 * WebDav 客户端实现
 * 参考 legado 项目的 WebDav 实现
 * 使用 fetch API 进行 HTTP 请求
 */

import { getBooksDirectory } from '@/lib/local-book/import';
import { getFileSystem } from '@/lib/platform/filesystem';
import { join } from '@tauri-apps/api/path';
import type { RemoteBook, RemoteBookManager, WebDavConfig } from '@/types/remote-book';

/**
 * WebDav 文件信息
 */
interface WebDavFile {
  displayName: string;
  path: string;
  size: number;
  contentType: string;
  resourceType: string;
  lastModify: number;
  isDir: boolean;
}

/**
 * WebDav 客户端类
 */
class WebDavClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  constructor(config: WebDavConfig) {
    this.baseUrl = config.url.replace(/\/$/, ''); // 移除末尾斜杠
    this.username = config.username;
    this.password = config.password;
  }

  /**
   * 创建基本认证头
   */
  private getAuthHeader(): string {
    const credentials = `${this.username}:${this.password}`;
    const encoded = btoa(credentials);
    return `Basic ${encoded}`;
  }

  /**
   * 发送 WebDav 请求
   */
  private async request(
    method: string,
    path: string,
    body?: string,
    headers?: Record<string, string>
  ): Promise<Response> {
    const url = `${this.baseUrl}/${path.replace(/^\//, '')}`;
    const requestHeaders: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
      ...headers,
    };

    if (body) {
      requestHeaders['Content-Type'] = 'application/xml; charset=utf-8';
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body,
    });

    if (!response.ok) {
      throw new Error(`WebDav request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  /**
   * 解析 WebDav XML 响应
   */
  private parseWebDavResponse(xmlText: string): WebDavFile[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // 检查解析错误
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parsing error: ${parserError.textContent}`);
    }

    const files: WebDavFile[] = [];
    const responses = doc.getElementsByTagNameNS('DAV:', 'response');

    for (const response of Array.from(responses)) {
      const href = response.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent;
      if (!href) continue;

      // 解码 URL
      const path = decodeURIComponent(href.replace(this.baseUrl, '').replace(/^\//, ''));

      // 跳过当前目录
      if (!path || path === '') continue;

      const propStat = response.getElementsByTagNameNS('DAV:', 'propstat')[0];
      if (!propStat) continue;

      const prop = propStat.getElementsByTagNameNS('DAV:', 'prop')[0];
      if (!prop) continue;

      const displayName = prop.getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent || '';
      const contentLength = prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '0';
      const contentType = prop.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
      const resourceType = prop.getElementsByTagNameNS('DAV:', 'resourcetype')[0]?.textContent || '';
      const lastModified = prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';

      const isDir = resourceType.includes('collection') || contentType === 'httpd/unix-directory';

      files.push({
        displayName: displayName || path.split('/').pop() || path,
        path,
        size: parseInt(contentLength, 10) || 0,
        contentType: contentType || (isDir ? 'httpd/unix-directory' : 'application/octet-stream'),
        resourceType,
        lastModify: lastModified ? new Date(lastModified).getTime() : Date.now(),
        isDir,
      });
    }

    return files;
  }

  /**
   * 列出目录内容
   */
  async listFiles(path: string = ''): Promise<WebDavFile[]> {
    const propfindBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getcontentlength/>
    <getcontenttype/>
    <getlastmodified/>
  </prop>
</propfind>`;

    const response = await this.request('PROPFIND', path, propfindBody, {
      'Depth': '1',
    });

    const xmlText = await response.text();
    return this.parseWebDavResponse(xmlText);
  }

  /**
   * 获取文件信息
   */
  async getFile(path: string): Promise<WebDavFile | null> {
    try {
      const files = await this.listFiles(path);
      return files.find(f => f.path === path) || null;
    } catch (error) {
      console.error('获取 WebDav 文件信息失败:', error);
      return null;
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(path: string): Promise<ArrayBuffer> {
    const response = await this.request('GET', path);
    return await response.arrayBuffer();
  }

  /**
   * 上传文件
   */
  async uploadFile(path: string, content: ArrayBuffer | Uint8Array): Promise<void> {
    const body = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
    await this.request('PUT', path, new TextDecoder().decode(body), {
      'Content-Type': 'application/octet-stream',
    });
  }

  /**
   * 创建目录
   */
  async makeDirectory(path: string): Promise<void> {
    await this.request('MKCOL', path);
  }

  /**
   * 删除文件或目录
   */
  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  /**
   * 检查文件是否存在
   */
  async exists(path: string): Promise<boolean> {
    try {
      const propfindBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype/>
  </prop>
</propfind>`;

      await this.request('PROPFIND', path, propfindBody, {
        'Depth': '0',
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * WebDav 远程书籍管理器实现
 */
export class WebDavRemoteBookManager implements RemoteBookManager {
  private client: WebDavClient;
  private rootBookPath: string;

  constructor(config: WebDavConfig) {
    this.client = new WebDavClient(config);
    this.rootBookPath = config.rootBookPath || 'books';
  }

  /**
   * 获取远程书籍列表
   */
  async getRemoteBookList(path: string): Promise<RemoteBook[]> {
    const fullPath = path ? `${this.rootBookPath}/${path}` : this.rootBookPath;
    const files = await this.client.listFiles(fullPath);

    const remoteBooks: RemoteBook[] = [];

    for (const file of files) {
      // 跳过当前目录
      if (file.path === fullPath) continue;

      // 检查是否是书籍文件（.txt, .epub 等）或目录
      const isBookFile = this.isBookFile(file.displayName);
      const isArchiveFile = this.isArchiveFile(file.displayName);

      if (file.isDir || isBookFile || isArchiveFile) {
        // 检查是否已在书架中
        const isOnBookShelf = await this.checkBookInShelf(file.displayName);

        remoteBooks.push({
          filename: file.displayName,
          path: file.path,
          size: file.size,
          lastModify: file.lastModify,
          contentType: file.isDir ? 'folder' : file.displayName.split('.').pop() || '',
          isOnBookShelf,
        });
      }
    }

    return remoteBooks;
  }

  /**
   * 获取远程书籍信息
   */
  async getRemoteBook(path: string): Promise<RemoteBook | null> {
    const file = await this.client.getFile(path);
    if (!file) return null;

    const isOnBookShelf = await this.checkBookInShelf(file.displayName);

    return {
      filename: file.displayName,
      path: file.path,
      size: file.size,
      lastModify: file.lastModify,
      contentType: file.isDir ? 'folder' : file.displayName.split('.').pop() || '',
      isOnBookShelf,
    };
  }

  /**
   * 下载远程书籍到本地
   */
  async downloadRemoteBook(remoteBook: RemoteBook): Promise<string> {
    const booksDir = await getBooksDirectory();
    const localPath = await join(booksDir, remoteBook.filename);
    const fs = await getFileSystem();

    // 下载文件内容
    const content = await this.client.downloadFile(remoteBook.path);
    const contentArray = new Uint8Array(content);

    // 保存到本地
    await fs.writeFile(localPath, contentArray);

    return localPath;
  }

  /**
   * 上传书籍到远程
   */
  async upload(bookUrl: string, fileName: string): Promise<void> {
    const fs = await getFileSystem();

    // 读取本地文件
    const content = await fs.readFile(bookUrl);
    const contentArray = content instanceof ArrayBuffer ? new Uint8Array(content) : new Uint8Array(content);

    // 上传到 WebDav
    const remotePath = `${this.rootBookPath}/${fileName}`;
    await this.client.uploadFile(remotePath, contentArray);
  }

  /**
   * 删除远程书籍
   */
  async delete(remoteBookUrl: string): Promise<void> {
    await this.client.delete(remoteBookUrl);
  }

  /**
   * 检查是否是书籍文件
   */
  private isBookFile(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'txt' || ext === 'epub' || ext === 'umd';
  }

  /**
   * 检查是否是压缩文件
   */
  private isArchiveFile(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'zip' || ext === 'rar' || ext === '7z';
  }

  /**
   * 检查书籍是否已在书架中
   */
  private async checkBookInShelf(_filename: string): Promise<boolean> {
    try {
      // 这里需要根据文件名查找书籍，可能需要遍历所有书籍
      // 简化实现：检查是否有同名文件
      // TODO: 实现更准确的检查逻辑
      return false;
    } catch {
      return false;
    }
  }
}
