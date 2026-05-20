/** @typedef {'mobile' | 'desktop'} PrintLayout */

export const PRINT_WIDTH = {
  mobile: 390,
  desktop: 900,
};

/**
 * @returns {PrintLayout}
 */
export function detectDefaultPrintLayout() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'mobile';
  if (
    window.matchMedia('(min-width: 768px)').matches ||
    window.matchMedia('(min-width: 600px) and (orientation: landscape)').matches
  ) {
    return 'desktop';
  }
  return 'mobile';
}

/**
 * @param {string} y
 * @param {number} m
 */
function monthLabelShort(y, m) {
  return `${y}年${m}月`;
}

/**
 * @param {Array<{ type: 'data' | 'empty', year: number, month: number }>} displayMonths
 */
function formatMonthRange(displayMonths) {
  const dataMonths = displayMonths.filter((x) => x.type === 'data');
  if (!dataMonths.length) return '（無月份）';
  const first = dataMonths[0];
  const last = dataMonths[dataMonths.length - 1];
  const count = displayMonths.length;
  const hasGhost = displayMonths.some((x) => x.type === 'empty');
  let range;
  if (dataMonths.length === 1) {
    range = monthLabelShort(first.year, first.month);
  } else {
    range = `${monthLabelShort(first.year, first.month)}～${monthLabelShort(last.year, last.month)}`;
  }
  let text = `${range}（${count} 個月）`;
  if (hasGhost) text += '；含無資料月份';
  return text;
}

/**
 * @returns {Array<{ type: 'data' | 'empty', year: number, month: number }>}
 */
export function getDisplayMonthsForExport(ctx) {
  const {
    selectedPerson,
    collectMonths,
    applyFutureMonthFilter,
    expandMonthsWithGaps,
    viewState,
  } = ctx;
  const allMonths = collectMonths(selectedPerson);
  if (!allMonths.length) return [];
  const months = applyFutureMonthFilter(allMonths);
  if (!months.length) return [];
  const showGaps = Boolean(viewState.showEmptyMonths);
  return showGaps
    ? expandMonthsWithGaps(months)
    : months.map(({ year, month }) => ({ type: 'data', year, month }));
}

/**
 * @typedef {{
 *   parsed: object | null,
 *   selectedPerson: string,
 *   collectMonths: (personKey: string) => { year: number, month: number }[],
 *   applyFutureMonthFilter: (months: { year: number, month: number }[]) => { year: number, month: number }[],
 *   expandMonthsWithGaps: (months: { year: number, month: number }[]) => Array<{ type: 'data' | 'empty', year: number, month: number }>,
 *   getPersonDisplayName: (key: string) => string,
 *   isDiffModeActive: () => boolean,
 *   viewState: {
 *     monthFilterFutureOnly: boolean,
 *     showEmptyMonths: boolean,
 *     showLocation: boolean,
 *     showPeriod: boolean,
 *     showAlias: boolean,
 *     showSameProjectPeers: boolean,
 *   },
 * }} ExportContext
 */

/**
 * @param {ExportContext} ctx
 */

/**
 * @param {ExportContext} ctx
 */
export function canExportPdf(ctx) {
  if (!ctx.parsed || !ctx.selectedPerson) return false;
  const allMonths = ctx.collectMonths(ctx.selectedPerson);
  if (!allMonths.length) return false;
  const filtered = ctx.applyFutureMonthFilter(allMonths);
  return filtered.length > 0;
}

/**
 * @param {ExportContext} ctx
 * @returns {'no-import' | 'no-months' | 'filtered-empty' | null}
 */
export function getExportBlockReason(ctx) {
  if (!ctx.parsed) return 'no-import';
  if (!ctx.selectedPerson) return 'no-months';
  const allMonths = ctx.collectMonths(ctx.selectedPerson);
  if (!allMonths.length) return 'no-months';
  const filtered = ctx.applyFutureMonthFilter(allMonths);
  if (!filtered.length) return 'filtered-empty';
  return null;
}

/**
 * @param {ExportContext} ctx
 * @returns {{ personLine: string, monthLine: string, viewLine: string } | null}
 */
