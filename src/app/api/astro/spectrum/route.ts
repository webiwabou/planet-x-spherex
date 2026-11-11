import { NextRequest, NextResponse } from "next/server";
import { CANONICAL_TARGETS, generateSyntheticSED, parseCoordinates } from "@/lib/astronomy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("target");
  const raParam = searchParams.get("ra");
  const decParam = searchParams.get("dec");

  let target = CANONICAL_TARGETS[0];

  if (targetId) {
    const found = CANONICAL_TARGETS.find((t) => t.id === targetId.toLowerCase());
    if (found) target = found;
  } else if (raParam && decParam) {
    const parsed = parseCoordinates(raParam, decParam);
    target = {
      ...CANONICAL_TARGETS[0],
      id: "custom",
      name: "Custom Coordinate Spectrum",
      raDeg: parsed.raDeg,
      decDeg: parsed.decDeg,
      raHms: parsed.raHms,
      decDms: parsed.decDms,
    };
  }

  const spectrum = generateSyntheticSED(target);

  return NextResponse.json({
    status: "success",
    target: {
      name: target.name,
      raDeg: target.raDeg,
      decDeg: target.decDeg,
    },
    totalBands: spectrum.length,
    spectrum,
  });
}
