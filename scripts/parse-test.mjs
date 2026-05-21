import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildPersonIndex,
  isLeaveToken,
  isScheduleDateNote,
  resolveAssignmentToken,
  resolveLeaveToken,
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

const leaveIdx = buildPersonIndex(['維鈞', '林欣瑩', '駿', '字鈞']);
const leaveHeader = new Map([
  ['維鈞', '維鈞'],
  ['林欣瑩', '林欣瑩'],
  ['駿', '駿'],
  ['字鈞', '字鈞'],
]);
console.assert(isLeaveToken('維鈞X'), '維鈞X is leave token');
console.assert(
  resolveLeaveToken('維X', leaveIdx, leaveHeader).type === 'leave',
  '維X -> leave'
);
console.assert(
  resolveLeaveToken('瑩X', leaveIdx, leaveHeader).person === '林欣瑩',
  '瑩X -> 林欣瑩'
);
console.assert(
  resolveLeaveToken('未知X', leaveIdx, leaveHeader).type === 'other',
  'unknown X -> 其他'
);

// --- resolve: 考試一前綴 + 複合人名（先 normalize 再 blacklist）---
const headerPeople = [
  '俊穎',
  '林欣瑩',
  '駿',
  '維鈞',
  '鴨子',
  '林威',
  '呂小遠',
];
const personIndex = buildPersonIndex(headerPeople);
const headerToCanonical = new Map(headerPeople.map((p) => [p, p]));

const examCombo = resolveAssignmentToken(
  '考試一俊瑩',
  personIndex,
  headerToCanonical
);
console.assert(examCombo.type === 'person', '考試一俊瑩 should resolve as person');
console.assert(
  examCombo.people.join(',') === '俊穎,林欣瑩',
  '考試一俊瑩 -> 俊穎+林欣瑩'
);
console.assert(
  resolveAssignmentToken('考試一', personIndex, headerToCanonical).type === 'other',
  '考試一 alone -> 其他'
);
console.assert(
  resolveAssignmentToken('期中考', personIndex, headerToCanonical).type === 'other',
  '期中考 -> 其他'
);

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

console.assert(
  (rawSet.get('考試一俊瑩') || 0) === 0,
  '考試一俊瑩 should not stay in 其他'
);
const jyExam = (byPerson['俊穎']?.['2026-03-16'] || []).some(
  (ev) => ev.rawName === '考試一俊瑩'
);
const xyExam = (byPerson['林欣瑩']?.['2026-03-16'] || []).some(
  (ev) => ev.rawName === '考試一俊瑩'
);
console.assert(jyExam, '俊穎 has 考試一俊瑩 on 2026-03-16');
console.assert(xyExam, '林欣瑩 has 考試一俊瑩 on 2026-03-16');

const buf519 = loadXlsx('shiftTotalTable0519_ori.xlsx');
const parsed519 = parseShiftWorkbook(buf519);
const weiLeave = (parsed519.byPerson['維鈞']?.['2026-05-24'] || []).filter(
  (ev) => ev.kind === 'leave'
);
console.assert(weiLeave.length >= 1, '維鈞X on 2026-05-24 is leave');
console.assert(weiLeave[0].rawName === '維鈞X', 'leave rawName preserved');

console.log('parse-test OK');
