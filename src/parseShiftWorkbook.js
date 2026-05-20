import * as XLSX from 'xlsx';
import {
  buildPersonIndex,
  canonicalPersonKey,
  dedupePeopleToCanonical,
  rawNameForEvent,
  resolveAssignmentToken,
  splitAssignmentTokens,
} from './resolvePersonNames.js';

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
 * @param {number[]} islandCols
 * @param {unknown[][]} grid
 * @param {number} c
 * @param {Set<number>} personCol
 * @param {Set<number>} dateCol
 */
/**
 * @param {number[]} islandCols
 * @param {unknown[][]} grid
 * @param {Set<number>} personCol
 * @param {Set<number>} dateCol
 * @returns {{ project: string, cols: number[] }[]}
 */
function buildProjectBlocks(islandCols, grid, personCol, dateCol) {
  const islandSet = new Set(islandCols);
  const h0 = (col) => (grid[0][col] != null ? String(grid[0][col]).trim() : '');

  /** @type {{ project: string, cols: number[] }[]} */
  const blocks = [];
  let curProject = null;
  /** @type {number[]} */
  let curCols = [];

  for (const col of islandCols) {
    if (!islandSet.has(col)) continue;
    if (personCol.has(col) || dateCol.has(col)) continue;
    const project = h0(col);
    if (!project || project === '期別') {
      if (curProject && curCols.length) {
        blocks.push({ project: curProject, cols: curCols });
      }
      curProject = null;
      curCols = [];
      continue;
    }

    if (curProject === project) {
      curCols.push(col);
    } else {
      if (curProject && curCols.length) blocks.push({ project: curProject, cols: curCols });
      curProject = project;
      curCols = [col];
    }
  }
  if (curProject && curCols.length) blocks.push({ project: curProject, cols: curCols });

  return blocks;
}

/**
 * 與隱式期別步驟 3 相同：僅採計「該列有有效日期」且「該欄儲存格非空白」者；人名格定義同 §4.2。
 * @param {unknown[][]} grid
 * @param {number} col
 * @param {number} lastDataRow
 * @param {Set<string>} knownNames
 * @param {import('./resolvePersonNames.js').PersonIndex} personIndex
 * @param {Map<string, string>} headerToCanonical
 */
function countPersonLikeSampleStats(grid, col, lastDataRow, knownNames, personIndex, headerToCanonical) {
  let N = 0;
  let T = 0;
  for (let r = DATA_START_ROW; r <= lastDataRow; r++) {
    const dateStr = rowDateStr(grid, r);
    if (!dateStr) continue;

    const rawCell = grid[r][col];
    if (rawCell == null) continue;
    const s = String(rawCell).trim();
    if (!s) continue;

    T++;

    const tokens = splitAssignmentTokens(rawCell, knownNames);
    let hasAnyPerson = false;
    for (const token of tokens) {
      const resolved = resolveAssignmentToken(token, personIndex, headerToCanonical);
      if (resolved.type === 'person' && resolved.people.length) {
        hasAnyPerson = true;
        break;
      }
    }
    if (hasAnyPerson) N++;
  }
  return { N, T };
}

function explicitPeriodColumnForAssignment(islandCols, grid, c, personCol, dateCol) {
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
    if (h0(col) === '期別') return col;
  }
  return null;
}

/**
 * @param {number[]} islandCols
 * @param {unknown[][]} grid
 * @param {number} lastDataRow
 * @param {Set<number>} personCol
 * @param {Set<number>} dateCol
 * @param {Set<string>} knownNames
 * @param {import('./resolvePersonNames.js').PersonIndex} personIndex
 * @param {Map<string, string>} headerToCanonical
 */
