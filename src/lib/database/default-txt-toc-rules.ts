import type { TxtTocRule } from '@/types';
import raw from '@/lib/database/default-data/txtTocRule.json';

interface RawTxtTocRule {
  id?: number;
  name?: string;
  rule?: string;
  replacement?: string;
  example?: string;
  serialNumber?: number;
  enable?: boolean;
}

export const DEFAULT_TXT_TOC_RULES: TxtTocRule[] = (raw as RawTxtTocRule[]).map((item) => ({
  id: Number(item.id ?? 0),
  name: String(item.name ?? ''),
  rule: String(item.rule ?? ''),
  replacement: String(item.replacement ?? ''),
  example: item.example ? String(item.example) : undefined,
  serialNumber: Number(item.serialNumber ?? 0),
  enable: item.enable !== false,
}));
