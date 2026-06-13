/**

 * Legado 兼容 WebSocket（port+1：bookSourceDebug / rssSourceDebug / searchBook）

 */

import http from 'node:http';

import crypto from 'node:crypto';

import type { IncomingMessage } from 'node:http';

import type { Socket } from 'node:net';

import {

  enqueueLegadoBridgeRequest,

} from './legado-web-api-bridge';



const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';



const WS_ROUTES: Record<string, string> = {

  '/bookSourceDebug': '/__internal/wsBookSourceDebug',

  '/rssSourceDebug': '/__internal/wsRssSourceDebug',

  '/searchBook': '/__internal/wsSearchBook',

};



let wsHttpServer: http.Server | null = null;

let wsAuthEnabled = false;

let wsAuthToken = '';



export function setLegadoWsAuth(enabled: boolean, token: string): void {

  wsAuthEnabled = enabled;

  wsAuthToken = token;

}



function wsAccept(key: string): string {

  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');

}



function writeWsText(socket: Socket, text: string): void {

  const payload = Buffer.from(text, 'utf8');

  const len = payload.length;

  const header = len < 126

    ? Buffer.from([0x81, len])

    : len <= 0xffff

      ? Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff])

      : (() => {

          const buf = Buffer.alloc(10);

          buf[0] = 0x81;

          buf[1] = 127;

          buf.writeBigUInt64BE(BigInt(len), 2);

          return buf;

        })();

  socket.write(Buffer.concat([header, payload]));

}



function readWsTextFrame(socket: Socket): Promise<string | null> {

  return new Promise((resolve) => {

    socket.once('data', (chunk: Buffer) => {

      if (chunk.length < 2) return resolve(null);

      const opcode = chunk[0] & 0x0f;

      if (opcode === 0x8) return resolve(null);

      const masked = (chunk[1] & 0x80) !== 0;

      let len = chunk[1] & 0x7f;

      let offset = 2;

      if (len === 126) {

        len = chunk.readUInt16BE(2);

        offset = 4;

      } else if (len === 127) {

        len = Number(chunk.readBigUInt64BE(2));

        offset = 10;

      }

      const mask = masked ? chunk.subarray(offset, offset + 4) : null;

      offset += masked ? 4 : 0;

      const payload = chunk.subarray(offset, offset + len);

      if (mask) {

        for (let i = 0; i < payload.length; i++) {

          payload[i] ^= mask[i % 4];

        }

      }

      resolve(payload.toString('utf8'));

    });

    socket.on('error', () => resolve(null));

  });

}



function checkWsAuth(req: IncomingMessage): boolean {

  if (!wsAuthEnabled) return true;

  if (!wsAuthToken) return false;

  const url = new URL(req.url ?? '/', 'http://localhost');

  const token =

    url.searchParams.get('token') ??

    (typeof req.headers.authorization === 'string'

      ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim()

      : undefined) ??

    (typeof req.headers.token === 'string' ? req.headers.token : undefined);

  return token === wsAuthToken;

}



function extractWsMessages(serialized: string, path: string): string[] {

  try {

    const outer = JSON.parse(serialized) as { body?: string };

    const legado = outer.body

      ? (JSON.parse(outer.body) as { data?: { logs?: { message: string }[]; messages?: string[] } })

      : (JSON.parse(serialized) as { data?: { logs?: { message: string }[]; messages?: string[] } });



    if (path === '/bookSourceDebug') {

      const logs = legado.data?.logs ?? [];

      return logs.map((line) => line.message).filter(Boolean);

    }

    return legado.data?.messages ?? [];

  } catch {

    return ['处理失败'];

  }

}



async function handleWsRoute(path: string, socket: Socket, message: string): Promise<void> {

  const internalPath = WS_ROUTES[path];

  if (!internalPath) {

    socket.destroy();

    return;

  }



  const timeoutMs = path === '/searchBook' ? 180_000 : 120_000;

  const id = crypto.randomUUID();

  const serialized = await enqueueLegadoBridgeRequest(

    {

      id,

      path: internalPath,

      method: 'POST',

      body: message,

      query: {},

    },

    timeoutMs,

  );



  for (const text of extractWsMessages(serialized, path)) {

    if (text) writeWsText(socket, text);

  }

  socket.end();

}



function handleWsUpgrade(req: IncomingMessage, socket: Socket, _head: Buffer): void {

  const path = (req.url ?? '').split('?')[0];

  if (!WS_ROUTES[path]) {

    socket.destroy();

    return;

  }

  if (!checkWsAuth(req)) {

    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');

    socket.destroy();

    return;

  }



  const key = req.headers['sec-websocket-key'] ?? 'reader-ws-key';

  const accept = wsAccept(String(key));

  socket.write(

    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,

  );



  void (async () => {

    const msg = await readWsTextFrame(socket);

    if (msg) await handleWsRoute(path, socket, msg);

    else socket.destroy();

  })();

}



export function startLegadoWsServer(port: number): void {

  if (wsHttpServer) return;

  wsHttpServer = http.createServer();

  wsHttpServer.on('upgrade', handleWsUpgrade);

  wsHttpServer.listen(port, '0.0.0.0', () => {

    console.log(`[legado-web-api] ws://127.0.0.1:${port}/bookSourceDebug`);

    console.log(`[legado-web-api] ws://127.0.0.1:${port}/rssSourceDebug`);

    console.log(`[legado-web-api] ws://127.0.0.1:${port}/searchBook`);

  });

  wsHttpServer.on('error', (e) => {

    console.warn('[legado-web-ws] 启动失败', e);

    wsHttpServer = null;

  });

}



export function stopLegadoWsServer(): void {

  wsHttpServer?.close();

  wsHttpServer = null;

}

