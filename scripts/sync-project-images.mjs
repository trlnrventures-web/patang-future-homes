/**
 * Sync data/projects.json image arrays from the folders in public/projects/.
 *
 *   <project folder>/            -> images[]          (main/hero + gallery)
 *   <project folder>/Elevation/  -> images[]          (main/hero + gallery)
 *   <project folder>/Amenities/  -> amenityImages[]   (captioned)
 *   <project folder>/Actual Show Flat/ -> showFlatImages[] (type: actual)
 *   <project folder>/Show Flat/  -> showFlatImages[]  (type: render)
 *
 * Projects without a folder are left untouched. The folder is the project's
 * `imageFolder` field when set, otherwise the slug.
 *
 * Run: npm run sync:images   (also runs automatically before `next build`)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_PROJECTS = path.join(ROOT, "public", "projects");
const PROJECTS_FILE = path.join(ROOT, "data", "projects.json");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const IGNORED_FILES = new Set([".gitkeep", "readme.md"]);
const IGNORED_DIRS = new Set(["video"]);

const MAIN_DIRS = ["", "Elevation"];
const AMENITY_DIR = "Amenities";
const ACTUAL_DIR = "Actual Show Flat";
const RENDER_DIR = "Show Flat";

function isImage(file) {
  return IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()) && !IGNORED_FILES.has(file.toLowerCase());
}

/** "Living Room-1000x900.jpg" -> "Living Room" */
function titleFromFile(file) {
  const base = file.replace(/\.[^.]+$/, "");
  return base
    .replace(/-\d{3,4}x\d{3,4}$/i, "")
    .replace(/^copy of\s+/i, "")
    .replace(/^\d+[\s._-]+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function smartTitle(file) {
  const title = titleFromFile(file);
  const letters = title.replace(/[^a-zA-Z]/g, "");
  if (!letters) return title;
  const isUniformCase = letters === letters.toLowerCase() || letters === letters.toUpperCase();
  if (!isUniformCase) return title;
  return title.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function sortMain(a, b) {
  const rank = (name) => (/main/i.test(name) ? 0 : 1);
  return (
    rank(a) - rank(b) ||
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function listDir(dir, subdir) {
  const full = path.join(dir, subdir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => entry.name)
    .sort(sortMain);
}

function toUrl(folderName, subdir, file) {
  const parts = [`/projects/${encodeURIComponent(folderName)}`];
  if (subdir) parts.push(encodeURIComponent(subdir));
  parts.push(encodeURIComponent(file));
  return parts.join("/");
}

function entryText(diff, key, before, after) {
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (!same) diff.push(key);
}

const raw = fs.readFileSync(PROJECTS_FILE, "utf-8");
const projects = JSON.parse(raw);

const changed = [];

for (const project of projects) {
  const folderName = project.imageFolder || project.slug;
  const dir = path.join(PUBLIC_PROJECTS, folderName);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

  const before = {
    images: project.images,
    amenityImages: project.amenityImages,
    showFlatImages: project.showFlatImages,
  };

  const images = [];
  for (const subdir of MAIN_DIRS) {
    if (subdir && IGNORED_DIRS.has(subdir.toLowerCase())) continue;
    for (const file of listDir(dir, subdir)) images.push(toUrl(folderName, subdir, file));
  }

  const amenityImages = listDir(dir, AMENITY_DIR).map((file) => ({
    title: smartTitle(file),
    src: toUrl(folderName, AMENITY_DIR, file),
  }));

  const actualImages = listDir(dir, ACTUAL_DIR).map((file) => ({
    title: smartTitle(file),
    type: "actual",
    src: toUrl(folderName, ACTUAL_DIR, file),
  }));
  const renderImages = listDir(dir, RENDER_DIR).map((file) => ({
    title: smartTitle(file),
    type: "render",
    src: toUrl(folderName, RENDER_DIR, file),
  }));
  const showFlatImages = [...actualImages, ...renderImages];

  project.images = images;
  project.amenityImages = amenityImages;
  project.showFlatImages = showFlatImages;

  const keys = [];
  entryText(keys, "images", before.images, images);
  entryText(keys, "amenityImages", before.amenityImages, amenityImages);
  entryText(keys, "showFlatImages", before.showFlatImages, showFlatImages);
  if (keys.length) changed.push(`${project.slug}: ${keys.join(", ")}`);
}

fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2) + "\n", "utf-8");

if (changed.length) {
  console.log(`Updated ${changed.length} project(s):`);
  for (const line of changed) console.log(`  - ${line}`);
} else {
  console.log("data/projects.json already in sync with public/projects/.");
}
