// Mirrors astro_engine/pipeline.py parse_sky_coordinates so mock mode rejects the same input as the backend
const SEXAGESIMAL = /^([0-9]+)(?:\s*:\s*|\s+)([0-9]+)(?:\s*:\s*|\s+)([0-9]+(?:\.[0-9]+)?)$/;
const HMS = /^([0-9]+)\s*h\s*([0-9]+)\s*m\s*([0-9]+(?:\.[0-9]+)?)\s*s?$/i;
const DMS = /^([0-9]+)\s*[d°]\s*([0-9]+)\s*[m'′]\s*([0-9]+(?:\.[0-9]+)?)\s*[s"″]?$/i;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export class CoordinateError extends Error {}

function parseAngle(value: string, axis: "RA" | "Dec"): number {
  const raw = value.trim();
  if (DECIMAL.test(raw)) return Number(raw);
  const signed = raw.startsWith("+") || raw.startsWith("-");
  const unsigned = signed ? raw.slice(1) : raw;
  const match = unsigned.match(SEXAGESIMAL) ?? unsigned.match(axis === "RA" ? HMS : DMS);
  if (!match) throw new CoordinateError(`Invalid ${axis} format.`);
  const [major, minutes, seconds] = match.slice(1, 4).map(Number);
  if (minutes >= 60 || seconds >= 60) throw new CoordinateError(`${axis} minutes and seconds must each be less than 60.`);
  let angle = major + minutes / 60 + seconds / 3600;
  if (axis === "RA") {
    if (raw.startsWith("-")) throw new CoordinateError("RA hours must be non-negative.");
    angle *= 15;
  }
  return raw.startsWith("-") ? -angle : angle;
}

export function parseCoordinates(ra: string, dec: string): [number, number] {
  const raDeg = parseAngle(ra, "RA");
  const decDeg = parseAngle(dec, "Dec");
  if (!(raDeg >= 0 && raDeg < 360)) throw new CoordinateError("RA must be finite and in [0, 360) degrees.");
  if (!(decDeg >= -90 && decDeg <= 90)) throw new CoordinateError("Dec must be finite and in [-90, 90] degrees.");
  return [raDeg, decDeg];
}

// Splits one typed string into its RA and Dec parts, e.g. "17:57:48.5 +04:41:36" or "269.45, 4.69"
export function splitCoordinates(text: string): [string, string] | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const comma = cleaned.split(/\s*,\s*/);
  if (comma.length === 2 && comma[0] && comma[1]) return [comma[0], comma[1]];
  const signAt = cleaned.slice(1).search(/[+\-−]/);
  if (signAt >= 0) {
    const cut = signAt + 1;
    return [cleaned.slice(0, cut).trim(), cleaned.slice(cut).replace("−", "-").trim()];
  }
  const parts = cleaned.split(" ");
  if (parts.length === 2) return [parts[0], parts[1]];
  if (parts.length === 6) return [parts.slice(0, 3).join(" "), parts.slice(3).join(" ")];
  const hms = cleaned.match(/^(\S+h\s*\S+m\s*\S+?s?)\s+(.+)$/i);
  if (hms) return [hms[1], hms[2]];
  return null;
}