export function getExportPreview(ctx) {
  if (!canExportPdf(ctx)) return null;
  const displayMonths = getDisplayMonthsForExport(ctx);
  const hints = [];
  if (ctx.viewState.monthFilterFutureOnly) hints.push('僅本月及未來月份');
  if (!ctx.viewState.showLocation) hints.push('不顯示地點');
  if (!ctx.viewState.showPeriod) hints.push('不顯示期別');
  if (!ctx.viewState.showAlias) hints.push('不顯示人員別名');
  if (!ctx.viewState.showSameProjectPeers) hints.push('不顯示同天同專案同地點人員');
  if (ctx.isDiffModeActive()) hints.push('含與上一版差異');
  const viewLine =
    hints.length > 0 ? hints.join('、') : '預設檢視';
  return {
    personLine: `人員：${ctx.getPersonDisplayName(ctx.selectedPerson)}`,
    monthLine: `月份：${formatMonthRange(displayMonths)}`,
    viewLine: `檢視：${viewLine}`,
  };
}

/**
 * @param {HTMLElement | null | undefined} el
 * @returns {HTMLElement | null}
 */
function cloneIfVisible(el) {
  if (!el || el.hidden) return null;
  const clone = el.cloneNode(true);
  if (clone instanceof HTMLElement) {
    clone.removeAttribute('hidden');
    clone.querySelectorAll('[hidden]').forEach((n) => n.removeAttribute('hidden'));
  }
  return clone instanceof HTMLElement ? clone : null;
}

/**
 * @param {HTMLElement} header
 */
function sanitizeHeaderClone(header) {
  header.querySelector('.toolbar')?.remove();
  header.querySelector('#error-banner')?.remove();
  const summary = header.querySelector('#person-summary');
  if (summary instanceof HTMLElement && summary.hidden) summary.remove();
}

/**
 * @param {PrintLayout} layout
 * @param {{
 *   headerEl: HTMLElement | null,
 *   legendEl: HTMLElement | null,
 *   personDiffPanelEl: HTMLElement | null,
 *   calendarRootEl: HTMLElement | null,
 * }} sources
 * @returns {Promise<void>}
 */
export function runPrintExport(layout, sources) {
  const width = PRINT_WIDTH[layout];
  const stylesheetHref = new URL('/styles.css', window.location.href).href;

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', '列印預覽');
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      iframe.remove();
      resolve();
      return;
    }

    const cleanup = () => {
      iframe.remove();
      resolve();
    };

    const fallback = window.setTimeout(cleanup, 120_000);
    win.addEventListener(
      'afterprint',
      () => {
        window.clearTimeout(fallback);
        cleanup();
      },
      { once: true }
    );

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="zh-TW" data-print-layout="${layout}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${width}">
<link rel="stylesheet" href="${stylesheetHref}">
<title>駕訓班總排班表 · 個人月曆</title>
</head>
<body class="print-export-frame"></body>
</html>`);
    doc.close();

    const body = doc.body;
    const wrap = doc.createElement('div');
    wrap.className = 'print-export-root';
    wrap.style.width = `${width}px`;
    wrap.style.maxWidth = '100%';

    const header = cloneIfVisible(sources.headerEl);
    if (header) {
      sanitizeHeaderClone(header);
      wrap.appendChild(header);
    }
    const legend = cloneIfVisible(sources.legendEl);
    if (legend) wrap.appendChild(legend);
    const diffPanel = cloneIfVisible(sources.personDiffPanelEl);
    if (diffPanel) wrap.appendChild(diffPanel);
    const calendar = cloneIfVisible(sources.calendarRootEl);
    if (calendar) wrap.appendChild(calendar);

    body.appendChild(wrap);

    const doPrint = () => {
      iframe.style.width = `${width}px`;
      win.focus();
      try {
        win.print();
      } catch {
        window.clearTimeout(fallback);
        cleanup();
      }
    };

    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    let pending = links.length;
    if (!pending) {
      requestAnimationFrame(doPrint);
      return;
    }
    const onReady = () => {
      pending -= 1;
      if (pending <= 0) requestAnimationFrame(doPrint);
    };
    for (const link of links) {
      if (link.sheet) onReady();
      else {
        link.addEventListener('load', onReady, { once: true });
        link.addEventListener('error', onReady, { once: true });
      }
    }
  });
}
