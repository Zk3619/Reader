/**
 * 简易 multipart/form-data 解析（WiFi 传书 /addLocalBook）
 */

export interface MultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  data: Uint8Array;
}

function parseContentDisposition(value: string): { name?: string; filename?: string } {
  const out: { name?: string; filename?: string } = {};
  const nameMatch = /name="([^"]*)"/i.exec(value);
  if (nameMatch) out.name = nameMatch[1];
  const fileMatch = /filename="([^"]*)"/i.exec(value);
  if (fileMatch) out.filename = fileMatch[1];
  return out;
}

export function parseMultipartFormData(
  body: Uint8Array,
  contentType: string,
): MultipartField[] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]?.trim();
  if (!boundary) return [];

  const delimiter = `--${boundary}`;
  const text = new TextDecoder('latin1').decode(body);
  const parts = text.split(delimiter);
  const fields: MultipartField[] = [];

  for (const part of parts) {
    const trimmed = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
    if (!trimmed || trimmed === '--') continue;

    const headerEnd = trimmed.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;

    const headerBlock = trimmed.slice(0, headerEnd);
    const rawBody = trimmed.slice(headerEnd + 4);
    const bodyBytes = rawBody.endsWith('\r\n')
      ? new TextEncoder().encode(rawBody.slice(0, -2))
      : new TextEncoder().encode(rawBody);

    let name: string | undefined;
    let filename: string | undefined;
    let partContentType: string | undefined;

    for (const line of headerBlock.split('\r\n')) {
      const lower = line.toLowerCase();
      if (lower.startsWith('content-disposition:')) {
        const parsed = parseContentDisposition(line.slice('content-disposition:'.length).trim());
        name = parsed.name;
        filename = parsed.filename;
      } else if (lower.startsWith('content-type:')) {
        partContentType = line.slice('content-type:'.length).trim();
      }
    }

    if (!name) continue;
    fields.push({
      name,
      filename,
      contentType: partContentType,
      data: bodyBytes,
    });
  }

  return fields;
}

export function multipartToAddLocalBookJson(fields: MultipartField[]): string | null {
  const fileNameField = fields.find((f) => f.name === 'fileName');
  const fileDataField = fields.find((f) => f.name === 'fileData');
  if (!fileDataField) return null;

  const fileName =
    (fileNameField ? new TextDecoder().decode(fileNameField.data) : '') ||
    fileDataField.filename ||
    'upload.bin';

  let binary = '';
  for (const byte of fileDataField.data) {
    binary += String.fromCharCode(byte);
  }
  const fileDataBase64 = btoa(binary);

  return JSON.stringify({ fileName, fileDataBase64 });
}
