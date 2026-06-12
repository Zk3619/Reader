/**
 * 段落重排（对齐 Legado ContentHelp.reSegment，含 forceSplit 随机断句）
 */

const MARK_SENTENCES_END = '？。！?!~';
const MARK_SENTENCES_END_P = '.？。！?!~';
const MARK_SENTENCES_MID = '.，、,—…';
const MARK_SENTENCES_SAY = '问说喊唱叫骂道着答';
const MARK_QUOTATION_BEFORE = '，：,:';
const MARK_QUOTATION = '"“”';
const MARK_QUOTATION_RIGHT = '"”';
const WORD_MAX_LENGTH = 16;
const PARAGRAPH_DIALOG = /^["“”][^"“”]+["“”]$/;

export interface ReSegmentOptions {
  /** 默认 Math.random，测试可注入固定序列 */
  random?: () => number;
}

function match(rule: string, chr: string): boolean {
  return rule.includes(chr);
}

function seekIndexes(
  str: string,
  key: string,
  from: number,
  to: number,
  inOrder: boolean,
): number[] {
  const list: number[] = [];
  if (str.length - from < 1) return list;
  let i = from > 0 ? from : 0;
  let t = str.length;
  if (to > 0) t = Math.min(t, to);
  while (i < t) {
    const c = inOrder ? str[i]! : str[str.length - i - 1]!;
    if (key.includes(c)) {
      if (list.length > 0 && i - list[list.length - 1]! === 1) {
        list[list.length - 1] = i;
      } else {
        list.push(i);
      }
    }
    i++;
  }
  return list;
}

function seekLast(str: string, key: string, from: number, to: number): number {
  if (str.length - from < 1) return -1;
  let i = str.length - 1;
  if (from < i && i > 0) i = from;
  const t = to > 0 ? to : 0;
  while (i > t) {
    if (key.includes(str[i]!)) return i;
    i--;
  }
  return -1;
}

function seekIndex(
  str: string,
  key: string,
  from: number,
  to: number,
  inOrder: boolean,
): number {
  if (str.length - from < 1) return -1;
  let i = from > 0 ? from : 0;
  let t = str.length;
  if (to > 0) t = Math.min(t, to);
  while (i < t) {
    const c = inOrder ? str[i]! : str[str.length - i - 1]!;
    if (key.includes(c)) return i;
    i++;
  }
  return -1;
}

function makeDict(str: string): string[] {
  const patten = new RegExp(
    `(?<=["'”“])([^\\p{P}]{1,${WORD_MAX_LENGTH}})(?=["'”“])`,
    'gu',
  );
  const cache: string[] = [];
  const dict: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = patten.exec(str)) !== null) {
    const word = m[1] ?? '';
    if (cache.includes(word)) {
      if (!dict.includes(word)) dict.push(word);
    } else {
      cache.push(word);
    }
  }
  return dict;
}

function forceSplit(
  str: string,
  offset: number,
  min: number,
  gain: number,
  trigger: number,
  random: () => number,
): number[] {
  const result: number[] = [];
  const arrayEnd = seekIndexes(str, MARK_SENTENCES_END_P, 0, str.length - 2, true);
  const arrayMid = seekIndexes(str, MARK_SENTENCES_MID, 0, str.length - 2, true);
  if (arrayEnd.length < trigger && arrayMid.length < trigger * 3) return result;
  let j = 0;
  let i = min;
  while (i < arrayEnd.length) {
    let k = 0;
    while (j < arrayMid.length) {
      if (arrayMid[j]! < arrayEnd[i]!) k++;
      j++;
    }
    if (random() * gain < 0.8 + k / 2.5) {
      result.push(arrayEnd[i]! + offset);
      i = Math.max(i + min, i);
    }
    i++;
  }
  return result;
}

function splitQuote(str: string): string {
  const length = str.length;
  if (length < 3) return str;
  if (match(MARK_QUOTATION, str[0]!)) {
    const i = seekIndex(str, MARK_QUOTATION, 1, length - 2, true) + 1;
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, str[i - 1]!)) {
      return `${str.slice(0, i)}\n${str.slice(i)}`;
    }
  } else if (match(MARK_QUOTATION, str[length - 1]!)) {
    const i = length - 1 - seekIndex(str, MARK_QUOTATION, 1, length - 2, false);
    if (i > 1 && !match(MARK_QUOTATION_BEFORE, str[i - 1]!)) {
      return `${str.slice(0, i)}\n${str.slice(i)}`;
    }
  }
  return str;
}

