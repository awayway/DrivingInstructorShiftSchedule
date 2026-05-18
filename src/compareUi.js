/** @typedef {import('./compareSchedules.js').ScheduleChange} ScheduleChange */

/**
 * @param {object} ctx
 * @param {ScheduleChange} change
 */
export function buildChangeCard(ctx, change) {
  const card = document.createElement('div');
  card.className = 'change-card';

  const head = document.createElement('div');
  head.className = 'change-card__head';
  const title = document.createElement('div');
  title.className = 'change-card__title';
  title.textContent = `${ctx.formatChangeDateLabel(change.dateStr)} · ${ctx.getPersonDisplayName(change.personKey)}`;
  const tag = document.createElement('span');
  tag.className = `change-card__type change-card__type--${change.type}`;
  tag.textContent = ctx.changeTypeLabel[change.type];
  head.appendChild(title);
  head.appendChild(tag);
  card.appendChild(head);

  const cols = document.createElement('div');
  cols.className = 'change-card__cols';

  if (change.type === 'remove' && change.baselineEvent) {
    const left = document.createElement('div');
    left.className = 'change-card__col change-card__col--baseline';
    const leftLabel = document.createElement('div');
    leftLabel.className = 'change-card__col-label';
    leftLabel.textContent = '上一版';
    left.appendChild(leftLabel);
    const evCard = document.createElement('div');
    evCard.className = `event-card ${ctx.projectClass(change.baselineEvent.project)} event-card--baseline-ref`;
    ctx.fillEventCard(evCard, change.baselineEvent, change.personKey, undefined, {
      full: true,
    });
    left.appendChild(evCard);
    const empty = document.createElement('div');
    empty.className = 'change-card__col change-card__col--empty';
    empty.textContent = '無';
    cols.appendChild(left);
    cols.appendChild(empty);
  } else if (change.type === 'add' && change.currentEvent) {
    const empty = document.createElement('div');
    empty.className = 'change-card__col change-card__col--empty';
    empty.textContent = '無';
    const right = document.createElement('div');
    right.className = 'change-card__col change-card__col--current';
    const rightLabel = document.createElement('div');
    rightLabel.className = 'change-card__col-label';
    rightLabel.textContent = '新版';
    right.appendChild(rightLabel);
    const evCard = document.createElement('div');
    evCard.className = `event-card ${ctx.projectClass(change.currentEvent.project)}`;
    ctx.fillEventCard(evCard, change.currentEvent, change.personKey, undefined, {
      full: true,
    });
    right.appendChild(evCard);
    cols.appendChild(empty);
    cols.appendChild(right);
  } else if (
    change.type === 'modify' &&
    change.baselineEvent &&
    change.currentEvent
  ) {
    const left = document.createElement('div');
    left.className = 'change-card__col change-card__col--baseline';
    const leftLabel = document.createElement('div');
    leftLabel.className = 'change-card__col-label';
    leftLabel.textContent = '上一版';
    left.appendChild(leftLabel);
    const baseCard = document.createElement('div');
    baseCard.className = `event-card ${ctx.projectClass(change.baselineEvent.project)} event-card--baseline-ref`;
    ctx.fillEventCard(baseCard, change.baselineEvent, change.personKey, undefined, {
      full: true,
    });
    left.appendChild(baseCard);

    const right = document.createElement('div');
    right.className = 'change-card__col change-card__col--current';
    const rightLabel = document.createElement('div');
    rightLabel.className = 'change-card__col-label';
    rightLabel.textContent = '新版';
    right.appendChild(rightLabel);
    const curCard = document.createElement('div');
    curCard.className = `event-card ${ctx.projectClass(change.currentEvent.project)}`;
    ctx.fillEventCard(curCard, change.currentEvent, change.personKey, undefined, {
      full: true,
    });
    right.appendChild(curCard);
    cols.appendChild(left);
    cols.appendChild(right);
  }

  card.appendChild(cols);
  return card;
}

/**
 * @param {object} ctx
 */
