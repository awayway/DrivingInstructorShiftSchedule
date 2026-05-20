import { OTHER_KEY } from './parseShiftWorkbook.js';

/** @param {string | null | undefined} loc */
function normalizeLocation(loc) {
  return (loc ?? '').trim();
}

/**
 * 同日同專案且同地點（`location` trim 後字串須與當前卡一致；兩端皆空視為同地點）、排除目前人員；清單內人員依 people 順序，「其他」以 rawName、zh-Hant 排序。
 * @param {{ people: string[], byPerson: Record<string, Record<string, Array<{ project: string, location?: string, rawName?: string }>>> }} schedule
 * @param {string} dateStr
 * @param {string} project
 * @param {string | null | undefined} location 當前卡片事件之地點（與他人事件 trim 後比對）
 * @param {string} currentPersonKey
 * @returns {string[]}
 */
export function findSameProjectPeers(
  schedule,
  dateStr,
  project,
  location,
  currentPersonKey
) {
  if (!schedule) return [];
  const projectKey = project.trim();
  if (!projectKey) return [];
  const locationKey = normalizeLocation(location);

  const listPeople = new Set();
  const otherNames = new Set();

  for (const personKey of [...schedule.people, OTHER_KEY]) {
    if (personKey === currentPersonKey) continue;
    const dayEvents = schedule.byPerson[personKey]?.[dateStr];
    if (!dayEvents?.length) continue;

    for (const ev of dayEvents) {
      if (ev.project?.trim() !== projectKey) continue;
      if (normalizeLocation(ev.location) !== locationKey) continue;
      if (personKey === OTHER_KEY) {
        const raw = ev.rawName?.trim();
        if (raw) otherNames.add(raw);
      } else {
        listPeople.add(personKey);
      }
    }
  }

  const out = [];
  for (const name of schedule.people) {
    if (listPeople.has(name)) out.push(name);
  }
  out.push(
    ...[...otherNames].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  );
  return out;
}
