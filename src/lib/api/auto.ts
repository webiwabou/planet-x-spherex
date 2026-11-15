import type { FrameQuery } from "../types";
import type { SkyApi } from "./client";
import { ApiError } from "./errors";

// Recorded frames answer for the five targets at once; everything else goes to the live backend
export function createAutoApi(recorded: SkyApi, live: SkyApi): SkyApi {
  return {
    kind: "auto",
    async frames(query: FrameQuery, signal?: AbortSignal) {
      try {
        return await recorded.frames(query, signal);
      } catch (e) {
        if (e instanceof ApiError && e.code === "no_fixture") return live.frames(query, signal);
        throw e;
      }
    },
    async resolve(ra: string, dec: string, signal?: AbortSignal) {
      try {
        return await live.resolve(ra, dec, signal);
      } catch (e) {
        if (e instanceof ApiError && e.code === "network") return recorded.resolve(ra, dec, signal);
        throw e;
      }
    },
    targets: (signal?: AbortSignal) => live.targets(signal).catch(() => recorded.targets(signal)),
    exportFits: (query: FrameQuery, cachedUrl?: string | null, signal?: AbortSignal) => live.exportFits(query, cachedUrl, signal),
  };
}
