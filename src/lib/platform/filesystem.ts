/**
 * 文件系统平台适配层
 * 提供统一的文件系统接口，支持 Tauri 和 Web 环境
 * 
 * 设计原则：
 * 1. 优先使用 Tauri 插件（如果可用）
 * 2. Web 环境降级到 File System Access API 或 IndexedDB
 * 3. 提供统一的 API 接口
 */

import { join } from '@tauri-apps/api/path';
import {
  exists as fsExists,
  mkdir as fsMkdir,
  readDir as fsReadDir,
  readFile as fsReadFile,
  readTextFile as fsReadTextFile,
  remove as fsRemove,
  stat as fsStat,
  writeFile as fsWriteFile,
  writeTextFile as fsWriteTextFile,
} from '@tauri-apps/plugin-fs';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { parseStorageRef } from '@/lib/platform/fs/storage-ref';

/** 是否为 StorageRef 字符串（path:/uri:/handle: 等） */
export function isStorageRefString(path: string): boolean {
  const t = path.trim();
  return (
    t.startsWith('path:') ||
    t.startsWith('uri:') ||
    t.startsWith('opfs:') ||
    t.startsWith('handle:') ||
    t.startsWith('virtual:') ||
    t.startsWith('local::') ||
    t.startsWith('saf-tree:') ||
    t.startsWith('content://')
  );
}

/**
 * 转为 Tauri plugin-fs / @tauri-apps/api/path 可用的原生路径。
 * L1 选文件返回的 `path:D:\...` 必须先剥离前缀。
 */
export function toNativeFilesystemPath(pathOrRef: string): string {
  if (isLocalBookPath(pathOrRef)) {
    throw new Error('local:: 请使用 readFile() 便捷方法');
  }
  if (!isStorageRefString(pathOrRef)) return pathOrRef;
  const ref = parseStorageRef(pathOrRef);
  if (ref.kind === 'path' || ref.kind === 'uri') return ref.value;
  throw new Error(
    `无法转为原生路径（请使用 readBytes）: ${pathOrRef.slice(0, 64)}`,
  );
}

// File System Access API 类型声明
declare global {
  interface Window {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        description?: string;
        accept?: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept?: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;
  }
}

/**
 * 文件系统接口
 */
export interface FileSystemAdapter {
  /**
   * 读取文件为 ArrayBuffer
   */
  readFile(path: string): Promise<ArrayBuffer>;

  /**
   * 读取文件为文本
   */
  readTextFile(path: string): Promise<string>;

  /**
   * 写入文件（ArrayBuffer）
   */
  writeFile(path: string, data: ArrayBuffer): Promise<void>;

  /**
   * 写入文件（文本）
   */
  writeTextFile(path: string, content: string): Promise<void>;

  /**
   * 检查文件是否存在
   */
  exists(path: string): Promise<boolean>;

  /**
   * 创建目录
   */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /**
   * 删除文件或目录
   */
  remove(path: string, recursive?: boolean): Promise<void>;

  /**
   * 列出目录内容
   */
  readDir(path: string): Promise<string[]>;

  /**
   * 获取文件大小（字节）
   */
  getFileSize(path: string): Promise<number>;

  /**
   * 获取文件修改时间（毫秒时间戳），不可用时返回 null
   */
  getFileMtime(path: string): Promise<number | null>;

  /**
   * 计算文件的 SHA-256 哈希值（用于文件内容比较）
   */
  getFileHash(path: string): Promise<string>;
}

/**
 * 本地书籍文件存储目录名
 */
const LOCAL_BOOKS_DIR = 'local-books';

/**
 * 检查路径是否是本地书籍虚拟路径（local::uuid 格式）
 */
function isLocalBookPath(path: string): boolean {
  return path.startsWith('local::');
}

/**
 * 从虚拟路径中提取 UUID
 */
function extractLocalBookId(path: string): string {
  return path.replace('local::', '');
}

/**
 * Tauri 文件系统实现
 */
class TauriFileSystemAdapter implements FileSystemAdapter {
  /**
   * 获取本地书籍存储目录路径
   */
  private async getLocalBooksDir(): Promise<string> {
    const appDir = await getAppDataDir();
    return await join(appDir, LOCAL_BOOKS_DIR);
  }

  /**
   * 获取本地书籍文件的完整路径
   */
  private async getLocalBookFilePath(bookId: string): Promise<string> {
    const booksDir = await this.getLocalBooksDir();
    return await join(booksDir, `${bookId}.dat`);
  }

