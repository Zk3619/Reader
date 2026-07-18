/**
 * 本地存储工具
 * 支持 Tauri Store 插件和 Web localStorage 两种方案
 * 对应 legado 项目的存储功能
 * 
 * 自动检测运行环境：
 * - Tauri环境：使用 @tauri-apps/plugin-store
 * - Web环境：使用 localStorage 降级方案
 */

import { join } from '@tauri-apps/api/path';
import { Store } from '@tauri-apps/plugin-store';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { getConfig, setConfig } from '@/lib/platform/config-file';
import { isTauri } from '@/lib/platform/detect';

/**
 * 默认存储文件名（仅Tauri使用）
 */
const DEFAULT_STORE_FILE = 'settings.json';

/**
 * Web平台存储实现（使用localStorage）
 */
class WebStorage {
    private prefix: string;

    constructor(fileName: string = DEFAULT_STORE_FILE) {
        // 使用文件名作为前缀，避免不同文件的数据冲突
        this.prefix = `store_${fileName}_`;
    }

    private getKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const item = localStorage.getItem(this.getKey(key));
            if (item === null) {
                return null;
            }
            return JSON.parse(item) as T;
        } catch (error) {
            console.error(`获取localStorage值失败 [${key}]:`, error);
            return null;
        }
    }

    async set<T>(key: string, value: T): Promise<void> {
        try {
            localStorage.setItem(this.getKey(key), JSON.stringify(value));
        } catch (error) {
            console.error(`设置localStorage值失败 [${key}]:`, error);
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            localStorage.removeItem(this.getKey(key));
        } catch (error) {
            console.error(`删除localStorage值失败 [${key}]:`, error);
            throw error;
        }
    }

    async keys(): Promise<string[]> {
        try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    // 移除前缀
                    keys.push(key.substring(this.prefix.length));
                }
            }
            return keys;
        } catch (error) {
            console.error('获取localStorage所有键失败:', error);
            return [];
        }
    }
}

/** 与 Store 插件兼容的接口：get/set/delete/keys/save */
type StoreLike = {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    save(): Promise<void>;
    keys(): Promise<string[]>;
};

/**
 * 使用 settings.json 作为后端的“存储”（应用设置与 dataDir 等均在此文件中）
 */
async function createConfigBackedStore(): Promise<StoreLike> {
    return {
        async get<T>(key: string): Promise<T | undefined> {
            const config = await getConfig();
            const v = config[key];
            return v as T | undefined;
        },
        async set(key: string, value: unknown): Promise<void> {
            const config = await getConfig();
            config[key] = value;
            await setConfig(config);
        },
        async delete(key: string): Promise<void> {
            const config = await getConfig();
            delete config[key];
            await setConfig(config);
        },
        async save(): Promise<void> {},
        async keys(): Promise<string[]> {
            const config = await getConfig();
            return Object.keys(config);
        },
    };
}

/**
 * Tauri平台存储实现：默认 settings 使用 settings.json，其他文件仍用 Store 插件
 */
class TauriStorage {
    private fileName: string;
    private storePromise: Promise<StoreLike | Store | null> | null = null;

    constructor(fileName: string = DEFAULT_STORE_FILE) {
        this.fileName = fileName;
    }

