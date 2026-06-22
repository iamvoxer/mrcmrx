import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const here = path.dirname(fileURLToPath(import.meta.url));
const webPublic = path.join(here, '..', 'packages', 'web', 'public');
const src = path.join(webPublic, 'assets', 'mrcx-logo.svg');
const out = path.join(webPublic, 'favicon.ico');

const [p16, p32] = await Promise.all([
  sharp(src).resize(16, 16).png().toBuffer(),
  sharp(src).resize(32, 32).png().toBuffer(),
]);

fs.writeFileSync(out, await toIco([p16, p32]));
console.log(`Wrote ${out}`);
