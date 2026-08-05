import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';

const XATTR_MAPPING: Record<string, string> = {
  'user.xdg.referrer.url': 'webpage_url',
  'user.dublincore.title': 'title',
  'user.dublincore.date': 'upload_date',
  'user.dublincore.contributor': 'uploader',
  'user.dublincore.format': 'format',
  'user.dublincore.description': 'description',
  'com.apple.metadata:kMDItemWhereFroms': 'webpage_url',
};

function hyphenateDate(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
}

export class XAttrMetadataPP extends PostProcessorBase {
  name = 'XAttrMetadata';

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const path = ctx.filename || ctx.info._filename;
    if (!path) return { info: ctx.info, filename: ctx.filename };

    const entries: Record<string, string> = {};
    for (const [xattrName, infoName] of Object.entries(XATTR_MAPPING)) {
      const platform =
        typeof navigator !== 'undefined' ? navigator.platform || '' : '';
      if (xattrName.includes(':') && !/darwin|mac/i.test(platform)) continue;
      let value = ctx.info[infoName];
      if (!value) continue;
      if (infoName === 'upload_date') value = hyphenateDate(String(value));
      if (xattrName === 'com.apple.metadata:kMDItemWhereFroms') {
        value = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><string>${String(
          value,
        )}</string></array></plist>`;
      }
      entries[xattrName] = String(value);
    }
    if (!Object.keys(entries).length) return { info: ctx.info, filename: path };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ available?: boolean; warnings?: string[] }>('write_file_xattrs', {
        path,
        entries,
      });
      if (!result?.available) {
        console.warn('[XAttrMetadata] xattr not available on this platform/filesystem');
      }
      for (const w of result?.warnings || []) console.warn(`[XAttrMetadata] ${w}`);
    } catch (e) {
      console.warn(`[XAttrMetadata] ${(e as Error).message}`);
    }
    return { info: ctx.info, filename: path };
  }
}
