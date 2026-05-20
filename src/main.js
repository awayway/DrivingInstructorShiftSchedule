import {
  compareSchedules,
  dayDiffBadge,
  eventCompareKey,
  formatBaselineHint,
  formatChangeDateLabel,
  formatSummaryText,
  summarizePersonChanges,
} from './compareSchedules.js';
import {
  buildChangeCard,
  renderCompareDialog as renderCompareDialogUi,
  renderPersonDiffPanel as renderPersonDiffPanelUi,
} from './compareUi.js';
import {
  canExportPdf,
  detectDefaultPrintLayout,
  getExportBlockReason,
  getExportPreview,
  runPrintExport,
} from './exportPdf.js';
import { findSameProjectPeers } from './findSameProjectPeers.js';
import { parseShiftWorkbook, OTHER_KEY } from './parseShiftWorkbook.js';

const fileInput = document.getElementById('file-input');
const btnImport = document.getElementById('btn-import');
const personSummary = document.getElementById('person-summary');
const personSummaryLabel = personSummary?.querySelector('.person-summary__text') ?? null;
const personRadioList = document.getElementById('person-radio-list');
const personDialogEmpty = document.getElementById('person-dialog-empty');
const monthFilterFutureOnly = document.getElementById('month-filter-future-only');
const showEmptyMonths = document.getElementById('show-empty-months');
const viewShowLocation = document.getElementById('view-show-location');
const viewShowPeriod = document.getElementById('view-show-period');
const viewShowAlias = document.getElementById('view-show-alias');
const viewShowSameProjectPeers = document.getElementById(
  'view-show-same-project-peers'
);
const viewShowBaselineDiff = document.getElementById('view-show-baseline-diff');
const viewBaselineDiffHint = document.getElementById('view-baseline-diff-hint');
const baselineFileInput = document.getElementById('baseline-file-input');
const compareDialogBody = document.getElementById('compare-dialog-body');
const personDiffPanel = document.getElementById('person-diff-panel');
const calendarRoot = document.getElementById('calendar-root');
const errorBanner = document.getElementById('error-banner');
const legendEl = document.getElementById('legend');
const mainNav = document.getElementById('main-nav');
const dialogOverlay = document.getElementById('dialog-overlay');
const dialogPeople = document.getElementById('dialog-people');
const dialogView = document.getElementById('dialog-view');
const dialogCompare = document.getElementById('dialog-compare');
const dialogMore = document.getElementById('dialog-more');
const exportBlockHint = document.getElementById('export-block-hint');
const exportReadyPanel = document.getElementById('export-ready-panel');
const exportPreviewEl = document.getElementById('export-preview');
const btnExportPdf = document.getElementById('btn-export-pdf');
const appHeader = document.querySelector('.app-header');

/** @type {'people' | 'view' | 'compare' | 'more' | null} */
let openDialogName = null;
/** @type {HTMLButtonElement | null} */
let dialogTriggerBtn = null;
/** @type {string} */
let selectedPerson = '';

const DIALOGS = {
  people: dialogPeople,
  view: dialogView,
  compare: dialogCompare,
  more: dialogMore,
};

const CHANGE_TYPE_LABEL = {
  add: '新增',
  remove: '刪除',
  modify: '修改',
};

const NAV_BTNS = mainNav.querySelectorAll('.main-nav__btn[data-dialog]');

/** 依專案名稱排序後依序指派，確保同一工作簿內各色不重複 */
const PROJECT_COLOR_PALETTE = [
  'proj-jingzhuan',
  'proj-jingdaxue',
  'proj-jingzhengpu',
  'proj-mute-a',
  'proj-mute-b',
  'proj-mute-c',
  'proj-mute-d',
  'proj-default',
];

/** 指定專案固定配色（避免自動分配太接近） */
const PROJECT_CLASS_OVERRIDES = new Map([['署汽車', 'proj-shu-car']]);

/** @type {Map<string, string>} */
const projectClassMap = new Map();

