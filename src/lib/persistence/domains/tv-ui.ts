/**
 * tv.ui 兼容入口：权威实现见 tv-config.ts（settings.json / tv_config_v1）
 */
export {
  TV_CONFIG_DOMAIN_ID,
  TV_CONFIG_STORAGE_KEY,
  TV_CONFIG_VERSION,
  TV_UI_DOMAIN_ID,
  TV_UI_DOC_KEY,
  TV_UI_VERSION,
  bindTvUiPersistAppliers,
  createTvConfigPersistDomain,
  createTvUiPersistDomain,
  persistTvUiNow,
  registerTvConfigPersistDomain,
  registerTvUiPersistDomain,
  type TvConfigSnapshot,
  type TvUiSnapshot,
} from '@/lib/persistence/domains/tv-config';
