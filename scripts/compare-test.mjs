import {
  compareSchedules,
  dayDiffBadge,
  diffPersonDay,
  eventCompareKey,
} from '../src/compareSchedules.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ev = (project, location = '', period = null, rawName) => ({
  project,
  location,
  period,
  ...(rawName != null ? { rawName } : {}),
});

// exact match unchanged
{
  const r = diffPersonDay(
    [ev('A', '台北', '1')],
    [ev('A', '台北', '1')]
  );
  assert(r.adds.length === 0 && r.removes.length === 0 && r.modifyPairs.length === 0);
}

// add only
{
  const r = diffPersonDay([], [ev('B', '台中')]);
  assert(r.adds.length === 1 && r.removes.length === 0);
}

// same project different location → modify
{
  const r = diffPersonDay(
    [ev('A', '台北')],
    [ev('A', '台中')]
  );
  assert(r.modifyPairs.length === 1 && r.adds.length === 0 && r.removes.length === 0);
}

// different project → delete + add
{
  const r = diffPersonDay([ev('A')], [ev('B')]);
  assert(r.removes.length === 1 && r.adds.length === 1 && r.modifyPairs.length === 0);
}

// rawName only change → delete + add
{
  const r = diffPersonDay(
    [ev('A', '台北', null, '維')],
    [ev('A', '台北', null, '維鈞半天')]
  );
  assert(r.removes.length === 1 && r.adds.length === 1 && r.modifyPairs.length === 0);
}

// two same project → two modifies
{
  const r = diffPersonDay(
    [ev('A', '台北'), ev('A', '台中')],
    [ev('A', '高雄'), ev('A', '新竹')]
  );
  assert(r.modifyPairs.length === 2);
}

const baseline = {
  people: ['維鈞'],
  byPerson: {
    維鈞: {
      '2026-05-20': [ev('專案甲', '台北')],
    },
  },
};
const current = {
  people: ['維鈞'],
  byPerson: {
    維鈞: {
      '2026-05-20': [ev('專案甲', '台中')],
    },
  },
};
const cmp = compareSchedules(baseline, current);
assert(cmp.summary.modified === 1 && cmp.summary.total === 1);

// remove-only with remaining shifts → − badge, N刪 summary
{
  const r = diffPersonDay(
    [ev('交通大隊', '大龍港'), ev('警專機車考照', '大台北')],
    [ev('交通大隊', '大龍港')]
  );
  assert(r.removes.length === 1 && r.adds.length === 0);
  const dayDiff = {
    adds: 0,
    removes: 1,
    modifies: 0,
    ghosts: r.removes,
    modifyPairs: [],
    currentDiffByKey: new Map(),
  };
  const partial = dayDiffBadge(dayDiff, 1);
  assert(partial.badge === '−' && partial.summary === '1刪');
  const empty = dayDiffBadge(dayDiff, 0);
  assert(
    empty.badge === '−' &&
      empty.summary === '此日已無排班（上一版 1 班）'
  );
}

console.log('compare-test: ok');
