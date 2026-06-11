import type { DictRule } from '@/types';
import raw from '@/lib/database/default-data/dictRules.json';

interface RawDictRule {
  name?: string;
  urlRule?: string;
  showRule?: string;
  enabled?: boolean;
  sortNumber?: number;
}

export const DEFAULT_DICT_RULES: DictRule[] = (raw as RawDictRule[]).map((item) => ({
  name: String(item.name ?? ''),
  urlRule: String(item.urlRule ?? ''),
  showRule: String(item.showRule ?? ''),
  enabled: item.enabled !== false,
  sortNumber: Number(item.sortNumber ?? 0),
}));