/** @type {{ people: string[], byPerson: Record<string, Record<string, Array<{ project: string, location: string, period: string | null, rawName?: string }>>> } | null} */
let parsed = null;

/** @type {typeof parsed} */
let baselineParsed = null;
/** @type {string} */
let baselineFileName = '';
/** @type {import('./compareSchedules.js').CompareResult | null} */
let compareResult = null;
/** @type {string} */
let compareDialogError = '';
/** @type {boolean} */
let baselineParsing = false;

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
}

/** @returns {string} */
function getPersonDisplayName(personKey) {
  if (personKey === OTHER_KEY) return OTHER_KEY;
  return personKey;
}

function updatePersonSummary() {
  if (!personSummary || !personSummaryLabel) return;
  if (!parsed || !selectedPerson) {
    personSummary.hidden = true;
    personSummaryLabel.textContent = '';
    return;
  }
  personSummaryLabel.textContent = `人員：${getPersonDisplayName(selectedPerson)}`;
  personSummary.hidden = false;
}

function setNavExpanded(dialogName) {
  for (const btn of NAV_BTNS) {
    const key = btn.getAttribute('data-dialog');
    btn.setAttribute('aria-expanded', key === dialogName ? 'true' : 'false');
  }
}

function getExportViewState() {
  return {
    monthFilterFutureOnly: Boolean(monthFilterFutureOnly?.checked),
    showEmptyMonths: Boolean(showEmptyMonths?.checked),
    showLocation: Boolean(viewShowLocation?.checked),
    showPeriod: Boolean(viewShowPeriod?.checked),
    showAlias: Boolean(viewShowAlias?.checked),
    showSameProjectPeers: Boolean(viewShowSameProjectPeers?.checked),
  };
}

function getExportContext() {
  return {
    parsed,
    selectedPerson,
    collectMonths,
    applyFutureMonthFilter,
    expandMonthsWithGaps,
    getPersonDisplayName,
    isDiffModeActive,
    viewState: getExportViewState(),
  };
}

function updateMoreDialog() {
  if (!exportBlockHint || !exportReadyPanel || !btnExportPdf) return;
  const ctx = getExportContext();
  const reason = getExportBlockReason(ctx);
  if (reason) {
    exportReadyPanel.hidden = true;
    exportBlockHint.hidden = false;
    if (reason === 'no-import') {
      exportBlockHint.textContent = '請先以頂部「匯入總排班表」匯入。';
    } else if (reason === 'filtered-empty') {
      exportBlockHint.textContent =
        '目前勾選「只顯示本月及未來月份」時沒有可匯出的月份；取消勾選即可匯出較早的排程。';
    } else {
      exportBlockHint.textContent = '此選項尚無排班資料，無法匯出。';
    }
    btnExportPdf.disabled = true;
    return;
  }
  exportBlockHint.hidden = true;
  exportReadyPanel.hidden = false;
  btnExportPdf.disabled = false;
  const preview = getExportPreview(ctx);
  if (exportPreviewEl && preview) {
    exportPreviewEl.innerHTML = '';
    for (const line of [preview.personLine, preview.monthLine, preview.viewLine]) {
      const p = document.createElement('p');
      p.textContent = line;
      exportPreviewEl.appendChild(p);
    }
  }
}

function applyDefaultPrintLayoutRadios() {
  const layout = detectDefaultPrintLayout();
  const radio = document.querySelector(
    `input[name="print-layout"][value="${layout}"]`
  );
  if (radio instanceof HTMLInputElement) radio.checked = true;
}

/** @returns {'mobile' | 'desktop'} */
function getSelectedPrintLayout() {
  const checked = document.querySelector('input[name="print-layout"]:checked');
  if (checked instanceof HTMLInputElement && checked.value === 'desktop') {
    return 'desktop';
  }
  return 'mobile';
}

function isDiffModeActive() {
  return Boolean(
    parsed &&
      baselineParsed &&
      compareResult &&
      viewShowBaselineDiff &&
      viewShowBaselineDiff.checked
  );
}

function recomputeCompare() {
  if (parsed && baselineParsed) {
    compareResult = compareSchedules(baselineParsed, parsed);
  } else {
    compareResult = null;
  }
}

