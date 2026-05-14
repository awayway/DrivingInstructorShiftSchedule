import { parseShiftWorkbook, OTHER_KEY } from './parseShiftWorkbook.js';

const fileInput = document.getElementById('file-input');
const btnImport = document.getElementById('btn-import');
const personSelect = document.getElementById('person-select');
const calendarRoot = document.getElementById('calendar-root');
const errorBanner = document.getElementById('error-banner');
const legendEl = document.getElementById('legend');

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
  if (personKey === OTHER_KEY && ev.rawName) {
    const raw = document.createElement('div');
    raw.className = 'raw-name-line';
    raw.textContent = ev.rawName;
    card.appendChild(raw);
  }
  const projectEl = document.createElement('div');
  projectEl.className = 'project-name';
  projectEl.textContent = ev.project;
  card.appendChild(projectEl);
  if (ev.location) {
    const locEl = document.createElement('div');
    locEl.className = 'location-name';
    locEl.textContent = ev.location;
    card.appendChild(locEl);
  }
  if (ev.period) {
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

function monthLabel(y, m) {
  return `${y}年 ${m}月`;
}

function renderCalendar() {
  calendarRoot.innerHTML = '';
  if (!parsed) return;
  const key = personSelect.value;
  const months = collectMonths(key);
  if (!months.length) {
    const p = document.createElement('p');
    p.className = 'empty-cal';
    p.textContent = '此選項尚無排班資料。';
    p.style.textAlign = 'center';
    p.style.color = '#666';
    calendarRoot.appendChild(p);
    return;
  }
  for (const { year, month } of months) {
    calendarRoot.appendChild(buildMonth(year, month, monthLabel(year, month), key));
  }
}

function fillLegend() {
  if (!parsed) {
    legendEl.hidden = true;
    legendEl.innerHTML = '';
    return;
  }
  const projects = new Set();
  const key = personSelect.value;
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

function fillPersonSelect() {
  personSelect.innerHTML = '';
  if (!parsed) {
    personSelect.disabled = true;
    return;
  }
  for (const name of parsed.people) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    personSelect.appendChild(opt);
  }
  const other = document.createElement('option');
  other.value = OTHER_KEY;
  other.textContent = OTHER_KEY;
  personSelect.appendChild(other);
  personSelect.disabled = false;
  personSelect.value = parsed.people[0] || OTHER_KEY;
}

async function onFile(file) {
  clearError();
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    parsed = parseShiftWorkbook(buf);
    fillPersonSelect();
    fillLegend();
    renderCalendar();
  } catch (e) {
    parsed = null;
    personSelect.innerHTML = '';
    personSelect.disabled = true;
    calendarRoot.innerHTML = '';
    legendEl.hidden = true;
    showError(e instanceof Error ? e.message : String(e));
  }
}

btnImport.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  onFile(f);
  fileInput.value = '';
});

personSelect.addEventListener('change', () => {
  fillLegend();
  renderCalendar();
});