    private async getStore(): Promise<StoreLike | Store | null> {
        if (!this.storePromise) {
            this.storePromise = (async () => {
                try {
                    if (this.fileName === DEFAULT_STORE_FILE) {
                        return await createConfigBackedStore();
                    }
                    const baseDir = await getAppDataDir();
                    const storePath = await join(baseDir, this.fileName);
                    return await Store.load(storePath);
                } catch (error) {
                    console.warn('[存储] Tauri Store 插件不可用，将回退到 WebStorage:', error);
                    return null;
                }
            })();
        }
        return this.storePromise;
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const store = await this.getStore();
            if (!store) {
                // 插件不可用，回退到 WebStorage
                const webStorage = new WebStorage(this.fileName);
                return await webStorage.get<T>(key);
            }
            const value = await store.get<T>(key);
            return value ?? null;
        } catch (error) {
            console.error(`获取Tauri存储值失败 [${key}]:`, error);
            // 出错时回退到 WebStorage
            try {
                const webStorage = new WebStorage(this.fileName);
                return await webStorage.get<T>(key);
            } catch (fallbackError) {
                console.error(`WebStorage 回退也失败 [${key}]:`, fallbackError);
                return null;
            }
        }
    }

    async set<T>(key: string, value: T): Promise<void> {
        try {
            const store = await this.getStore();
            if (!store) {
                // 插件不可用，回退到 WebStorage
                const webStorage = new WebStorage(this.fileName);
                await webStorage.set(key, value);
                return;
            }
            await store.set(key, value);
            await store.save();
        } catch (error) {
            console.error(`设置Tauri存储值失败 [${key}]:`, error);
            // 出错时回退到 WebStorage
            try {
                const webStorage = new WebStorage(this.fileName);
                await webStorage.set(key, value);
            } catch (fallbackError) {
                console.error(`WebStorage 回退也失败 [${key}]:`, fallbackError);
                throw fallbackError;
            }
        }
    }

    async delete(key: string): Promise<void> {
        try {
            const store = await this.getStore();
            if (!store) {
                // 插件不可用，回退到 WebStorage
                const webStorage = new WebStorage(this.fileName);
                await webStorage.delete(key);
                return;
            }
            await store.delete(key);
            await store.save();
        } catch (error) {
            console.error(`删除Tauri存储值失败 [${key}]:`, error);
            // 出错时回退到 WebStorage
            try {
                const webStorage = new WebStorage(this.fileName);
                await webStorage.delete(key);
            } catch (fallbackError) {
                console.error(`WebStorage 回退也失败 [${key}]:`, fallbackError);
                throw fallbackError;
            }
        }
    }

    async keys(): Promise<string[]> {
        try {
            const store = await this.getStore();
            if (!store) {
                // 插件不可用，回退到 WebStorage
                const webStorage = new WebStorage(this.fileName);
                return await webStorage.keys();
            }
            return await store.keys();
        } catch (error) {
            console.error('获取Tauri存储所有键失败:', error);
            // 出错时回退到 WebStorage
            try {
                const webStorage = new WebStorage(this.fileName);
                return await webStorage.keys();
            } catch (fallbackError) {
                console.error('WebStorage 回退也失败:', fallbackError);
                return [];
            }
        }
    }
}

/**
 * 获取存储实例（自动选择Tauri或Web方案）
 */
function getStorageInstance(fileName: string = DEFAULT_STORE_FILE): WebStorage | TauriStorage {
    if (isTauri()) {
        return new TauriStorage(fileName);
    } else {
        return new WebStorage(fileName);
    }
}

/**
 * 获取存储值
 */
export async function getStorage<T>(key: string, fileName?: string): Promise<T | null> {
    try {
        const storage = getStorageInstance(fileName);
        return await storage.get<T>(key);
    } catch (error) {
        console.error(`获取存储值失败 [${key}]:`, error);
        return null;
    }
}

/**
 * 设置存储值
 */
export async function setStorage<T>(key: string, value: T, fileName?: string): Promise<void> {
    try {
        const storage = getStorageInstance(fileName);
        await storage.set(key, value);
    } catch (error) {
        console.error(`设置存储值失败 [${key}]:`, error);
        throw error;
    }
}

/**
 * 删除存储值
 */
export async function deleteStorage(key: string, fileName?: string): Promise<void> {
    try {
        const storage = getStorageInstance(fileName);
        await storage.delete(key);
    } catch (error) {
        console.error(`删除存储值失败 [${key}]:`, error);
        throw error;
    }
}

/**
 * 检查存储键是否存在
 */
export async function hasStorage(key: string, fileName?: string): Promise<boolean> {
    try {
        const storage = getStorageInstance(fileName);
        const value = await storage.get(key);
        return value !== null && value !== undefined;
    } catch (error) {
        console.error(`检查存储键失败 [${key}]:`, error);
        return false;
    }
}

/**
 * 获取所有存储键
 */
export async function getAllKeys(fileName?: string): Promise<string[]> {
    try {
        const storage = getStorageInstance(fileName);
        return await storage.keys();
    } catch (error) {
        console.error('获取所有存储键失败:', error);
        return [];
    }
}

/**
 * 清空所有存储
 */
export async function clearStorage(fileName?: string): Promise<void> {
    try {
        const storage = getStorageInstance(fileName);
        const keys = await storage.keys();
        for (const key of keys) {
            await storage.delete(key);
        }
    } catch (error) {
        console.error('清空存储失败:', error);
        throw error;
    }
}
