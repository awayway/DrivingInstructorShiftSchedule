import * as XLSX from 'xlsx';

export const OTHER_KEY = '其他';

const DATA_START_ROW = 2;
const FIRST_COL = 2;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {unknown} v */
export function isNumericLike(v) {
  if (v == null || v === '') return true;
  if (typeof v === 'number' && !Number.isNaN(v)) return true;
  if (v instanceof Date) return true;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return true;
    return !Number.isNaN(Number(t));
  }
  return false;
}

/** Excel 1900 日期系統序號 → YYYY-MM-DD（與 Excel 曆日一致；由序號換算之瞬間為 UTC 午夜） */
function serialToYMD(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** @param {unknown} v */
function cellToYMD(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // SheetJS 常把「試算表上該曆日」存成本地午夜對應的 Date，用本地分量才與 Excel 畫面一致
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return serialToYMD(v);
  }
  return null;
}

/** @param {unknown[][]} grid @param {number} r */
function rowDateStr(grid, r) {
  const v1 = grid[r][1];
  if (typeof v1 === 'number' && v1 > 20000 && v1 < 80000) return serialToYMD(v1);
  const v0 = grid[r][0];
  if (v0 instanceof Date && !Number.isNaN(v0.getTime())) {
    return `${v0.getFullYear()}-${pad2(v0.getMonth() + 1)}-${pad2(v0.getDate())}`;
  }
  return cellToYMD(v0);
}

/**
 * @param {unknown[][]} grid
 * @param {number} c
 * @param {number} dataStart
 * @param {number} lastRow
 */
function isDateColumn(grid, c, dataStart, lastRow) {
  let hits = 0;
  let total = 0;
  for (let r = dataStart; r <= lastRow; r++) {
    const v = grid[r][c];
    if (v == null || v === '') continue;
    total++;
    if (v instanceof Date) hits++;
    else if (typeof v === 'number' && v > 40000 && v < 60000) hits++;
  }
  return total > 0 && hits / total > 0.5;
}

/**
 * @param {number} endCol
 * @param {Set<number>} dateCol
 */
function buildColumnIslands(endCol, dateCol) {
  /** @type {number[][]} */
  const islands = [];
  let cur = [];
  for (let c = FIRST_COL; c <= endCol; c++) {
    if (dateCol.has(c)) {
      if (cur.length) islands.push(cur);
      cur = [];
    } else cur.push(c);
  }
  if (cur.length) islands.push(cur);
  return islands;
}

/**
 * 期別僅來自「專案欄左側」：取同島內、欄索引小於 c 之最右一欄第 1 列為「期別」者。
 * 若左側存在「另一專案欄」且兩專案欄之間（不含兩端）沒有任何第 1 列為「期別」的欄，則本專案欄不帶期別（null）。
 *
 * @param {number[]} islandCols
 * @param {unknown[][]} grid
 * @param {number} c
 * @param {number} r
 * @param {Set<number>} personCol
 * @param {Set<number>} dateCol
 */
