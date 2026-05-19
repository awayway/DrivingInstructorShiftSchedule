import { OTHER_KEY } from './parseShiftWorkbook.js';

/** @typedef {{ project: string, location: string, period: string | null, rawName?: string }} ShiftEvent */

/** @typedef {'add' | 'remove' | 'modify'} ChangeType */

/**
 * @typedef {object} ScheduleChange
 * @property {ChangeType} type
 * @property {string} personKey
 * @property {string} dateStr
 * @property {ShiftEvent} [baselineEvent]
 * @property {ShiftEvent} [currentEvent]
 */

/**
 * @typedef {object} DayDiff
 * @property {number} adds
 * @property {number} removes
 * @property {number} modifies
 * @property {ShiftEvent[]} ghosts
 * @property {Array<{ current: ShiftEvent, baseline: ShiftEvent }>} modifyPairs
 * @property {Map<string, ShiftEvent>} currentDiffByKey
 */

/**
 * @typedef {object} CompareSummary
 * @property {number} total
 * @property {number} people
 * @property {number} dates
 * @property {number} added
 * @property {number} removed
 * @property {number} modified
 */

/**
 * @typedef {object} CompareResult
 * @property {CompareSummary} summary
 * @property {ScheduleChange[]} sortedChanges
 * @property {Record<string, ScheduleChange[]>} changesByPerson
 * @property {Record<string, Record<string, DayDiff>>} dayDiffByPerson
 */

const TYPE_RANK = { remove: 0, modify: 1, add: 2 };

/** @param {unknown} v */
function norm(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** @param {ShiftEvent} ev */
export function eventCompareKey(ev) {
  return `${norm(ev.project)}\x1e${norm(ev.location)}\x1e${norm(ev.period)}\x1e${norm(ev.rawName)}`;
}

/**
 * @param {ShiftEvent[]} baselineEvents
 * @param {ShiftEvent[]} currentEvents
 */
export function diffPersonDay(baselineEvents, currentEvents) {
  /** @type {ShiftEvent[]} */
  const baseRemain = [];
  const currPool = [...currentEvents];

  for (const ev of baselineEvents) {
    const k = eventCompareKey(ev);
    const idx = currPool.findIndex((e) => eventCompareKey(e) === k);
    if (idx >= 0) currPool.splice(idx, 1);
    else baseRemain.push(ev);
  }

  /** @type {Map<string, ShiftEvent[]>} */
  const byProjectBase = new Map();
  /** @type {Map<string, ShiftEvent[]>} */
  const byProjectCurr = new Map();

  for (const ev of baseRemain) {
    const p = norm(ev.project);
    if (!byProjectBase.has(p)) byProjectBase.set(p, []);
    byProjectBase.get(p).push(ev);
  }
  for (const ev of currPool) {
    const p = norm(ev.project);
    if (!byProjectCurr.has(p)) byProjectCurr.set(p, []);
    byProjectCurr.get(p).push(ev);
  }

  /** @type {ShiftEvent[]} */
  const adds = [];
  /** @type {ShiftEvent[]} */
  const removes = [];
  /** @type {Array<{ baseline: ShiftEvent, current: ShiftEvent }>} */
  const modifyPairs = [];

  const projects = new Set([...byProjectBase.keys(), ...byProjectCurr.keys()]);
  for (const p of projects) {
    const bList = byProjectBase.get(p) || [];
    const cList = byProjectCurr.get(p) || [];
    const pairCount = Math.min(bList.length, cList.length);
    for (let i = 0; i < pairCount; i++) {
      const baseline = bList[i];
      const current = cList[i];
      modifyPairs.push({ baseline, current });
    }
    for (let i = pairCount; i < bList.length; i++) removes.push(bList[i]);
    for (let i = pairCount; i < cList.length; i++) adds.push(cList[i]);
  }

  return { adds, removes, modifyPairs };
}

/**
 * @param {string[]} currentPeople
 * @param {string[]} baselinePeople
 */
export function buildPersonSortOrder(currentPeople, baselinePeople) {
  /** @type {string[]} */
  const order = [];
  const seen = new Set();
  for (const p of currentPeople) {
    if (p === OTHER_KEY) continue;
    order.push(p);
    seen.add(p);
  }
  for (const p of baselinePeople) {
    if (p === OTHER_KEY) continue;
    if (!seen.has(p)) {
      order.push(p);
      seen.add(p);
    }
  }
  order.push(OTHER_KEY);
  return order;
}

/**
 * @param {ScheduleChange} change
 */
function changeRawName(change) {
  return change.baselineEvent?.rawName || change.currentEvent?.rawName || '';
}

/**
 * @param {ScheduleChange[]} changes
 * @param {string[]} currentPeople
 * @param {string[]} baselinePeople
 */
function sortChanges(changes, currentPeople, baselinePeople) {
  const personOrder = buildPersonSortOrder(currentPeople, baselinePeople);
  const personRank = new Map(personOrder.map((p, i) => [p, i]));

  changes.sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    const pa = personRank.get(a.personKey) ?? 9999;
    const pb = personRank.get(b.personKey) ?? 9999;
    if (pa !== pb) return pa - pb;
    if (a.personKey === OTHER_KEY && b.personKey === OTHER_KEY) {
      const cmp = changeRawName(a).localeCompare(changeRawName(b));
      if (cmp !== 0) return cmp;
    }
    return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  });
}

/**
 * @param {{ people: string[], byPerson: Record<string, Record<string, ShiftEvent[]>> }} baseline
 * @param {{ people: string[], byPerson: Record<string, Record<string, ShiftEvent[]>> }} current
 * @returns {CompareResult}
 */