export function renderPersonDiffPanel(ctx) {
  const { personDiffPanel, compareResult, selectedPerson, isDiffModeActive } =
    ctx;
  if (!personDiffPanel) return;
  personDiffPanel.innerHTML = '';
  if (!isDiffModeActive() || !compareResult || !selectedPerson) {
    personDiffPanel.hidden = true;
    return;
  }

  const changes = compareResult.changesByPerson[selectedPerson] || [];
  const panel = document.createElement('div');
  panel.className = 'person-diff-panel__inner';

  if (!changes.length) {
    const empty = document.createElement('p');
    empty.className = 'person-diff-panel__empty';
    empty.textContent = `與上一版相比，${ctx.getPersonDisplayName(selectedPerson)} 無變更`;
    panel.appendChild(empty);
    personDiffPanel.appendChild(panel);
    personDiffPanel.hidden = false;
    return;
  }

  const summary = ctx.summarizePersonChanges(
    compareResult.changesByPerson,
    selectedPerson
  );
  const summaryCard = document.createElement('div');
  summaryCard.className = 'diff-summary-card';
  for (const line of ctx.formatSummaryText(summary, false)) {
    const p = document.createElement('p');
    p.className = 'diff-summary-card__line';
    p.textContent = line;
    summaryCard.appendChild(p);
  }
  panel.appendChild(summaryCard);

  const list = document.createElement('div');
  list.className = 'change-card-list';
  for (const ch of changes) list.appendChild(ctx.buildChangeCard(ch));
  panel.appendChild(list);
  personDiffPanel.appendChild(panel);
  personDiffPanel.hidden = false;
}

/**
 * @param {object} ctx
 */
export function renderCompareDialog(ctx) {
  const { compareDialogBody, parsed, baselineParsed, baselineParsing } = ctx;
  if (!compareDialogBody) return;
  compareDialogBody.innerHTML = '';

  if (!parsed) {
    const p = document.createElement('p');
    p.className = 'dialog-empty-hint';
    p.textContent = '請先以頂部按鈕匯入新版總排班表。';
    compareDialogBody.appendChild(p);
    return;
  }

  if (!baselineParsed) {
    const wrap = document.createElement('div');
    wrap.className = 'compare-import-block';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-primary compare-import-btn';
    btn.textContent = baselineParsing ? '解析中…' : '匯入上一版總排班表';
    btn.disabled = baselineParsing;
    btn.addEventListener('click', () => ctx.baselineFileInput?.click());
    const hint = document.createElement('p');
    hint.className = 'compare-import-hint';
    hint.textContent = '檔案僅在瀏覽器解析；請先以頂部按鈕匯入新版。';
    wrap.appendChild(btn);
    wrap.appendChild(hint);
    compareDialogBody.appendChild(wrap);
    return;
  }

  if (ctx.compareDialogError) {
    const err = document.createElement('p');
    err.className = 'compare-dialog-error';
    err.textContent = ctx.compareDialogError;
    compareDialogBody.appendChild(err);
  }

  const fileRow = document.createElement('div');
  fileRow.className = 'compare-file-row';
  fileRow.appendChild(
    document.createTextNode(`上一版：${ctx.baselineFileName || '（未命名）'} `)
  );
  const reselect = document.createElement('button');
  reselect.type = 'button';
  reselect.className = 'compare-reselect-btn';
  reselect.disabled = baselineParsing;
  reselect.textContent = baselineParsing ? '解析中…' : '重新選擇';
  reselect.addEventListener('click', () => ctx.baselineFileInput?.click());
  fileRow.appendChild(reselect);
  compareDialogBody.appendChild(fileRow);

  const { compareResult } = ctx;
  if (!compareResult) return;

  const summaryCard = document.createElement('div');
  summaryCard.className = 'diff-summary-card';
  for (const line of ctx.formatSummaryText(compareResult.summary, true)) {
    const p = document.createElement('p');
    p.className = 'diff-summary-card__line';
    p.textContent = line;
    summaryCard.appendChild(p);
  }
  compareDialogBody.appendChild(summaryCard);

  const listWrap = document.createElement('div');
  listWrap.className = 'change-card-list';
  if (compareResult.summary.total === 0) {
    const same = document.createElement('p');
    same.className = 'compare-no-changes';
    same.textContent = '兩版相同，無變更';
    listWrap.appendChild(same);
  } else {
    for (const ch of compareResult.sortedChanges) {
      listWrap.appendChild(ctx.buildChangeCard(ch));
    }
  }
  compareDialogBody.appendChild(listWrap);
}
