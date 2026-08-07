/**
 * MetadataParserPP — interpret / replace fields (yt-dlp --parse-metadata).
 */

import type { PostProcessorContext, PostProcessorResult, VideoInfo } from '../types';
import { PostProcessorBase } from './base';

export type MetadataAction =
  | { type: 'interpret'; from: string; to: string }
  | { type: 'replace'; field: string; search: string; replace: string };

function fieldToTemplate(tmpl: string): string {
  if (/^[a-zA-Z_]+$/.test(tmpl)) return `%(${tmpl})s`;
  return tmpl;
}

function formatToRegex(fmt: string): string {
  if (/^\w+$/.test(fmt)) return `(?<${fmt}>.+)`;
  let last = 0;
  let regex = '';
  const re = /%\((\w+)\)s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fmt))) {
    regex += escapeReg(fmt.slice(last, m.index));
    regex += `(?<${m[1]}>.+)`;
    last = m.index + m[0].length;
  }
  if (last < fmt.length) regex += escapeReg(fmt.slice(last));
  return regex;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evalTemplate(tmpl: string, info: VideoInfo): string {
  return tmpl.replace(/%\((\w+)\)s/g, (_m, key: string) => {
    const v = (info as Record<string, unknown>)[key];
    return v == null ? '' : String(v);
  });
}

export class MetadataParserPP extends PostProcessorBase {
  name = 'MetadataParser';
  constructor(private actions: MetadataAction[] = []) {
    super();
  }

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const actions =
      this.actions.length > 0
        ? this.actions
        : parseActionsFromOptions(ctx.options.parse_metadata);
    for (const action of actions) {
      if (action.type === 'interpret') {
        const data = evalTemplate(fieldToTemplate(action.from), ctx.info);
        const re = new RegExp(formatToRegex(fieldToTemplate(action.to)), 's');
        const match = re.exec(data);
        if (!match?.groups) {
          console.warn(`[${this.name}] Could not interpret ${action.from} as ${action.to}`);
          continue;
        }
        for (const [k, v] of Object.entries(match.groups)) {
          if (v != null) (ctx.info as Record<string, unknown>)[k] = v;
        }
      } else if (action.type === 'replace') {
        const cur = String((ctx.info as Record<string, unknown>)[action.field] ?? '');
        try {
          const re = new RegExp(action.search);
          (ctx.info as Record<string, unknown>)[action.field] = cur.replace(
            re,
            action.replace,
          );
        } catch {
          (ctx.info as Record<string, unknown>)[action.field] = cur.split(action.search).join(
            action.replace,
          );
        }
      }
    }
    return { info: ctx.info, filename: ctx.filename };
  }
}

/** MetadataFromFieldPP — convenience for FROM:TO interpret pairs. */
export class MetadataFromFieldPP extends MetadataParserPP {
  name = 'MetadataFromField';
  constructor(formats: string[] = []) {
    const actions: MetadataAction[] = formats.map((f) => {
      const [from, to] = f.split(':');
      return { type: 'interpret', from: from || '', to: to || from || '' };
    });
    super(actions);
  }
}

function parseActionsFromOptions(
  raw: unknown,
): MetadataAction[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: MetadataAction[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      // "title:%(artist)s - %(title)s" or "description:(?s)(?P<title>.+)"
      if (item.includes('s/')) {
        // REPLACE style field:s/search/replace/
        const m = /^(\w+):s\/(.+)\/(.*)\/$/.exec(item);
        if (m) {
          out.push({ type: 'replace', field: m[1]!, search: m[2]!, replace: m[3]! });
          continue;
        }
      }
      const idx = item.indexOf(':');
      if (idx > 0) {
        out.push({
          type: 'interpret',
          from: item.slice(0, idx),
          to: item.slice(idx + 1),
        });
      }
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (o.type === 'replace' || o.action === 'replace') {
        out.push({
          type: 'replace',
          field: String(o.field || ''),
          search: String(o.search || ''),
          replace: String(o.replace || ''),
        });
      } else {
        out.push({
          type: 'interpret',
          from: String(o.from || o.inp || ''),
          to: String(o.to || o.out || ''),
        });
      }
    }
  }
  return out;
}