function buildImplicitPeriodMapping(
  islandCols,
  grid,
  lastDataRow,
  personCol,
  dateCol,
  knownNames,
  personIndex,
  headerToCanonical
) {
  /** @type {Set<number>} */
  const implicitPeriodCol = new Set();
  /** @type {Map<number, number>} assignmentCol -> periodSourceCol */
  const implicitSourceForCol = new Map();

  const blocks = buildProjectBlocks(islandCols, grid, personCol, dateCol);

  for (const b of blocks) {
    if (b.cols.length < 2) continue;
    const L = b.cols[0];

    // block 左側已有顯式期別欄時，不啟用隱式期別
    const explicitCol = explicitPeriodColumnForAssignment(islandCols, grid, L, personCol, dateCol);
    if (explicitCol != null) continue;

    const { N, T } = countPersonLikeSampleStats(grid, L, lastDataRow, knownNames, personIndex, headerToCanonical);

    if (T === 0) continue; // 無樣本，不啟用隱式期別
    if (N > T / 2) continue; // 嚴格多數為人名格，維持指派

    implicitPeriodCol.add(L);
    for (const c of b.cols) {
      if (c === L) continue;
      implicitSourceForCol.set(c, L);
    }
  }

  return { implicitPeriodCol, implicitSourceForCol };
}

/**
 * §4.2 步驟 4b：第 1 列空白、採計與隱式期別步驟 3 相同且人名格嚴格多數 → 併入左側最近專案之指派欄。
 * @param {number[]} islandCols
 * @param {unknown[][]} grid
 * @param {number} lastDataRow
 * @param {Set<number>} personCol
 * @param {Set<number>} dateCol
 * @param {Set<string>} knownNames
 * @param {import('./resolvePersonNames.js').PersonIndex} personIndex
 * @param {Map<string, string>} headerToCanonical
 * @param {Set<number>} implicitPeriodCols
 * @returns {Map<number, { anchor: number, locationSourceCol: number, refColForPeriod: number }>}
 */
