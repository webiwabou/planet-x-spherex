import type { FrameQuery, QuickLookSeries, ResolvedCoordinates, TargetAvailability } from "../types";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";

export type ApiKind = "mock" | "live";

export interface SkyApi {
  readonly kind: ApiKind;
  frames(query: FrameQuery, signal?: AbortSignal): Promise<QuickLookSeries>;
  resolve(ra: string, dec: string, signal?: AbortSignal): Promise<ResolvedCoordinates>;
  targets(signal?: AbortSignal): Promise<TargetAvailability[]>;
}

export const API_BASE = process.env.NEXT_PUBLIC_SPHEREX_API ?? "http://localhost:8000";

// ?data=live or ?data=mock overrides the build-time default
export function apiKind(search?: URLSearchParams): ApiKind {
  const requested = search?.get("data") ?? process.env.NEXT_PUBLIC_SPHEREX_DATA;
  return requested === "live" ? "live" : "mock";
}

export const createApi = (kind: ApiKind): SkyApi => (kind === "live" ? createLiveApi(API_BASE) : createMockApi());