function updateBaselineDiffHint() {
  if (!viewBaselineDiffHint) return;
  const showHint =
    viewShowBaselineDiff?.checked && !baselineParsed && Boolean(parsed);
  viewBaselineDiffHint.hidden = !showHint;
}

/**
 * @param {'people' | 'view' | 'compare' | 'more'} name
 * @param {HTMLButtonElement} [triggerBtn]
 */
function openDialog(name, triggerBtn) {
  if (openDialogName === name) {
    closeAllDialogs();
    return;
  }
  closeAllDialogs();
  const panel = DIALOGS[name];
  if (!panel) return;
  openDialogName = name;
  dialogTriggerBtn = triggerBtn || null;
  dialogOverlay.hidden = false;
  dialogOverlay.setAttribute('aria-hidden', 'false');
  panel.hidden = false;
  document.body.classList.add('dialog-open');
  setNavExpanded(name);
  if (name === 'more') {
    applyDefaultPrintLayoutRadios();
    updateMoreDialog();
  }
  const focusTarget = panel.querySelector(
    'input:not([disabled]), button.dialog__close, button.btn-export-pdf:not([disabled])'
  );
  if (focusTarget instanceof HTMLElement) focusTarget.focus();
}

function closeAllDialogs() {
  const wasCompare = openDialogName === 'compare';
  openDialogName = null;
  dialogOverlay.hidden = true;
  dialogOverlay.setAttribute('aria-hidden', 'true');
  dialogPeople.hidden = true;
  dialogView.hidden = true;
  dialogCompare.hidden = true;
  dialogMore.hidden = true;
  document.body.classList.remove('dialog-open');
  setNavExpanded(null);
  if (dialogTriggerBtn) {
    dialogTriggerBtn.focus();
    dialogTriggerBtn = null;
  }
  if (wasCompare) {
    refreshDiffUi();
    fillLegend();
    renderCalendar();
  }
}

function renderEmptyHint() {
  if (parsed) return;
  calendarRoot.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'empty-hint';
  p.innerHTML = '請點上方 <strong>「匯入總排班表」</strong>';
  calendarRoot.appendChild(p);
}

function rebuildProjectClassMap() {
  projectClassMap.clear();
  if (!parsed) return;
  const projects = new Set();
  const sources = [parsed.byPerson];
  if (baselineParsed) sources.push(baselineParsed.byPerson);
  for (const byPerson of sources) {
    for (const sched of Object.values(byPerson)) {
      for (const day of Object.values(sched)) {
        for (const ev of day) {
          const name = ev.project?.trim();
          if (name) projects.add(name);
        }
      }
    }
  }
  [...projects]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .forEach((name, index) => {
      const cls =
        PROJECT_COLOR_PALETTE[index] ??
        PROJECT_COLOR_PALETTE[PROJECT_COLOR_PALETTE.length - 1];
      projectClassMap.set(name, cls);
    });
}

