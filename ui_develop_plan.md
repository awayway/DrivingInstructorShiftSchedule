# UI 改版開發計劃（底欄／右側欄導航）

## 1. 背景與目標

### 1.1 為何改版

- 主要使用裝置為**手機**（桌面亦有，但手機常用）。
- 月曆為**垂直捲動**之多個月份區塊；若檢視選項全放在頂部 `toolbar`，使用者捲到下方月份時，無法快速切換人員或檢視設定。
- **手機橫向**時可用高度很少，若三鍵仍固定底部會明顯壓縮月曆可視區域。
- 未來將增加多項檢視與匯出功能；頂部空間不足以容納。

### 1.2 設計決策（已定案）

| 項目 | 決策 |
| ---- | ---- |
| 主導航 | 固定三鍵：**人員**、**檢視**、**更多**；**同一組 DOM**，依斷點切換排版（見下表） |
| 導航排版（響應式） | **直向手機（預設）**：底部橫排底欄。**寬度夠時**：改為**右側**固定直欄（見 §1.2.1、§9） |
| 面板形式 | 一律 **Bottom Sheet**（自底部滑出）；寬螢幕／側欄模式可選讓 sheet 面板 `max-width` 與主內容同欄置中，仍自底部滑出 |
| 匯入按鈕 | **保留在 header**（不遷移到底欄「更多」）；進站後首要操作、重新匯入頻率低，置頂較明顯 |
| 「更多」Phase 1 | 導航按鈕可先存在，**點擊暫不開啟 sheet**（無反應）；待 Phase 4 匯出功能再實作內容 |
| 目前人員顯示 | **header 內一行文字**（如 `人員：維鈞`）；隨 header **一起捲走**，**不 sticky**；與「人員」sheet 選擇同步更新 |
| 狀態列／頂部 sticky | **不做**（不含獨立 sticky 摘要列；header 內人員文字屬一般 header 內容，非固定列） |
| 主畫面 | 盡量留給圖例 + 月曆／清單內容 |

#### 1.2.1 為何採右側欄（非左側）

**已定案：寬螢幕／橫向時，三鍵放在視窗右側直欄。**

| 考量 | 右側（採用） | 左側（未採用） |
| ---- | ------------ | -------------- |
| 垂直空間 | 不佔底部高度，橫向手機可多顯示月曆列 | 同右側 |
| 閱讀與月曆 | 標題、週一欄起點多在左，工具放右較少搶視線 | 左側欄與月曆左緣競爭 |
| 系統手勢 | 較少與 Android 左緣返回、iOS 邊緣手勢衝突 | 左緣易誤觸 |
| 橫握操作 | 多數右手使用者較易觸及右緣／右下區 | 左緣較遠 |
| 常見模式 | 地圖、閱讀類 App 常把次要工具放右 | Material 桌面常見左側 rail，但本專案以手機橫向為優先 |

### 1.3 與既有計劃的關係

- 業務邏輯、解析規則、月曆渲染行為仍以 [`develop-plan.md`](./develop-plan.md) 為準。
- 本文件僅描述 **UI 殼層、版面、遷移步驟與未來功能擺放位置**。

---

## 2. 改版後版面結構

### 2.1 直向手機（底欄模式，預設）

```
┌─────────────────────────────┐
│ 總排班表 · 個人月曆            │  ← header（標題、副標）
│ 檔案僅在瀏覽器解析…            │     隨頁面捲動，不 sticky
│  人員：維鈞                   │  ← #person-summary
│  [ 匯入總排班表 ]              │
├─────────────────────────────┤
│  #legend                     │
│  #calendar-root              │  ← padding-bottom 避開底欄
│                             │
├─────────────────────────────┤
│    [人員] [檢視] [更多]       │  ← #main-nav（底欄；三鍵置中成組，不均分全寬）
└─────────────────────────────┘
```

### 2.2 橫向手機／桌面（右側欄模式）

```
┌──────────────────────────────────────┬──┐
│  header、#legend、#calendar-root      │人│
│  （主內容區；padding-right 避開側欄）  │員│
│                                      │檢│
│                                      │視│
│                                      │更│
│                                      │多│
└──────────────────────────────────────┴──┘
                                        ↑ #main-nav 右側固定直欄（約 56–72px + safe area）
```

