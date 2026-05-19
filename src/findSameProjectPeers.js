import { OTHER_KEY } from './parseShiftWorkbook.js';

/**
 * 同日同專案、排除目前人員；清單內人員依 people 順序，「其他」以 rawName、zh-Hant 排序。
 * @param {{ people: string[], byPerson: Record<string, Record<string, Array<{ project: string, rawName?: string }>>> }} schedule
 * @param {string} dateStr
 * @param {string} project
 * @param {string} currentPersonKey
 * @returns {string[]}
 */
export function findSameProjectPeers(
  schedule,
  dateStr,
  project,
  currentPersonKey
) {
  if (!schedule) return [];
  const projectKey = project.trim();
  if (!projectKey) return [];

  const listPeople = new Set();
  const otherNames = new Set();

  for (const personKey of [...schedule.people, OTHER_KEY]) {
    if (personKey === currentPersonKey) continue;
    const dayEvents = schedule.byPerson[personKey]?.[dateStr];
    if (!dayEvents?.length) continue;

    for (const ev of dayEvents) {
      if (ev.project?.trim() !== projectKey) continue;
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
