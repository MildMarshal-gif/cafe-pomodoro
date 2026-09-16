import { readFile, stat } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { SCENES } from "../dist/engine.mjs";
const html = await readFile("dist/index.html", "utf8");
const js = await readFile("dist/app.mjs", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate element IDs");
for (const match of js.matchAll(/\$\(['"]#([a-z-]+)['"]\)/g)) {
  if (match[1] === "preview-dialog") continue;
  assert(ids.includes(match[1]), `missing element ${match[1]}`);
}
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const value = match[1];
  if (/^(data:|https?:)/.test(value)) continue;
  assert(
    (await stat("dist/" + value)).isFile(),
    `missing local asset ${value}`,
  );
}
for (const scene of SCENES) {
  const data = await readFile(`dist/assets/${scene.id}.png`);
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  assert(data.readUInt32BE(16) >= 1024);
  assert(data.readUInt32BE(20) >= 768);
}
for (const file of [
  "dist/app.mjs",
  "dist/engine.mjs",
  "dist/sound.mjs",
  "scripts/serve.mjs",
])
  execFileSync(process.execPath, ["--check", file]);
assert(!/<video\b/i.test(html), "prototype must use static image previews");
assert(html.includes('lang="ja"'));
assert(html.includes('name="viewport"'));
console.log(
  "Static checks passed: element IDs, selectors, local references, 4 PNG images, module syntax, Japanese/mobile metadata, no video.",
);