**切換條件**（CSS，見 §9）：`(min-width: 768px)` **或** `(min-width: 600px) and (orientation: landscape)` → 右側欄；其餘 → 底欄。

點擊導航按鈕 → 開啟對應 **Sheet**（遮罩 + 可關閉面板）：

| 導航按鈕 | Sheet ID（建議） | Phase 1 | 未來 |
| -------- | ---------------- | ------- | ---- |
| **人員** | `#sheet-people` | 單一人員 `<select>`（自 toolbar 遷入） | 多選 checkbox 清單 |
| **檢視** | `#sheet-view` | 「只顯示本月及未來月份」checkbox（自 toolbar 遷入） | 地點／期別／空白月／月曆清單模式等 |
| **更多** | `#sheet-more` | **點擊無反應**（不開 sheet） | 匯出 PDF、Excel／CSV 等 |

---

## 3. 現況對照（遷移前）

目前控制項位於 [`index.html`](./index.html) 的 `.toolbar`：

| 控制項 | DOM / ID | Phase 1 處置 | 邏輯綁定（[`src/main.js`](./src/main.js)） |
| ------ | -------- | ------------ | ------------------------------------------- |
| 匯入 | `#btn-import` → `#file-input` | **留在 header** | `btnImport` click、`fileInput` change |
| 人員 | `#person-select` | 遷至 **人員** sheet | `personSelect` change → `renderCalendar`、`fillLegend` |
| 月份篩選 | `#month-filter-future-only` | 遷至 **檢視** sheet | `monthFilterFutureOnly` change → `renderCalendar` |

**遷移原則**：僅移動「人員」「月份篩選」的 DOM 位置與樣式；**不改變** `id`、事件行為與 `renderCalendar()` 等既有函式簽名。匯入相關 DOM **不移動**。

---

## 4. Phase 1：三鍵導航遷移（不影響功能）

> **目標**：使用者改從底欄或右側欄開啟面板操作（依斷點自動切換）；行為與現版完全一致。

### 4.1 HTML（`index.html`）

1. **header 內 `.toolbar` 精簡為匯入 + 目前人員摘要**：
   - 保留 `#btn-import`、`#file-input`（`hidden`）。
   - **新增** `#person-summary`（建議 `<p class="person-summary">`）：顯示目前選取人員，格式 **`人員：{名稱}`**；尚未匯入或無選取時 `hidden` 或留空。
   - 移除 toolbar 內的 `#person-select`、人員 label、`#month-filter-future-only`（改放 sheet）。
2. **新增**：
   - `<nav id="main-nav" class="main-nav">`：內層建議 `.main-nav__actions`，內放三個 `<button type="button">`（`data-sheet="people|view|more"`）。**僅一組 DOM**；CSS 依 §9 切換底欄／右側欄，勿做兩套按鈕。
   - 底欄模式：`.main-nav__actions` 橫排、`justify-content: center`、固定 `gap`（**不均分**全寬）。
   - 右側欄模式：`.main-nav__actions` 直排、`flex-direction: column`、按鈕置中。
   - **Phase 1 僅實作** `#sheet-people`、`#sheet-view` 兩個 sheet 容器（結構見 §4.4）。
   - `#sheet-more` 可**不建 DOM**，或預留空容器；「更多」按鈕 **不綁定** `openSheet('more')`。
3. **錯誤橫幅** `#error-banner` 仍留在 `header` 內。

### 4.2 CSS（`styles.css`）

