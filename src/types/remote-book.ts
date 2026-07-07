/**
 * 远程书籍相关类型定义
 * 参考 legado 项目的 RemoteBook 实现
 */

/**
 * 远程书籍信息
 */
export interface RemoteBook {
  /** 文件名 */
  filename: string;
  /** 远程路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（时间戳，毫秒） */
  lastModify: number;
  /** 内容类型（文件扩展名或 "folder"） */
  contentType: string;
  /** 是否已在书架中 */
  isOnBookShelf: boolean;
}

/**
 * 远程书籍管理器接口
 * 参考 legado 项目的 RemoteBookManager
 */
export interface RemoteBookManager {
  /**
   * 获取远程书籍列表
   * @param path 远程路径
   */
  getRemoteBookList(path: string): Promise<RemoteBook[]>;

  /**
   * 根据路径获取远程书籍信息
   * @param path 远程路径
   */
  getRemoteBook(path: string): Promise<RemoteBook | null>;

  /**
   * 下载远程书籍到本地
   * @param remoteBook 远程书籍信息
   * @returns 本地文件路径
   */
  downloadRemoteBook(remoteBook: RemoteBook): Promise<string>;

  /**
   * 上传书籍到远程
   * @param bookUrl 本地书籍路径
   * @param fileName 文件名
   */
  upload(bookUrl: string, fileName: string): Promise<void>;

  /**
   * 删除远程书籍
   * @param remoteBookUrl 远程书籍路径
   */
  delete(remoteBookUrl: string): Promise<void>;
}

/**
 * WebDav 配置信息（对齐 Legado PreferKey + AppWebDav）
 */
export interface WebDavConfig {
  /** WebDav 服务器地址 */
  url: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 服务器 ID（用于标识不同的 WebDav 服务器） */
  serverID?: number;
  /** 远程书籍根目录（默认为 books） */
  rootBookPath?: string;
  /** 云同步根子目录（Legado 默认 legado） */
  webDavDir?: string;
  /** 备份文件名中的设备标识（Legado webDavDeviceName） */
  deviceName?: string;
  /** 启用自动备份（24 小时间隔，在设置页触发） */
  autoBackupEnabled?: boolean;
  /** 启动/打开设置时检测云端是否有更新备份 */
  autoCheckNewBackup?: boolean;
  /** 上次成功上传备份的时间戳 */
  lastBackupTime?: number;
  /** 上次上传的远程备份文件名 */
  lastRemoteBackupName?: string;
}

/**
 * 远程书籍排序方式
 */
export type RemoteBookSort = 'name' | 'time' | 'size';
