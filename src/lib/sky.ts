const DEG = Math.PI / 180;
const ARCSEC_PER_RAD = 206264.80624709636;

// World coordinates are arcseconds on a whole-sky plate carree map: x grows westward so east is left, y grows southward so north is up
export const worldOf = (raDeg: number, decDeg: number): [number, number] => [(360 - raDeg) * 3600, -decDeg * 3600];

export function raDecOfWorld(wx: number, wy: number): [number, number] {
  const ra = (((360 - wx / 3600) % 360) + 360) % 360;
  return [ra, Math.max(-90, Math.min(90, -wy / 3600))];
}

export function tangentOffset(ra0: number, dec0: number, ra: number, dec: number): [number, number] | null {
  const d0 = dec0 * DEG, d = dec * DEG, da = (ra - ra0) * DEG;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da);
  if (cosc <= 0) return null;
  const xi = (Math.cos(d) * Math.sin(da)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / cosc;
  return [xi * ARCSEC_PER_RAD, eta * ARCSEC_PER_RAD];
}

export function raDecOfOffset(ra0: number, dec0: number, xiArcsec: number, etaArcsec: number): [number, number] {
  const xi = xiArcsec / ARCSEC_PER_RAD, eta = etaArcsec / ARCSEC_PER_RAD, d0 = dec0 * DEG;
  const rho = Math.hypot(xi, eta);
  if (rho === 0) return [ra0, dec0];
  const c = Math.atan(rho);
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho);
  const ra = ra0 * DEG + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c));
  return [(((ra / DEG) % 360) + 360) % 360, dec / DEG];
}

export function formatRA(raDeg: number): string {
  const hours = ((((raDeg % 360) + 360) % 360) / 15) * 3600;
  const tenths = Math.round(hours * 10) % (24 * 36000);
  const h = Math.floor(tenths / 36000), m = Math.floor((tenths % 36000) / 600), s = (tenths % 600) / 10;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}m${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? "−" : "+";
  const total = Math.round(Math.abs(decDeg) * 3600);
  const d = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${sign}${String(d).padStart(2, "0")}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}

export function formatAngle(arcsec: number): string {
  const deg = arcsec / 3600;
  if (deg >= 1) return `${deg.toFixed(deg >= 10 ? 0 : 1)}°`;
  const arcmin = arcsec / 60;
  if (arcmin >= 1) return `${arcmin.toFixed(arcmin >= 10 ? 0 : 1)}′`;
  return `${arcsec.toFixed(0)}″`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const formatMonth = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Galactic equator in equatorial coordinates, for the whole-sky texture
export const galacticPlaneDec = (raDeg: number) => Math.atan(Math.tan(62.87 * DEG) * Math.sin((raDeg - 282.86) * DEG)) / DEG;