function buildExtensionAssignmentMeta(
  islandCols,
  grid,
  lastDataRow,
  personCol,
  dateCol,
  knownNames,
  personIndex,
  headerToCanonical,
  implicitPeriodCols
) {
  const islandSet = new Set(islandCols);
  const h0 = (col) => (grid[0][col] != null ? String(grid[0][col]).trim() : '');
  const blocks = buildProjectBlocks(islandCols, grid, personCol, dateCol);
  /** @type {Map<number, { anchor: number, locationSourceCol: number, refColForPeriod: number }>} */
  const meta = new Map();

  const minCol = islandCols.length ? Math.min(...islandCols) : FIRST_COL;

  for (const c of islandCols) {
    if (personCol.has(c) || dateCol.has(c)) continue;
    if (h0(c) !== '') continue;

    const { N, T } = countPersonLikeSampleStats(grid, c, lastDataRow, knownNames, personIndex, headerToCanonical);
    if (T === 0 || N <= T / 2) continue;

    let anchor = null;
    for (let col = c - 1; col >= minCol; col--) {
      if (!islandSet.has(col)) continue;
      if (personCol.has(col) || dateCol.has(col)) continue;
      const h = h0(col);
      if (!h || h === '期別') continue;
      anchor = col;
      break;
    }
    if (anchor == null) continue;

    const block = blocks.find((b) => b.cols.includes(anchor));
    if (!block) continue;

    const assignCols = block.cols.filter((col) => !implicitPeriodCols.has(col));
    const locationSourceCol = implicitPeriodCols.has(anchor)
      ? assignCols.find((col) => col > anchor) ?? assignCols[0] ?? anchor
      : anchor;
    const refColForPeriod = assignCols.length ? Math.max(...assignCols) : anchor;

    meta.set(c, { anchor, locationSourceCol, refColForPeriod });
  }

  return meta;
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
  const rawHeaderPeople = [];
  /** @type {Map<string, string>} */
  const headerToCanonical = new Map();
  const knownNames = new Set();

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
    rawHeaderPeople.push(name);
    knownNames.add(name);
    headerToCanonical.set(name, canonicalPersonKey(name));
  }

  const people = dedupePeopleToCanonical(rawHeaderPeople);
  const personIndex = buildPersonIndex(people);

  const firstPersonCol = personCol.size ? Math.min(...personCol) : range.e.c + 1;
  const lastAssignCol = Math.max(FIRST_COL, firstPersonCol - 1);
  const islands = buildColumnIslands(lastAssignCol, dateCol);
  /** @param {number} c */
  function islandForCol(c) {
    return islands.find((is) => is.includes(c)) || null;
  }

  /** @type {Set<number>} */
  const implicitPeriodCols = new Set();
  /** @type {Map<number, number>} */
  const implicitPeriodSourceForCol = new Map();
  for (const island of islands) {
    const { implicitPeriodCol, implicitSourceForCol } = buildImplicitPeriodMapping(
      island,
      grid,
      lastDataRow,
      personCol,
      dateCol,
      knownNames,
      personIndex,
      headerToCanonical
    );
    for (const c of implicitPeriodCol) implicitPeriodCols.add(c);
    for (const [c, src] of implicitSourceForCol) implicitPeriodSourceForCol.set(c, src);
  }

  /** @type {Map<number, { anchor: number, locationSourceCol: number, refColForPeriod: number }>} */
  const extensionAssignmentMeta = new Map();
  for (const island of islands) {
    const partial = buildExtensionAssignmentMeta(
      island,
      grid,
      lastDataRow,
      personCol,
      dateCol,
      knownNames,
      personIndex,
      headerToCanonical,
      implicitPeriodCols
    );
    for (const [col, m] of partial) extensionAssignmentMeta.set(col, m);
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

  /**
   * @param {string} personKey
   * @param {string} dateStr
   * @param {{ project: string, location: string, period: string | null, rawName?: string }} ev
   */
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
      if (implicitPeriodCols.has(c)) continue;

      const island = islandForCol(c);

      /** @type {string} */
      let project;
      /** @type {string} */
      let location;
      /** @type {number} */
      let periodRefCol;

      if (extensionAssignmentMeta.has(c)) {
        const ex = extensionAssignmentMeta.get(c);
        project = grid[0][ex.anchor] != null ? String(grid[0][ex.anchor]).trim() : '';
        if (!project) continue;

        const ownLoc = grid[1][c];
        if (ownLoc != null && String(ownLoc).trim() !== '') {
          location = String(ownLoc).trim();
        } else {
          const fb = grid[1][ex.locationSourceCol];
          location = fb != null && String(fb).trim() !== '' ? String(fb).trim() : '';
        }
        periodRefCol = ex.refColForPeriod;
      } else {
        project = grid[0][c] != null ? String(grid[0][c]).trim() : '';
        if (!project || project === '期別') continue;

        const locRaw = grid[1][c];
        location = locRaw != null && String(locRaw).trim() !== '' ? String(locRaw).trim() : '';
        periodRefCol = c;
      }

      let periodVal = null;
      if (island) {
        const explicitCol = explicitPeriodColumnForAssignment(island, grid, periodRefCol, personCol, dateCol);
        if (explicitCol != null) {
          const pv = grid[r][explicitCol];
          if (pv != null && String(pv).trim() !== '') periodVal = String(pv).trim();
        } else if (implicitPeriodSourceForCol.has(periodRefCol)) {
          const src = implicitPeriodSourceForCol.get(periodRefCol);
          const pv = src != null ? grid[r][src] : null;
          if (pv != null && String(pv).trim() !== '') periodVal = String(pv).trim();
        }
      }

      const rawCell = grid[r][c];
      if (rawCell == null || rawCell === '') continue;
      if (rawCell instanceof Date) continue;
      if (typeof rawCell === 'number' && isNumericLike(rawCell)) continue;
      if (typeof rawCell === 'string' && isNumericLike(rawCell)) continue;

      const tokens = splitAssignmentTokens(rawCell, knownNames);
      if (!tokens.length) continue;

      for (const token of tokens) {
        const resolved = resolveAssignmentToken(token, personIndex, headerToCanonical);

        if (resolved.type === 'other') {
          pushEvent(OTHER_KEY, dateStr, {
            project,
            location,
            period: periodVal,
            rawName: resolved.rawName,
          });
          continue;
        }

        for (const person of resolved.people) {
          const rn = rawNameForEvent(resolved.rawName, person);
          const ev = {
            project,
            location,
            period: periodVal,
            ...(rn != null ? { rawName: rn } : {}),
          };
          pushEvent(person, dateStr, ev);
        }

        if (resolved.partialRest) {
          pushEvent(OTHER_KEY, dateStr, {
            project,
            location,
            period: periodVal,
            rawName: resolved.partialRest,
          });
        }
      }
    }
  }

  return { people, byPerson };
}
