/**
 * 迁移共用工具
 */

import type { DatabaseAdapter } from '@/lib/platform/database';

export async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

export async function viewExists(db: DatabaseAdapter, name: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='view' AND name = ?`,
    [name],
  );
  return rows.length > 0;
}

export async function renameTableIfExists(
  db: DatabaseAdapter,
  from: string,
  to: string,
): Promise<boolean> {
  if (await tableExists(db, to)) return false;
  if (!(await tableExists(db, from))) return false;
  await db.execute(`ALTER TABLE "${from}" RENAME TO "${to}"`);
  return true;
}

export async function dropViewIfExists(db: DatabaseAdapter, name: string): Promise<void> {
  if (await viewExists(db, name)) {
    await db.execute(`DROP VIEW IF EXISTS "${name}"`);
  }
}

export async function dropTableIfExists(db: DatabaseAdapter, name: string): Promise<void> {
  if (await tableExists(db, name)) {
    await db.execute(`DROP TABLE IF EXISTS "${name}"`);
  }
}

export async function createCompatView(
  db: DatabaseAdapter,
  viewName: string,
  targetTable: string,
): Promise<void> {
  await dropViewIfExists(db, viewName);
  if (!(await tableExists(db, targetTable))) return;
  if (await tableExists(db, viewName)) return;
  await db.execute(`CREATE VIEW IF NOT EXISTS "${viewName}" AS SELECT * FROM "${targetTable}"`);
}

/**
 * 双轨收敛：仅 from → 改名为 to；两边都在则按共享列 INSERT OR IGNORE 后 DROP from。
 * from 若是 VIEW 则直接 DROP（不迁数据）。
 */
export async function copyTableIfDual(
  db: DatabaseAdapter,
  from: string,
  to: string,
): Promise<void> {
  await dropViewIfExists(db, from);
  if (!(await tableExists(db, from))) return;
  if (!(await tableExists(db, to))) {
    await db.execute(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    return;
  }
  const fromCols = await db.select<{ name: string }>(`PRAGMA table_info("${from}")`);
  const toCols = await db.select<{ name: string }>(`PRAGMA table_info("${to}")`);
  const toSet = new Set(toCols.map((c) => c.name));
  const shared = fromCols.map((c) => c.name).filter((n) => toSet.has(n));
  if (shared.length > 0) {
    const cols = shared.map((c) => `"${c}"`).join(', ');
    await db.execute(
      `INSERT OR IGNORE INTO "${to}" (${cols}) SELECT ${cols} FROM "${from}"`,
    );
  }
  await dropTableIfExists(db, from);
}

/** 嵌套计数：避免 v116 内再调 v115 时提前把 FK 打开 */
let foreignKeysDisableDepth = 0;

/** 迁移期关闭外键检查（DROP/重建父表时必需；须在事务外） */
export async function withForeignKeysDisabled(
  db: DatabaseAdapter,
  fn: () => Promise<void>,
): Promise<void> {
  if (foreignKeysDisableDepth === 0) {
    await db.execute('PRAGMA foreign_keys = OFF');
  }
  foreignKeysDisableDepth += 1;
  try {
    await fn();
  } finally {
    foreignKeysDisableDepth -= 1;
    if (foreignKeysDisableDepth === 0) {
      await db.execute('PRAGMA foreign_keys = ON');
    }
  }
}

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
};

/**
 * 若表仍 REFERENCES 旧父表名，按映射重建（保留数据与非自动索引）。
 * 例：reader_chapters 仍指向 books → 改为 reader_books。
 */
export async function retargetTableForeignKeys(
  db: DatabaseAdapter,
  table: string,
  parentMap: Record<string, string>,
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;

  const fks = await db.select<ForeignKeyRow>(`PRAGMA foreign_key_list("${table}")`);
  const needsRetarget = fks.some((fk) => parentMap[fk.table] != null);
  if (!needsRetarget) return false;

  const t0 = Date.now();
  console.log(`[migration] retarget FK on ${table}…`);

  const schemaRows = await db.select<{ sql: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  const createSql = schemaRows[0]?.sql;
  if (!createSql) return false;

  let newSql = createSql;
  for (const [fromParent, toParent] of Object.entries(parentMap)) {
    const re = new RegExp(`REFERENCES\\s+"?${fromParent}"?`, 'gi');
    newSql = newSql.replace(re, `REFERENCES "${toParent}"`);
  }
  if (newSql === createSql) return false;

  const tmp = `${table}__fk_fix`;
  await dropTableIfExists(db, tmp);
  newSql = newSql.replace(
    new RegExp(`^\\s*CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?["']?${table}["']?`, 'i'),
    `CREATE TABLE "${tmp}"`,
  );

  const indexRows = await db.select<{ sql: string | null }>(
    `SELECT sql FROM sqlite_master
     WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
    [table],
  );

  await db.execute(newSql);
  await db.execute(`INSERT INTO "${tmp}" SELECT * FROM "${table}"`);
  await db.execute(`DROP TABLE "${table}"`);
  await db.execute(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);

  for (const row of indexRows) {
    if (row.sql) {
      await db.execute(row.sql);
    }
  }
  console.log(`[migration] retarget FK on ${table} done (${Date.now() - t0}ms)`);
  return true;
}
