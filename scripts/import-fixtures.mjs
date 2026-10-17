// Tách file từ ytBilingualDump() thành fixtures/<videoId>.<lang>.<kind>[.<tlang>].json3.json
// Dùng: npm run fixtures:import -- ~/Downloads/yt-bilingual-capture-*.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Thiếu đường dẫn file capture');
  process.exit(1);
}
const outDir = join(import.meta.dirname, '..', 'fixtures');
mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const { tracks } = JSON.parse(readFileSync(file, 'utf8'));
  for (const { info, json3 } of tracks) {
    const name = [info.videoId, info.lang, info.kind ?? 'manual', info.tlang].filter(Boolean).join('.') + '.json3.json';
    writeFileSync(join(outDir, name), JSON.stringify(json3, null, 1) + '\n');
    console.log(`${name}  (${json3.events?.length ?? 0} events)`);
  }
}