function projectClass(project) {
  const key = project.trim();
  const override = PROJECT_CLASS_OVERRIDES.get(key);
  if (override) return override;
  return projectClassMap.get(key) ?? 'proj-default';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {HTMLDivElement} card
 * @param {{ project: string, location: string, period: string | null, rawName?: string }} ev
 * @param {string} personKey
 * @param {string} [dateStr]
 * @param {{ full?: boolean, includePeers?: boolean, peerSchedule?: typeof parsed }} [opts]
 */
function fillEventCard(card, ev, personKey, dateStr, opts = {}) {
  const full = opts.full === true;
  const includePeers = opts.includePeers !== false && !full;
  const showAlias = full || (viewShowAlias ? viewShowAlias.checked : true);
  if (
    ev.rawName &&
    (personKey === OTHER_KEY ||
      (showAlias && ev.rawName.trim() !== personKey.trim()))
  ) {
    const raw = document.createElement('div');
    raw.className = 'raw-name-line';
    if (ev.rawName.trim().endsWith('X')) raw.classList.add('raw-name-line--x');
    raw.textContent = ev.rawName;
    card.appendChild(raw);
  }
  const projectEl = document.createElement('div');
  projectEl.className = 'project-name';
  projectEl.textContent = ev.project;
  card.appendChild(projectEl);
  const showLocation = full || (viewShowLocation ? viewShowLocation.checked : true);
  const showPeriod = full || (viewShowPeriod ? viewShowPeriod.checked : true);
  if (showLocation && ev.location) {
    const locEl = document.createElement('div');
    locEl.className = 'location-name';
    locEl.textContent = ev.location;
    card.appendChild(locEl);
  }
  if (showPeriod && ev.period) {
    const periodEl = document.createElement('span');
    periodEl.className = 'period-line';
    periodEl.textContent = ev.period;
    card.appendChild(periodEl);
  }

  const showPeers =
    includePeers &&
    dateStr &&
    (viewShowSameProjectPeers ? viewShowSameProjectPeers.checked : true);
  if (showPeers) {
    const schedule = opts.peerSchedule ?? parsed;
    const peers = findSameProjectPeers(
      schedule,
      dateStr,
      ev.project,
      ev.location,
      personKey
    );
    if (peers.length) {
      const peersEl = document.createElement('div');
      peersEl.className = 'same-project-peers-line';
      peersEl.textContent = peers.join('、');
      card.appendChild(peersEl);
    }
  }
}

/**
 * @param {{ project: string, location: string, period: string | null, rawName?: string }} ev
 * @param {string} personKey
 * @param {string} [dateStr]
 * @param {{ ghost?: boolean, diffClass?: string, baselineHint?: string }} [opts]
 */
function createEventCardElement(ev, personKey, dateStr, opts = {}) {
  /** @type {import('./findSameProjectPeers.js').Parameters<typeof findSameProjectPeers>[0] | undefined} */
  const ghostPeerSchedule = opts.ghost ? baselineParsed ?? undefined : undefined;
  const card = document.createElement('div');
  const cls = projectClass(ev.project);
  card.className = `event-card ${cls}`;
  if (opts.diffClass) card.classList.add(opts.diffClass);
  if (opts.ghost) {
    card.classList.add('event-card--diff-remove');
    const tag = document.createElement('div');
    tag.className = 'diff-ghost-tag';
    tag.textContent = '刪除（上一版）';
    card.appendChild(tag);
    fillEventCard(card, ev, personKey, dateStr, {
      peerSchedule: ghostPeerSchedule,
    });
  } else {
    fillEventCard(card, ev, personKey, dateStr);
    if (opts.baselineHint) {
      const hint = document.createElement('div');
      hint.className = 'diff-baseline-hint';
      hint.textContent = `原：${opts.baselineHint}`;
      card.appendChild(hint);
    }
  }
  return card;
}

/**
 * @param {HTMLElement} cell
 * @param {import('./compareSchedules.js').DayDiff} dayDiff
 * @param {number} currentCount
 */
function appendDayDiffChrome(cell, dayDiff, currentCount) {
  const { badge, summary, cellClass } = dayDiffBadge(dayDiff, currentCount);
  cell.classList.add(cellClass);
  const dateLabel = cell.querySelector('.date-num');
  if (dateLabel) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'day-diff-badge';
    badgeEl.textContent = badge;
    dateLabel.appendChild(badgeEl);
  }
  const summaryEl = document.createElement('div');
  summaryEl.className = 'day-diff-summary';
  summaryEl.textContent = summary;
  const anchor = cell.querySelector('.date-num');
  if (anchor?.nextSibling) cell.insertBefore(summaryEl, anchor.nextSibling);
  else cell.appendChild(summaryEl);
}

const dayHeaders = ['一', '二', '三', '四', '五', '六', '日'];

function todayYMD() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/**
 * @param {number} year
 * @param {number} month 1-based
 * @param {string} label
 * @param {string} personKey
 */
