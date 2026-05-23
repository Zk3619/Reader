import { getDatabase } from '@/lib/database/database-core';
import type { Server } from '@/types';

export async function getAllServers(): Promise<Server[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM servers ORDER BY sortNumber ASC'
  );
  return rows.map(mapRow);
}

export async function upsertServer(server: Server): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO servers (id, name, type, config, sortNumber)
     VALUES (?, ?, ?, ?, ?)`,
    [server.id, server.name, server.type, server.config ?? null, server.sortNumber]
  );
}

export async function deleteServer(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM servers WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): Server {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    type: String(row.type ?? ''),
    config: row.config ? String(row.config) : undefined,
    sortNumber: Number(row.sortNumber ?? 0),
  };
}
