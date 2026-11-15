import type { FrameQuery, QuickLookSeries, ResolvedCoordinates, TargetAvailability } from "../types";
import type { SkyApi } from "./client";
import { ApiError, errorFromResponse } from "./errors";

async function request<T>(base: string, path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base + path, { ...init, signal });
  } catch {
    if (signal?.aborted) throw new ApiError("aborted", "The request was cancelled.");
    throw new ApiError("network", "The SPHEREx service did not answer.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromResponse(response.status, body);
  return body as T;
}

export function createLiveApi(base: string): SkyApi {
  const root = base.replace(/\/$/, "");
  return {
    kind: "live",
    frames: (query: FrameQuery, signal?: AbortSignal) =>
      request<QuickLookSeries>(root, "/api/spherex/frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      }, signal),
    resolve: async (ra: string, dec: string, signal?: AbortSignal): Promise<ResolvedCoordinates> => {
      const params = new URLSearchParams({ ra, dec });
      const body = await request<{ ra_deg: number; dec_deg: number }>(root, `/api/coordinates/resolve?${params}`, {}, signal);
      return { ra_deg: body.ra_deg, dec_deg: body.dec_deg };
    },
    targets: async (signal?: AbortSignal): Promise<TargetAvailability[]> => {
      const body = await request<{ results?: TargetAvailability[] }>(root, "/api/spherex/targets", {}, signal);
      return body.results ?? [];
    },
  };
}
