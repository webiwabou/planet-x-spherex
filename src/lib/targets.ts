import { centreChannel } from "./detectors";
import presets from "./series-presets.json";
import type { FieldSpec } from "./series";
import { formatDec, formatRA, tangentOffset } from "./sky";

export type TargetId = "barnards_star" | "epsilon_indi_b" | "wise_0855" | "rw_aurigae" | "r_draconis";

// A curated band-matched series: observations whose target pixel saw the same narrow channel
export type SeriesPreset = { detector_id: number; wavelength_um: number; bandwidth_um: number; observation_ids: string[] };

export type Target = {
  id: TargetId;
  key: number;
  name: string;
  raDeg: number;
  decDeg: number;
  fovArcmin: number;
  blurb: string;
  presets: SeriesPreset[];
};

const PRESETS = presets as Record<string, SeriesPreset[]>;

// Search centres from GET /api/spherex/targets (resources/spherex/samples/manifest.json)
const BASE: Omit<Target, "presets">[] = [
  { id: "barnards_star", key: 1, name: "Barnard’s Star", raDeg: 269.4485025, decDeg: 4.7669315, fovArcmin: 8, blurb: "Moves 10.4″ a year, faster than any other star" },
  { id: "epsilon_indi_b", key: 2, name: "Epsilon Indi B", raDeg: 331.04414658852124, decDeg: -56.78284419511611, fovArcmin: 8, blurb: "A pair of brown dwarfs, moving 4.7″ a year" },
  { id: "wise_0855", key: 3, name: "WISE 0855−0714", raDeg: 133.79512916666667, decDeg: -7.245147222222222, fovArcmin: 8, blurb: "A cold brown dwarf, moving 8.1″ a year" },
  { id: "rw_aurigae", key: 4, name: "RW Aurigae", raDeg: 76.95652603458, decDeg: 30.40143817389, fovArcmin: 8, blurb: "A young star that dims and brightens irregularly" },
  { id: "r_draconis", key: 5, name: "R Draconis", raDeg: 248.16761083295, decDeg: 66.75497941722, fovArcmin: 8, blurb: "A pulsing giant on a 246-day cycle" },
];

export const TARGETS: readonly Target[] = BASE.map((t) => ({ ...t, presets: PRESETS[t.id] ?? [] }));

export const targetById = (id: string | null | undefined) => TARGETS.find((t) => t.id === id) ?? null;

export const targetByKey = (key: number) => TARGETS.find((t) => t.key === key) ?? null;

export function fieldSpecOf(target: Target, detectorId?: number): FieldSpec | null {
  const preset = target.presets.find((p) => p.detector_id === detectorId) ?? (detectorId === undefined ? target.presets[0] : undefined);
  if (!preset) return null;
  return {
    key: target.id,
    label: target.name,
    targetId: target.id,
    raDeg: target.raDeg,
    decDeg: target.decDeg,
    fovArcmin: target.fovArcmin,
    detectorId: preset.detector_id,
    wavelengthUm: preset.wavelength_um,
    bandwidthUm: preset.bandwidth_um,
    observationIds: preset.observation_ids,
  };
}

export const detectorsOf = (target: Target) => target.presets.map((p) => p.detector_id);

// Positions anywhere else have no curated observations, so the backend picks them for the detector's middle channel
export function skyFieldSpec(raDeg: number, decDeg: number, detectorId: number): FieldSpec {
  const { wavelengthUm, bandwidthUm } = centreChannel(detectorId);
  return {
    key: `sky:${raDeg.toFixed(4)},${decDeg.toFixed(4)}`,
    label: `${formatRA(raDeg)} ${formatDec(decDeg)}`,
    targetId: null,
    raDeg,
    decDeg,
    fovArcmin: 8,
    detectorId,
    wavelengthUm,
    bandwidthUm,
  };
}

// The backend's target list carries the propagated search centres, so they replace the built-in ones when available
export function applyTargetCentres(results: { target_id: string; search_ra_deg: number; search_dec_deg: number }[]) {
  for (const r of results) {
    const t = TARGETS.find((x) => x.id === r.target_id);
    if (t && Number.isFinite(r.search_ra_deg) && Number.isFinite(r.search_dec_deg)) {
      t.raDeg = r.search_ra_deg;
      t.decDeg = r.search_dec_deg;
    }
  }
}

export function targetNear(raDeg: number, decDeg: number): Target | null {
  return TARGETS.find((t) => {
    const offset = tangentOffset(t.raDeg, t.decDeg, raDeg, decDeg);
    return !!offset && Math.hypot(offset[0], offset[1]) < t.fovArcmin * 60 * 1.5;
  }) ?? null;
}
