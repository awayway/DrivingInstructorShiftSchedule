/** 保護「月/日」中的斜線，避免切分 token 時拆開 */
const DATE_SLASH_PLACEHOLDER = '\uE000';

const SCHEDULE_DATE_NOTE_RE =
  /^\d{1,2}\/\d{1,2}(只有)?(上午|下午|半天)?$/u;

/** 整段為活動／備註，非人名（「經理」不在此列，可歸「其他」顯示） */
const NON_PERSON_EXACT = new Set([
  '大台北',
  'BMW',
  '3',
  '上',
  '期中考',
  '期末考',
  '特考班術科測驗',
  '特考班其末考周',
  '特考班其中考周',
  '特考班期末考周',
  '23只有下午',
]);

const EVENT_PREFIX_RE = /^(特考班|警專|期中考|期末考|考試)/u;

const NOTE_SUFFIX_RE = /(半天|上午|下午|上半天|下半天|只有下午|保養)$/u;
const NOTE_PREFIX_HALF_DAY_RE = /^半天/u;

/**
 * @param {string} name
 * @returns {string}
 */
export function canonicalPersonKey(name) {
  return String(name).trim().replace(/\.+$/, '');
}

/**
 * @param {string[]} rawPeople 表頭原始人名（可含尾端「.」）
 * @returns {string[]} 去重後正規人員鍵
 */