function buildMonth(year, month, label, personKey) {
  const section = document.createElement('div');
  section.className = 'month-section';

  const header = document.createElement('div');
  header.className = 'month-header';
  header.textContent = label;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  dayHeaders.forEach((d, i) => {
    const dh = document.createElement('div');
    dh.className = 'day-header' + (i >= 5 ? ' weekend' : '');
    dh.textContent = d;
    grid.appendChild(dh);
  });

  const firstDay = new Date(year, month - 1, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const todayStr = todayYMD();

  const schedule =
    parsed && parsed.byPerson[personKey] ? parsed.byPerson[personKey] : {};

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const colIdx = i % 7;
    if (colIdx === 6) cell.classList.add('sunday');
    if (colIdx === 5) cell.classList.add('saturday');

    let dateNum;
    let dateYear;
    let dateMonth;

    if (i < startOffset) {
      dateNum = prevDays - startOffset + i + 1;
      dateMonth = month - 1 < 1 ? 12 : month - 1;
      dateYear = month - 1 < 1 ? year - 1 : year;
      cell.classList.add('other-month');
    } else if (i >= startOffset + daysInMonth) {
      dateNum = i - startOffset - daysInMonth + 1;
      dateMonth = month + 1 > 12 ? 1 : month + 1;
      dateYear = month + 1 > 12 ? year + 1 : year;
      cell.classList.add('other-month');
    } else {
      dateNum = i - startOffset + 1;
      dateMonth = month;
      dateYear = year;
    }

    const dateStr = `${dateYear}-${pad(dateMonth)}-${pad(dateNum)}`;

    if (dateStr === todayStr) cell.classList.add('today');

    const dateLabel = document.createElement('div');
    dateLabel.className = 'date-num';
    dateLabel.textContent = String(dateNum);
    cell.appendChild(dateLabel);

    if (!cell.classList.contains('other-month')) {
      const events = schedule[dateStr] || [];
      const showDiff = isDiffModeActive();
      const dayDiff = showDiff
        ? compareResult?.dayDiffByPerson[personKey]?.[dateStr]
        : null;

      if (dayDiff) appendDayDiffChrome(cell, dayDiff, events.length);

      /** @type {Map<string, { baseline: import('./compareSchedules.js').ShiftEvent }>} */
      const modifyByCurrentKey = new Map();
      if (dayDiff) {
        for (const pair of dayDiff.modifyPairs) {
          modifyByCurrentKey.set(eventCompareKey(pair.current), pair);
        }
      }

      for (const ev of events) {
        let diffClass = '';
        let baselineHint = '';
        if (dayDiff?.currentDiffByKey.has(eventCompareKey(ev))) {
          const pair = modifyByCurrentKey.get(eventCompareKey(ev));
          if (pair) {
            diffClass = 'event-card--diff-chg';
            baselineHint = formatBaselineHint(pair.baseline);
          } else {
            diffClass = 'event-card--diff-add';
          }
        }
        cell.appendChild(
          createEventCardElement(ev, personKey, dateStr, {
            diffClass,
            baselineHint,
          })
        );
      }

      if (dayDiff?.ghosts?.length) {
        for (const ev of dayDiff.ghosts) {
          cell.appendChild(
            createEventCardElement(ev, personKey, dateStr, { ghost: true })
          );
        }
      }
    }

    grid.appendChild(cell);
  }

  section.appendChild(grid);
  return section;
}

function collectMonths(personKey) {
  if (!parsed) return [];
  const months = new Map();
  /** @param {string} d */
  const addDate = (d) => {
    const [y, m] = d.split('-').map(Number);
    const key = `${y}-${pad(m)}`;
    if (!months.has(key)) months.set(key, { year: y, month: m });
  };

  for (const d of Object.keys(parsed.byPerson[personKey] || {})) addDate(d);

  if (isDiffModeActive() && baselineParsed) {
    for (const d of Object.keys(baselineParsed.byPerson[personKey] || {})) {
      addDate(d);
    }
    const dayDiff = compareResult?.dayDiffByPerson[personKey];
    if (dayDiff) {
      for (const d of Object.keys(dayDiff)) addDate(d);
    }
  }

  if (!months.size) return [];
  return [...months.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
}

/** 瀏覽器本日所屬曆月（1-based month） */
function currentCalendarYearMonth() {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth() + 1 };
}

