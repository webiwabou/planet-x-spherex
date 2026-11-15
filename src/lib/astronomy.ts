import catalogue from "../../resources/gaia/targets.json";
import { SPHEREX_DETECTORS } from "./spherex-bands";

export interface CelestialTarget {
  id: string;
  name: string;
  designation: string;
  category: string;
  raDeg: number;
  decDeg: number;
  raHms: string;
  decDms: string;
  pmRaMasYr: number;
  pmDecMasYr: number;
  defaultFovArcmin: number;
  recommendedDetectors: number[];
  description: string;
  physicalInsight: string;
}

export interface SimulatedSpectralPoint {
  bandIndex: number;
  detectorId: number;
  wavelengthMicrons: number;
  fluxDensity: number;
  uncertainty: number;
}

export interface SpherexSurvey {
  epochIndex: number;
  name: string;
  observationDate: string;
  deltaYearsFromT0: number;
}

// Placeholder epochs for UI testing, NOT verified SPHEREx observations.
export const SPHEREX_SURVEYS: SpherexSurvey[] = [
  { epochIndex: 0, name: "Demo 1", observationDate: "Illustrative", deltaYearsFromT0: 0 },
  { epochIndex: 1, name: "Demo 2", observationDate: "Illustrative", deltaYearsFromT0: 0.5 },
  { epochIndex: 2, name: "Demo 3", observationDate: "Illustrative", deltaYearsFromT0: 1.0 },
  { epochIndex: 3, name: "Demo 4", observationDate: "Illustrative", deltaYearsFromT0: 1.5 },
];

export function parseCoordinates(
  raInput: string | number,
  decInput: string | number
) {
  function parseAngle(value: string | number, isRa: boolean): number {
    const raw = String(value).trim();
    if (!raw) throw new Error("Coordinate cannot be empty.");

    const decimal = Number(raw);
    if (Number.isFinite(decimal)) return decimal;

    const negative = raw.startsWith("-");
    const parts = raw
      .replace(/^[+-]/, "")
      .replace(/[hHdD°mMsS'′"″:]/g, " ")
      .trim()
      .split(/\s+/);

    if (parts.length !== 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
      throw new Error(`Invalid ${isRa ? "RA" : "Dec"} format.`);
    }

    const [major, minutes, seconds] = parts.map(Number);

    if (minutes >= 60 || seconds >= 60) {
      throw new Error("Minutes and seconds must be less than 60.");
    }

    if (isRa && negative) {
      throw new Error("RA hours must be non-negative.");
    }

    const angle = major + minutes / 60 + seconds / 3600;
    return (negative ? -1 : 1) * angle * (isRa ? 15 : 1);
  }

  const raDeg = parseAngle(raInput, true);
  const decDeg = parseAngle(decInput, false);

  if (!Number.isFinite(raDeg) || raDeg < 0 || raDeg >= 360) {
    throw new Error("RA must be between 0 and 360 degrees (exclusive).");
  }

  if (!Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) {
    throw new Error("Dec must be between -90 and 90 degrees.");
  }

  return {
    raDeg,
    decDeg,
    raHms: formatAngle(raDeg / 15, true),
    decDms: formatAngle(decDeg, false),
  };
}

function formatAngle(value: number, isRa: boolean): string {
  const sign = !isRa && value < 0 ? "-" : "+";
  const absolute = Math.abs(value);
  const totalSeconds = Math.round(absolute * 360000) / 100;
  const major = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds - major * 3600 - minutes * 60;

  const parts = [
    String(major).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    seconds.toFixed(2).padStart(5, "0"),
  ];

  return isRa
    ? `${parts[0]}h ${parts[1]}m ${parts[2]}s`
    : `${sign}${parts[0]}d ${parts[1]}m ${parts[2]}s`;
}

const TARGET_METADATA: Record<string, {
  category: string;
  defaultFovArcmin: number;
  description: string;
}> = {
  barnards_star: {
    category: "High Proper Motion",
    defaultFovArcmin: 5,
    description: "Nearby star; candidate for proper-motion examination.",
  },
  epsilon_indi_b: {
    category: "Brown Dwarf",
    defaultFovArcmin: 5,
    description: "Nearby brown dwarf companion.",
  },
  wise_0855: {
    category: "Brown Dwarf",
    defaultFovArcmin: 5,
    description: "Cold brown dwarf and NASA challenge benchmark.",
  },
  rw_aurigae: {
    category: "Variable Star",
    defaultFovArcmin: 5,
    description: "Young variable star.",
  },
  r_draconis: {
    category: "Variable Star",
    defaultFovArcmin: 5,
    description: "Long-period variable star.",
  },
};

export const CANONICAL_TARGETS: CelestialTarget[] = catalogue.targets.map(
  (entry) => {
    const coordinates = parseCoordinates(entry.ra_deg, entry.dec_deg);
    const metadata = TARGET_METADATA[entry.id];

    return {
      id: entry.id,
      name: entry.name,
      designation: entry.resolver_name,
      category: metadata?.category ?? "Astronomical Target",
      ...coordinates,

      // Unknown, not measured zero motion.
      // Only used to keep the existing simulated viewer operational.
      pmRaMasYr: 0,
      pmDecMasYr: 0,

      defaultFovArcmin: metadata?.defaultFovArcmin ?? 5,
      recommendedDetectors: [1, 2, 3, 4, 5, 6],
      description: metadata?.description ?? entry.note,
      physicalInsight:
        "Catalogue coordinates are search centers, not propagated positions. " +
        "Spectral and motion displays are illustrative until connected to observations.",
    };
  }
);

// DEMONSTRATION ONLY.
// This is a compatibility implementation, not extracted SPHEREx photometry.
// The Python backend remains authoritative for spectrum generation.
export function generateSyntheticSED(
  target: CelestialTarget
): SimulatedSpectralPoint[] {
  const points: SimulatedSpectralPoint[] = [];
  let bandIndex = 1;

  for (const detector of SPHEREX_DETECTORS) {
    const step =
      (detector.wavelengthMax - detector.wavelengthMin) / 17;

    for (let i = 0; i < 17; i++) {
      const wavelengthMicrons =
        detector.wavelengthMin + (i + 0.5) * step;

      const fluxDensity = 50 / Math.pow(wavelengthMicrons, 1.5);

      points.push({
        bandIndex,
        detectorId: detector.id,
        wavelengthMicrons,
        fluxDensity,
        uncertainty: fluxDensity * 0.03,
      });

      bandIndex++;
    }
  }

  return points;
}
