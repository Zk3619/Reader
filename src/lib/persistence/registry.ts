/**
 * PersistenceRegistry：跨模块 hydrate / persist / flush
 */

import type { PersistDomain, PersistReason } from '@/lib/persistence/types';

const domains = new Map<string, PersistDomain>();
const hydratedIds = new Set<string>();
let flushListenersInstalled = false;
let criticalDone = false;
let deferredDone = false;

export function registerPersistDomain(domain: PersistDomain): void {
  if (domains.has(domain.id)) {
    // HMR / 重复 bootstrap：静默覆盖，避免刷屏告警
    domains.set(domain.id, domain);
    return;
  }
  domains.set(domain.id, domain);
}

export function getPersistDomain(id: string): PersistDomain | undefined {
  return domains.get(id);
}

export function listPersistDomains(): PersistDomain[] {
  return [...domains.values()];
}

async function runHydrate(domain: PersistDomain): Promise<void> {
  try {
    await domain.hydrate();
    hydratedIds.add(domain.id);
  } catch (error) {
    console.warn(`[persistence] hydrate failed: ${domain.id}`, error);
  }
}

export async function hydrateCritical(): Promise<void> {
  if (criticalDone) return;
  const list = [...domains.values()].filter((d) => d.priority === 'critical');
  await Promise.all(list.map(runHydrate));
  criticalDone = true;
}

export async function hydrateDeferred(): Promise<void> {
  if (deferredDone) return;
  const list = [...domains.values()].filter((d) => d.priority === 'deferred');
  for (const domain of list) {
    await runHydrate(domain);
  }
  deferredDone = true;
}

/** 幂等：若该域尚未 hydrate 则执行 */
export async function ensureHydrated(id: string): Promise<void> {
  if (hydratedIds.has(id)) return;
  const domain = domains.get(id);
  if (!domain) return;
  await runHydrate(domain);
}

export function isPersistDomainHydrated(id: string): boolean {
  return hydratedIds.has(id);
}

export async function persistDomain(
  id: string,
  reason: PersistReason = 'change',
): Promise<void> {
  const domain = domains.get(id);
  if (!domain?.persist) return;
  try {
    await domain.persist(reason);
  } catch (error) {
    console.warn(`[persistence] persist failed: ${id}`, error);
  }
}

export async function flushAll(): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const domain of domains.values()) {
    if (domain.flush) {
      tasks.push(
        Promise.resolve(domain.flush()).catch((error) => {
          console.warn(`[persistence] flush failed: ${domain.id}`, error);
        }),
      );
    } else if (domain.persist) {
      tasks.push(
        Promise.resolve(domain.persist('flush')).catch((error) => {
          console.warn(`[persistence] flush-persist failed: ${domain.id}`, error);
        }),
      );
    }
  }
  await Promise.all(tasks);
}

export function installPersistenceFlushListeners(): void {
  if (flushListenersInstalled || typeof window === 'undefined') return;
  flushListenersInstalled = true;
  const onHide = () => {
    void flushAll();
  };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}

export async function dumpPersistDomains(
  ids?: string[],
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const list = ids?.length
    ? ids.map((id) => domains.get(id)).filter((d): d is PersistDomain => !!d)
    : [...domains.values()];
  for (const domain of list) {
    if (!domain.exportSnapshot) continue;
    try {
      out[domain.id] = await domain.exportSnapshot();
    } catch (error) {
      console.warn(`[persistence] export failed: ${domain.id}`, error);
    }
  }
  return out;
}

export async function importPersistDomains(
  snapshots: Record<string, unknown>,
): Promise<void> {
  for (const [id, data] of Object.entries(snapshots)) {
    const domain = domains.get(id);
    if (!domain?.importSnapshot || data == null) continue;
    try {
      await domain.importSnapshot(data);
    } catch (error) {
      console.warn(`[persistence] import failed: ${id}`, error);
    }
  }
}
