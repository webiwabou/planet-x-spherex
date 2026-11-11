import { NextResponse } from "next/server";
import { CANONICAL_TARGETS } from "@/lib/astronomy";

export async function GET() {
  return NextResponse.json({
    status: "success",
    count: CANONICAL_TARGETS.length,
    targets: CANONICAL_TARGETS,
  });
}
