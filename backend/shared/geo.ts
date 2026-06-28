const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

interface GeoBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function encodeGeohash(lat: number, lng: number, precision = 7): string {
  let geohash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true;
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        minLng = mid;
      } else {
        ch = ch << 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch = ch << 1;
        maxLat = mid;
      }
    }
    evenBit = !evenBit;
    bit++;
    if (bit === 5) {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

export function decodeGeohash(geohash: string): { lat: number; lng: number; bounds: GeoBounds } {
  let evenBit = true;
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;

  for (const c of geohash) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) continue;
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (evenBit) {
        const mid = (minLng + maxLng) / 2;
        if (bit === 1) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (bit === 1) minLat = mid;
        else maxLat = mid;
      }
      evenBit = !evenBit;
    }
  }

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    bounds: { minLat, minLng, maxLat, maxLng },
  };
}

const NEIGHBOR_DATA: Record<string, [string, string]> = {
  n: ['bc01fg45238967deuvhjyznpkmstqrwx', 'bc01fg45238967deuvhjyznpkmstqrwx'],
};

function adjacent(geohash: string, direction: 'n' | 's' | 'e' | 'w'): string {
  const neighbour: Record<string, [string, string]> = {
    n: ['bc01fg45238967deuvhjyznpkmstqrwx', 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'],
    s: ['bc01fg45238967deuvhjyznpkmstqrwx', '14365h7k9dcfesgujnmqp0r2twvyx8zb'],
    e: ['p0r21436x8zb9dcf5h7kjnmqesgutwvy', 'bc01fg45238967deuvhjyznpkmstqrwx'],
    w: ['14365h7k9dcfesgujnmqp0r2twvyx8zb', 'bc01fg45238967deuvhjyznpkmstqrwx'],
  };

  const lastCh = geohash.slice(-1);
  let parent = geohash.slice(0, -1);
  const type = geohash.length % 2;

  if (parent === '') parent = '';
  const [check, neighbourList] = neighbour[direction];
  if (check[type].indexOf(lastCh) !== -1 && parent !== '') {
    parent = adjacent(parent, direction);
  }

  const idx = '0123456789bcdefghjkmnpqrstuvwxyz'.indexOf(lastCh);
  void NEIGHBOR_DATA;
  return parent + '0123456789bcdefghjkmnpqrstuvwxyz'[
    'p0r21436x8zb9dcf5h7kjnmqesgutwvy'[type] !== undefined ? idx : idx
  ];
}

export function geohashNeighbours(geohash: string): string[] {
  const n = adjacent(geohash, 'n');
  const ne = adjacent(n, 'e');
  const e = adjacent(geohash, 'e');
  const se = adjacent(adjacent(geohash, 's'), 'e');
  const s = adjacent(geohash, 's');
  const sw = adjacent(adjacent(geohash, 's'), 'w');
  const w = adjacent(geohash, 'w');
  const nw = adjacent(n, 'w');
  return [geohash, n, ne, e, se, s, sw, w, nw];
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function parseBbox(bbox: string): GeoBounds | null {
  const parts = bbox.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  return { minLat, minLng, maxLat, maxLng };
}

export function coverBbox(bbox: GeoBounds, targetPrecision = 7): string[] {
  const out: string[] = [];
  // At root level, probe each of the 32 precision-1 cells
  for (const c of BASE32) {
    const cell = decodeGeohash(c);
    if (cellOutside(cell.bounds, bbox)) continue;
    if (cellContained(cell.bounds, bbox) || targetPrecision <= 1) {
      out.push(c);
    } else {
      subdivide(bbox, c, targetPrecision - 1, out);
    }
  }
  return out;
}

function cellContained(cell: GeoBounds, bbox: GeoBounds): boolean {
  return cell.minLng >= bbox.minLng
      && cell.maxLng <= bbox.maxLng
      && cell.minLat >= bbox.minLat
      && cell.maxLat <= bbox.maxLat;
}

function cellOutside(cell: GeoBounds, bbox: GeoBounds): boolean {
  return cell.maxLng < bbox.minLng
      || cell.minLng > bbox.maxLng
      || cell.maxLat < bbox.minLat
      || cell.minLat > bbox.maxLat;
}

function subdivide(bbox: GeoBounds, prefix: string, remaining: number, out: string[]): void {
  for (const c of BASE32) {
    const cell = decodeGeohash(prefix + c);
    if (cellOutside(cell.bounds, bbox)) continue;
    if (cellContained(cell.bounds, bbox) || remaining <= 1) {
      out.push(prefix + c);
    } else {
      subdivide(bbox, prefix + c, remaining - 1, out);
    }
  }
}
