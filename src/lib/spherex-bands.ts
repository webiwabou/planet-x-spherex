export interface SpherexDetector {
  id: number;
  code: string;
  wavelengthMin: number;
  wavelengthMax: number;
  color: string;
}

export interface MolecularFeature {
  formula: string;
  description: string;
  wavelengths: number[];
  color: string;
}

export const SPHEREX_DETECTORS: SpherexDetector[] = [
  { id: 1, code: "D1", wavelengthMin: 0.75, wavelengthMax: 1.11, color: "#38bdf8" },
  { id: 2, code: "D2", wavelengthMin: 1.11, wavelengthMax: 1.64, color: "#22d3ee" },
  { id: 3, code: "D3", wavelengthMin: 1.64, wavelengthMax: 2.42, color: "#34d399" },
  { id: 4, code: "D4", wavelengthMin: 2.42, wavelengthMax: 3.82, color: "#fbbf24" },
  { id: 5, code: "D5", wavelengthMin: 3.82, wavelengthMax: 4.42, color: "#fb923c" },
  { id: 6, code: "D6", wavelengthMin: 4.42, wavelengthMax: 5.00, color: "#f472b6" },
];

// Spectral feature annotations will be added after wavelength verification.
// An empty list prevents displaying unverified scientific markers.
export const MOLECULAR_FEATURES: MolecularFeature[] = [];
