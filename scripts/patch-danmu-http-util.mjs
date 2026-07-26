import fs from 'fs';

const p =
  'd:/Projects/Reader/src/lib/media/video/danmaku/danmu-api/vendor/utils/http-util.js';
let c = fs.readFileSync(p, 'utf8');
console.log('has cross:', c.includes('跨异步'));

c = c.replace(
  "import { AsyncLocalStorage } from 'node:async_hooks';",
  "import { AsyncLocalStorage } from '../../shims/async-hooks.js';\nimport { nativeFetch } from '../../shims/reader-native-fetch.js';",
);

c = c.replace(
  /\/\/ 兼容iOS巨魔环境：使用node-fetch替代内置fetch\r?\n\s*let response;\r?\n\s*if \(typeof WebAssembly === 'undefined'\) \{\r?\n\s*log\("info", "\[Utils\] \[HTTP\] iOS环境降级使用node-fetch"\);\r?\n\s*const fetch = \(await import\('node-fetch'\)\)\.default;\r?\n\s*response = await fetch\(url, \{\r?\n\s*method: 'GET',\r?\n\s*headers: \{\r?\n\s*\.\.\.options\.headers,\r?\n\s*\},\r?\n\s*signal: controller\.signal\r?\n\s*\}\);\r?\n\s*\} else \{\r?\n\s*\/\/ 现代浏览器环境\r?\n\s*response = await fetch\(url, \{\r?\n\s*method: 'GET',\r?\n\s*headers: \{\r?\n\s*\.\.\.options\.headers,\r?\n\s*\},\r?\n\s*signal: controller\.signal\r?\n\s*\}\);\r?\n\s*\}/g,
  `let response = await nativeFetch(url, {
          method: 'GET',
          headers: {
            ...options.headers,
          },
          signal: controller.signal
        });`,
);

c = c.replace(
  /\/\/ 兼容iOS巨魔环境：使用node-fetch替代内置fetch\r?\n\s*let response;\r?\n\s*if \(typeof WebAssembly === 'undefined'\) \{\r?\n\s*log\("info", "\[Utils\] \[HTTP\] iOS环境降级使用node-fetch"\);\r?\n\s*const fetch = \(await import\('node-fetch'\)\)\.default;\r?\n\s*response = await fetch\(url, fetchOptions\);\r?\n\s*\} else \{\r?\n\s*\/\/ 现代浏览器环境\r?\n\s*response = await fetch\(url, fetchOptions\);\r?\n\s*\}/g,
  'let response = await nativeFetch(url, fetchOptions);',
);

c = c.replace(/\bawait fetch\(/g, 'await nativeFetch(');

fs.writeFileSync(p, c, 'utf8');
console.log('raw fetch(', (c.match(/(?<!native)fetch\(/g) || []).length);
console.log('nativeFetch(', (c.match(/nativeFetch\(/g) || []).length);
console.log('has shim', c.includes('reader-native-fetch'));
