#!/usr/bin/env node
/*
 * build.js — statically compiles every image in ./images into a 3-wide grid.
 *
 * No dependencies. Run with: node build.js
 * Output is written to ./public (index.html + style.css + images/).
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const PUBLIC_DIR = path.join(ROOT, "public");
const PUBLIC_IMAGES_DIR = path.join(PUBLIC_DIR, "images");

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg",
]);

function log(msg) {
  process.stdout.write(`[build] ${msg}\n`);
}

// Collect image files, ignoring hidden/system files, sorted for stable output.
function collectImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    log(`No images/ directory found — creating an empty one.`);
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return [];
  }
  return fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => !name.startsWith("."))
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Turn a filename like "sleepy-fox_01.jpg" into "sleepy fox 01" for alt text.
function altFromFilename(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTile(filename) {
  const src = `images/${encodeURIComponent(filename)}`;
  const alt = escapeHtml(altFromFilename(filename));
  return `      <figure class="tile">
        <img src="${src}" alt="${alt}" loading="lazy" decoding="async" />
      </figure>`;
}

function renderPage(images) {
  const tiles = images.length
    ? images.map(renderTile).join("\n")
    : `      <p class="empty-note">no foxes yet — drop images into the <code>images/</code> folder and rebuild.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>foxgirls.download</title>
  <meta name="description" content="a scrolling grid of foxes." />
  <link rel="preconnect" href="/" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="body-content">
    <header class="page-head">
      <h2>foxgirls.download</h2>
      <p class="text1">${images.length} fox${images.length === 1 ? "" : "es"} and counting.</p>
    </header>

    <section class="gallery-grid">
${tiles}
    </section>

    <footer class="page-foot">
      <p>maintined by s1erra, main page : <a href="https://foxgirl.fyi">foxgirl.fyi</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function main() {
  const images = collectImages();
  log(`Found ${images.length} image(s).`);

  // Fresh public/ each build so deleted source images don't linger.
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });

  // Copy source images into public/images.
  for (const name of images) {
    copyFile(path.join(IMAGES_DIR, name), path.join(PUBLIC_IMAGES_DIR, name));
  }

  // Copy the stylesheet.
  copyFile(path.join(ROOT, "style.css"), path.join(PUBLIC_DIR, "style.css"));

  // Write the generated page.
  fs.writeFileSync(path.join(PUBLIC_DIR, "index.html"), renderPage(images));

  log(`Wrote public/index.html and copied assets.`);
}

main();