| 樣式類別 | 說明 |
| -------- | ---- |
| `.main-nav`（底欄模式，預設） | `position: fixed; bottom: 0; left: 0; right: 0;`；`padding-bottom: env(safe-area-inset-bottom)` |
| `.main-nav__actions`（底欄） | `display: flex; justify-content: center; gap: 12px–24px`；**勿** `space-between` 或按鈕 `flex: 1` |
| `.main-nav`（右側欄模式，見 §9 媒體查詢） | `top: 0; bottom: 0; right: 0; left: auto; width: ~56–72px`；`padding-right: env(safe-area-inset-right)` |
| `.main-nav__actions`（右側欄） | `flex-direction: column; justify-content: center; gap: 8px–16px; height: 100%` |
| `body` 或主內容包裝 | 底欄模式：`padding-bottom` ≥ 底欄高（56–64px + safe area）；右側欄模式：`padding-right` ≥ 側欄寬 + safe area；**勿同時**留過大 bottom padding |
| `.sheet-overlay` | 全螢幕半透明遮罩；點擊關閉 |
| `.sheet-panel` | 自底部滑入；`max-height: ~85vh`；內容可捲；寬螢幕可 `max-width: 900px` 水平置中 |
| `.sheet-panel[hidden]` / `.sheet-overlay[hidden]` | 關閉狀態 |

移除或調整原 `.toolbar`、`.month-filter-toggle` 在頂部的樣式；sheet 內可複用類似排版。

### 4.3 JavaScript（`src/main.js`）

**Phase 1 僅新增「殼層」邏輯，不 refactor 資料流：**

1. `openSheet(name)` / `closeSheet()` / `closeAllSheets()`（`name` 僅 `'people' | 'view'`）。
2. `#main-nav` 內「人員」「檢視」click → 開啟對應 sheet（若已開啟同一個可 toggle 關閉）；底欄／右側欄共用同一 listener。
3. 「更多」click → **Phase 1 不處理**（`preventDefault` 後 return，或根本不綁 listener）。
4. 遮罩 click、`Escape` 鍵 → 關閉 sheet。
5. **新增** `updatePersonSummary()`：依 `#person-select` 目前值更新 `#person-summary` 文字；於 `personSelect` `change`、`fillPersonSelect`（匯入後）、`renderCalendar` 等時機呼叫。
6. **不修改** `parseShiftWorkbook`、`renderCalendar`、`applyFutureMonthFilter` 等核心邏輯。

`getElementById` 的 id 不變；`personSelect`、`monthFilterFutureOnly` 遷至 sheet 後仍可正常運作。`btnImport`、`fileInput`、**`#person-summary`** **始終在 header**。

### 4.4 Sheet 內容（Phase 1 最小集合）

#### `#sheet-people`（人員）

```html
<!-- 語意結構示意 -->
<header>人員</header>
<label for="person-select">目前人員</label>
<select id="person-select" disabled>...</select>
<!-- Phase 1：維持單選 select，行為與現版相同 -->
```

- 變更 `person-select` 後：更新 header **`#person-summary`**（例：`人員：維鈞`）；可選擇關閉 sheet 或保持開啟（建議 **關閉**，減少遮擋月曆）。

#### `#sheet-view`（檢視）

```html
<header>檢視設定</header>
<label class="month-filter-toggle">
  <input type="checkbox" id="month-filter-future-only" checked />
  只顯示本月及未來月份
</label>
```

- 勾選狀態變更仍觸發既有 `change` → `renderCalendar()`。

#### Header（匯入 + 目前人員，不遷移）

```html
<!-- 留在 .app-header -->
<p id="person-summary" class="person-summary" hidden>人員：維鈞</p>
<div class="toolbar">
  <input id="file-input" type="file" accept=".xlsx,.xls" hidden />
  <button type="button" id="btn-import" class="btn-primary">匯入總排班表</button>
</div>
```

**`#person-summary` 顯示規則**：

| 狀態 | 顯示 |
| ---- | ---- |
| 未匯入 | `hidden` 或不渲染 |
| 單選（Phase 1） | `人員：{目前 select 的 option 文字}`，例：`人員：維鈞`、`人員：其他` |
| 多選（Phase 3） | `人員：{名稱1}、{名稱2}、…`，例：`人員：維鈞、鴨子`；順序與勾選一致 |
| 多選但僅一人 | 仍為 `人員：維鈞`（單名不加頓號） |

- 分隔符號：**全形頓號 `、`**。
- **唯讀展示**；變更人員請用導航「人員」sheet（summary 本身不必可點，除非日後產品要點擊開 sheet）。

#### `#sheet-more`（更多）— Phase 1 不實作

