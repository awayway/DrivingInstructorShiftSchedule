import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseShiftWorkbook, OTHER_KEY } from '../src/parseShiftWorkbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = path.resolve(__dirname, '../../example/shiftTotalTable.xlsx');
const buf = fs.readFileSync(xlsxPath);
const { people, byPerson } = parseShiftWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

console.log('people count', people.length, people.slice(0, 5), '...');
const 林威 = byPerson['林威'];
const dates = 林威 ? Object.keys(林威).sort() : [];
console.log('林威 first dates', dates.slice(0, 5));
if (dates.length && 林威) console.log('sample events', 林威[dates[0]]);

const other = byPerson[OTHER_KEY];
const od = other ? Object.keys(other).sort() : [];
console.log('其他 days', od.length, 'first', od.slice(0, 3));
if (od.length && other) console.log('其他 sample', other[od[0]]?.slice(0, 3));
