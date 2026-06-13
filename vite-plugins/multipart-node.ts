/**
 * Node 侧 multipart 解析（WiFi 传书）
 */

export interface MultipartField {
  name: string;
  filename?: string;
  data: Buffer;
}

function parseContentDisposition(value: string): { name?: string; filename?: string } {
  const out: { name?: string; filename?: string } = {};
  const nameMatch = /name="([^"]*)"/i.exec(value);
  if (nameMatch) out.name = nameMatch[1];
  const fileMatch = /filename="([^"]*)"/i.exec(value);
  if (fileMatch) out.filename = fileMatch[1];
  return out;
}

export function parseMultipartFormData(body: Buffer, contentType: string): MultipartField[] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]?.trim();
  if (!boundary) return [];

  const delimiter = `--${boundary}`;
  const text = body.toString('latin1');
  const parts = text.split(delimiter);
  const fields: MultipartField[] = [];

  for (const part of parts) {
    const trimmed = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
    if (!trimmed || trimmed === '--') continue;

    const headerEnd = trimmed.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;

    const headerBlock = trimmed.slice(0, headerEnd);
    let rawBody = trimmed.slice(headerEnd + 4);
    if (rawBody.endsWith('\r\n')) rawBody = rawBody.slice(0, -2);

    let name: string | undefined;
    let filename: string | undefined;
    for (const line of headerBlock.split('\r\n')) {
      const lower = line.toLowerCase();
      if (lower.startsWith('content-disposition:')) {
        const parsed = parseContentDisposition(line.slice('content-disposition:'.length).trim());
        name = parsed.name;
        filename = parsed.filename;
      }
    }
    if (!name) continue;
    fields.push({ name, filename, data: Buffer.from(rawBody, 'latin1') });
  }

  return fields;
}

export function multipartToAddLocalBookJson(fields: MultipartField[]): string | null {
  const fileNameField = fields.find((f) => f.name === 'fileName');
  const fileDataField = fields.find((f) => f.name === 'fileData');
  if (!fileDataField) return null;

  const fileName =
    (fileNameField ? fileNameField.data.toString('utf8').trim() : '') ||
    fileDataField.filename ||
    'upload.bin';

  return JSON.stringify({
    fileName,
    fileDataBase64: fileDataField.data.toString('base64'),
  });
}