  /**
   * 确保本地书籍目录存在
   */
  private async ensureLocalBooksDir(): Promise<void> {
    const booksDir = await this.getLocalBooksDir();
    if (!await fsExists(booksDir)) {
      await fsMkdir(booksDir, { recursive: true });
    }
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    if (isStorageRefString(path)) {
      const ref = parseStorageRef(path);
      if (ref.kind !== 'path') {
        const { readBytes } = await import('@/lib/platform/fs/read-write');
        return readBytes(ref);
      }
    }

    let actualPath = path;
    if (isStorageRefString(path)) {
      actualPath = parseStorageRef(path).value;
    } else if (isLocalBookPath(path)) {
      actualPath = await this.getLocalBookFilePath(extractLocalBookId(path));
    }

    const data = await fsReadFile(actualPath);
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    return buffer as ArrayBuffer;
  }

  async readTextFile(path: string): Promise<string> {
    return await fsReadTextFile(toNativeFilesystemPath(path));
  }

  async writeFile(path: string, data: ArrayBuffer): Promise<void> {
    let actualPath = path;
    if (isLocalBookPath(path)) {
      await this.ensureLocalBooksDir();
      const bookId = extractLocalBookId(path);
      actualPath = await this.getLocalBookFilePath(bookId);
    } else if (isStorageRefString(path)) {
      actualPath = toNativeFilesystemPath(path);
    }

    await fsWriteFile(actualPath, new Uint8Array(data));
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await fsWriteTextFile(toNativeFilesystemPath(path), content);
  }

  async exists(path: string): Promise<boolean> {
    if (isLocalBookPath(path)) {
      const bookId = extractLocalBookId(path);
      const actualPath = await this.getLocalBookFilePath(bookId);
      return fsExists(actualPath);
    }
    if (isStorageRefString(path)) {
      const ref = parseStorageRef(path);
      if (ref.kind === 'path' || ref.kind === 'uri') {
        return fsExists(ref.value);
      }
      const { fileRefExists } = await import('@/lib/platform/fs/read-write');
      return fileRefExists(ref);
    }
    return fsExists(path);
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    await fsMkdir(toNativeFilesystemPath(path), { recursive });
  }

  async remove(path: string, recursive: boolean = false): Promise<void> {
    await fsRemove(toNativeFilesystemPath(path), { recursive });
  }

  async readDir(path: string): Promise<string[]> {
    const entries = await fsReadDir(toNativeFilesystemPath(path));
    return entries.map(entry => {
      // DirEntry 可能有 name 属性
      if (entry && typeof entry === 'object' && 'name' in entry) {
        return String(entry.name || '');
      }
      // 如果 entry 本身就是字符串路径
      if (typeof entry === 'string') {
        return entry;
      }
      return '';
    });
  }

  async getFileSize(path: string): Promise<number> {
    if (isStorageRefString(path)) {
      const ref = parseStorageRef(path);
      if (ref.kind === 'path' || ref.kind === 'uri') {
        const metadata = await fsStat(ref.value);
        return metadata.size ?? 0;
      }
      const content = await this.readFile(path);
      return content.byteLength;
    }
    const metadata = await fsStat(path);
    return metadata.size ?? 0;
  }

  async getFileMtime(path: string): Promise<number | null> {
    if (isStorageRefString(path)) {
      const ref = parseStorageRef(path);
      if (ref.kind === 'path' || ref.kind === 'uri') {
        const metadata = await fsStat(ref.value);
        return metadata.mtime?.getTime() ?? null;
      }
      return null;
    }
    const metadata = await fsStat(path);
    return metadata.mtime?.getTime() ?? null;
  }

  async getFileHash(path: string): Promise<string> {
    const content = await this.readFile(path);

    // 使用 Web Crypto API 计算 SHA-256 哈希
    const hashBuffer = await crypto.subtle.digest('SHA-256', content);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }
}

/**
 * Web 文件系统实现（使用 IndexedDB 缓存）
 */
class WebFileSystemAdapter implements FileSystemAdapter {
  private dbName = 'reader-filesystem';
  private dbVersion = 1;
  private storeName = 'files';

