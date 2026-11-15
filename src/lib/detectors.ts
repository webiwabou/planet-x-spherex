export type DetectorId = 1 | 2 | 3 | 4 | 5 | 6;

export type Detector = { id: DetectorId; label: string; minUm: number; maxUm: number };

export const WAVELENGTH_MIN_UM = 0.75;
export const WAVELENGTH_MAX_UM = 5.0;

export const DETECTORS: readonly Detector[] = [
  { id: 1, label: "D1", minUm: 0.75, maxUm: 1.11 },
  { id: 2, label: "D2", minUm: 1.11, maxUm: 1.64 },
  { id: 3, label: "D3", minUm: 1.64, maxUm: 2.42 },
  { id: 4, label: "D4", minUm: 2.42, maxUm: 3.82 },
  { id: 5, label: "D5", minUm: 3.82, maxUm: 4.42 },
  { id: 6, label: "D6", minUm: 4.42, maxUm: 5.0 },
];

export const detector = (id: number): Detector => DETECTORS[Math.min(5, Math.max(0, Math.round(id) - 1))];

export function detectorAt(wavelengthUm: number): Detector {
  return DETECTORS.find((d) => wavelengthUm < d.maxUm) ?? DETECTORS[5];
}

export const isDetectorId = (value: number): value is DetectorId => Number.isInteger(value) && value >= 1 && value <= 6;

export const formatRange = (d: Detector) => `${d.minUm.toFixed(2)} to ${d.maxUm.toFixed(2)} µm`;

// SPHEREx resolving power per detector; one channel is about wavelength / R wide
export const RESOLVING_POWER: Record<DetectorId, number> = { 1: 41, 2: 41, 3: 41, 4: 35, 5: 110, 6: 130 };

export function centreChannel(id: number): { wavelengthUm: number; bandwidthUm: number } {
  const d = detector(id);
  const wavelengthUm = (d.minUm + d.maxUm) / 2;
  return { wavelengthUm: Number(wavelengthUm.toFixed(4)), bandwidthUm: Number((wavelengthUm / RESOLVING_POWER[d.id]).toFixed(4)) };
}