/**
 * @param {{ year: number, month: number }[]} months
 */
function applyFutureMonthFilter(months) {
  if (!monthFilterFutureOnly || !monthFilterFutureOnly.checked) return months;
  const { year: cy, month: cm } = currentCalendarYearMonth();
  return months.filter(
    ({ year, month }) => year > cy || (year === cy && month >= cm)
  );
}

function monthLabel(y, m) {
  return `${y}年 ${m}月`;
}

/**
 * @param {{ year: number, month: number }} a
 * @param {{ year: number, month: number }} b
 * @returns {number}
 */
function compareYearMonth(a, b) {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

/**
 * @param {number} year
 * @param {number} month 1-based
 * @returns {{ year: number, month: number }}
 */
function nextCalendarMonth(year, month) {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/**
 * @param {{ year: number, month: number }[]} months sorted data months
 * @returns {Array<{ type: 'data' | 'empty', year: number, month: number }>}
 */
function expandMonthsWithGaps(months) {
  if (!months.length) return [];
  const out = [{ type: 'data', year: months[0].year, month: months[0].month }];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const curr = months[i];
    let cursor = nextCalendarMonth(prev.year, prev.month);
    while (compareYearMonth(cursor, curr) < 0) {
      out.push({ type: 'empty', year: cursor.year, month: cursor.month });
      cursor = nextCalendarMonth(cursor.year, cursor.month);
    }
    out.push({ type: 'data', year: curr.year, month: curr.month });
  }
  return out;
}

/**
 * @param {number} year
 * @param {number} month 1-based
 */
function buildEmptyMonthPlaceholder(year, month) {
  const section = document.createElement('div');
  section.className = 'month-section month-section--empty';
  section.setAttribute('aria-label', `${monthLabel(year, month)}，無排班資料`);

  const header = document.createElement('div');
  header.className = 'month-header month-header--empty';
  header.textContent = monthLabel(year, month);
  section.appendChild(header);

  const body = document.createElement('p');
  body.className = 'month-empty-body';
  body.textContent = '無排班資料';
  section.appendChild(body);

  return section;
}

function renderCalendar() {
  calendarRoot.innerHTML = '';
  if (!parsed) {
    renderEmptyHint();
    updatePersonSummary();
    renderPersonDiffPanel();
    updateMoreDialog();
    return;
  }
  updatePersonSummary();
  renderPersonDiffPanel();
  updateMoreDialog();
  const key = selectedPerson;
  const allMonths = collectMonths(key);
  if (!allMonths.length) {
    const p = document.createElement('p');
    p.className = 'empty-cal';
    p.textContent = '此選項尚無排班資料。';
    p.style.textAlign = 'center';
    p.style.color = '#666';
    calendarRoot.appendChild(p);
    return;
  }
  const months = applyFutureMonthFilter(allMonths);
  if (!months.length) {
    const p = document.createElement('p');
    p.className = 'empty-cal';
    p.textContent =
      '目前勾選「只顯示本月及未來月份」時沒有可顯示的月份；取消勾選即可檢視較早的排程。';
    p.style.textAlign = 'center';
    p.style.color = '#666';
    calendarRoot.appendChild(p);
    return;
  }
  const showGaps = showEmptyMonths && showEmptyMonths.checked;
  const displayMonths = showGaps
    ? expandMonthsWithGaps(months)
    : months.map(({ year, month }) => ({ type: 'data', year, month }));

  for (const item of displayMonths) {
    if (item.type === 'empty') {
      calendarRoot.appendChild(
        buildEmptyMonthPlaceholder(item.year, item.month)
      );
    } else {
      calendarRoot.appendChild(
        buildMonth(item.year, item.month, monthLabel(item.year, item.month), key)
      );
    }
  }
}

function getCompareUiCtx() {
  return {
    personDiffPanel,
    compareDialogBody,
    baselineFileInput,
    parsed,
    baselineParsed,
    baselineFileName,
    baselineParsing,
    compareResult,
    compareDialogError,
    selectedPerson,
    isDiffModeActive,
    getPersonDisplayName,
    formatChangeDateLabel,
    formatSummaryText,
    summarizePersonChanges,
    fillEventCard,
    projectClass,
    changeTypeLabel: CHANGE_TYPE_LABEL,
    buildChangeCard: (ch) => buildChangeCard(getCompareUiCtx(), ch),
  };
}

function renderPersonDiffPanel() {
  renderPersonDiffPanelUi(getCompareUiCtx());
}

function renderCompareDialog() {
  renderCompareDialogUi(getCompareUiCtx());
}

function refreshDiffUi() {
  updateBaselineDiffHint();
  renderPersonDiffPanel();
  if (openDialogName === 'compare') renderCompareDialog();
}

function fillLegend() {
  if (!parsed) {
    legendEl.hidden = true;
    legendEl.innerHTML = '';
    return;
  }
  const projects = new Set();
  const key = selectedPerson;
  const sched = parsed.byPerson[key] || {};
  for (const day of Object.values(sched)) {
    for (const ev of day) projects.add(ev.project);
  }
  legendEl.innerHTML = '';
  for (const p of [...projects].sort()) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('div');
    dot.className = `legend-dot ${projectClass(p)}`;
    const span = document.createElement('span');
    span.textContent = p;
    item.appendChild(dot);
    item.appendChild(span);
    legendEl.appendChild(item);
  }

  if (isDiffModeActive()) {
    const diffRow = document.createElement('div');
    diffRow.className = 'legend-diff-row';
    const items = [
      { cls: 'legend-diff-sample--add', label: '新增' },
      { cls: 'legend-diff-sample--chg', label: '修改', hint: '原：…' },
      { cls: 'legend-diff-sample--remove', label: '刪除（上一版）' },
    ];
    for (const it of items) {
      const item = document.createElement('div');
      item.className = 'legend-item legend-item--diff';
      const sample = document.createElement('div');
      sample.className = `legend-diff-sample ${it.cls}`;
      const span = document.createElement('span');
      span.textContent = it.hint ? `${it.label}（${it.hint}）` : it.label;
      item.appendChild(sample);
      item.appendChild(span);
      diffRow.appendChild(item);
    }
    legendEl.appendChild(diffRow);
  }

  legendEl.hidden = legendEl.childElementCount === 0;
}

