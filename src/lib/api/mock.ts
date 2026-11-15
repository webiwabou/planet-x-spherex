import { CoordinateError, parseCoordinates } from "../coords";
import type { FrameQuery, QuickLookSeries, ResolvedCoordinates, TargetAvailability } from "../types";
import type { SkyApi } from "./client";
import { ApiError } from "./errors";

export type FixtureIndex = {
  recorded_at: string;
  source: string;
  targets_file: string;
  series: { target_id: string; file: string; query: FrameQuery }[];
};

const separationDeg = (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const r = Math.PI / 180;
  const c = Math.sin(dec1 * r) * Math.sin(dec2 * r) + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

async function load<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    if (signal?.aborted) throw new ApiError("aborted", "The request was cancelled.");
    throw new ApiError("network", "The recorded frames could not be read.");
  }
  if (!response.ok) throw new ApiError("no_fixture", `No recorded file at ${url}.`, response.status);
  return (await response.json()) as T;
}

export function createMockApi(root = "/fixtures"): SkyApi {
  let index: Promise<FixtureIndex> | null = null;
  const getIndex = (signal?: AbortSignal) => (index ??= load<FixtureIndex>(`${root}/index.json`, signal).catch((e) => {
    index = null;
    throw e;
  }));

  const toDegrees = (ra: string, dec: string): [number, number] => {
    try {
      return parseCoordinates(ra, dec);
    } catch (e) {
      throw new ApiError("invalid_coordinates", e instanceof CoordinateError ? e.message : "Invalid coordinates.", 422);
    }
  };

  return {
    kind: "mock",
    async frames(query: FrameQuery, signal?: AbortSignal): Promise<QuickLookSeries> {
      const [ra, dec] = toDegrees(query.ra, query.dec);
      const { series } = await getIndex(signal);
      const near = series.filter((s) => {
        const [sra, sdec] = parseCoordinates(s.query.ra, s.query.dec);
        return separationDeg(ra, dec, sra, sdec) * 60 < s.query.fov_arcmin / 4;
      });
      const hit = near.find((s) => s.query.detector_id === query.detector_id);
      if (!hit) {
        const message = near.length
          ? `Recorded frames for this field exist for ${near.map((s) => `D${s.query.detector_id}`).join(", ")} only.`
          : "Recorded frames exist only for the five NASA targets.";
        throw new ApiError("no_fixture", message);
      }
      return load<QuickLookSeries>(`${root}/${hit.file}`, signal);
    },
    async resolve(ra: string, dec: string): Promise<ResolvedCoordinates> {
      const [raDeg, decDeg] = toDegrees(ra, dec);
      return { ra_deg: raDeg, dec_deg: decDeg };
    },
    async targets(signal?: AbortSignal): Promise<TargetAvailability[]> {
      const { targets_file } = await getIndex(signal);
      const body = await load<{ results?: TargetAvailability[] }>(`${root}/${targets_file}`, signal);
      return body.results ?? [];
    },
  };
}
