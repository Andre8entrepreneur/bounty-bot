import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");
const destDir = resolve(process.cwd(), "src/lib/solana/idl");

const files = [
  { src: resolve(repoRoot, "target/idl/escrow.json"), dest: resolve(destDir, "escrow.json") },
  { src: resolve(repoRoot, "target/types/escrow.ts"), dest: resolve(destDir, "escrow.ts") },
];

for (const { src } of files) {
  if (!existsSync(src)) {
    console.error(`idl:sync: ${src} not found — run \`anchor build\` first.`);
    process.exit(1);
  }
}

mkdirSync(destDir, { recursive: true });

for (const { src, dest } of files) {
  copyFileSync(src, dest);
  console.log(`idl:sync: copied ${src} -> ${dest}`);
}
