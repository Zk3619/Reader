#!/usr/bin/env python3
"""
一次性机械转译 yt-dlp extractor → Reader TS。

Usage:
  python transpile_extractors.py
  python transpile_extractors.py --yt-dlp D:/Projects/Rust/Reader/Download/yt-dlp-master

输出:
  ../extractors/generated/**/*.ts
  ../extractors/generated-index.ts
  ../extractors/generated-registry.ts
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "extractors" / "generated"
OUT_INDEX = HERE.parent / "extractors" / "generated-index.ts"
OUT_REGISTRY = HERE.parent / "extractors" / "generated-registry.ts"

HAND_OVERRIDES = {
    "Youtube",
    "BiliBili",
    "Twitter",
    "TikTok",
    "Vimeo",
    "TwitchVod",
    "Soundcloud",
    "Douyin",
    "BiliBiliBangumi",
    "Instagram",
    "Reddit",
    "Niconico",
    "Generic",
}

SKIP_FILES = {
    "__init__.py",
    "extractors.py",
    "lazy_extractors.py",
    "common.py",  # 用手写 InfoExtractor
}


@dataclass
class MethodInfo:
    name: str
    args: list[str]
    is_async: bool
    is_staticmethod: bool
    is_classmethod: bool
    body_src: str
    decorators: list[str] = field(default_factory=list)


@dataclass
class ClassInfo:
    name: str
    bases: list[str]
    module_rel: str  # e.g. youtube/_video.py or reddit.py
    ie_name: str | None = None
    valid_url: Any = None  # str | False | None | list
    methods: dict[str, MethodInfo] = field(default_factory=dict)
    fields: dict[str, str] = field(default_factory=dict)  # name -> TS expr


def find_yt_dlp(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    env = os.environ.get("YT_DLP_ROOT")
    if env:
        candidates.append(Path(env))
    candidates += [
        HERE.parents[4] / "Download" / "yt-dlp-master",  # Reader/src/lib/download/ytdlp/port -> up?
        Path(r"d:\Projects\Rust\Reader\Download\yt-dlp-master"),
        Path(r"D:\Projects\Rust\Reader\Download\yt-dlp-master"),
        Path(r"d:\Projects\Download\yt-dlp-master"),
    ]
    # port is at Reader/src/lib/download/ytdlp/port → parents[4]=Reader, need one more for Rust/Reader
    candidates.insert(0, HERE.parents[5] / "Download" / "yt-dlp-master")
    for c in candidates:
        if (c / "yt_dlp" / "extractor").is_dir():
            return c
    raise SystemExit("Cannot find yt-dlp root; pass --yt-dlp")


def walk_py(extractor_dir: Path) -> list[Path]:
    files: list[Path] = []
    for p in extractor_dir.rglob("*.py"):
        if p.name.startswith("_") and p.name not in {"_extractors.py"}:
            # keep youtube/_base.py etc (starts with _ but not only _)
            if p.name.startswith("__"):
                continue
        if p.name in SKIP_FILES:
            continue
        if p.name == "_extractors.py":
            continue
        files.append(p)
    return sorted(files)


def py_str(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        # f-string → approximate
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                parts.append(v.value)
            else:
                parts.append("${...}")
        return "".join(parts)
    return None


def extract_valid_url_value(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant):
        if node.value is False:
            return False
        if node.value is None:
            return None
        if isinstance(node.value, str):
            return node.value
    if isinstance(node, ast.Name) and node.id == "False":
        return False
    if isinstance(node, (ast.Tuple, ast.List)):
        vals = []
        for elt in node.elts:
            s = py_str(elt)
            if s is not None:
                vals.append(s)
        return vals or None
    # BinOp string concat
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = extract_valid_url_value(node.left)
        right = extract_valid_url_value(node.right)
        if isinstance(left, str) and isinstance(right, str):
            return left + right
    s = py_str(node)
    return s


def method_source(src: str, node: ast.AST) -> str:
    try:
        return ast.get_source_segment(src, node) or ""
    except Exception:
        return ""


def parse_module(path: Path, extractor_root: Path) -> list[ClassInfo]:
    src = path.read_text(encoding="utf-8", errors="replace")
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        print(f"WARN: parse fail {path}: {e}", file=sys.stderr)
        return []
    rel = path.relative_to(extractor_root).as_posix()
    classes: list[ClassInfo] = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not node.name.endswith("IE"):
            continue
        if node.name == "InfoExtractor":
            continue
        bases = []
        for b in node.bases:
            if isinstance(b, ast.Name):
                bases.append(b.id)
            elif isinstance(b, ast.Attribute):
                bases.append(b.attr)
        info = ClassInfo(name=node.name, bases=bases, module_rel=rel)
        info.ie_name = node.name.replace("IE", "").lower()
        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for t in stmt.targets:
                    if isinstance(t, ast.Name):
                        if t.id == "IE_NAME":
                            s = py_str(stmt.value)
                            if s:
                                info.ie_name = s
                        elif t.id == "_VALID_URL":
                            info.valid_url = extract_valid_url_value(stmt.value)
                        elif t.id in {"IE_DESC", "_NETRC_MACHINE", "_WORKING"}:
                            s = py_str(stmt.value)
                            if s is not None:
                                info.fields[t.id] = json.dumps(s)
                        elif t.id.startswith("_") and isinstance(stmt.value, ast.Constant):
                            v = stmt.value.value
                            if isinstance(v, (str, int, float, bool)) or v is None:
                                info.fields[t.id] = json.dumps(v)
            elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if stmt.name == "_TESTS" or stmt.name.startswith("test_"):
                    continue
                args = [a.arg for a in stmt.args.args if a.arg != "self"]
                decos = []
                for d in stmt.decorator_list:
                    if isinstance(d, ast.Name):
                        decos.append(d.id)
                    elif isinstance(d, ast.Attribute):
                        decos.append(d.attr)
                info.methods[stmt.name] = MethodInfo(
                    name=stmt.name,
                    args=args,
                    is_async=isinstance(stmt, ast.AsyncFunctionDef),
                    is_staticmethod="staticmethod" in decos,
                    is_classmethod="classmethod" in decos,
                    body_src=method_source(src, stmt),
                    decorators=decos,
                )
        classes.append(info)
    return classes


def parse_extractors_order(extractor_dir: Path) -> list[str]:
    path = extractor_dir / "_extractors.py"
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    # from .foo import BarIE, BazIE
    order: list[str] = []
    for m in re.finditer(r"\b([A-Za-z0-9_]+IE)\b", text):
        name = m.group(1)
        if name not in order and name != "InfoExtractor":
            order.append(name)
    return order


def js_regex_literal(py_pat: str) -> str:
    """Convert Python regex string to JS RegExp source string for new RegExp(...)"""
    s = py_pat
    # strip verbose (?x) and whitespace/comments roughly for storage;
    # registry compileValidUrl already handles (?x) — store raw Python pattern
    # Escape for TS string
    return json.dumps(s)


def ts_valid_url(val: Any) -> str:
    if val is False:
        return "false"
    if val is None:
        return "null"
    if isinstance(val, list):
        parts = ", ".join(js_regex_literal(x) for x in val if isinstance(x, str))
        return f"[{parts}]"
    if isinstance(val, str):
        return js_regex_literal(val)
    return "null"


def emit_method_ts(m: MethodInfo, class_name: str, prefix: str = "../../") -> str:
    """Emit a TS method; body is either thin port wrapper or unsupported throw."""
    args_ts = ", ".join(f"{a}: any" for a in m.args) or ""
    if m.name == "_real_extract":
        return textwrap.dedent(
            f"""\
            async _real_extract(url: string): Promise<import('{prefix}types').VideoInfo> {{
              return await this._ported_real_extract({json.dumps(class_name)}, url);
            }}
            """
        )
    async_kw = "async "
    if m.is_staticmethod:
        return (
            f"  static async {m.name}(..._args: any[]): Promise<any> {{\n"
            f"    throw new Error('[port] static {class_name}.{m.name} not expanded');\n"
            f"  }}\n"
        )
    return (
        f"  {async_kw}{m.name}({args_ts}): Promise<any> {{\n"
        f"    throw new Error('[port] {class_name}.{m.name} not expanded');\n"
        f"  }}\n"
    )


def mro_merge(class_name: str, by_name: dict[str, ClassInfo]) -> ClassInfo | None:
    root = by_name.get(class_name)
    if not root:
        return None
    # C3-lite: walk bases left-to-right, then child overrides
    ordered: list[ClassInfo] = []
    seen: set[str] = set()

    def visit(c: ClassInfo):
        if c.name in seen:
            return
        seen.add(c.name)
        for b in c.bases:
            if b in by_name:
                visit(by_name[b])
            # InfoExtractor / SearchInfoExtractor — skip
        ordered.append(c)

    visit(root)
    merged = ClassInfo(
        name=root.name,
        bases=root.bases,
        module_rel=root.module_rel,
        ie_name=root.ie_name,
        valid_url=root.valid_url,
        fields=dict(root.fields),
    )
    # apply from base to child
    for c in ordered:
        for k, v in c.fields.items():
            merged.fields[k] = v
        for k, m in c.methods.items():
            merged.methods[k] = m
        if c.valid_url is not None:
            merged.valid_url = c.valid_url
        if c.ie_name:
            merged.ie_name = c.ie_name
    # child root fields win again
    merged.ie_name = root.ie_name or merged.ie_name
    if root.valid_url is not None:
        merged.valid_url = root.valid_url
    merged.fields.update(root.fields)
    merged.methods.update(root.methods)
    return merged


def module_out_path(module_rel: str) -> Path:
    # foo.py → foo.ts; youtube/_base.py → youtube/_base.ts
    return OUT_DIR / module_rel.replace(".py", ".ts")


def rel_import_prefix(module_rel: str) -> str:
    # generated/foo.ts → ../../
    # generated/youtube/_video.ts → ../../../
    depth = module_rel.count("/")  # 0 for top-level
    return "../" * (depth + 2)


def emit_module_file(
    module_rel: str,
    classes: list[ClassInfo],
    by_name: dict[str, ClassInfo],
) -> str:
    lines: list[str] = []
    lines.append("/** AUTO-GENERATED by port/transpile_extractors.py — do not edit */")
    lines.append("/* eslint-disable */")
    prefix = rel_import_prefix(module_rel)

    need_search = False
    need_info = False
    for raw in classes:
        uses_search = any("Search" in b for b in raw.bases)
        if uses_search:
            need_search = True
        else:
            need_info = True
    if need_search and need_info:
        lines.append(f"import {{ InfoExtractor, SearchInfoExtractor }} from '{prefix}common';")
    elif need_search:
        lines.append(f"import {{ SearchInfoExtractor }} from '{prefix}common';")
    else:
        lines.append(f"import {{ InfoExtractor }} from '{prefix}common';")
    lines.append("")

    for raw in classes:
        merged = mro_merge(raw.name, by_name) or raw
        base = "InfoExtractor"
        for b in raw.bases:
            if "Search" in b:
                base = "SearchInfoExtractor"
                break
        ie_name = merged.ie_name or raw.name.replace("IE", "").lower()
        lines.append(f"export class {raw.name} extends {base} {{")
        lines.append(f"  static IE_NAME = {json.dumps(ie_name)};")
        lines.append(
            f"  static _VALID_URL: RegExp | string | false | null | string[] = {ts_valid_url(merged.valid_url)};"
        )
        for fk, fv in merged.fields.items():
            if fk in {"IE_NAME", "_VALID_URL"}:
                continue
            lines.append(f"  static {fk} = {fv};")
        if "_real_extract" not in merged.methods:
            merged.methods["_real_extract"] = MethodInfo(
                name="_real_extract",
                args=["url"],
                is_async=True,
                is_staticmethod=False,
                is_classmethod=False,
                body_src="",
            )
        lines.append(emit_method_ts(merged.methods["_real_extract"], raw.name, prefix))
        if base == "SearchInfoExtractor":
            lines.append(
                f"  protected async _get_n_results(query: string, n: number): Promise<import('{prefix}types').VideoInfo[]> {{\n"
                "    void query; void n;\n"
                "    return [];\n"
                "  }\n"
            )
        lines.append("}")
        lines.append("")
    return "\n".join(lines)


# Will patch InfoExtractor with _ported_real_extract in common.ts
PORTED_HELPER_NOTE = True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yt-dlp", default=None)
    args = ap.parse_args()
    root = find_yt_dlp(args.yt_dlp)
    extractor_dir = root / "yt_dlp" / "extractor"
    print(f"yt-dlp: {root}")
    print(f"out: {OUT_DIR}")

    if OUT_DIR.exists():
        # clean generated ts
        for p in OUT_DIR.rglob("*.ts"):
            p.unlink()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_classes: list[ClassInfo] = []
    by_name: dict[str, ClassInfo] = {}
    by_module: dict[str, list[ClassInfo]] = {}

    for py in walk_py(extractor_dir):
        classes = parse_module(py, extractor_dir)
        for c in classes:
            all_classes.append(c)
            by_name[c.name] = c
            by_module.setdefault(c.module_rel, []).append(c)

    order = parse_extractors_order(extractor_dir)
    print(f"classes: {len(all_classes)}, _extractors order: {len(order)}")

    # Emit per-module files
    exported: list[tuple[str, str, str]] = []  # className, ieKey, importPath
    for module_rel, classes in sorted(by_module.items()):
        out_path = module_out_path(module_rel)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        text = emit_module_file(module_rel, classes, by_name)
        out_path.write_text(text, encoding="utf-8")
        import_path = "./generated/" + module_rel.replace(".py", "").replace("\\", "/")
        for c in classes:
            ie_key = c.name[:-2] if c.name.endswith("IE") else c.name
            exported.append((c.name, ie_key, import_path))

    # generated-index.ts — re-export all
    index_lines = [
        "/** AUTO-GENERATED — do not edit */",
        "/* eslint-disable */",
    ]
    for class_name, _ie_key, import_path in exported:
        index_lines.append(f"export {{ {class_name} }} from '{import_path}';")
    OUT_INDEX.write_text("\n".join(index_lines) + "\n", encoding="utf-8")

    # Build registry following _extractors order
    class_to_export = {c: (k, p) for c, k, p in exported}
    ordered_keys: list[str] = []
    for class_name in order:
        if class_name in class_to_export:
            ordered_keys.append(class_name)
    for class_name, _, _ in exported:
        if class_name not in ordered_keys:
            ordered_keys.append(class_name)

    # HAND_OVERRIDES set for registry
    reg: list[str] = []
    reg.append("/** AUTO-GENERATED by port/transpile_extractors.py — do not edit */")
    reg.append(f"/** Source: {root} */")
    reg.append(f"/** Generated: {datetime.now(timezone.utc).isoformat()} */")
    reg.append(f"/** Entries: {len(ordered_keys)} */")
    reg.append("/* eslint-disable */")
    reg.append("import type { ExtractorEntry } from '../types';")
    reg.append("import type { InfoExtractor } from '../common';")
    # Import all classes — namespace imports per module
    modules_needed: dict[str, list[str]] = {}
    for class_name in ordered_keys:
        _k, path = class_to_export[class_name]
        modules_needed.setdefault(path, []).append(class_name)

    for path, names in sorted(modules_needed.items()):
        # path is ./generated/foo
        alias = path.replace("./generated/", "").replace("/", "_").replace("-", "_").replace(".", "_")
        reg.append(f"import * as mod_{alias} from '{path}';")

    reg.append("")
    reg.append("export const HAND_OVERRIDES = new Set([")
    for k in sorted(HAND_OVERRIDES):
        reg.append(f"  {json.dumps(k)},")
    reg.append("]);")
    reg.append("/** @deprecated use HAND_OVERRIDES */")
    reg.append("export const IMPLEMENTED_IE_KEYS = HAND_OVERRIDES;")
    reg.append("")
    reg.append("type Ctor = new () => InfoExtractor;")
    reg.append("const CLASS_MAP: Record<string, Ctor> = {")
    for class_name in ordered_keys:
        _k, path = class_to_export[class_name]
        alias = path.replace("./generated/", "").replace("/", "_").replace("-", "_").replace(".", "_")
        reg.append(f"  {json.dumps(class_name)}: mod_{alias}.{class_name} as unknown as Ctor,")
    reg.append("};")
    reg.append("")
    reg.append("export const GENERATED_EXTRACTOR_DEFS: Array<{")
    reg.append("  ie_key: string;")
    reg.append("  ie_name: string;")
    reg.append("  className: string;")
    reg.append("  valid_url: string | string[] | false | null;")
    reg.append("  module_hint?: string;")
    reg.append("}> = [")

    for class_name in ordered_keys:
        info = by_name[class_name]
        ie_key = class_name[:-2] if class_name.endswith("IE") else class_name
        ie_name = info.ie_name or ie_key.lower()
        vu = info.valid_url
        if vu is False:
            vu_js = "false"
        elif vu is None:
            vu_js = "null"
        elif isinstance(vu, list):
            vu_js = json.dumps(vu)
        else:
            vu_js = json.dumps(vu)
        reg.append("  {")
        reg.append(f"    ie_key: {json.dumps(ie_key)},")
        reg.append(f"    ie_name: {json.dumps(ie_name)},")
        reg.append(f"    className: {json.dumps(class_name)},")
        reg.append(f"    valid_url: {vu_js} as any,")
        reg.append(f"    module_hint: {json.dumps(info.module_rel)},")
        reg.append("  },")
    reg.append("];")
    reg.append("")
    reg.append("export function buildGeneratedExtractorEntries(): ExtractorEntry[] {")
    reg.append("  const out: ExtractorEntry[] = [];")
    reg.append("  for (const e of GENERATED_EXTRACTOR_DEFS) {")
    reg.append("    if (HAND_OVERRIDES.has(e.ie_key)) continue;")
    reg.append("    const Ctor = CLASS_MAP[e.className];")
    reg.append("    if (!Ctor) continue;")
    reg.append("    out.push({")
    reg.append("      ie_key: e.ie_key,")
    reg.append("      ie_name: e.ie_name,")
    reg.append("      valid_url: e.valid_url,")
    reg.append("      implemented: true,")
    reg.append("      module_hint: e.module_hint,")
    reg.append("      create: () => new Ctor(),")
    reg.append("    });")
    reg.append("  }")
    reg.append("  return out;")
    reg.append("}")
    reg.append("")

    OUT_REGISTRY.write_text("\n".join(reg) + "\n", encoding="utf-8")
    print(f"Wrote {len(by_module)} modules, {len(ordered_keys)} registry entries")
    print(f"HAND_OVERRIDES: {len(HAND_OVERRIDES)}")


if __name__ == "__main__":
    main()
