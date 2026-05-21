/**
 * Unify discover -> explore naming (UI + cache + styles; lib explore* unchanged).
 * Run: node scripts/rename-discover-to-explore.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const moves = [
  ["pages/discover/DiscoverPage.tsx", "pages/explore/ExplorePage.tsx"],
  ["pages/discover/DiscoverBookListIntro.tsx", "pages/explore/ExploreBookListIntro.tsx"],
  ["pages/discover/DiscoverBookCardSkeleton.tsx", "pages/explore/ExploreBookCardSkeleton.tsx"],
];

for (const [from, to] of moves) {
  const fromPath = path.join(src, from);
  const toPath = path.join(src, to);
  if (!fs.existsSync(fromPath)) {
    console.warn("skip missing:", from);
    continue;
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.renameSync(fromPath, toPath);
  console.log("moved", from, "->", to);
}

try {
  fs.rmdirSync(path.join(src, "pages/discover"));
} catch {
  /* not empty or missing */
}

const replacements = [
  ["DiscoverBookListSkeleton", "ExploreBookListSkeleton"],
  ["DiscoverBookCardSkeleton", "ExploreBookCardSkeleton"],
  ["DiscoverBookListIntro", "ExploreBookListIntro"],
  ["useDiscoverSkeletonCount", "useExploreSkeletonCount"],
  ["DiscoverPageProps", "ExplorePageProps"],
  ["DiscoverPage", "ExplorePage"],
  ["discoverBookListIntroWrapClass", "exploreBookListIntroWrapClass"],
  ["discoverBookListIntroClass", "exploreBookListIntroClass"],
  ["discoverBookListBadgeEllipsisClass", "exploreBookListBadgeEllipsisClass"],
  ["discoverBookListBadgeLastClass", "exploreBookListBadgeLastClass"],
  ["discoverBookListBadgeClass", "exploreBookListBadgeClass"],
  ["discoverBookListBadgeRowClass", "exploreBookListBadgeRowClass"],
  ["discoverBookListBodyClass", "exploreBookListBodyClass"],
  ["discoverBookListCoverClass", "exploreBookListCoverClass"],
  ["discoverBookListCardClass", "exploreBookListCardClass"],
  ["discoverSkeletonPulseClass", "exploreSkeletonPulseClass"],
  ["discover-book-list-intro", "explore-book-list-intro"],
  ["--discover-intro-line-clamp", "--explore-intro-line-clamp"],
  ["DISCOVER_BOOK_GRID_CLASS", "EXPLORE_BOOK_GRID_CLASS"],
  ["discover_pagination_preference", "explore_pagination_preference"],
  ["DiscoverPageCache", "ExplorePageCache"],
  ["getDiscoverCacheKey", "getExploreCacheKey"],
  ["getDiscoverCache", "getExploreCache"],
  ["setDiscoverCache", "setExploreCache"],
  ["updateDiscoverCache", "updateExploreCache"],
  ["clearDiscoverCache", "clearExploreCache"],
  ["shouldOpenDiscoverPageForSection", "shouldOpenExplorePageForSection"],
  ["SOURCE_FILTER_DISCOVER_ENABLED", "SOURCE_FILTER_EXPLORE_ENABLED"],
  ["SOURCE_FILTER_DISCOVER_DISABLED", "SOURCE_FILTER_EXPLORE_DISABLED"],
  ["__filter:discover_enabled__", "__filter:explore_enabled__"],
  ["__filter:discover_disabled__", "__filter:explore_disabled__"],
  ["setShowDiscoverPaginationPreferenceDialog", "setShowExplorePaginationPreferenceDialog"],
  ["showDiscoverPaginationPreferenceDialog", "showExplorePaginationPreferenceDialog"],
  ["setDiscoverContext", "setExploreContext"],
  ["discoverContext", "exploreContext"],
  ["@/pages/discover/", "@/pages/explore/"],
  ["fromPage: 'discover'", "fromPage: 'explore'"],
  ['fromPage: "discover"', 'fromPage: "explore"'],
  ['fromPage ?? "discover"', 'fromPage ?? "explore"'],
  ['setCurrentPage("discover")', 'setCurrentPage("explore")'],
  ['currentPage() === "discover"', 'currentPage() === "explore"'],
  ['"discover"', '"explore"'],
  ["'discover'", "'explore'"],
  ["  discover:", "  explore:"],
  [".discover", ".explore"],
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|css)$/.test(ent.name)) files.push(p);
  }
  return files;
}

let n = 0;
for (const file of walk(src)) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [a, b] of replacements) {
    if (text.includes(a)) {
      text = text.split(a).join(b);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, text);
    n++;
  }
}

console.log(`updated ${n} files`);
