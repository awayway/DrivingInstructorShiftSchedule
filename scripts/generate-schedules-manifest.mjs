import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULES_DIR = path.join(__dirname, '..', 'public', 'schedules');
const MANIFEST_PATH = path.join(SCHEDULES_DIR, 'manifest.json');
const NAME_RE = /^shift-(\d{8})\.xlsx$/i;

/** @param {string} ymd */
function isValidCalendarDate(ymd) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** @param {string} ymd */
function toIsoDate(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function main() {
  if (!fs.existsSync(SCHEDULES_DIR)) {
    fs.mkdirSync(SCHEDULES_DIR, { recursive: true });
  }

  const entries = fs.readdirSync(SCHEDULES_DIR, { withFileTypes: true });
  const xlsxNames = entries
    .filter((e) => e.isFile() && /\.xlsx$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  /** @type {Array<{ name: string, reason: string }>} */
  const failures = [];
  /** @type {Array<{ name: string, date: string, ymd: string }>} */
  const valid = [];

  for (const name of xlsxNames) {
    const match = NAME_RE.exec(name);
    if (!match) {
      failures.push({
        name,
        reason: '預期格式：shift-YYYYMMDD.xlsx（例：shift-20250518.xlsx）',
      });
      continue;
    }
    const ymd = match[1];
    if (!isValidCalendarDate(ymd)) {
      failures.push({
        name,
        reason: `檔名日期無效：${ymd}（非合法曆日）`,
      });
      continue;
    }
    valid.push({ name, date: toIsoDate(ymd), ymd });
  }

  const byDate = new Map();
  for (const item of valid) {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item.name);
  }
  for (const [date, names] of byDate) {
    if (names.length > 1) {
      for (const name of names) {
        failures.push({
          name,
          reason: `與其他檔案同日期 ${date} 衝突：${names.filter((n) => n !== name).join('、')}`,
        });
      }
    }
  }

  if (failures.length > 0) {
    const unique = new Map();
    for (const f of failures) {
      if (!unique.has(f.name)) unique.set(f.name, f.reason);
    }
    console.error(
      `✖ public/schedules/：排班表檔名驗證失敗（共 ${unique.size} 個）\n`
    );
    for (const [name, reason] of unique) {
      console.error(`  ${name}`);
      console.error(`    ${reason}`);
      console.error('');
    }
    console.error(
      '請重新命名或移出 public/schedules/ 後再執行 npm run schedules:manifest'
    );
    process.exit(1);
  }

  valid.sort((a, b) => b.date.localeCompare(a.date));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: valid.map(({ name, date }) => ({ name, date })),
    latest: valid.length > 0 ? valid[0].name : null,
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `✔ manifest.json（${manifest.files.length} 個檔案，latest: ${manifest.latest ?? '—'}）`
  );
}

main();