- 導航保留「更多」按鈕以預留位置；**點擊無反應**。
- Phase 4 再新增 sheet 與匯出按鈕（見 §6.4）。

### 4.5 空狀態引導（建議，Phase 1 可選）

尚未匯入（`parsed === null`）時，`#calendar-root` 可顯示短文：

> 請點上方 **「匯入總排班表」**

匯入入口在 header，無需引導至底欄「更多」。

### 4.6 Phase 1 測試清單

| # | 案例 | 預期 |
| - | ---- | ---- |
| 1 | 點 header「匯入總排班表」 | 與改版前相同，可選檔並解析 |
| 2 | 匯入 `example/shiftTotalTable.xlsx` | 人員列表正確 |
| 3 | 人員 sheet 切換人員 | 月曆、圖例即時更新；header 顯示 `人員：{名稱}` 與選項一致 |
| 3b | 捲動頁面後 | header（含人員文字）隨內容捲走，**不**固定於視窗頂端 |
| 4 | 檢視 sheet 勾選／取消「只顯示本月及未來月份」 | 月份區塊顯示／隱藏與改版前一致 |
| 5 | 點「更多」 | **無 sheet 彈出、無錯誤** |
| 6 | 捲動至最後一個月份 | 導航仍可點；最後一個月不被底欄／側欄遮住 |
| 7 | 開啟 sheet 後點遮罩、按 Esc | sheet 關閉，月曆可操作 |
| 8 | 手機直向（底欄模式） | 底欄不擋內容；三鍵置中；sheet 可捲；匯入可點 |
| 8b | 手機橫向（右側欄模式） | 無底欄佔高；右側三鍵可點；月曆可視高度明顯大於底欄方案 |
| 8c | 桌面（≥768px，右側欄） | 右側欄固定；主內容 `padding-right` 正確；sheet 正常 |
| 9 | 選取「其他」 | 行為與 `develop-plan.md` 一致 |
| 10 | 旋轉螢幕直向↔橫向 | 導航自動切換底欄／右側欄；無重複按鈕、功能正常 |

### 4.7 Phase 1 交付物

- 更新：`index.html`、`styles.css`、`src/main.js`
- 若部署 `docs/`：執行 build 後同步靜態輸出
- **不**變更：`src/parseShiftWorkbook.js`、解析資料模型

---

## 5. 輕量提示與 header 人員文字

### 5.1 Header 目前人員（Phase 1 必做）

- 位置：**header 內** `#person-summary`，與標題、匯入按鈕同區。
- 性質：**唯讀摘要**，隨 header 捲動；**不是**獨立 sticky 狀態列。
- 與導航「人員」sheet 的 `<select>`（或未來多選）保持同步。

### 5.2 可選輕量提示（導航／sheet）

以下僅在 **導航按鈕**（底欄或右側欄）或 **sheet 內** 提供額外線索，Phase 1 可省略：

| 位置 | 時機 | 呈現 |
| ---- | ---- | ---- |
| 「人員」按鈕 | Phase 3 多選後，已選人數 ≠ 全部 | 按鈕角標數字（可選；header 已有全名列表時非必須） |
| 「檢視」按鈕 | 任一檢視選項偏離預設 | 小圓點 |
| Sheet 標題下方 | 打開檢視 sheet 時 | 一行小字摘要（僅 sheet 內） |

---

## 6. 未來功能與擺放位置

以下功能**尚未實作**。檢視／人員／匯出類選項放入對應 Sheet；**匯入**固定留在 header，不放入「更多」。

### 6.1 總覽表

