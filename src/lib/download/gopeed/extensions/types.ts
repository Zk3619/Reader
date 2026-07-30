/**
 * Gopeed 扩展类型（对齐 pkg/download/extension.go）
 */

export type ActivationEvent = 'onResolve' | 'onStart' | 'onError' | 'onDone';

export type SettingType = 'string' | 'number' | 'boolean';

export interface SettingOption {
  label: string;
  value: string;
}

export interface ExtensionSetting {
  name: string;
  title: string;
  description?: string;
  required?: boolean;
  type: SettingType;
  value?: unknown;
  options?: SettingOption[];
}

export interface ExtensionMatch {
  /** Chrome match patterns */
  urls?: string[];
  /** Request label keys */
  labels?: string[];
}

export interface ExtensionScript {
  event: ActivationEvent | string;
  match?: ExtensionMatch;
  entry: string;
}

export interface ExtensionRepository {
  url: string;
  directory?: string;
}

/** manifest.json 原始形态（安装前） */
export interface ExtensionManifest {
  name: string;
  title: string;
  version: string;
  author?: string;
  description?: string;
  icon?: string;
  homepage?: string;
  repository?: ExtensionRepository;
  scripts?: ExtensionScript[];
  settings?: ExtensionSetting[];
}

/** 已安装扩展运行时对象 */
export interface Extension extends ExtensionManifest {
  identity: string;
  scripts: ExtensionScript[];
  settings: ExtensionSetting[];
  disabled: boolean;
  devMode: boolean;
  /** 开发模式下的源码目录 */
  devPath: string;
  /** 安装目录（非 dev） */
  installPath: string;
  createdAt: number;
  updatedAt: number;
}

export interface OnResolveContext {
  req: { url: string; rawUrl?: string; labels?: Record<string, string> };
  res?: {
    name?: string;
    size?: number;
    files?: Array<{ name: string; size: number; selected?: boolean }>;
  } | null;
}

export interface OnTaskContext {
  task: {
    id: string;
    url: string;
    title: string;
    state: string;
    filepath: string;
    error?: string | null;
    meta?: Record<string, unknown>;
  };
  error?: string | null;
}

export function buildExtensionIdentity(manifest: Pick<ExtensionManifest, 'author' | 'name'>): string {
  if (!manifest.author) return manifest.name;
  return `${manifest.author}@${manifest.name}`;
}

export function validateManifest(m: ExtensionManifest): void {
  if (!m.name) throw new Error('extension name is required');
  if (!m.title) throw new Error('extension title is required');
  if (!m.version) throw new Error('extension version is required');
}
