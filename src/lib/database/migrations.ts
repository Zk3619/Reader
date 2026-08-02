/**
 * 数据库迁移定义
 *
 * 开发期基线：v1 = 当前产品最终 schema（见 schema-v1.sql）。
 * 对外测试版/正式版发布后，增量变更从 v2 起追加。
 * 历史链（原 v96…v129）已归档于 `_archive/`。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  BASELINE_SCHEMA_VERSION,
  migrateBaselineV1,
} from '@/lib/database/migration-v1';

export { BASELINE_SCHEMA_VERSION };

export interface Migration {
  version: number;
  up: (db: DatabaseAdapter) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: BASELINE_SCHEMA_VERSION,
    up: migrateBaselineV1,
  },
];
