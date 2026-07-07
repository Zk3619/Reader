/**
 * WebDav 远程书籍管理器
 */

import { getBooksDirectory } from '@/lib/local-book/import';
import { getFileSystem } from '@/lib/platform/filesystem';
import { join } from '@tauri-apps/api/path';
import { WebDavClient } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl } from '@/lib/remote-book/webdav-config-storage';
import type { RemoteBook, RemoteBookManager, WebDavConfig } from '@/types/remote-book';

export class WebDavRemoteBookManager implements RemoteBookManager {
  private client: WebDavClient;
  private rootBookPath: string;

  constructor(config: WebDavConfig) {
    const rootUrl = buildRootWebDavUrl(config);
    this.client = new WebDavClient(rootUrl, config.username, config.password);
    this.rootBookPath = (config.rootBookPath || 'books').replace(/^\/+|\/+$/g, '');
  }

  async getRemoteBookList(path: string): Promise<RemoteBook[]> {
    const fullPath = path ? `${this.rootBookPath}/${path}` : this.rootBookPath;
    const files = await this.client.listFiles(fullPath);
    const remoteBooks: RemoteBook[] = [];

    for (const file of files) {
      if (file.path === fullPath || file.path === `${fullPath}/`) continue;
      const isBookFile = this.isBookFile(file.displayName);
      const isArchiveFile = this.isArchiveFile(file.displayName);
      if (file.isDir || isBookFile || isArchiveFile) {
        remoteBooks.push({
          filename: file.displayName,
          path: file.path,
          size: file.size,
          lastModify: file.lastModify,
          contentType: file.isDir ? 'folder' : file.displayName.split('.').pop() || '',
          isOnBookShelf: false,
        });
      }
    }

    return remoteBooks;
  }

  async getRemoteBook(path: string): Promise<RemoteBook | null> {
    const files = await this.client.listFiles(path);
    const file = files.find((f) => f.path === path);
    if (!file) return null;
    return {
      filename: file.displayName,
      path: file.path,
      size: file.size,
      lastModify: file.lastModify,
      contentType: file.isDir ? 'folder' : file.displayName.split('.').pop() || '',
      isOnBookShelf: false,
    };
  }

  async downloadRemoteBook(remoteBook: RemoteBook): Promise<string> {
    const booksDir = await getBooksDirectory();
    const localPath = await join(booksDir, remoteBook.filename);
    const fs = await getFileSystem();
    const content = await this.client.downloadFile(remoteBook.path);
    await fs.writeFile(localPath, content);
    return localPath;
  }

  async upload(bookUrl: string, fileName: string): Promise<void> {
    const fs = await getFileSystem();
    const content = await fs.readFile(bookUrl);
    const contentArray =
      content instanceof ArrayBuffer ? new Uint8Array(content) : new Uint8Array(content);
    const remotePath = `${this.rootBookPath}/${fileName}`;
    await this.client.uploadFile(remotePath, contentArray);
  }

  async delete(remoteBookUrl: string): Promise<void> {
    await this.client.delete(remoteBookUrl);
  }

  private isBookFile(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'txt' || ext === 'epub' || ext === 'umd';
  }

  private isArchiveFile(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'zip' || ext === 'rar' || ext === '7z';
  }
}

export { WebDavClient } from '@/lib/remote-book/webdav-client';
