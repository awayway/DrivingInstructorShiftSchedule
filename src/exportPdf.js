/** @typedef {'mobile' | 'desktop'} PrintLayout */

export const PRINT_WIDTH = {
  mobile: 390,
  desktop: 900,
};

/**
 * iOS／iPadOS WebKit 的 window.print() 常忽略版面與背景，改走 canvas → PDF。
 * @returns {boolean}
 */
export function isIosExportClient() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * 與主頁相同來源的樣式（dev: styles.css；build: Vite 打包後的 assets/*.css）
 * @returns {string}
 */
function resolveExportStylesheetHref() {
  const link = document.querySelector('link[rel="stylesheet"]');
  if (link instanceof HTMLLinkElement && link.href) return link.href;
  const base = import.meta.env.BASE_URL || '/';
  return new URL(`${base}styles.css`, window.location.href).href;
}

/**
 * @param {string} color
 */
function isOpaqueColor(color) {
  return (
    Boolean(color) &&
    color !== 'transparent' &&
    color !== 'rgba(0, 0, 0, 0)' &&
    !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(color)
  );
}

/**
 * @param {Element} src
 * @param {Element} dest
 */
function syncPrintColorsOnElement(src, dest) {
  if (!(src instanceof HTMLElement) || !(dest instanceof HTMLElement)) return;
  const cs = getComputedStyle(src);

  const bg = cs.backgroundColor;
  if (isOpaqueColor(bg)) {
    dest.style.setProperty('box-shadow', `inset 0 0 0 1000px ${bg}`, 'important');
  }

  const blw = Number.parseFloat(cs.borderLeftWidth);
  if (blw > 0) {
    dest.style.setProperty('border-left', cs.borderLeft, 'important');
  }

  const color = cs.color;
  if (isOpaqueColor(color)) {
    dest.style.setProperty('color', color, 'important');
  }

  dest.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
  dest.style.setProperty('print-color-adjust', 'exact', 'important');
}

/**
 * @param {HTMLElement} srcRoot
 * @param {HTMLElement} destRoot
 */
function syncPrintColorsTree(srcRoot, destRoot) {
  syncPrintColorsOnElement(srcRoot, destRoot);
  const srcNodes = srcRoot.querySelectorAll('*');
  const destNodes = destRoot.querySelectorAll('*');
  const n = Math.min(srcNodes.length, destNodes.length);
  for (let i = 0; i < n; i += 1) {
    syncPrintColorsOnElement(srcNodes[i], destNodes[i]);
  }
}

/**
 * @param {number} width
 */
function applyPrintIframeChrome(iframe, width) {
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:-1',
    `width:${width}px`,
    'height:auto',
    'min-height:100vh',
    'border:0',
    'margin:0',
    'padding:0',
    'opacity:0.01',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';');
}

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
 * @param {boolean} [syncColors]
 * @returns {HTMLElement | null}
 */
function cloneIfVisible(el, syncColors = false) {
  if (!el || el.hidden) return null;
  const clone = el.cloneNode(true);
  if (clone instanceof HTMLElement) {
    clone.removeAttribute('hidden');
    clone.querySelectorAll('[hidden]').forEach((n) => n.removeAttribute('hidden'));
    if (syncColors && el instanceof HTMLElement) syncPrintColorsTree(el, clone);
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
 * @param {{
 *   headerEl: HTMLElement | null,
 *   legendEl: HTMLElement | null,
 *   personDiffPanelEl: HTMLElement | null,
 *   calendarRootEl: HTMLElement | null,
 * }} sources
 * @param {{ syncColors?: boolean, canvasMount?: boolean }} [opts]
 * @returns {HTMLElement}
 */
function buildPrintExportRoot(sources, opts = {}) {
  const { syncColors = false, canvasMount = false } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'print-export-root';

  const header = cloneIfVisible(sources.headerEl, syncColors);
  const legend = cloneIfVisible(sources.legendEl, syncColors);
  const diffPanel = cloneIfVisible(sources.personDiffPanelEl, syncColors);
  const calendar = cloneIfVisible(sources.calendarRootEl, syncColors);

  if (canvasMount) {
    const intro = document.createElement('div');
    intro.className = 'print-canvas-intro';
    if (header) {
      sanitizeHeaderClone(header);
      intro.appendChild(header);
    }
    if (legend) intro.appendChild(legend);
    if (diffPanel) intro.appendChild(diffPanel);
    if (intro.childElementCount > 0) wrap.appendChild(intro);
    if (calendar) wrap.appendChild(calendar);
  } else {
    if (header) {
      sanitizeHeaderClone(header);
      wrap.appendChild(header);
    }
    if (legend) wrap.appendChild(legend);
    if (diffPanel) wrap.appendChild(diffPanel);
    if (calendar) wrap.appendChild(calendar);
  }

  return wrap;
}

/**
 * @returns {Promise<void>}
 */
async function waitForExportPaint() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 200));
}

/**
 * @param {string} name
 */
function sanitizePdfFilename(name) {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return cleaned.endsWith('.pdf') ? cleaned : `${cleaned || '駕訓班排班表'}.pdf`;
}