| 功能 | 優先建議 | 放置位置 | 控制元件 | 備註 |
| ---- | -------- | -------- | -------- | ---- |
| 目前人員顯示 | Phase 1 | **header** `#person-summary` | 唯讀文字 | 單選：`人員：維鈞`；多選：`人員：維鈞、鴨子`；不 sticky |
| 人員多選 | Phase 3 | **人員** sheet | Checkbox 清單 + 搜尋 + 全選／清除 +「套用」 | 取代單一 `<select>`；同步更新 header 人員文字；月曆合併顯示 |
| 只顯示本月及未來月份 | ✅ 已有 | **檢視** sheet | Checkbox | Phase 1 遷移 |
| 顯示／不顯示地點 | Phase 2 | **檢視** sheet → 區塊「卡片內容」 | Checkbox | 影響 `fillEventCard`，不必重算月份清單 |
| 顯示／不顯示期別 | Phase 2 | **檢視** sheet → 區塊「卡片內容」 | Checkbox | 同上 |
| 顯示／不顯示空白月份 | Phase 2 | **檢視** sheet → 區塊「月份範圍」 | Checkbox | 與「未來月份」同區；需定義「空白月」定義 |
| 月曆模式／清單模式 | Phase 2 | **檢視** sheet → 區塊「檢視模式」 | Segmented control（互斥） | 切換 `#calendar-root` 渲染器 |
| 重設檢視為預設 | Phase 2 | **檢視** sheet 底部 | 文字按鈕 | 還原各 checkbox／模式預設值 |
| 匯入總排班表 | ✅ 已有 | **header**（常駐） | 主按鈕 | **不遷移**；進站首要操作 |
| 匯出 PDF | Phase 4 | **更多** sheet | 次按鈕 | 依「目前人員 + 檢視篩選」；可用 print CSS 或 html2pdf |
| 匯出 Excel／CSV | Phase 4 | **更多** sheet | 次按鈕 | 瀏覽器下載；文案可寫「下載 CSV」 |
| 檢視偏好記憶 | Phase 2+ | （無獨立 UI） | `localStorage` | 鍵名如 `shiftSchedule.viewSettings` |
| 回到本月 | 可選 | 頂部 header 或 **檢視** sheet | 小連結／按鈕 | 捲動至當月區塊；非必要 |

### 6.2 「檢視」Sheet 分組（Phase 2 目標結構）

```
檢視設定
────────────────
【月份範圍】
  ☐ 只顯示本月及未來月份     ← 已有
  ☐ 顯示空白月份             ← 未來

【卡片內容】
  ☐ 顯示地點                 ← 未來
  ☐ 顯示期別                 ← 未來

【檢視模式】
  ( 月曆 | 清單 )            ← 未來，互斥

[ 重設為預設 ]
```

### 6.3 「人員」Sheet（Phase 3 目標結構）

```
人員
已選 3 / 12 人          ← sheet 內輔助（可選）；header 同步顯示「人員：A、B、C」
────────────────
[ 🔍 搜尋人員... ]

☑ 王小明
☑ 李大華
☐ 陳小美
...
☑ 其他                  ← 固定選項，對應 OTHER_KEY

[ 全選 ]  [ 清除 ]      [ 套用 ]
```

**產品規則（建議）**：多選時月曆採**合併顯示**（同日多張卡，卡上標示人名）；清單模式則**依人分組**。

### 6.4 「更多」Sheet（Phase 4 目標結構）

> 匯入不在此 sheet；匯入按鈕始終在 **header**。

```
更多
────────────────
📄 匯出 PDF（目前檢視）
📊 下載 Excel / CSV（目前檢視）

匯出範圍說明（小字）：
  將匯出已選 N 位人員、依目前檢視篩選…
```

Phase 1：底欄「更多」可見，**點擊不開啟**上述內容。

---

## 7. 建議實作階段

| 階段 | 內容 | 影響範圍 |
| ---- | ---- | -------- |
| **Phase 1** | 響應式三鍵導航（直向底欄／橫向與桌面右側欄）；人員／檢視 sheet；header 匯入 + `#person-summary`；「更多」暫無反應 | `index.html`、`styles.css`、`main.js`（殼層） |
| **Phase 2** | `viewSettings` 物件；地點／期別／空白月／月曆清單切換；localStorage | `main.js`、`styles.css` |
| **Phase 3** | 人員多選；合併月曆／清單分組；底欄角標 | `main.js`、可能調整 `collectMonths` / `buildMonth` |
| **Phase 4** | PDF／CSV 匯出；匯出範圍說明 | 新模組或 `export.js`、print 樣式 |

Phase 1 完成並通過 §4.6 測試後，再進行 Phase 2；各階段均可獨立 PR。