export function compareSchedules(baseline, current) {
  const allPeople = new Set([
    ...Object.keys(baseline.byPerson || {}),
    ...Object.keys(current.byPerson || {}),
  ]);

  /** @type {ScheduleChange[]} */
  const changes = [];
  /** @type {Record<string, Record<string, DayDiff>>} */
  const dayDiffByPerson = {};

  for (const personKey of allPeople) {
    const baseSched = baseline.byPerson[personKey] || {};
    const currSched = current.byPerson[personKey] || {};
    const dates = new Set([...Object.keys(baseSched), ...Object.keys(currSched)]);

    for (const dateStr of dates) {
      const { adds, removes, modifyPairs } = diffPersonDay(
        baseSched[dateStr] || [],
        currSched[dateStr] || []
      );
      if (!adds.length && !removes.length && !modifyPairs.length) continue;

      if (!dayDiffByPerson[personKey]) dayDiffByPerson[personKey] = {};
      /** @type {Map<string, ShiftEvent>} */
      const currentDiffByKey = new Map();
      for (const ev of adds) currentDiffByKey.set(eventCompareKey(ev), ev);
      for (const { current: cur } of modifyPairs) {
        currentDiffByKey.set(eventCompareKey(cur), cur);
      }

      dayDiffByPerson[personKey][dateStr] = {
        adds: adds.length,
        removes: removes.length,
        modifies: modifyPairs.length,
        ghosts: removes,
        modifyPairs,
        currentDiffByKey,
      };

      for (const ev of removes) {
        changes.push({ type: 'remove', personKey, dateStr, baselineEvent: ev });
      }
      for (const { baseline: b, current: c } of modifyPairs) {
        changes.push({
          type: 'modify',
          personKey,
          dateStr,
          baselineEvent: b,
          currentEvent: c,
        });
      }
      for (const ev of adds) {
        changes.push({ type: 'add', personKey, dateStr, currentEvent: ev });
      }
    }
  }

  sortChanges(changes, current.people, baseline.people);

  /** @type {Record<string, ScheduleChange[]>} */
  const changesByPerson = {};
  for (const ch of changes) {
    if (!changesByPerson[ch.personKey]) changesByPerson[ch.personKey] = [];
    changesByPerson[ch.personKey].push(ch);
  }

  let added = 0;
  let removed = 0;
  let modified = 0;
  const peopleWithChanges = new Set();
  const datesWithChanges = new Set();

  for (const ch of changes) {
    peopleWithChanges.add(ch.personKey);
    datesWithChanges.add(ch.dateStr);
    if (ch.type === 'add') added++;
    else if (ch.type === 'remove') removed++;
    else modified++;
  }

  const summary = {
    total: added + removed + modified,
    people: peopleWithChanges.size,
    dates: datesWithChanges.size,
    added,
    removed,
    modified,
  };

  return {
    summary,
    sortedChanges: changes,
    changesByPerson,
    dayDiffByPerson,
  };
}

/**
 * @param {DayDiff} dayDiff
 * @param {number} [currentCount] 新版當日該員班次數；0 表示整日刪光（§10.7）
 */
export function dayDiffBadge(dayDiff, currentCount = 0) {
  const { adds, removes, modifies } = dayDiff;
  if (adds > 0 && removes === 0 && modifies === 0) {
    return { badge: '+', summary: `${adds} 增`, cellClass: 'day-cell--diff-add' };
  }
  if (removes > 0 && adds === 0 && modifies === 0) {
    const summary =
      currentCount > 0
        ? `${removes}刪`
        : `此日已無排班（上一版 ${removes} 班）`;
    return {
      badge: '−',
      summary,
      cellClass: 'day-cell--diff-remove',
    };
  }
  if (modifies > 0 && adds === 0 && removes === 0) {
    return { badge: '~', summary: '有修改', cellClass: 'day-cell--diff-change' };
  }
  return { badge: '±', summary: '有變更', cellClass: 'day-cell--diff-mixed' };
}

/** @param {string} dateStr */
export function formatChangeDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}/${d}（${week[dt.getDay()]}）`;
}

/**
 * @param {CompareSummary} summary
 * @param {boolean} includePeopleCount
 */
export function formatSummaryText(summary, includePeopleCount) {
  const lines = [`共 ${summary.total} 處變更`];
  if (includePeopleCount) {
    lines.push(`${summary.people} 位人員 · ${summary.dates} 個日期`);
  } else {
    lines.push(`${summary.dates} 個日期`);
  }
  lines.push(
    `新增 ${summary.added} · 刪除 ${summary.removed} · 修改 ${summary.modified}`
  );
  return lines;
}

/** @param {Record<string, ScheduleChange[]>} changesByPerson */
export function summarizePersonChanges(changesByPerson, personKey) {
  const list = changesByPerson[personKey] || [];
  const dates = new Set(list.map((c) => c.dateStr));
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const ch of list) {
    if (ch.type === 'add') added++;
    else if (ch.type === 'remove') removed++;
    else modified++;
  }
  return {
    total: list.length,
    dates: dates.size,
    added,
    removed,
    modified,
  };
}

/** @param {ShiftEvent} ev */
export function formatBaselineHint(ev) {
  const parts = [norm(ev.project)];
  const loc = norm(ev.location);
  if (loc) parts.push(loc);
  const period = norm(ev.period);
  if (period) parts.push(period);
  return parts.join(' · ');
}
