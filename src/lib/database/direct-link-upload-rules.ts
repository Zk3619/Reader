import { getDatabase } from '@/lib/database/database-core';
import type { DirectLinkUploadRule } from '@/types';

export async function getAllDirectLinkUploadRules(): Promise<DirectLinkUploadRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM direct_link_upload_rules ORDER BY sortOrder ASC'
  );
  return rows.map(mapRow);
}

export async function upsertDirectLinkUploadRule(rule: DirectLinkUploadRule): Promise<number> {
  const db = await getDatabase();
  if (rule.id != null) {
    await db.execute(
      `UPDATE direct_link_upload_rules SET
        uploadUrl = ?, downloadUrlRule = ?, summary = ?, compress = ?,
        customHeaders = ?, timeout = ?, retryCount = ?, sortOrder = ?,
        isDefault = ?, uploadCount = ?, lastUsedTime = ?, createTime = ?, updateTime = ?
       WHERE id = ?`,
      [
        rule.uploadUrl,
        rule.downloadUrlRule,
        rule.summary,
        rule.compress ? 1 : 0,
        rule.customHeaders ?? null,
        rule.timeout,
        rule.retryCount,
        rule.sortOrder,
        rule.isDefault ? 1 : 0,
        rule.uploadCount,
        rule.lastUsedTime,
        rule.createTime,
        rule.updateTime,
        rule.id,
      ]
    );
    return rule.id;
  }
  await db.execute(
    `INSERT INTO direct_link_upload_rules (
      uploadUrl, downloadUrlRule, summary, compress, customHeaders, timeout,
      retryCount, sortOrder, isDefault, uploadCount, lastUsedTime, createTime, updateTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.uploadUrl,
      rule.downloadUrlRule,
      rule.summary,
      rule.compress ? 1 : 0,
      rule.customHeaders ?? null,
      rule.timeout,
      rule.retryCount,
      rule.sortOrder,
      rule.isDefault ? 1 : 0,
      rule.uploadCount,
      rule.lastUsedTime,
      rule.createTime,
      rule.updateTime,
    ]
  );
  const rows = await db.select<{ id: number }>('SELECT last_insert_rowid() as id');
  return Number(rows[0]?.id ?? 0);
}

export async function deleteDirectLinkUploadRule(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM direct_link_upload_rules WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): DirectLinkUploadRule {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    uploadUrl: String(row.uploadUrl ?? ''),
    downloadUrlRule: String(row.downloadUrlRule ?? ''),
    summary: String(row.summary ?? ''),
    compress: Boolean(row.compress ?? 0),
    customHeaders: row.customHeaders ? String(row.customHeaders) : undefined,
    timeout: Number(row.timeout ?? 0),
    retryCount: Number(row.retryCount ?? 0),
    sortOrder: Number(row.sortOrder ?? 0),
    isDefault: Boolean(row.isDefault ?? 0),
    uploadCount: Number(row.uploadCount ?? 0),
    lastUsedTime: Number(row.lastUsedTime ?? 0),
    createTime: Number(row.createTime ?? 0),
    updateTime: Number(row.updateTime ?? 0),
  };
}
