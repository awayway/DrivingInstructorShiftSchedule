import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isScheduleDateNote,
  splitAssignmentTokens,
} from '../src/resolvePersonNames.js';
import { parseShiftWorkbook, OTHER_KEY } from '../src/parseShiftWorkbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(__dirname, '../example');

function loadXlsx(name) {
  const p = path.join(exampleDir, name);
  const buf = fs.readFileSync(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// --- unit checks ---
const known = new Set(['駿.', '維鈞']);
console.assert(
  splitAssignmentTokens('3/23只有下午', known).join('|') === '3/23只有下午',
  'date note should not split'
);
console.assert(isScheduleDateNote('3/23只有下午'), 'date note detect');

// --- shiftTotalTable0515_01 ---
const buf = loadXlsx('shiftTotalTable0515_01.xlsx');
const { people, byPerson } = parseShiftWorkbook(buf);

console.log('people count', people.length);
console.assert(!people.includes('維鈞.'), '維鈞. merged into dialog list');
console.assert(people.includes('維鈞'), '維鈞 in list');
console.assert(people.includes('駿'), '駿 in list');
console.assert(!people.includes('駿.'), '駿. merged');

const other = byPerson[OTHER_KEY] || {};
let rawSet = new Map();
for (const evs of Object.values(other)) {
  for (const ev of evs) {
    const r = ev.rawName || '';
    rawSet.set(r, (rawSet.get(r) || 0) + 1);
  }
}
console.log('其他 unique rawName count', rawSet.size);
console.assert(!rawSet.has('3'), '3 should not be separate other token');
console.assert(!rawSet.has('23只有下午'), '23只有下午 should not be split');
console.assert(rawSet.has('3/23只有下午') || rawSet.get('3/23只有下午') === 1, 'full date note in 其他');

const wei = byPerson['維鈞'];
let hasAliasRaw = false;
if (wei) {
  for (const evs of Object.values(wei)) {
    for (const ev of evs) {
      if (ev.rawName === '維' || ev.rawName === '鴨' || ev.rawName === '維鈞半天') {
        hasAliasRaw = true;
      }
    }
  }
}
console.log('維鈞 has alias rawName events', hasAliasRaw);

const duckOther = [...rawSet.keys()].filter((k) => k === '鴨').length;
console.log('鴨 still in 其他 count', rawSet.get('鴨') || 0);
console.assert((rawSet.get('鴨') || 0) === 0, '鴨 should map to 鴨子 not 其他');

const jingli = rawSet.get('經理') || 0;
console.log('經理 in 其他', jingli);
console.assert(jingli > 0, '經理 should remain in 其他 as displayable name');

console.log('parse-test OK');
