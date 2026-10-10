import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
async function manifest(directory, prefix = '') {
  const entries = [];
  for (const item of await readdir(directory,{withFileTypes:true})) {
    assert.ok(!item.isSymbolicLink(),'Hosting artifacts must not contain symlinks');
    const relative = `${prefix}${item.name}`;
    const file = path.join(directory,item.name);
    if (item.isDirectory()) entries.push(...await manifest(file,`${relative}/`));
    else {
      assert.ok(item.isFile(),'Expected only regular hosting files');
      const digest = createHash('sha256').update(await readFile(file)).digest('hex');
      entries.push([relative,digest]);
    }
  }
  return entries.sort(([a],[b])=>a.localeCompare(b));
}
const built = await manifest(path.join(root,'apps/web/dist'));
const downloaded = await manifest(path.join(root,'.tools/hosting-artifact'));
assert.ok(built.some(([name])=>name==='index.html'),'Build must include index.html');
assert.deepEqual(downloaded,built,'Downloaded hosting artifact must match every built file byte for byte');
console.log(`Hosting artifact round trip verified: ${built.length} files with identical SHA-256 hashes.`);
