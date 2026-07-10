const MODULE_RAIL_COOKIE_NAME = 'module-sidebar-rail:state';
const MODULE_RAIL_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function readModuleSidebarRailExpanded(defaultOpen = true): boolean {
  if (typeof document === 'undefined') return defaultOpen;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${MODULE_RAIL_COOKIE_NAME}=([^;]*)`),
  );
  if (!match) return defaultOpen;
  return match[1] === 'true';
}

export function persistModuleSidebarRailExpanded(expanded: boolean): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${MODULE_RAIL_COOKIE_NAME}=${expanded}; path=/; max-age=${MODULE_RAIL_COOKIE_MAX_AGE}`;
}

export type ModuleSidebarRailState = 'expanded' | 'collapsed';

export function moduleSidebarRailState(expanded: boolean): ModuleSidebarRailState {
  return expanded ? 'expanded' : 'collapsed';
}