function reduceLength(str: string): string {
  const p = str.split('\n');
  const l = p.length;
  const b = p.map((line) => PARAGRAPH_DIALOG.test(line));
  let dialogue = 0;
  for (let i = 0; i < l; i++) {
    if (b[i]) {
      if (dialogue < 0) dialogue = 1;
      else if (dialogue < 2) dialogue++;
    } else {
      if (dialogue > 1) {
        p[i] = splitQuote(p[i]!);
        dialogue--;
      } else if (dialogue > 0 && i < l - 2) {
        if (b[i + 1]) p[i] = splitQuote(p[i]!);
      }
    }
  }
  return p.join('\n');
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

function findNewLines(str: string, dict: string[], random: () => number): string {
  const chars = [...str];
  const arrayQuote: number[] = [];
  let insN: number[] = [];
  const mod = new Array<number>(str.length).fill(0);
  let waitClose = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    if (match(MARK_QUOTATION, c)) {
      const size = arrayQuote.length;
      if (size > 0) {
        const quotePre = arrayQuote[size - 1]!;
        if (i - quotePre === 2) {
          let remove = false;
          if (waitClose) {
            if (match(',，、/', str[i - 1]!)) remove = true;
          } else if (match(',，、/和与或', str[i - 1]!)) {
            remove = true;
          }
          if (remove) {
            chars[i] = '“';
            chars[i - 2] = '”';
            arrayQuote.pop();
            mod[size - 1] = 1;
            mod[size] = -1;
            continue;
          }
        }
      }
      arrayQuote.push(i);

      if (i > 1) {
        const charB1 = str[i - 1]!;
        let charB2 = '';
        if (match(MARK_QUOTATION_BEFORE, charB1)) {
          if (arrayQuote.length > 1) {
            const lastQuote = arrayQuote[arrayQuote.length - 2]!;
            let p = 0;
            if (charB1 === ',' || charB1 === '，') {
              if (arrayQuote.length > 2) {
                p = arrayQuote[arrayQuote.length - 3]!;
                if (p > 0) charB2 = str[p - 1]!;
              }
            }
            if (match(MARK_SENTENCES_END_P, charB2)) {
              insN.push(p - 1);
            } else if (!match('的', charB2)) {
              const lastEnd = seekLast(str, MARK_SENTENCES_END, i, lastQuote);
              if (lastEnd > 0) insN.push(lastEnd);
              else insN.push(lastQuote);
            }
          }
          waitClose = true;
          mod[size] = 1;
          if (size > 0) {
            mod[size - 1] = -1;
            if (size > 1) mod[size - 2] = 1;
          }
        } else if (waitClose) {
          waitClose = false;
          insN.push(i);
        }
      }
    }
  }

  let string = chars.join('');
  const size = arrayQuote.length;
  let opend = false;

  if (size > 0) {
    for (let i = 0; i < size; i++) {
      if (mod[i]! > 0) {
        opend = true;
      } else if (mod[i]! < 0) {
        if (!opend) {
          if (i > 0) mod[i] = 3;
        }
        opend = false;
      } else {
        opend = !opend;
        mod[i] = opend ? 2 : -2;
      }
    }

    if (opend) {
      if (arrayQuote[size - 1]! - string.length > -3) {
        if (size > 1) mod[size - 2] = 4;
        mod[size - 1] = -4;
      } else if (!match(MARK_SENTENCES_SAY, string[string.length - 2]!)) {
        string += '”';
      }
    }

    let loop2Mod1 = -1;
    let i = 0;
    let j = arrayQuote[0]! - 1;
    if (j < 0) {
      i = 1;
      loop2Mod1 = 0;
    }
    while (i < size) {
      j = arrayQuote[i]! - 1;
      const loop2Mod2 = mod[i]!;
      if (loop2Mod1 < 0 && loop2Mod2 > 0) {
        if (match(MARK_SENTENCES_END, string[j]!)) insN.push(j);
      }
      loop2Mod1 = loop2Mod2;
      i++;
    }
  }

  const insN1: number[] = [];
  for (const idx of insN) {
    if (match("\"'”“", string[idx]!)) {
      const start = seekLast(string, "\"'”“", idx - 1, idx - WORD_MAX_LENGTH);
      if (start > 0) {
        const word = str.slice(start + 1, idx);
        if (dict.includes(word)) continue;
        if (match('的地得', str[start]!)) continue;
      }
    }
    insN1.push(idx);
  }
  insN = uniqueSorted(insN1);

  {
    let subs: string;
    let j = 0;
    let progress = 0;
    let nextLine = insN.length > 0 ? insN[0]! : -1;
    let gain = 3;
    let min = 0;
    let trigger = 2;

    for (let i = 0; i < arrayQuote.length; i++) {
      const quote = arrayQuote[i]!;
      if (quote > 0) {
        gain = 4;
        min = 2;
        trigger = 4;
      } else {
        gain = 3;
        min = 0;
        trigger = 2;
      }

      while (j < insN.length) {
        if (nextLine >= quote) break;
        nextLine = insN[j]!;
        if (progress < nextLine) {
          subs = string.slice(progress, nextLine);
          insN.push(...forceSplit(subs, progress, min, gain, trigger, random));
          progress = nextLine + 1;
        }
        j++;
      }
      if (progress < quote) {
        subs = string.slice(progress, quote + 1);
        insN.push(...forceSplit(subs, progress, min, gain, trigger, random));
        progress = quote + 1;
      }
    }

    while (j < insN.length) {
      nextLine = insN[j]!;
      if (progress < nextLine) {
        subs = string.slice(progress, nextLine);
        insN.push(...forceSplit(subs, progress, min, gain, trigger, random));
        progress = nextLine + 1;
      }
      j++;
    }
    if (progress < string.length) {
      subs = string.slice(progress, string.length);
      insN.push(...forceSplit(subs, progress, min, gain, trigger, random));
    }
  }

  const insQuote = new Array<boolean>(size).fill(false);
  opend = false;
  const stringChars = [...string];
  for (let i = 0; i < size; i++) {
    const p = arrayQuote[i]!;
    if (mod[i]! > 0) {
      stringChars[p] = '“';
      if (opend) insQuote[i] = true;
      opend = true;
    } else if (mod[i]! < 0) {
      stringChars[p] = '”';
      opend = false;
    } else {
      opend = !opend;
      stringChars[p] = opend ? '“' : '”';
    }
  }
  string = stringChars.join('');
  insN = uniqueSorted(insN);

  const buffer: string[] = [];
  let j = 0;
  let progress = 0;
  let nextLine = insN.length > 0 ? insN[0]! : -1;

  for (let i = 0; i < arrayQuote.length; i++) {
    const quote = arrayQuote[i]!;
    while (j < insN.length) {
      if (nextLine >= quote) break;
      nextLine = insN[j]!;
      buffer.push(string.slice(progress, nextLine + 1), '\n');
      progress = nextLine + 1;
      j++;
    }
    if (progress < quote) {
      buffer.push(string.slice(progress, quote + 1));
      progress = quote + 1;
    }
    if (insQuote[i] && buffer.length > 0) {
      const last = buffer[buffer.length - 1]!;
      if (last.endsWith('\n')) buffer.push('“');
      else {
        const tail = buffer.pop() ?? '';
        buffer.push(tail.slice(0, -1), '”\n');
      }
    }
  }

  while (j < insN.length) {
    nextLine = insN[j]!;
    if (progress <= nextLine) {
      buffer.push(string.slice(progress, nextLine + 1), '\n');
      progress = nextLine + 1;
    }
    j++;
  }
  if (progress < string.length) {
    buffer.push(string.slice(progress, string.length));
  }
  return buffer.join('');
}

