// Playwright driver for scripts/record-demo.sh — run that, not this.
// Captures exactly one replay loop of the Pit wall as PNG frames plus an
// ffmpeg concat list, so the encoded GIF loops seamlessly.
//
// A loop starts when realtime re-broadcasts `event: initial` after the replay
// reconnects (realtime/src/ingest/mod.rs). We hook the page's own EventSource
// to timestamp those, and cut the capture between two of them.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const env = (name, fallback) => process.env[name] ?? fallback;
const PW_DIR = env("PW_DIR"); // where record-demo.sh installed playwright
const FRAMES_DIR = env("FRAMES_DIR");
const PAGE_URL = env("PAGE_URL", "http://localhost:3000/pitwall");
const MAX_MS = Number(env("MAX_SECONDS", "60")) * 1000; // longest loop accepted
const FRAME_MS = 100; // the dashboard's store tick (useLiveData.ts TICK_MS)
// An `initial` lands in the store on the next tick, then React paints.
const PAINT_LAG_MS = 250;

const { chromium } = createRequire(join(PW_DIR, "noop.js"))("playwright");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2, // supersample; record-demo.sh scales down
  });
  await page.addInitScript(() => {
    window.__loopStarts = [];
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(...args) {
        super(...args);
        let first = true; // the per-connection snapshot, not a loop start
        this.addEventListener("initial", () => {
          if (first) first = false;
          else window.__loopStarts.push(Date.now());
        });
      }
    };
  });

  await page.goto(PAGE_URL);
  // Fully populated pit wall: 5 timing rows, 5 cars on the map, the ring.
  await page.locator('[role="button"][aria-label$=" stints"]').nth(4).waitFor();
  await page
    .locator('svg[aria-label="Circuit map with current car positions"] g[transform]')
    .nth(4)
    .waitFor()
    .catch(() => {
      throw new Error("no cars on the track map: its outline needs internet (MultiViewer)");
    });
  await page.locator('svg[aria-label="Circle of doom"]').waitFor();

  const loopStarts = () => page.evaluate(() => window.__loopStarts);
  // A loop that started while the page was loading would be cut short.
  await page.evaluate(() => (window.__loopStarts.length = 0));
  console.log("==> waiting for the replay to loop");
  await page.waitForFunction(() => window.__loopStarts.length >= 1, null, {
    timeout: 120_000,
    polling: 50,
  });
  const [start] = await loopStarts();
  const from = start + PAINT_LAG_MS;
  await page.waitForTimeout(Math.max(0, from - Date.now()));

  console.log("==> capturing one loop");
  const frames = [];
  let to = from + MAX_MS;
  let last;
  for (;;) {
    const t = Date.now();
    if (t >= to) break;
    // Identical screenshots just extend the previous frame's duration.
    const png = await page.screenshot();
    if (!last?.equals(png)) {
      const file = `f${String(frames.length).padStart(4, "0")}.png`;
      await writeFile(join(FRAMES_DIR, file), png);
      frames.push({ file, t });
      last = png;
    }
    const next = (await loopStarts())[1];
    if (next !== undefined) to = Math.min(to, next + PAINT_LAG_MS);
    const wait = t + FRAME_MS - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  const next = (await loopStarts())[1];
  if (next === undefined || next + PAINT_LAG_MS > to) {
    throw new Error(
      `the replay loop outlasted MAX_SECONDS=${MAX_MS / 1000}: ` +
        "lower REPLAY_FRAME_DELAY_MS or raise MAX_SECONDS",
    );
  }

  // ffmpeg concat demuxer: per-frame durations from capture timestamps; the
  // last file is listed twice so its duration is honoured.
  const lines = frames.map((f, i) => {
    const end = i + 1 < frames.length ? frames[i + 1].t : to;
    return `file '${f.file}'\nduration ${((end - f.t) / 1000).toFixed(3)}`;
  });
  lines.push(`file '${frames.at(-1).file}'`);
  await writeFile(join(FRAMES_DIR, "frames.txt"), lines.join("\n") + "\n");
  console.log(`==> ${frames.length} distinct frames over ${((to - from) / 1000).toFixed(1)}s`);
} finally {
  await browser.close();
}
