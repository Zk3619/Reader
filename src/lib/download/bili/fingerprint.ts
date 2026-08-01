/**
 * B 站风控指纹（对照 BiliTools auth.ts）
 */

export function getWebGLFingerPrint(): {
  dm_img_str: string;
  dm_cover_img_str: string;
} {
  let dm_img_str = 'bm8gd2ViZ2';
  let dm_cover_img_str = 'bm8gd2ViZ2wgZXh0ZW5zaW';
  if (typeof document === 'undefined') {
    return { dm_img_str, dm_cover_img_str };
  }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      const version = gl.getParameter(gl.VERSION);
      dm_img_str = version ? btoa(version).slice(0, -2) : dm_img_str;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        if (renderer && vendor) {
          dm_cover_img_str = btoa(renderer + vendor).slice(0, -2);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { dm_img_str, dm_cover_img_str };
}

export function getFingerPrint(_uuid: string): Record<string, unknown> {
  const screenW = typeof screen !== 'undefined' ? screen.width : 1920;
  const screenH = typeof screen !== 'undefined' ? screen.height : 1080;
  const availW = typeof screen !== 'undefined' ? screen.availWidth : screenW;
  const availH = typeof screen !== 'undefined' ? screen.availHeight : screenH;
  const colorDepth = typeof screen !== 'undefined' ? screen.colorDepth || 24 : 24;
  const innerW = typeof window !== 'undefined' ? window.innerWidth : screenW;
  const innerH = typeof window !== 'undefined' ? window.innerHeight : screenH;
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);

  return {
    '3064': 1,
    '5062': Date.now(),
    '03bf': 'https%3A%2F%2Fwww.bilibili.com%2F',
    '39c8': '333.1007.fp.risk',
    '34f1': '',
    d402: '',
    '654a': '',
    '6e7c': `${innerW}x${innerH}`,
    '3c43': {
      '2673': 0,
      '641c': 0,
      '6527': 0,
      '7003': 1,
      '807e': 1,
      '5766': colorDepth,
      b8ce:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      '07a4': nav.language || 'zh-CN',
      '1c57': (nav as Navigator & { deviceMemory?: number }).deviceMemory || 8,
      '0bd0': nav.hardwareConcurrency || 8,
      '748e': [screenW, screenH],
      d61f: [availW, availH],
      fc9d: new Date().getTimezoneOffset(),
      '6aa9': Intl.DateTimeFormat().resolvedOptions().timeZone,
      '75b8': 1,
      '3b21': 1,
      '8a1c': 0,
      d52f: 'not available',
      adca: nav.platform || 'Win32',
      '80c9': [],
      '13ab': '',
      bfe9: '',
      a3c1: [],
      '6bc5': (() => {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
          const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
          return debugInfo && gl
            ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) +
                '~' +
                gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : 'not available';
        } catch {
          return 'not available';
        }
      })(),
      ed31: 0,
      '72bd': 0,
      '097b': 0,
      '52cd': [0, 0, 0],
      d02f: '124.04347527516074',
      a658: ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia'],
    },
    '54ef':
      '{"b_ut":null,"home_version":"V8","in_new_ab":true,"is_modern":true}',
    '8b94': 'https%3A%2F%2Fwww.bilibili.com%2F',
    df35: _uuid,
    '07a4': nav.language || 'zh-CN',
    '5f45': null,
    db46: 0,
  };
}

export async function correspondPath(timestamp: number): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: 'y4HdjgJHBlbaBN04VERG4qNBIFHP6a3GozCl75AihQloSWCXC5HDNgyinEnhaQ_4-gaMud_GF50elYXLlCToR9se9Z8z433U3KjM-3Yx7ptKkmQNAMggQwAVKgq3zYAoidNEWuxpkY_mAitTSRLnsJW-NCTa0bqBFF6Wm1MxgfE',
      e: 'AQAB',
    },
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  );
  const data = new TextEncoder().encode(`refresh_${timestamp}`);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data),
  );
  return Array.from(encrypted)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
