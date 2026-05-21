/**
 * One-off src layout migration: move files + rewrite import paths.
 * Run: node scripts/reorganize-src.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const moves = [
  ["App.tsx", "app/App.tsx"],
  ["App.css", "app/App.css"],
  ["lib/viewport-classes.ts", "lib/ui/viewport-classes.ts"],
  ["lib/shell-layout.ts", "lib/shell/layout.ts"],
  ["lib/sources-filters.ts", "lib/sources/filters.ts"],
  ["lib/format-display-time.ts", "lib/format/display-time.ts"],
  ["lib/dev-hmr-state.ts", "lib/dev/hmr-state.ts"],
  ["utils/book-group-card-press.ts", "lib/bookshelf/book-group-card-press.ts"],
  ["utils/book-group-card-styles.ts", "lib/bookshelf/book-group-card-styles.ts"],
  ["utils/book-group-cover.ts", "lib/bookshelf/book-group-cover.ts"],
  ["utils/book-group-order.ts", "lib/bookshelf/book-group-order.ts"],
  ["utils/book-order.ts", "lib/bookshelf/book-order.ts"],
  ["utils/book-sort.ts", "lib/bookshelf/book-sort.ts"],
  ["utils/bookshelf-grid-gap.ts", "lib/bookshelf/bookshelf-grid-gap.ts"],
  ["utils/bookshelf-layout-gap.ts", "lib/bookshelf/bookshelf-layout-gap.ts"],
  ["utils/bookshelf-view-mode.ts", "lib/bookshelf/bookshelf-view-mode.ts"],
  // shell
  ["components/Navigation.tsx", "components/shell/Navigation.tsx"],
  ["components/SideBar.tsx", "components/shell/SideBar.tsx"],
  ["components/BottomBar.tsx", "components/shell/BottomBar.tsx"],
  ["components/Tray.tsx", "components/shell/Tray.tsx"],
  ["components/PageToolbar.tsx", "components/shell/PageToolbar.tsx"],
  ["components/PageToolbarTitleDropdown.tsx", "components/shell/PageToolbarTitleDropdown.tsx"],
  ["components/PageHeader.tsx", "components/shell/PageHeader.tsx"],
  ["components/ShellLayoutProvider.tsx", "components/shell/ShellLayoutProvider.tsx"],
  ["components/ShellLayoutSetting.tsx", "components/shell/ShellLayoutSetting.tsx"],
  ["components/SplashScreen.tsx", "components/shell/SplashScreen.tsx"],
  ["components/ScrollToTop.tsx", "components/shell/ScrollToTop.tsx"],
  ["components/ThemeSwitch.tsx", "components/shell/ThemeSwitch.tsx"],
  ["components/WindowControlButtons.tsx", "components/shell/WindowControlButtons.tsx"],
  ["components/SettingsPageToolbar.tsx", "components/shell/SettingsPageToolbar.tsx"],
  // shared
  ["components/AppDialog.tsx", "components/shared/AppDialog.tsx"],
  ["components/AppToasts.tsx", "components/shared/AppToasts.tsx"],
  ["components/icons.tsx", "components/shared/icons.tsx"],
  ["components/DatabaseBackup.tsx", "components/shared/DatabaseBackup.tsx"],
  // bookshelf
  ["components/BookshelfPageToolbar.tsx", "components/bookshelf/BookshelfPageToolbar.tsx"],
  ["components/BookshelfGroupNav.tsx", "components/bookshelf/BookshelfGroupNav.tsx"],
  ["components/BookshelfLayoutDialog.tsx", "components/bookshelf/BookshelfLayoutDialog.tsx"],
  ["components/BookshelfLayoutGrid.tsx", "components/bookshelf/BookshelfLayoutGrid.tsx"],
  ["components/BookGroupManagePageToolbar.tsx", "components/bookshelf/BookGroupManagePageToolbar.tsx"],
  ["components/BookGroupFormDialog.tsx", "components/bookshelf/BookGroupFormDialog.tsx"],
  ["components/BookGroupContextMenu.tsx", "components/bookshelf/BookGroupContextMenu.tsx"],
  ["components/book-group-cover-icon.tsx", "components/bookshelf/book-group-cover-icon.tsx"],
  ["components/BookContextMenu.tsx", "components/bookshelf/BookContextMenu.tsx"],
  // sources
  ["components/SourcesPageToolbar.tsx", "components/sources/SourcesPageToolbar.tsx"],
  ["components/SourceGroupManageDialog.tsx", "components/sources/SourceGroupManageDialog.tsx"],
  ["components/SourceGroupSelector.tsx", "components/sources/SourceGroupSelector.tsx"],
  ["components/SourceLoginDialog.tsx", "components/sources/SourceLoginDialog.tsx"],
  ["components/SourceSearchDialog.tsx", "components/sources/SourceSearchDialog.tsx"],
  ["components/DeleteSourceDialog.tsx", "components/sources/DeleteSourceDialog.tsx"],
  ["components/ImportSourceSelectDialog.tsx", "components/sources/ImportSourceSelectDialog.tsx"],
  ["components/ImportSourceNetworkDialog.tsx", "components/sources/ImportSourceNetworkDialog.tsx"],
  ["components/ImportSourceQrDialog.tsx", "components/sources/ImportSourceQrDialog.tsx"],
  // books
  ["components/AddBookByUrlDialog.tsx", "components/books/AddBookByUrlDialog.tsx"],
  ["components/BookDirectoryDialog.tsx", "components/books/BookDirectoryDialog.tsx"],
  ["components/BookEditDialog.tsx", "components/books/BookEditDialog.tsx"],
  ["components/DeleteBookDialog.tsx", "components/books/DeleteBookDialog.tsx"],
  ["components/ImportActionDialog.tsx", "components/books/ImportActionDialog.tsx"],
  ["components/ReplaceFileDialog.tsx", "components/books/ReplaceFileDialog.tsx"],
  ["components/ChapterList.tsx", "components/books/ChapterList.tsx"],
  // remote-book
  ["components/WebDavConfigDialog.tsx", "components/remote-book/WebDavConfigDialog.tsx"],
];

const componentDirs = {
  Navigation: "shell",
  SideBar: "shell",
  BottomBar: "shell",
  Tray: "shell",
  PageToolbar: "shell",
  PageToolbarTitleDropdown: "shell",
  PageHeader: "shell",
  ShellLayoutProvider: "shell",
  ShellLayoutSetting: "shell",
  SplashScreen: "shell",
  ScrollToTop: "shell",
  ThemeSwitch: "shell",
  WindowControlButtons: "shell",
  SettingsPageToolbar: "shell",
  AppDialog: "shared",
  AppToasts: "shared",
  icons: "shared",
  DatabaseBackup: "shared",
  BookshelfPageToolbar: "bookshelf",
  BookshelfGroupNav: "bookshelf",
  BookshelfLayoutDialog: "bookshelf",
  BookshelfLayoutGrid: "bookshelf",
  BookGroupManagePageToolbar: "bookshelf",
  BookGroupFormDialog: "bookshelf",
  BookGroupContextMenu: "bookshelf",
  "book-group-cover-icon": "bookshelf",
  BookContextMenu: "bookshelf",
  SourcesPageToolbar: "sources",
  SourceGroupManageDialog: "sources",
  SourceGroupSelector: "sources",
  SourceLoginDialog: "sources",
  SourceSearchDialog: "sources",
  DeleteSourceDialog: "sources",
  ImportSourceSelectDialog: "sources",
  ImportSourceNetworkDialog: "sources",
  ImportSourceQrDialog: "sources",
  AddBookByUrlDialog: "books",
  BookDirectoryDialog: "books",
  BookEditDialog: "books",
  DeleteBookDialog: "books",
  ImportActionDialog: "books",
  ReplaceFileDialog: "books",
  ChapterList: "books",
  WebDavConfigDialog: "remote-book",
};

const libReplacements = [
  ["@/lib/dev-hmr-state", "@/lib/dev/hmr-state"],
  ["@/lib/format-display-time", "@/lib/format/display-time"],
  ["@/lib/sources-filters", "@/lib/sources/filters"],
  ["@/lib/shell-layout", "@/lib/shell/layout"],
  ["@/lib/viewport-classes", "@/lib/ui/viewport-classes"],
  ["@/utils/bookshelf-view-mode", "@/lib/bookshelf/bookshelf-view-mode"],
  ["@/utils/bookshelf-layout-gap", "@/lib/bookshelf/bookshelf-layout-gap"],
  ["@/utils/bookshelf-grid-gap", "@/lib/bookshelf/bookshelf-grid-gap"],
  ["@/utils/book-sort", "@/lib/bookshelf/book-sort"],
  ["@/utils/book-order", "@/lib/bookshelf/book-order"],
  ["@/utils/book-group-order", "@/lib/bookshelf/book-group-order"],
  ["@/utils/book-group-cover", "@/lib/bookshelf/book-group-cover"],
  ["@/utils/book-group-card-styles", "@/lib/bookshelf/book-group-card-styles"],
  ["@/utils/book-group-card-press", "@/lib/bookshelf/book-group-card-press"],
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

for (const [from, to] of moves) {
  const fromPath = path.join(src, from);
  const toPath = path.join(src, to);
  if (!fs.existsSync(fromPath)) {
    console.warn("skip missing:", from);
    continue;
  }
  ensureDir(toPath);
  fs.renameSync(fromPath, toPath);
  console.log("moved", from, "->", to);
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const files = walk(src).concat(path.join(src, "index.tsx"));

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const [oldPath, newPath] of libReplacements) {
    if (text.includes(oldPath)) {
      text = text.split(oldPath).join(newPath);
      changed = true;
    }
  }

  for (const [name, dir] of Object.entries(componentDirs)) {
    const patterns = [
      `@/components/${name}`,
      `~/components/${name}`,
      `src/components/${name}`,
    ];
    const replacement = `@/components/${dir}/${name}`;
    for (const pat of patterns) {
      if (text.includes(pat)) {
        text = text.split(pat).join(replacement);
        changed = true;
      }
    }
  }

  if (file.endsWith("index.tsx")) {
    if (text.includes('from "./App"')) {
      text = text.replace('from "./App"', 'from "./app/App"');
      changed = true;
    }
  }

  if (file.endsWith(path.join("app", "App.tsx"))) {
    text = text.replace(/from "\.\/pages\//g, 'from "@/pages/');
    changed = true;
  }

  if (changed) fs.writeFileSync(file, text);
}

console.log("done");