export function dedupePeopleToCanonical(rawPeople) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const p of rawPeople) {
    const c = canonicalPersonKey(p);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isScheduleDateNote(s) {
  return SCHEDULE_DATE_NOTE_RE.test(String(s).trim());
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isNonPersonNote(s) {
  const t = String(s).trim();
  if (!t) return true;
  if (NON_PERSON_EXACT.has(t)) return true;
  if (EVENT_PREFIX_RE.test(t)) return true;
  if (/測驗|考周/u.test(t)) return true;
  return false;
}

/**
 * @param {unknown} raw
 * @param {Set<string> | undefined} knownNames 整格與表頭完全一致時不切分
 * @returns {string[]}
 */
export function splitAssignmentTokens(raw, knownNames) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (knownNames && knownNames.has(s)) return [s];
  if (isScheduleDateNote(s)) return [s];

  const protectedStr = s.replace(
    /(\d{1,2})\/(\d{1,2})/g,
    `$1${DATE_SLASH_PLACEHOLDER}$2`
  );
  const parts = protectedStr
    .split(/[,./、／]+/)
    .map((x) => x.replaceAll(DATE_SLASH_PLACEHOLDER, '/').trim())
    .filter(Boolean);

  if (!parts.length) return [];
  return parts;
}

/**
 * @param {string} token
 * @returns {string}
 */
function normalizeTokenForResolve(token) {
  let s = String(token).trim().replace(/[\s　]+/g, '');
  if (!s) return '';
  s = s.replace(/^考試一/u, '');
  s = s.replace(/^警專[一二三四五六七八九十\d]*考/u, '');
  s = s.replace(/^考/u, '');
  s = s.replace(NOTE_SUFFIX_RE, '');
  s = s.replace(NOTE_PREFIX_HALF_DAY_RE, '');
  s = s.replace(/\d+/gu, '');
  s = s.replace(/[上下]/gu, '');
  return s.trim();
}

/**
 * @typedef {{ canonical: Map<string, string>, aliases: Map<string, Set<string>> }} PersonIndex
 */

/**
 * @param {string[]} canonicalPeople
 * @returns {PersonIndex}
 */
export function buildPersonIndex(canonicalPeople) {
  /** @type {Map<string, string>} */
  const canonical = new Map();
  /** @type {Map<string, Set<string>>} */
  const aliases = new Map();

  /**
   * @param {string} alias
   * @param {string} personCanon
   */
  function addAlias(alias, personCanon) {
    const a = alias.trim();
    const c = canonicalPersonKey(personCanon);
    if (!a || !c) return;
    if (!aliases.has(a)) aliases.set(a, new Set());
    aliases.get(a).add(c);
    canonical.set(c, c);
  }

  for (const p of canonicalPeople) {
    const base = canonicalPersonKey(p);
    addAlias(p, base);
    addAlias(base, base);

    if (base.includes('/')) {
      for (const part of base.split('/')) addAlias(part.trim(), base);
    }

    const chars = [...base];
    if (chars.length >= 2) {
      addAlias(chars[chars.length - 1], base);
      addAlias(chars[0], base);
      if (chars.length >= 3) addAlias(chars.slice(-2).join(''), base);
    }

    if (base === '鴨子') addAlias('鴨', base);
    if (base === '呂小遠') {
      addAlias('遠', base);
      addAlias('小遠', base);
    }
    if (base === '林欣瑩') {
      addAlias('瑩', base);
      addAlias('欣', base);
      addAlias('欣瑩', base);
    }
    if (base === '林威') addAlias('威', base);
    if (base === '字鈞') addAlias('字', base);
    if (base === '維鈞') addAlias('維', base);
    if (base === '俊穎') addAlias('俊', base);
    if (base === '廖/歹徒') {
      addAlias('歹徒', base);
      addAlias('廖', base);
      addAlias('歹', base);
    }
  }

  return { canonical, aliases };
}

/**
 * @param {string} t
 * @param {PersonIndex} index
 * @returns {string | null}
 */
function resolveSingleNormalized(t, index) {
  if (!t) return null;
  const { aliases, canonical } = index;

  if (aliases.has(t)) {
    const cands = [...aliases.get(t)];
    if (cands.length === 1) return cands[0];
    return null;
  }

  /** @type {{ display: string, score: number }[]} */
  const hits = [];
  for (const [c] of canonical) {
    if (c.startsWith(t)) {
      hits.push({ display: c, score: 50 + t.length * 10 - (c.length - t.length) });
    } else if (t.startsWith(c) && c.length >= 2) {
      hits.push({ display: c, score: 25 });
    }
  }
  if (hits.length === 1) return hits[0].display;
  if (hits.length > 1) {
    hits.sort((a, b) => b.score - a.score);
    if (hits[0].score > hits[1].score + 5) return hits[0].display;
  }
  return null;
}

/**
 * @param {string} s
 * @param {PersonIndex} index
 * @returns {{ ok: boolean, people: string[], rest?: string }}
 */
function greedySegment(s, index) {
  const aliasList = [...index.aliases.keys()].sort((a, b) => b.length - a.length);
  /** @type {string[]} */
  const out = [];
  let pos = 0;

  while (pos < s.length) {
    let matched = false;
    for (const al of aliasList) {
      if (!s.startsWith(al, pos)) continue;
      const cands = [...index.aliases.get(al)];
      if (cands.length !== 1) continue;
      out.push(cands[0]);
      pos += al.length;
      matched = true;
      break;
    }
    if (!matched) {
      const one = resolveSingleNormalized(s[pos], index);
      if (one) {
        out.push(one);
        pos += 1;
        continue;
      }
      return { ok: false, people: out, rest: s.slice(pos) };
    }
  }
  return { ok: true, people: out };
}

/**
 * @param {string} token
 * @returns {boolean}
 */
export function isLeaveToken(token) {
  const t = String(token).trim();
  if (!t.endsWith('X')) return false;
  const namePart = t.slice(0, -1).trim();
  return namePart.length > 0;
}

/**
 * @typedef {{
 *   type: 'leave',
 *   person: string,
 *   rawName: string,
 * } | { type: 'notLeave' } | { type: 'other', rawName: string }} LeaveResolveResult
 */

/**
 * @param {string} token
 * @param {PersonIndex} index
 * @param {Map<string, string>} headerToCanonical
 * @returns {LeaveResolveResult}
 */
export function resolveLeaveToken(token, index, headerToCanonical) {
  if (!isLeaveToken(token)) return { type: 'notLeave' };

  const raw = String(token).trim();
  const namePart = raw.slice(0, -1).trim();

  if (isScheduleDateNote(raw)) return { type: 'other', rawName: raw };

  if (headerToCanonical.has(namePart)) {
    const person = headerToCanonical.get(namePart);
    if (person) return { type: 'leave', person, rawName: raw };
  }

  for (const [headerRaw, canon] of headerToCanonical) {
    if (canonicalPersonKey(headerRaw) === canonicalPersonKey(namePart) && canon) {
      return { type: 'leave', person: canon, rawName: raw };
    }
  }

  const norm = normalizeTokenForResolve(namePart);
  if (!norm) return { type: 'other', rawName: raw };
  if (isNonPersonNote(norm)) return { type: 'other', rawName: raw };

  const whole = resolveSingleNormalized(norm, index);
  if (whole) return { type: 'leave', person: whole, rawName: raw };

  return { type: 'other', rawName: raw };
}

/**
 * @typedef {{
 *   type: 'person',
 *   people: string[],
 *   rawName: string,
 *   partialRest?: string,
 * } | { type: 'other', rawName: string }} ResolveResult
 */

/**
 * @param {string} token 切分後原文
 * @param {PersonIndex} index
 * @param {Map<string, string>} headerToCanonical 表頭原文 → 正規鍵
 * @returns {ResolveResult}
 */
export function resolveAssignmentToken(token, index, headerToCanonical) {
  const raw = String(token).trim();
  if (!raw) return { type: 'other', rawName: raw };

  if (isScheduleDateNote(raw)) return { type: 'other', rawName: raw };

  if (headerToCanonical.has(raw)) {
    const person = headerToCanonical.get(raw);
    if (person) {
      return { type: 'person', people: [person], rawName: raw };
    }
  }

  const norm = normalizeTokenForResolve(raw);
  if (!norm) return { type: 'other', rawName: raw };

  if (isNonPersonNote(norm)) return { type: 'other', rawName: raw };

  const whole = resolveSingleNormalized(norm, index);
  if (whole) {
    return { type: 'person', people: [whole], rawName: raw };
  }

  const seg = greedySegment(norm, index);
  if (seg.ok && seg.people.length) {
    return { type: 'person', people: seg.people, rawName: raw };
  }
  if (seg.people.length) {
    return {
      type: 'person',
      people: seg.people,
      rawName: raw,
      partialRest: seg.rest,
    };
  }

  return { type: 'other', rawName: raw };
}

/**
 * @param {string} rawName
 * @param {string} personCanonical
 * @returns {string | undefined}
 */
export function rawNameForEvent(rawName, personCanonical) {
  const r = String(rawName).trim();
  const p = String(personCanonical).trim();
  if (!r || r === p) return undefined;
  return rawName;
}
