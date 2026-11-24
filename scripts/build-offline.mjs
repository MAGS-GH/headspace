import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distribution = join(projectDir, "dist");
const worker = await readFile(join(projectDir, "scripts", "service-worker.js"), "utf8");
const hash = createHash("sha256").update(worker);
const urls = [];

const licenses = join(distribution, "licenses");
await mkdir(licenses, { recursive: true });
for (const font of ["dm-sans", "lora"]) {
  await copyFile(join(projectDir, "node_modules", "@fontsource-variable", font, "LICENSE"), join(licenses, font + ".txt"));
}
await copyFile(join(projectDir, "src", "icons", "LICENSE"), join(licenses, "lucide.txt"));

async function addDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (directory === distribution && entry.name === "downloads") continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(file);
    } else if (entry.isFile() && !/^sw\.js$|\.(map|zip|exe|msi)$/i.test(entry.name)) {
      const path = relative(distribution, file).split(sep).map(encodeURIComponent).join("/");
      hash.update(path).update("\0").update(await readFile(file)).update("\0");
      urls.push("./" + path);
    }
  }
}

await addDirectory(distribution);
const version = hash.digest("hex").slice(0, 20);
const preamble = `const BUILD_VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(urls, null, 2)};\n`;
await writeFile(join(distribution, "sw.js"), preamble + worker);
console.log(`Offlineversion ${version} indeholder ${urls.length} filer.`);
