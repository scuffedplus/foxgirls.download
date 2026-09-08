#!/usr/bin/env node
/*
 * optimize-images.js — normalizes ./images into sequentially named WebP files.
 *
 * For every image in images/:
 *   - if it is not already WebP (checked by magic bytes, not extension),
 *     re-encode it as WebP and delete the original file;
 *   - rename it to fox_<N>.webp.
 *
 * Numbering is stable: a file already called fox_<N> keeps its N, so existing
 * URLs survive. Anything else takes the lowest free numbers, in sorted order.
 *
 * Note: WebP has no progressive/interlaced encoding mode — the format doesn't
 * define one. WebP files decode incrementally via the decoder's streaming API
 * regardless of how they were encoded, so there is no flag to set here.
 *
 * Requires sharp. Run with: node scripts/optimize-images.js
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");

// Raster formats we can re-encode. SVG is deliberately excluded: rasterizing a
// vector to WebP loses the thing that makes it worth keeping.
const CONVERTIBLE = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif",
]);

const WEBP_QUALITY = 82;
const WEBP_EFFORT = 6;
// High-quality chroma subsampling (libwebp's sharp YUV conversion). Costs a
// little encode time and keeps saturated edges — fox fur, reds — from bleeding.
const WEBP_SMART_SUBSAMPLE = true;
// Let libwebp pick the deblocking filter strength per image instead of using a
// fixed one, which smooths blocking artefacts out of flat areas.
const WEBP_SMART_DEBLOCK = true;

function log(msg) {
  process.stdout.write(`[images] ${msg}\n`);
}

// RIFF....WEBP — sniff the container rather than trusting the extension, so a
// mislabelled .webp (or a real WebP named .png) is handled correctly.
function isWebp(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) < 12) return false;
    return head.toString("ascii", 0, 4) === "RIFF" &&
           head.toString("ascii", 8, 12) === "WEBP";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function collect() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  return fs
    .readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((n) => CONVERTIBLE.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const FOX_NAME = /^fox_(\d+)$/;

// Split the set into files that already carry a fox_<N> number (which they
// keep) and files that need one assigned. Files literally named fox_<N>.webp
// claim first and never move, so no conversion can overwrite one of them
// before it is processed (fox_1.png next to fox_1.webp must not clobber the
// webp). Other fox_<N> names (fox_3.png, fox_03.webp) keep N when it's still
// free; everything else takes the lowest free numbers.
function planNumbers(files) {
  const taken = new Set();
  const keeps = new Map(); // filename -> N
  const needs = [];

  const foxNumber = (name) => {
    const m = FOX_NAME.exec(path.basename(name, path.extname(name)));
    return m && Number(m[1]) > 0 ? Number(m[1]) : 0;
  };

  // Pass 1: files already at their final path stay put.
  for (const name of files) {
    const n = foxNumber(name);
    if (n && name === `fox_${n}.webp`) {
      taken.add(n);
      keeps.set(name, n);
    }
  }

  // Pass 2: other numbered names keep their N when free; the rest queue up.
  for (const name of files) {
    if (keeps.has(name)) continue;
    const n = foxNumber(name);
    if (n && !taken.has(n)) {
      taken.add(n);
      keeps.set(name, n);
    } else {
      needs.push(name);
    }
  }

  let next = 1;
  for (const name of needs) {
    while (taken.has(next)) next++;
    taken.add(next);
    keeps.set(name, next);
  }
  return keeps;
}

async function main() {
  const files = collect();
  log(`Found ${files.length} image(s) in images/.`);
  if (!files.length) return;

  const numbers = planNumbers(files);
  let converted = 0;
  let renamed = 0;

  for (const name of files) {
    const src = path.join(IMAGES_DIR, name);
    const target = `fox_${numbers.get(name)}.webp`;
    const dest = path.join(IMAGES_DIR, target);

    if (isWebp(src)) {
      if (name === target) continue;
      // Already WebP — just give it its number.
      fs.renameSync(src, dest);
      renamed++;
      log(`renamed  ${name} -> ${target}`);
      continue;
    }

    // Encode to a temp file first so a mid-write failure can't leave a
    // truncated fox_N.webp behind in place of a good source image.
    const tmp = path.join(IMAGES_DIR, `.${target}.tmp`);
    try {
      await sharp(src, { animated: true })
        // Carry the source's ICC profile through instead of stripping it, so
        // wide-gamut (Display P3 etc.) images don't shift colour after encode.
        .keepIccProfile()
        .webp({
          quality: WEBP_QUALITY,
          effort: WEBP_EFFORT,
          smartSubsample: WEBP_SMART_SUBSAMPLE,
          smartDeblock: WEBP_SMART_DEBLOCK,
        })
        .toFile(tmp);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      log(`SKIP     ${name} — could not decode (${err.message})`);
      continue;
    }

    fs.renameSync(tmp, dest);
    // The original is only removed once the WebP is safely in place.
    if (src !== dest) fs.rmSync(src, { force: true });
    converted++;
    log(`encoded  ${name} -> ${target}`);
  }

  log(`Done: ${converted} re-encoded, ${renamed} renamed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
