// Records POST /api/spherex/frames for every preset in src/lib/series-presets.json; optional --base=URL and target ids narrow it
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--base="))?.slice(7) ?? process.env.SPHEREX_API ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const only = new Set(args.filter((a) => !a.startsWith("--")));
const out = path.join(root, "public/fixtures");

// IRSA's search service drops requests now and then, so archive errors are retried with a growing pause
async function fetchJson(url, init, attempts = 8) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    if (response.ok) return body;
    const code = body?.detail?.code ?? `HTTP ${response.status}`;
    if (attempt >= attempts || ![502, 503, 504].includes(response.status)) throw new Error(`${url} failed: ${code} ${body?.detail?.message ?? ""}`);
    console.log(`  ${code}, retrying (${attempt}/${attempts - 1})`);
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
}

const presets = JSON.parse(await readFile(path.join(root, "src/lib/series-presets.json"), "utf8"));
await mkdir(path.join(out, "frames"), { recursive: true });

const targets = await fetchJson(`${base}/api/spherex/targets`);
await writeFile(path.join(out, "targets.json"), JSON.stringify(targets));
const centres = Object.fromEntries(targets.results.map((t) => [t.target_id, t]));

const indexPath = path.join(out, "index.json");
const previous = await readFile(indexPath, "utf8").then(JSON.parse).catch(() => ({ series: [] }));
const recorded = new Map(previous.series.map((s) => [s.file, s]));

for (const [targetId, list] of Object.entries(presets)) {
  if (only.size && !only.has(targetId)) continue;
  const centre = centres[targetId];
  if (!centre) throw new Error(`No search centre for ${targetId}`);
  for (const preset of list) {
    const query = {
      ra: String(centre.search_ra_deg),
      dec: String(centre.search_dec_deg),
      fov_arcmin: centre.fov_arcmin,
      detector_id: preset.detector_id,
      wavelength_um: preset.wavelength_um,
      bandwidth_um: preset.bandwidth_um,
      observation_ids: preset.observation_ids,
    };
    const started = Date.now();
    const series = await fetchJson(`${base}/api/spherex/frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    const file = `frames/${targetId}_d${preset.detector_id}.json`;
    await writeFile(path.join(out, file), JSON.stringify(series));
    recorded.set(file, { target_id: targetId, file, query });
    const covered = series.frames.map((f) => `${f.observation_time.slice(0, 10)} ${Math.round((100 * f.covered_pixels) / (series.width * series.height))}%`);
    console.log(`${targetId} D${preset.detector_id}: ${series.frames.length} frames in ${((Date.now() - started) / 1000).toFixed(0)} s, ${covered.join(", ")}`);
  }
}

const index = {
  recorded_at: new Date().toISOString(),
  source: "POST /api/spherex/frames from astro_engine, SPHEREx DR1 and QR3 at IRSA",
  targets_file: "targets.json",
  series: [...recorded.values()].sort((a, b) => a.file.localeCompare(b.file)),
};
await writeFile(indexPath, `${JSON.stringify(index, null, 1)}\n`);
