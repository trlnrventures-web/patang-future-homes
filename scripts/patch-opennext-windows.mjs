/**
 * OpenNext (via @opennextjs/aws) recreates Next.js's node_modules symlinks with
 * plain file symlinks, which Windows only allows from an elevated shell or with
 * Developer Mode enabled. Next itself creates those links as junctions, which
 * need no privilege — so on win32 we fall back to a junction.
 *
 * Patched file: node_modules/@opennextjs/aws/dist/build/copyTracedFiles.js
 * Idempotent and a no-op on other platforms. Runs automatically before
 * `npm run deploy` / `npm run preview` (see predeploy/prepreview scripts).
 */
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "win32") {
  process.exit(0);
}

const TARGET = path.join(
  process.cwd(),
  "node_modules",
  "@opennextjs",
  "aws",
  "dist",
  "build",
  "copyTracedFiles.js"
);

const MARKER = "patch-opennext-windows";
const OLD = "symlinkSync(symlink, to);";
const NEW = [
  "try {",
  "    symlinkSync(symlink, to);",
  "} catch (linkErr) {",
  `    // ${MARKER}: junctions need no privilege on Windows`,
  '    if (linkErr.code === "EEXIST") {',
  "        // already linked",
  '    } else if (linkErr.code === "EPERM" || linkErr.code === "EACCES") {',
  '        symlinkSync(symlink, to, "junction");',
  "    } else {",
  "        throw linkErr;",
  "    }",
  "}",
]
  .map((line, i) => (i === 0 ? line : `                ${line}`))
  .join("\n");

if (!fs.existsSync(TARGET)) {
  console.warn(`[patch-opennext-windows] ${TARGET} not found, skipping.`);
  process.exit(0);
}

const source = fs.readFileSync(TARGET, "utf-8");

if (source.includes(MARKER)) {
  process.exit(0);
}

if (!source.includes(OLD)) {
  console.error(
    "[patch-opennext-windows] Could not find the symlink call to patch — " +
      "@opennextjs/aws may have changed. Deploy will likely fail on Windows."
  );
  process.exit(1);
}

fs.writeFileSync(TARGET, source.replace(OLD, NEW), "utf-8");
console.log("[patch-opennext-windows] patched copyTracedFiles.js");