  /**
   * 获取 IndexedDB 数据库
   */
  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  /**
   * 从 IndexedDB 读取文件
   */
  private async readFromIndexedDB(path: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(path);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? (result as ArrayBuffer) : null);
        };
      });
    } catch (error) {
      console.error('[文件系统] 从 IndexedDB 读取失败:', error);
      return null;
    }
  }

  /**
   * 写入文件到 IndexedDB
   */
  private async writeToIndexedDB(path: string, data: ArrayBuffer): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(data, path);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[文件系统] 写入 IndexedDB 失败:', error);
      throw error;
    }
  }

  /**
   * 使用 File System Access API 选择文件
   * Web 环境专用：让用户选择文件
   */
  async selectFile(): Promise<File | null> {
    try {
      if (window.showOpenFilePicker) {
        const fileHandles = await window.showOpenFilePicker({
          multiple: false,
        });
        if (fileHandles && fileHandles.length > 0) {
          return await fileHandles[0].getFile();
        }
      }
    } catch (error) {
      // 用户取消选择
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      console.warn('[文件系统] File System Access API 不可用:', error);
    }

    // 降级到 input 元素
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        resolve(file || null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    // 首先尝试从 IndexedDB 读取
    const cached = await this.readFromIndexedDB(path);
    if (cached) {
      return cached;
    }

    // 如果缓存不存在，提示用户选择文件
    // 注意：Web 环境无法直接通过路径读取文件，需要用户选择
    throw new Error(
      `Web 环境无法直接读取文件路径 "${path}"。请使用 selectFile() 方法让用户选择文件。`
    );
  }

  async readTextFile(path: string): Promise<string> {
    const buffer = await this.readFile(path);
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  async writeFile(path: string, data: ArrayBuffer): Promise<void> {
    // Web 环境：保存到 IndexedDB
    await this.writeToIndexedDB(path, data);

    // 可选：尝试使用 File System Access API 保存到用户选择的文件
    try {
      if (window.showSaveFilePicker) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: path.split('/').pop() || 'file',
        });
        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        }
      }
    } catch (error) {
      // 用户取消或 API 不可用，仅保存到 IndexedDB
      console.warn('[文件系统] 保存到文件系统失败，仅保存到 IndexedDB:', error);
    }
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    await this.writeFile(path, data.buffer);
  }

  async exists(path: string): Promise<boolean> {
    const cached = await this.readFromIndexedDB(path);
    return cached !== null;
  }

  async mkdir(_path: string, _recursive: boolean = true): Promise<void> {
    // Web 环境：IndexedDB 不需要创建目录
    // 路径中的目录信息会在存储时保留
    console.warn('[文件系统] Web 环境不支持 mkdir，路径会在存储时自动处理');
  }

  async remove(path: string, _recursive: boolean = false): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(path);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[文件系统] 删除文件失败:', error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const content = await this.readFromIndexedDB(path);
    return content ? content.byteLength : 0;
  }

  async getFileMtime(_path: string): Promise<number | null> {
    return null;
  }

  async getFileHash(path: string): Promise<string> {
    // 读取文件内容
    const content = await this.readFromIndexedDB(path);
    if (!content) {
      throw new Error(`文件不存在: ${path}`);
    }

    // 使用 Web Crypto API 计算 SHA-256 哈希
    const hashBuffer = await crypto.subtle.digest('SHA-256', content);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  async readDir(_path: string): Promise<string[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAllKeys();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const keys = request.result as string[];
          // 过滤出指定路径下的文件
          const files = keys.filter(key => key.startsWith(_path));
          resolve(files);
        };
      });
    } catch (error) {
      console.error('[文件系统] 读取目录失败:', error);
      return [];
    }
  }

}

/**
 * 文件系统适配器实例
 */
let fsAdapter: FileSystemAdapter | null = null;

/**
 * 获取文件系统适配器
 */
export async function getFileSystem(): Promise<FileSystemAdapter> {
  if (fsAdapter) {
    return fsAdapter;
  }

  if (isTauri()) {
    fsAdapter = new TauriFileSystemAdapter();
  } else {
    fsAdapter = new WebFileSystemAdapter();
  }

  return fsAdapter;
}

/**
 * 便捷方法：读取文件
 */
export async function readFile(path: string): Promise<ArrayBuffer> {
  const trimmed = path.trim();
  if (
    trimmed.startsWith('path:') ||
    trimmed.startsWith('uri:') ||
    trimmed.startsWith('opfs:') ||
    trimmed.startsWith('handle:') ||
    trimmed.startsWith('virtual:') ||
    trimmed.startsWith('local::') ||
    trimmed.startsWith('content://')
  ) {
    const { readBytes } = await import('@/lib/platform/fs/read-write');
    const { parseStorageRef } = await import('@/lib/platform/fs/storage-ref');
    return readBytes(parseStorageRef(trimmed));
  }
  const fs = await getFileSystem();
  return fs.readFile(path);
}

/**
 * 便捷方法：读取文本文件
 */
export async function readTextFile(path: string): Promise<string> {
  const fs = await getFileSystem();
  return fs.readTextFile(path);
}

/**
 * 便捷方法：写入文件
 */
export async function writeFile(path: string, data: ArrayBuffer): Promise<void> {
  const fs = await getFileSystem();
  return fs.writeFile(path, data);
}

/**
 * 便捷方法：写入文本文件
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  const fs = await getFileSystem();
  return fs.writeTextFile(path, content);
}

/**
 * 便捷方法：检查文件是否存在
 */
export async function fileExists(path: string): Promise<boolean> {
  const fs = await getFileSystem();
  return fs.exists(path);
}

/**
 * Web 环境专用：让用户选择文件
 */
export async function selectFile(): Promise<File | null> {
  if (isTauri()) {
    throw new Error('selectFile() 仅在 Web 环境中可用');
  }

  const adapter = await getFileSystem() as WebFileSystemAdapter;
  return adapter.selectFile();
}
