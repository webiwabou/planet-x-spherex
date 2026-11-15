import type { FrameQuery, QuickLookSeries, ResolvedCoordinates, TargetAvailability } from "../types";
import { createAutoApi } from "./auto";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";

export type ApiKind = "mock" | "live" | "auto";

export interface SkyApi {
  readonly kind: ApiKind;
  frames(query: FrameQuery, signal?: AbortSignal): Promise<QuickLookSeries>;
  resolve(ra: string, dec: string, signal?: AbortSignal): Promise<ResolvedCoordinates>;
  targets(signal?: AbortSignal): Promise<TargetAvailability[]>;
}

// An empty value means the API is served from the same origin as the page
export const API_BASE = process.env.NEXT_PUBLIC_SPHEREX_API ?? "http://localhost:8000";

// ?data=mock, ?data=live or ?data=auto overrides the build-time default
export function apiKind(search?: URLSearchParams): ApiKind {
  const requested = search?.get("data") ?? process.env.NEXT_PUBLIC_SPHEREX_DATA;
  return requested === "live" || requested === "auto" ? requested : "mock";
}

export function createApi(kind: ApiKind): SkyApi {
  if (kind === "live") return createLiveApi(API_BASE);
  if (kind === "auto") return createAutoApi(createMockApi(), createLiveApi(API_BASE));
  return createMockApi();
}
