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
const calendarRoot = document.getElementById('calendar-root');
const errorBanner = document.getElementById('error-banner');
const legendEl = document.getElementById('legend');
const mainNav = document.getElementById('main-nav');
const dialogOverlay = document.getElementById('dialog-overlay');
const dialogPeople = document.getElementById('dialog-people');
const dialogView = document.getElementById('dialog-view');

/** @type {'people' | 'view' | null} */
let openDialogName = null;
/** @type {HTMLButtonElement | null} */
let dialogTriggerBtn = null;
/** @type {string} */
let selectedPerson = '';

const DIALOGS = {
  people: dialogPeople,
  view: dialogView,
};

const NAV_BTNS = mainNav.querySelectorAll('.main-nav__btn[data-dialog]');

const PROJ_CLASSES = [
  'proj-jingzhuan',
  'proj-jingdaxue',
  'proj-jingzhengpu',
  'proj-mute-a',
  'proj-mute-b',
  'proj-mute-c',
  'proj-mute-d',
];

/** @type {{ people: string[], byPerson: Record<string, Record<string, Array<{ project: string, location: string, period: string | null, rawName?: string }>>> } | null} */
let parsed = null;

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
    if (key === 'more') continue;
    btn.setAttribute('aria-expanded', key === dialogName ? 'true' : 'false');
  }
}

/**
 * @param {'people' | 'view'} name
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
  const focusTarget = panel.querySelector(
    'input:not([disabled]), button.dialog__close'
  );
  if (focusTarget instanceof HTMLElement) focusTarget.focus();
}

function closeAllDialogs() {
  openDialogName = null;
  dialogOverlay.hidden = true;
  dialogOverlay.setAttribute('aria-hidden', 'true');
  dialogPeople.hidden = true;
  dialogView.hidden = true;
  document.body.classList.remove('dialog-open');
  setNavExpanded(null);
  if (dialogTriggerBtn) {
    dialogTriggerBtn.focus();
    dialogTriggerBtn = null;
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

function hashProject(project) {
  let h = 0;
  for (let i = 0; i < project.length; i++) {
    h = (h * 31 + project.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function projectClass(project) {
  const key = project.trim();
  if (key.includes('警專')) return 'proj-jingzhuan';
  if (key.includes('警察大學') || key.includes('警大')) return 'proj-jingdaxue';
  if (key.includes('警政署') || key.includes('普機')) return 'proj-jingzhengpu';
  return PROJ_CLASSES[hashProject(key) % PROJ_CLASSES.length];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {HTMLDivElement} card
 * @param {{ project: string, location: string, period: string | null, rawName?: string }} ev
 * @param {string} personKey
 */
function fillEventCard(card, ev, personKey) {
  if (
    ev.rawName &&
    (personKey === OTHER_KEY || ev.rawName.trim() !== personKey.trim())
  ) {
    const raw = document.createElement('div');
    raw.className = 'raw-name-line';
    raw.textContent = ev.rawName;
    card.appendChild(raw);
  }
  const projectEl = document.createElement('div');
  projectEl.className = 'project-name';
  projectEl.textContent = ev.project;
  card.appendChild(projectEl);
  const showLocation = viewShowLocation ? viewShowLocation.checked : true;
  const showPeriod = viewShowPeriod ? viewShowPeriod.checked : true;
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
      const events = schedule[dateStr];
      if (events && events.length) {
        for (const ev of events) {
          const card = document.createElement('div');
          const cls = projectClass(ev.project);
          card.className = `event-card ${cls}`;
          fillEventCard(card, ev, personKey);
          cell.appendChild(card);
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
  const dates = Object.keys(parsed.byPerson[personKey] || {}).sort();
  if (!dates.length) return [];
  const months = new Map();
  for (const d of dates) {
    const [y, m] = d.split('-').map(Number);
    const key = `${y}-${pad(m)}`;
    if (!months.has(key)) months.set(key, { year: y, month: m });
  }
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
    return;
  }
  updatePersonSummary();
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
  closeAllDialogs();
}

async function onFile(file) {
  clearError();
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    parsed = parseShiftWorkbook(buf);
    fillPersonRadios();
    fillLegend();
    renderCalendar();
    updatePersonSummary();
  } catch (e) {
    parsed = null;
    selectedPerson = '';
    fillPersonRadios();
    calendarRoot.innerHTML = '';
    legendEl.hidden = true;
    updatePersonSummary();
    renderEmptyHint();
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
});

showEmptyMonths?.addEventListener('change', () => {
  renderCalendar();
});

viewShowLocation?.addEventListener('change', () => {
  renderCalendar();
});

viewShowPeriod?.addEventListener('change', () => {
  renderCalendar();
});

for (const btn of NAV_BTNS) {
  btn.addEventListener('click', () => {
    const dialog = btn.getAttribute('data-dialog');
    if (dialog === 'more') return;
    if (dialog === 'people' || dialog === 'view') {
      openDialog(dialog, btn);
    }
  });
}

dialogOverlay.addEventListener('click', (e) => {
  if (e.target === dialogOverlay) closeAllDialogs();
});

for (const panel of [dialogPeople, dialogView]) {
  panel.addEventListener('click', (e) => e.stopPropagation());
  const closeBtn = panel.querySelector('.dialog__close');
  closeBtn?.addEventListener('click', closeAllDialogs);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openDialogName) closeAllDialogs();
});

fillPersonRadios();
renderEmptyHint();
updatePersonSummary();