/**
 * @param {string} value
 * @param {string} label
 */
function appendPersonRadio(value, label) {
  const el = document.createElement('label');
  el.className = 'person-radio';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'current-person';
  input.value = value;
  if (value === selectedPerson) input.checked = true;
  const span = document.createElement('span');
  span.textContent = label;
  el.appendChild(input);
  el.appendChild(span);
  personRadioList.appendChild(el);
}

function fillPersonRadios() {
  personRadioList
    .querySelectorAll('.person-radio')
    .forEach((el) => el.remove());

  if (!parsed) {
    selectedPerson = '';
    personDialogEmpty.hidden = false;
    return;
  }

  personDialogEmpty.hidden = true;
  const names = [...parsed.people];
  if (!selectedPerson || !names.includes(selectedPerson)) {
    if (selectedPerson !== OTHER_KEY) {
      selectedPerson = names[0] || OTHER_KEY;
    }
  }

  for (const name of names) {
    appendPersonRadio(name, name);
  }
  appendPersonRadio(OTHER_KEY, OTHER_KEY);

  const checked = personRadioList.querySelector(
    `input[name="current-person"][value="${CSS.escape(selectedPerson)}"]`
  );
  if (checked instanceof HTMLInputElement) checked.checked = true;

  updatePersonSummary();
}

function onPersonRadioChange() {
  const checked = personRadioList.querySelector(
    'input[name="current-person"]:checked'
  );
  if (!(checked instanceof HTMLInputElement)) return;
  selectedPerson = checked.value;
  fillLegend();
  renderCalendar();
  updatePersonSummary();
  updateMoreDialog();
  closeAllDialogs();
}