---

## 8. 程式架構建議（Phase 2 起）

Phase 1 可維持現有全域變數與 `getElementById`。Phase 2 起建議收斂為：

```js
/** @type {ViewSettings} */
const viewSettings = {
  futureMonthsOnly: true,   // 對應 month-filter-future-only
  showLocation: true,       // 未來
  showPeriod: true,         // 未來
  showEmptyMonths: false,   // 未來
  displayMode: 'calendar',  // 'calendar' | 'list' 未來
};

/** @type {string[]} */
let selectedPeople = [];    // Phase 3；Phase 1 仍用 person-select 單值
```

- `renderCalendar()` 改讀 `viewSettings` 與 `selectedPeople`。
- `updatePersonSummary()`：Phase 1 讀 `personSelect` 單值；Phase 3 改讀 `selectedPeople.join('、')` 前綴 `人員：`。
- Sheet 內 control 只負責更新狀態並呼叫 `render()`。

---

## 9. 響應式與無障礙

### 9.1 導航斷點（已定案）

| 模式 | 條件（滿足任一即為右側欄） | 導航位置 |
| ---- | -------------------------- | -------- |
| **底欄**（預設） | 其餘情況（以**手機直向**為主） | 底部橫排，三鍵置中成組 |
| **右側欄** | `min-width: 768px` | 視窗右側固定直欄 |
| **右側欄** | `min-width: 600px` **且** `orientation: landscape` | 同上（涵蓋手機橫向） |

建議 CSS 範例：

```css
/* 預設：底欄 */
.main-nav { bottom: 0; left: 0; right: 0; /* ... */ }

@media (min-width: 768px),
       (min-width: 600px) and (orientation: landscape) {
  /* 右側欄 */
  .main-nav {
    top: 0; bottom: 0; right: 0; left: auto;
    width: var(--nav-rail-width, 64px);
  }
  body { padding-bottom: 0; padding-right: calc(var(--nav-rail-width, 64px) + env(safe-area-inset-right)); }
}
```

### 9.2 其他

| 項目 | 說明 |
| ---- | ---- |
| Sheet | 各模式皆用 Bottom Sheet；橫向／桌面不另做置中 Modal |
| 主內容寬度 | 仍可 `max-width: 900px` 置中；右側欄佔 viewport 右緣，不擠進 900px 欄內 |
| 焦點 | 開啟 sheet 時焦點移入第一個可互動元素；關閉後焦點回到 `#main-nav` 觸發按鈕 |
| `aria` | `aria-expanded`、`aria-modal`、`role="dialog"` 於 sheet 面板 |

---

## 10. 檔案清單

| 檔案 | Phase 1 | 後續 |
| ---- | ------- | ---- |
| `index.html` | `#main-nav`（底欄／右側欄）；人員／檢視 sheet；header 匯入 + `#person-summary` | 「更多」sheet、匯出按鈕 |
| `styles.css` | 響應式 `#main-nav`、sheet、`.person-summary`、`padding-bottom` / `padding-right` | 清單模式、print 樣式 |
| `src/main.js` | sheet 開關；`updatePersonSummary()` | viewSettings、多選、匯出 |
| `src/parseShiftWorkbook.js` | 不變 | 不變（除非匯出需額外 API） |
| `src/export.js`（新建） | — | Phase 4 匯出邏輯 |
| `develop-plan.md` | 可選：第 5 節 UI 表補充「操作改由底欄」 | 與本文件交叉引用 |

---

## 11. 修訂紀錄

| 日期 | 說明 |
| ---- | ---- |
| 2026-05-15 | 初版：底部三鍵方案、Phase 1 遷移步驟、未來功能擺放位置 |
| 2026-05-15 | 匯入改為常駐 header；Phase 1「更多」暫無反應；匯出仍規劃於「更多」sheet |
| 2026-05-15 | header 新增 `#person-summary`（`人員：{名稱}`，多選時以頓號串接）；不 sticky |
| 2026-05-15 | 響應式導航：直向底欄；橫向手機／桌面改**右側**直欄（保留垂直空間）；斷點見 §9 |
