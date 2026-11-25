import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const base = JSON.parse(read(`_locales/${manifest.default_locale}/messages.json`));
const keys = Object.keys(base).sort();
const placeholders = text => [...text.matchAll(/\$([a-z][a-z0-9_]*)\$/gi)].map(m => m[1].toLowerCase()).sort();
for (const locale of readdirSync(resolve(root, '_locales'))) {
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
  assert.deepEqual(Object.keys(messages).sort(), keys, `${locale}: missing or extra keys`);
  for (const key of keys) {
    const entry = messages[key];
    assert.equal(typeof entry.message, 'string', `${locale}/${key}: message must be text`);
    assert(entry.message.trim(), `${locale}/${key}: empty message`);
    assert.deepEqual(placeholders(entry.message), placeholders(base[key].message), `${locale}/${key}: placeholders changed`);
    assert.deepEqual(entry.placeholders || {}, base[key].placeholders || {}, `${locale}/${key}: substitution definitions changed`);
  }
}
for (const dir of ['', 'popup', 'reminder-dialog', 'reminder-list', 'options']) {
  for (const name of readdirSync(resolve(root, dir)).filter(name => /\.(html|js|json)$/.test(name))) {
    const file = `${dir}/${name}`;
    const source = read(file.replace(/^\//, ''));
    const patterns = [/I18n\.message\(\s*"([^"]+)"/g, /data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g, /__MSG_(\w+)__/g];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) assert(base[match[1]], `${file}: unknown key ${match[1]}`);
    }
  }
}
console.log(`Validated ${keys.length} messages in every locale and static references.`);
