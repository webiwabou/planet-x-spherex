import type { ApiErrorCode } from "../types";

const KNOWN: ReadonlySet<string> = new Set<ApiErrorCode>([
  "invalid_coordinates",
  "invalid_request",
  "unusable_series",
  "observations_missing",
  "observation_not_found",
  "search_truncated",
  "invalid_fits_metadata",
  "archive_unavailable",
  "no_fixture",
  "network",
  "aborted",
  "unknown",
]);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  get retryable() {
    return this.code === "archive_unavailable" || this.code === "network";
  }
}

export const isAbort = (error: unknown) => error instanceof ApiError && error.code === "aborted";

// FastAPI sends {detail: {code, message}} for domain errors, {detail: [...]} for validation and {detail: "..."} otherwise
export function errorFromResponse(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const { code, message } = detail as { code?: unknown; message?: unknown };
    if (typeof code === "string") return new ApiError(KNOWN.has(code) ? (code as ApiErrorCode) : "unknown", String(message ?? ""), status);
  }
  if (Array.isArray(detail)) {
    const text = detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d))).join("; ");
    return new ApiError("invalid_request", text, status);
  }
  if (typeof detail === "string") return new ApiError(status === 400 ? "invalid_coordinates" : "unknown", detail, status);
  if (status === 503 || status === 504) return new ApiError("archive_unavailable", "The SPHEREx archive is not answering.", status);
  return new ApiError("unknown", `The service answered with HTTP ${status}.`, status);
}