async function onBaselineFile(file) {
  compareDialogError = '';
  if (!file || !parsed) return;
  baselineParsing = true;
  renderCompareDialog();
  try {
    const buf = await file.arrayBuffer();
    baselineParsed = parseShiftWorkbook(buf);
    baselineFileName = file.name;
    compareDialogError = '';
    recomputeCompare();
    rebuildProjectClassMap();
    refreshDiffUi();
    fillLegend();
    renderCalendar();
  } catch (e) {
    compareDialogError = e instanceof Error ? e.message : String(e);
    renderCompareDialog();
  } finally {
    baselineParsing = false;
    renderCompareDialog();
  }
}

async function onFile(file) {
  clearError();
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    parsed = parseShiftWorkbook(buf);
    recomputeCompare();
    rebuildProjectClassMap();
    fillPersonRadios();
    fillLegend();
    renderCalendar();
    updatePersonSummary();
    refreshDiffUi();
    updateMoreDialog();
  } catch (e) {
    parsed = null;
    projectClassMap.clear();
    selectedPerson = '';
    fillPersonRadios();
    calendarRoot.innerHTML = '';
    legendEl.hidden = true;
    updatePersonSummary();
    renderEmptyHint();
    refreshDiffUi();
    updateMoreDialog();
    showError(e instanceof Error ? e.message : String(e));
  }
}

btnImport.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  onFile(f);
  fileInput.value = '';
});

if (personSummary instanceof HTMLButtonElement) {
  personSummary.addEventListener('click', () => {
    openDialog('people', personSummary);
  });
}

personRadioList.addEventListener('change', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.name === 'current-person') {
    onPersonRadioChange();
  }
});

monthFilterFutureOnly.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

showEmptyMonths?.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

viewShowLocation?.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

viewShowPeriod?.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

viewShowAlias?.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

viewShowSameProjectPeers?.addEventListener('change', () => {
  renderCalendar();
  updateMoreDialog();
});

viewShowBaselineDiff?.addEventListener('change', () => {
  refreshDiffUi();
  fillLegend();
  renderCalendar();
  updateMoreDialog();
});

baselineFileInput?.addEventListener('change', () => {
  const f = baselineFileInput.files && baselineFileInput.files[0];
  onBaselineFile(f);
  baselineFileInput.value = '';
});

for (const btn of NAV_BTNS) {
  btn.addEventListener('click', () => {
    const dialog = btn.getAttribute('data-dialog');
    if (
      dialog === 'people' ||
      dialog === 'view' ||
      dialog === 'compare' ||
      dialog === 'more'
    ) {
      openDialog(/** @type {'people' | 'view' | 'compare' | 'more'} */ (dialog), btn);
      if (dialog === 'compare') renderCompareDialog();
    }
  });
}

dialogOverlay.addEventListener('click', (e) => {
  if (e.target === dialogOverlay) closeAllDialogs();
});

for (const panel of [dialogPeople, dialogView, dialogCompare, dialogMore]) {
  panel?.addEventListener('click', (e) => e.stopPropagation());
  const closeBtn = panel?.querySelector('.dialog__close');
  closeBtn?.addEventListener('click', closeAllDialogs);
}

btnExportPdf?.addEventListener('click', async () => {
  const ctx = getExportContext();
  if (!canExportPdf(ctx)) return;
  const layout = getSelectedPrintLayout();
  closeAllDialogs();
  await runPrintExport(layout, {
    headerEl: appHeader instanceof HTMLElement ? appHeader : null,
    legendEl: legendEl instanceof HTMLElement ? legendEl : null,
    personDiffPanelEl:
      personDiffPanel instanceof HTMLElement ? personDiffPanel : null,
    calendarRootEl: calendarRoot instanceof HTMLElement ? calendarRoot : null,
  });
});

fillPersonRadios();
renderEmptyHint();
updatePersonSummary();
updateBaselineDiffHint();
updateMoreDialog();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openDialogName) closeAllDialogs();
});
