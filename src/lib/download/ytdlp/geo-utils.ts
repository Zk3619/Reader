/**
 * GeoUtils.random_ipv4 subset — country code → CIDR → random IPv4.
 * Map trimmed to common broadcast markets; unknown codes return null.
 */

const COUNTRY_IP_MAP: Record<string, string> = {
  US: '72.229.28.0/23',
  GB: '25.0.0.0/8',
  DE: '53.0.0.0/8',
  FR: '90.0.0.0/9',
  JP: '133.0.0.0/8',
  KR: '211.32.0.0/12',
  CN: '36.128.0.0/10',
  TW: '1.34.0.0/15',
  HK: '1.32.0.0/16',
  AU: '1.128.0.0/11',
  CA: '99.224.0.0/11',
  BR: '191.128.0.0/12',
  IN: '1.6.0.0/15',
  RU: '5.8.0.0/14',
  NL: '31.204.128.0/17',
  SE: '78.66.0.0/15',
  IT: '79.0.0.0/10',
  ES: '88.0.0.0/11',
  PL: '5.172.0.0/14',
  TR: '5.25.0.0/16',
  SG: '8.20.152.0/21',
  TH: '1.0.128.0/17',
  VN: '1.52.0.0/14',
  ID: '1.0.0.0/16',
  MY: '1.9.0.0/16',
  PH: '1.36.0.0/16',
  MX: '187.128.0.0/11',
  AR: '181.0.0.0/12',
  NZ: '49.224.0.0/13',
};

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new Error(`invalid ipv4: ${ip}`);
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function intToIpv4(n: number): string {
  const x = n >>> 0;
  return `${(x >>> 24) & 255}.${(x >>> 16) & 255}.${(x >>> 8) & 255}.${x & 255}`;
}

/** Random IPv4 in CIDR block, or by ISO country code (2 letters). */
export function randomIpv4(codeOrBlock: string): string | null {
  const raw = String(codeOrBlock || '').trim();
  if (!raw) return null;
  let block = raw;
  if (raw.length === 2) {
    block = COUNTRY_IP_MAP[raw.toUpperCase()] || '';
    if (!block) return null;
  }
  const [addr, prefStr] = block.split('/');
  if (!addr || prefStr == null) return null;
  const preflen = Number(prefStr);
  if (!Number.isFinite(preflen) || preflen < 0 || preflen > 32) return null;
  try {
    const addrMin = ipv4ToInt(addr);
    const hostMask = preflen === 0 ? 0xffffffff : 0xffffffff >>> preflen;
    const addrMax = (addrMin | hostMask) >>> 0;
    const span = (addrMax - addrMin) >>> 0;
    const offset = span === 0 ? 0 : Math.floor(Math.random() * (span + 1));
    return intToIpv4((addrMin + offset) >>> 0);
  } catch {
    return null;
  }
}

export function listGeoCountries(): string[] {
  return Object.keys(COUNTRY_IP_MAP).sort();
}
