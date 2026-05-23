/**
 * 数据库备份管理器
 * 提供高级的备份和恢复功能
 */

import { save } from '@tauri-apps/plugin-dialog';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readBytes } from '@/lib/platform/fs/read-write';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
  exportDatabaseAsBlob,
  exportDatabaseAndDownload,
  importDatabase,
  importDatabaseFromFile,
  importDatabaseFromPath,
} from '@/lib/database/export-import';
import { isTauri } from '@/lib/platform/detect';

/**
 * 备份选项
 */
export interface BackupOptions {
  /** 文件名（不含扩展名） */
  filename?: string;
  /** 是否包含时间戳 */
  includeTimestamp?: boolean;
  /** 备份描述 */
  description?: string;
}

/**
 * 备份信息
 */
export interface BackupInfo {
  /** 备份文件名 */
  filename: string;
  /** 备份时间 */
  timestamp: number;
  /** 文件大小（字节） */
  size: number;
  /** 备份描述 */
  description?: string;
}

/**
 * 导出数据库备份
 * 
 * @param options 备份选项
 * @returns 备份信息
 */
export async function createBackup(options: BackupOptions = {}): Promise<BackupInfo> {
  const {
    filename = 'reader-backup',
    includeTimestamp = true,
    description,
  } = options;

  // 生成文件名
  let backupFilename = filename;
  if (includeTimestamp) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    backupFilename = `${filename}-${timestamp}`;
  }
  backupFilename = `${backupFilename}.db`;

  // 导出数据库
  const blob = await exportDatabaseAsBlob(backupFilename);

  // 下载文件（Web 环境）或保存到文件系统（Tauri 环境）
  if (isTauri()) {
    // Tauri 环境：保存到用户选择的目录
    await saveBackupToFile(blob, backupFilename);
  } else {
    // Web 环境：触发下载
    await exportDatabaseAndDownload(backupFilename);
  }

  return {
    filename: backupFilename,
    timestamp: Date.now(),
    size: blob.size,
    description,
  };
}

/**
 * 保存备份到文件（Tauri 环境）
 */
async function saveBackupToFile(blob: Blob, filename: string): Promise<void> {
  try {
    // 打开文件保存对话框
    const filePath = await save({
      defaultPath: filename,
      filters: [
        {
          name: 'SQLite Database',
          extensions: ['db', 'sqlite', 'sqlite3'],
        },
      ],
    });

    if (!filePath) {
      throw new Error('用户取消保存');
    }

    // 将 Blob 转换为 ArrayBuffer
    const buffer = await blob.arrayBuffer();
    await writeFile(filePath, new Uint8Array(buffer));

    console.log('[备份管理器] 备份已保存到:', filePath);
  } catch (error) {
    console.error('[备份管理器] 保存备份失败:', error);
    throw error;
  }
}

/**
 * 恢复数据库备份
 * 
 * @param replace 是否替换现有数据库（默认 true）
 */
export async function restoreBackup(replace: boolean = true): Promise<void> {
  if (isTauri()) {
    // Tauri 环境：使用文件选择对话框
    await restoreBackupFromFile(replace);
  } else {
    // Web 环境：使用文件输入
    await importDatabaseFromFile(replace);
  }
}

/** 从已选 File 恢复数据库（书源导入流程检测到 .db 时使用） */
export async function restoreBackupFromUserFile(file: File, replace = true): Promise<void> {
  const buffer = await file.arrayBuffer();
  await importDatabase(buffer, replace);
  console.log('[备份管理器] 已从所选文件恢复备份:', file.name);
}

/**
 * 从文件恢复备份（Tauri 环境）
 */
async function restoreBackupFromFile(replace: boolean): Promise<void> {
  try {
    // 打开文件选择对话框
    const picked = await pickFile({
      filters: [
        {
          name: 'SQLite Database',
          extensions: ['db', 'sqlite', 'sqlite3'],
        },
      ],
    });

    if (picked.ref.kind === 'path' || picked.ref.kind === 'uri') {
      await importDatabaseFromPath(picked.ref.value, replace);
    } else {
      const bytes = picked.bytes ?? (await readBytes(picked.ref));
      await importDatabase(bytes, replace);
    }
    console.log('[备份管理器] 备份已恢复');
  } catch (error) {
    if (isUserCancelled(error)) {
      throw new Error('用户取消选择文件');
    }
    console.error('[备份管理器] 恢复备份失败:', error);
    throw error;
  }
}

/**
 * 获取备份文件信息（从 ArrayBuffer）
 */
export async function getBackupInfo(buffer: ArrayBuffer): Promise<BackupInfo> {
  // 可以尝试读取数据库的元数据
  // 这里简化处理，只返回基本信息
  return {
    filename: 'backup.db',
    timestamp: Date.now(),
    size: buffer.byteLength,
  };
}
