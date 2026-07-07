/**
 * WebDAV 协议客户端（PROPFIND / GET / PUT / MKCOL / DELETE）
 * 对齐 legados-main/.../lib/webdav/WebDav.kt
 */

export interface WebDavFileInfo {
  displayName: string;
  path: string;
  size: number;
  contentType: string;
  lastModify: number;
  isDir: boolean;
}

export class WebDavClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
  }

  private getAuthHeader(): string {
    return `Basic ${btoa(`${this.username}:${this.password}`)}`;
  }

  private resolveUrl(path: string): string {
    const clean = path.replace(/^\/+/, '');
    return clean ? `${this.baseUrl}/${clean}` : `${this.baseUrl}/`;
  }

  private async request(
    method: string,
    path: string,
    body?: BodyInit | null,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const response = await fetch(this.resolveUrl(path), {
      method,
      headers: {
        Authorization: this.getAuthHeader(),
        ...headers,
      },
      body: body ?? undefined,
    });
    if (!response.ok) {
      throw new Error(`WebDAV ${method} 失败: ${response.status} ${response.statusText}`);
    }
    return response;
  }

  private parseWebDavResponse(xmlText: string, listPath: string): WebDavFileInfo[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`WebDAV XML 解析失败: ${parserError.textContent ?? ''}`);
    }

    const files: WebDavFileInfo[] = [];
    const responses = doc.getElementsByTagNameNS('DAV:', 'response');
    const normalizedList = listPath.replace(/^\/+|\/+$/g, '');

    for (const response of Array.from(responses)) {
      const hrefRaw = response.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent;
      if (!hrefRaw) continue;

      let path = decodeURIComponent(hrefRaw);
      try {
        const asUrl = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
        path = decodeURIComponent(asUrl.pathname.replace(/^\//, ''));
      } catch {
        path = decodeURIComponent(path.replace(this.baseUrl, '').replace(/^\//, ''));
      }

      if (!path || path === normalizedList || path === `${normalizedList}/`) continue;

      const propStat = response.getElementsByTagNameNS('DAV:', 'propstat')[0];
      const prop = propStat?.getElementsByTagNameNS('DAV:', 'prop')[0];
      if (!prop) continue;

      const displayName =
        prop.getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent
        || path.split('/').pop()
        || path;
      const contentLength =
        prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '0';
      const contentType =
        prop.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
      const resourceType =
        prop.getElementsByTagNameNS('DAV:', 'resourcetype')[0]?.textContent || '';
      const lastModified =
        prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';

      const isDir =
        resourceType.includes('collection') || contentType === 'httpd/unix-directory';

      files.push({
        displayName,
        path,
        size: parseInt(contentLength, 10) || 0,
        contentType: contentType || (isDir ? 'httpd/unix-directory' : 'application/octet-stream'),
        lastModify: lastModified ? new Date(lastModified).getTime() : Date.now(),
        isDir,
      });
    }

    return files;
  }

  async checkConnection(): Promise<boolean> {
    const propfindBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`;
    await this.request('PROPFIND', '', propfindBody, { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' });
    return true;
  }

  async listFiles(path = ''): Promise<WebDavFileInfo[]> {
    const propfindBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getcontentlength/>
    <getcontenttype/>
    <getlastmodified/>
  </prop>
</propfind>`;
    const response = await this.request('PROPFIND', path, propfindBody, {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    });
    const xmlText = await response.text();
    return this.parseWebDavResponse(xmlText, path);
  }

  async downloadFile(path: string): Promise<ArrayBuffer> {
    const response = await this.request('GET', path);
    return response.arrayBuffer();
  }

  async uploadFile(path: string, content: ArrayBuffer | Uint8Array): Promise<void> {
    const body =
      content instanceof Uint8Array
        ? content.byteOffset === 0 && content.byteLength === content.buffer.byteLength
          ? content
          : content.slice()
        : new Uint8Array(content);
    await this.request('PUT', path, body, { 'Content-Type': 'application/octet-stream' });
  }

  async makeDirectory(path: string): Promise<void> {
    try {
      await this.request('MKCOL', path);
    } catch (error) {
      const exists = await this.exists(path);
      if (!exists) throw error;
    }
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      const propfindBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`;
      await this.request('PROPFIND', path, propfindBody, {
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      });
      return true;
    } catch {
      return false;
    }
  }

  async ensureDirectories(paths: string[]): Promise<void> {
    for (const path of paths) {
      const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      let current = '';
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        await this.makeDirectory(current);
      }
    }
  }
}