/**
 * iOS 匯出 PDF 檔名：排班表-{人名}-{列印日期}-{列印時間}.pdf
 * 列印日期＝本機 YYYYMMDD；列印時間＝本機 HHmmss（24 小時制）。
 * @param {string} personName
 * @param {Date} [at]
 * @returns {string}
 */
export function buildIosExportPdfFilename(personName, at = new Date()) {
  const y = at.getFullYear();
  const mo = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const h = String(at.getHours()).padStart(2, '0');
  const mi = String(at.getMinutes()).padStart(2, '0');
  const s = String(at.getSeconds()).padStart(2, '0');
  const datePart = `${y}${mo}${d}`;
  const timePart = `${h}${mi}${s}`;
  const safeName = personName.trim() || '未命名';
  return sanitizePdfFilename(`排班表-${safeName}-${datePart}-${timePart}.pdf`);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('jspdf').jsPDF} pdf
 * @param {number} targetWidth
 * @param {{ value: boolean }} firstPageRef
 */
function appendCanvasToPdf(canvas, pdf, targetWidth, firstPageRef) {
  const margin = 14;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = Math.min(targetWidth, pageWidth - margin * 2);
  const printableHeight = pageHeight - margin * 2;
  const imgHeight = (canvas.height * printableWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  let offsetY = 0;
  while (offsetY < imgHeight) {
    if (!firstPageRef.value) pdf.addPage();
    else firstPageRef.value = false;

    pdf.addImage(
      imgData,
      'PNG',
      margin,
      margin - offsetY,
      printableWidth,
      imgHeight
    );
    offsetY += printableHeight;
  }
}

/**
 * @param {PrintLayout} layout
 * @param {number} width
 * @param {{
 *   headerEl: HTMLElement | null,
 *   legendEl: HTMLElement | null,
 *   personDiffPanelEl: HTMLElement | null,
 *   calendarRootEl: HTMLElement | null,
 * }} sources
 * @param {{ filename?: string }} [options]
 * @returns {Promise<void>}
 */
async function runCanvasPdfExport(layout, width, sources, options = {}) {
  const mount = buildPrintExportRoot(sources, { canvasMount: true });
  mount.classList.add('print-canvas-export-mount');
  mount.style.width = `${width}px`;
  mount.style.maxWidth = `${width}px`;

  const html = document.documentElement;
  html.setAttribute('data-print-layout', layout);
  document.body.appendChild(mount);

  try {
    await waitForExportPaint();

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const pdf = new jsPDF({ unit: 'px', format: 'a4', orientation: 'portrait' });
    const firstPageRef = { value: true };

    const blocks = [];
    const intro = mount.querySelector('.print-canvas-intro');
    if (intro instanceof HTMLElement && intro.childElementCount > 0) {
      blocks.push(intro);
    }
    mount.querySelectorAll('.month-section').forEach((el) => {
      if (el instanceof HTMLElement) blocks.push(el);
    });
    if (!blocks.length) blocks.push(mount);

    for (const block of blocks) {
      const canvas = await html2canvas(block, {
        scale: 2,
        width,
        windowWidth: width,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      appendCanvasToPdf(canvas, pdf, width, firstPageRef);
    }

    pdf.save(
      options.filename
        ? sanitizePdfFilename(options.filename)
        : buildIosExportPdfFilename('未命名')
    );
  } finally {
    mount.remove();
    html.removeAttribute('data-print-layout');
  }
}

/**
 * @param {PrintLayout} layout
 * @param {number} width
 * @param {{
 *   headerEl: HTMLElement | null,
 *   legendEl: HTMLElement | null,
 *   personDiffPanelEl: HTMLElement | null,
 *   calendarRootEl: HTMLElement | null,
 * }} sources
 * @returns {Promise<void>}
 */
function runIframePrintExport(layout, width, sources) {
  const stylesheetHref = resolveExportStylesheetHref();

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', '列印預覽');
    applyPrintIframeChrome(iframe, width);
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
    const wrap = buildPrintExportRoot(sources, { syncColors: true });
    wrap.style.width = `${width}px`;
    wrap.style.maxWidth = '100%';
    body.appendChild(wrap);

    const doPrint = async () => {
      applyPrintIframeChrome(iframe, width);
      wrap.style.width = `${width}px`;
      wrap.style.maxWidth = `${width}px`;
      if (doc.fonts?.ready) {
        try {
          await doc.fonts.ready;
        } catch {
          /* 字型載入失敗仍嘗試列印 */
        }
      }
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
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
      void doPrint();
      return;
    }
    const onReady = () => {
      pending -= 1;
      if (pending <= 0) void doPrint();
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

/**
 * @param {PrintLayout} layout
 * @param {{
 *   headerEl: HTMLElement | null,
 *   legendEl: HTMLElement | null,
 *   personDiffPanelEl: HTMLElement | null,
 *   calendarRootEl: HTMLElement | null,
 * }} sources
 * @param {{ filename?: string }} [options]
 * @returns {Promise<void>}
 */
export async function runPrintExport(layout, sources, options = {}) {
  const width = PRINT_WIDTH[layout];
  if (isIosExportClient()) {
    await runCanvasPdfExport(layout, width, sources, options);
    return;
  }
  await runIframePrintExport(layout, width, sources);
}