/** 对齐 Legado ContentHelp.reSegment */
export function reSegmentContent(
  content: string,
  chapterName: string,
  options?: ReSegmentOptions,
): string {
  if (!content.trim()) return content;

  const random = options?.random ?? Math.random;
  const dict = makeDict(content);
  let content1 = content
    .replace(/&quot;/g, '“')
    .replace(/[:：]['"‘”“]+/g, '：“')
    .replace(/["”“]+\s*["”“][\s"”“]*/g, '”\n“');

  let p = content1.split(/\n(\s*)/);
  let buffer = '  ';
  const chapterTrim = chapterName.trim();
  const firstTrim = (p[0] ?? '').trim();
  if (chapterTrim !== firstTrim) {
    buffer += (p[0] ?? '').replace(/[\u3000\s]+/g, '');
  }

  for (let i = 1; i < p.length; i++) {
    const last = buffer.slice(-1);
    const prev = buffer.length > 1 ? buffer[buffer.length - 2]! : '';
    if (
      match(MARK_SENTENCES_END, last) ||
      (match(MARK_QUOTATION_RIGHT, last) && match(MARK_SENTENCES_END, prev))
    ) {
      buffer += '\n';
    }
    buffer += (p[i] ?? '').replace(/[\u3000\s]/g, '');
  }

  p = buffer
    .replace(/["”“]+\s*["”“]+/g, '”\n“')
    .replace(/["”“]+([？。！?!~])["”“]+/g, '”$1\n“')
    .replace(/["”“]+([？。！?!~])([^"”“])/g, '”$1\n$2')
    .replace(/([问说喊唱叫骂道着答])[\.。]/g, '$1。\n')
    .split('\n');

  buffer = '';
  for (const s of p) {
    buffer += '\n';
    buffer += findNewLines(s, dict, random);
  }

  content1 = reduceLength(buffer)
    .replace(/^\s+/, '')
    .replace(/\s*["”“]+\s*["”“][\s"”“]*/g, '”\n“')
    .replace(/[:：][”“"\s]+/g, '：“')
    .replace(/\n["“”]([^\n"“”]+)([,:，：]["”“])([^\n"“”]+)/g, '\n$1：“$3')
    .replace(/\n(\s*)/g, '\n');

  return content1;
}