function periodForColumn(islandCols, grid, c, r, personCol, dateCol) {
  const h0 = (col) => (grid[0][col] != null ? String(grid[0][col]).trim() : '');
  const islandSet = new Set(islandCols);
  const minCol = islandCols.length ? Math.min(...islandCols) : c;

  /** @param {number} col */
  function isAssignmentProjectCol(col) {
    if (!islandSet.has(col)) return false;
    if (personCol.has(col) || dateCol.has(col)) return false;
    const h = h0(col);
    return Boolean(h) && h !== '期別';
  }

  const projHere = h0(c);
  if (!projHere || projHere === '期別') return null;

  let prevOtherProjectCol = null;
  for (let col = c - 1; col >= minCol; col--) {
    if (!isAssignmentProjectCol(col)) continue;
    if (h0(col) !== projHere) {
      prevOtherProjectCol = col;
      break;
    }
  }

  if (prevOtherProjectCol != null) {
    let hasPeriodBetween = false;
    for (let m = prevOtherProjectCol + 1; m < c; m++) {
      if (!islandSet.has(m)) continue;
      if (h0(m) === '期別') {
        hasPeriodBetween = true;
        break;
      }
    }
    if (!hasPeriodBetween) return null;
  }

  for (let col = c - 1; col >= minCol; col--) {
    if (!islandSet.has(col)) continue;
    if (h0(col) === '期別') return grid[r][col];
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {Set<string> | undefined} knownNames 若整格字串與某位教練姓名完全一致，則不再依句點等符號拆開（避免「駿.」被拆成「駿」誤配到另一欄）
 * @returns {string[]}
 */
function splitAssignmentTokens(raw, knownNames) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (knownNames && knownNames.has(s)) return [s];
  return s
    .split(/[,./、／]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ people: string[], byPerson: Record<string, Record<string, Array<{ project: string, location: string, period: string | null, rawName?: string }>>> }}
 */
export function parseShiftWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  if (!wb.SheetNames.length) throw new Error('活頁簿沒有任何工作表');
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) throw new Error('第一張工作表沒有儲存格範圍');

  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  /** @type {unknown[][]} */
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell) grid[r][c] = cell.v;
    }
  }
  const merges = ws['!merges'] || [];
  for (const m of merges) {
    const v = grid[m.s.r][m.s.c];
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (grid[r][c] == null || grid[r][c] === '') grid[r][c] = v;
      }
    }
  }

  let lastDataRow = range.e.r;
  let emptyRun = 0;
  for (let r = DATA_START_ROW; r <= range.e.r; r++) {
    const ok = Boolean(rowDateStr(grid, r));
    if (!ok) {
      emptyRun++;
      if (emptyRun >= 8) {
        lastDataRow = r - emptyRun;
        break;
      }
    } else emptyRun = 0;
  }

  const dateCol = new Set();
  for (let c = 0; c <= range.e.c; c++) {
    if (isDateColumn(grid, c, DATA_START_ROW, lastDataRow)) dateCol.add(c);
  }

  const personCol = new Set();
  /** @type {string[]} */
  const people = [];
  const seen = new Set();
  for (let c = 0; c <= range.e.c; c++) {
    if (grid[0][c] === '期別') continue;
    if (!isNumericLike(grid[1][c])) continue;
    let ok = true;
    for (let r = DATA_START_ROW; r <= lastDataRow; r++) {
      if (!isNumericLike(grid[r][c])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const name = grid[0][c] != null ? String(grid[0][c]).trim() : '';
    if (!name) continue;
    personCol.add(c);
    if (!seen.has(name)) {
      seen.add(name);
      people.push(name);
    }
  }

  const peopleSet = new Set(people);
  const firstPersonCol = personCol.size ? Math.min(...personCol) : range.e.c + 1;
  const lastAssignCol = Math.max(FIRST_COL, firstPersonCol - 1);
  const islands = buildColumnIslands(lastAssignCol, dateCol);
  /** @param {number} c */
  function islandForCol(c) {
    return islands.find((is) => is.includes(c)) || null;
  }

  /** @type {Record<string, Record<string, Array<{ project: string, location: string, period: string | null, rawName?: string }>>>} */
  const byPerson = {};
  /** @type {Map<string, Set<string>>} */
  const seenEventKeys = new Map();

  /** 同日同人（「其他」含 rawName）同專案／地點／期別僅保留一筆 */
  function eventDedupKey(ev) {
    const period = ev.period ?? '';
    const raw = ev.rawName ?? '';
    return `${ev.project}\x1e${ev.location}\x1e${period}\x1e${raw}`;
  }

  function pushEvent(personKey, dateStr, ev) {
    const bucketKey = `${personKey}\x1f${dateStr}`;
    let keys = seenEventKeys.get(bucketKey);
    if (!keys) {
      keys = new Set();
      seenEventKeys.set(bucketKey, keys);
    }
    const dk = eventDedupKey(ev);
    if (keys.has(dk)) return;
    keys.add(dk);

    if (!byPerson[personKey]) byPerson[personKey] = {};
    if (!byPerson[personKey][dateStr]) byPerson[personKey][dateStr] = [];
    byPerson[personKey][dateStr].push(ev);
  }

  for (let r = DATA_START_ROW; r <= lastDataRow; r++) {
    const dateStr = rowDateStr(grid, r);
    if (!dateStr) continue;

    for (let c = FIRST_COL; c <= lastAssignCol; c++) {
      if (personCol.has(c)) continue;
      if (dateCol.has(c)) continue;
      if (grid[0][c] === '期別') continue;

      const project = grid[0][c] != null ? String(grid[0][c]).trim() : '';
      if (!project || project === '期別') continue;

      const locRaw = grid[1][c];
      const location = locRaw != null && String(locRaw).trim() !== '' ? String(locRaw).trim() : '';

      const island = islandForCol(c);
      let periodVal = null;
      if (island) {
        const pv = periodForColumn(island, grid, c, r, personCol, dateCol);
        if (pv != null && String(pv).trim() !== '') periodVal = String(pv).trim();
      }

      const rawCell = grid[r][c];
      if (rawCell == null || rawCell === '') continue;
      if (rawCell instanceof Date) continue;
      if (typeof rawCell === 'number' && isNumericLike(rawCell)) continue;
      if (typeof rawCell === 'string' && isNumericLike(rawCell)) continue;

      const tokens = splitAssignmentTokens(rawCell, peopleSet);
      if (!tokens.length) continue;

      for (const token of tokens) {
        if (peopleSet.has(token)) {
          pushEvent(token, dateStr, {
            project,
            location,
            period: periodVal,
          });
        } else {
          pushEvent(OTHER_KEY, dateStr, {
            project,
            location,
            period: periodVal,
            rawName: token,
          });
        }
      }
    }
  }

  return { people, byPerson };
}
