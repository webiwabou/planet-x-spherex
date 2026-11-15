
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.ASTRO_BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const ra = request.nextUrl.searchParams.get("ra");
  const dec = request.nextUrl.searchParams.get("dec");

  if (!ra || !dec) {
    return NextResponse.json(
      { detail: "Both RA and Dec are required." },
      { status: 400 }
    );
  }

  try {
    const url = new URL("/api/coordinates/resolve", BACKEND_URL);
    url.searchParams.set("ra", ra);
    url.searchParams.set("dec", dec);

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Astronomy backend unavailable. Please try again.",
      },
      { status: 503 }
    );
  }
}

