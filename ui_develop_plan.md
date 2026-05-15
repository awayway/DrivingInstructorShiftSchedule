# UI 改版開發計劃（底欄／右側欄導航 + 置中 Dialog）

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
| 面板形式 | **置中 Dialog**（`role="dialog"` + 全螢幕遮罩）；面板在視窗**中央**顯示，可較大、內容區可上下捲動；**不用** Bottom Sheet（自底部滑出、可視區小、操作需多點一層） |
| 匯入按鈕 | **保留在 header**（不遷移到底欄「更多」）；進站後首要操作、重新匯入頻率低，置頂較明顯 |
| 「更多」Phase 1 | 導航按鈕可先存在，**點擊暫不開啟 dialog**（無反應）；待 Phase 4 匯出功能再實作內容 |
| 目前人員顯示 | **header 內一行文字**（如 `人員：維鈞`）；隨 header **一起捲走**，**不 sticky**；與「人員」dialog 內選取同步更新 |
| 人員選擇 UI | 點「人員」→ dialog 內直接列出**所有人員的 radio**（含「其他」）；**不用** dialog 內再嵌 `<select>` 下拉 |
| 檢視設定 UI | 點「檢視」→ 置中 dialog 顯示目前檢視項目（checkbox 等），**不用** sheet |
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

#### 1.2.2 為何採置中 Dialog（非 Bottom Sheet）

**已定案：人員／檢視以置中 Dialog 承載，不再使用自底部滑出的 Sheet。**

| 考量 | 置中 Dialog（採用） | Bottom Sheet（不採用） |
| ---- | ------------------- | ---------------------- |
| 可視面積 | 面板可設較大 `max-width`／`max-height`，置中蓋在畫面上 | 貼底、高度受限，手機上易覺得「卡在下面」 |
| 人員選擇 | 一鍵開 dialog 即可點選所有人員（radio） | 常需「開 sheet → 再點下拉」兩步 |
| 長清單 | dialog **內容區**可 `overflow-y: auto` 捲動 | 同樣可捲，但底部區塊心理與實際空間都較擠 |
| 檢視設定 | 置中一覽目前選項，與人員 dialog 體驗一致 | 與人員面板形式不一致 |
| 橫向手機 | 中央大面板較不受底部／極矮視窗限制 | 底部 sheet 更壓縮月曆剩餘高度 |

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

點擊導航按鈕 → 開啟對應 **置中 Dialog**（全螢幕遮罩 + 中央面板）：

```
        ┌─────────────────────────┐
        │░░░░░░ 半透明遮罩 ░░░░░░░░│
        │░░  ┌───────────────┐ ░░│
        │░░  │  Dialog 標題   │ ░░│  ← 視窗中央
        │░░  │  （可捲動內容） │ ░░│
        │░░  └───────────────┘ ░░│
        │░░░░░░░░░░░░░░░░░░░░░░░░│
```

| 導航按鈕 | Dialog ID（建議） | Phase 1 | 未來 |
| -------- | ----------------- | ------- | ---- |
| **人員** | `#dialog-people` | **Radio 清單**列出所有人員（含「其他」）；選取即切換 | 多選 checkbox 清單（仍於置中 dialog） |
| **檢視** | `#dialog-view` | 「只顯示本月及未來月份」checkbox | 地點／期別／空白月／月曆清單模式等 |
| **更多** | `#dialog-more` | **點擊無反應**（不開 dialog） | 匯出 PDF、Excel／CSV 等 |

---

## 3. 現況對照（遷移前）

目前控制項位於 [`index.html`](./index.html) 的 `.toolbar`：

| 控制項 | DOM / ID | Phase 1 處置 | 邏輯綁定（[`src/main.js`](./src/main.js)） |
| ------ | -------- | ------------ | ------------------------------------------- |
| 匯入 | `#btn-import` → `#file-input` | **留在 header** | `btnImport` click、`fileInput` change |
| 人員 | `#person-select`（舊） | 改為 **人員 dialog** 內 **radio 群組**；以 `selectedPerson`（或 `name="current-person"` 之 radio）驅動月曆 | 選取變更 → `renderCalendar`、`fillLegend`、`updatePersonSummary` |
| 月份篩選 | `#month-filter-future-only` | 遷至 **檢視** dialog（id 可保留） | `change` → `renderCalendar` |

**遷移原則**：調整 DOM 與互動（sheet → dialog、select → radio）；**不改變** `parseShiftWorkbook`、`renderCalendar`、`applyFutureMonthFilter` 等核心邏輯與資料模型。匯入相關 DOM **不移動**。

> **實作備註**：2026-05-15 曾以 Bottom Sheet + `<select>` 完成 Phase 1 初版；下列 §4 為 **Dialog + radio** 定案，待確認後改 code。

---

## 4. Phase 1：三鍵導航 + 置中 Dialog（不影響功能）

> **目標**：使用者從底欄或右側欄開啟**置中 Dialog**操作（依斷點自動切換）；人員**一鍵選取**（radio）；檢視設定於中央 dialog 調整；月曆行為與現版一致。

### 4.1 HTML（`index.html`）

1. **header 內 `.toolbar` 精簡為匯入 + 目前人員摘要**：
   - 保留 `#btn-import`、`#file-input`（`hidden`）。
   - **新增** `#person-summary`（建議 `<p class="person-summary">`）：顯示目前選取人員，格式 **`人員：{名稱}`**；尚未匯入或無選取時 `hidden` 或留空。
   - 移除 toolbar 內舊版 `#person-select`、`#month-filter-future-only`（改放 dialog）。
2. **新增**：
   - `<nav id="main-nav" class="main-nav">`：內層 `.main-nav__actions`，三個 `<button type="button">`（建議 `data-dialog="people|view|more"`）。**僅一組 DOM**；CSS 依 §9 切換底欄／右側欄。
   - **Phase 1 僅實作** `#dialog-people`、`#dialog-view`（結構見 §4.4）；共用 `#dialog-overlay` 或各 dialog 共用一層遮罩。
   - `#dialog-more` 可**不建 DOM**；「更多」**不綁定** `openDialog('more')`。
3. **錯誤橫幅** `#error-banner` 仍留在 `header` 內。
4. **Dialog 骨架（建議）**：
   - `#dialog-overlay`：全螢幕遮罩，`aria-hidden` 與 `[hidden]` 控制顯示。
   - `.dialog`：置中面板，`role="dialog"`、`aria-modal="true"`、標題列 + 可捲動 `.dialog__body` + 可選關閉鈕。

### 4.2 CSS（`styles.css`）

| 樣式類別 | 說明 |
| -------- | ---- |
| `.main-nav`（底欄／右側欄） | 同前 §9；與 dialog 無關 |
| `body` 主內容留白 | 底欄 `padding-bottom`／右側欄 `padding-right`；**dialog 開啟時**另加 `overflow: hidden` 於 `body`（可選 class `dialog-open`） |
| `#dialog-overlay` | `position: fixed; inset: 0`；半透明背景；`display: flex; align-items: center; justify-content: center`（或由 overlay 內層負責置中） |
| `.dialog` | 置中；`width: min(92vw, 420px)`（人員可略寬，如 `min(92vw, 480px)`）；`max-height: min(85vh, 640px)`；`border-radius`；陰影；**不**貼底 |
| `.dialog__body` | `overflow-y: auto`；`-webkit-overflow-scrolling: touch`；人員清單長時在此區捲動 |
| `.person-radio-list` | 垂直排列；每項為 `label` + `input[type=radio]` 或按鈕式 radio；觸控目標高度建議 ≥ 44px |
| `.dialog[hidden]` / `#dialog-overlay[hidden]` | 關閉狀態 |

**移除** Bottom Sheet 專用樣式（如 `.sheet-panel { bottom: 0 }`、自底部滑入動畫）；改為置中淡入／scale（可選，非必須）。

### 4.3 JavaScript（`src/main.js`）

**Phase 1 殼層邏輯（Dialog 版），不 refactor 解析／月曆核心：**

1. `openDialog(name)` / `closeAllDialogs()`（`name` 僅 `'people' | 'view'`）；同一按鈕可 toggle 關閉。
2. 「人員」「檢視」click → 開啟對應 dialog；「更多」→ **不處理**。
3. 遮罩 click、`Escape`、標題列關閉鈕 → 關閉 dialog。
4. **`fillPersonRadios()`**（取代或併用 `fillPersonSelect`）：匯入後依 `parsed.people` + 「其他」動態建立 radio；`checked` 對應目前選取人員。
5. **`selectedPerson`**（字串）或讀取 `input[name="current-person"]:checked`：驅動 `renderCalendar`、`fillLegend`；**不再依賴** `<select id="person-select">`。
6. radio **`change`**（或點選後）：更新月曆與圖例、`updatePersonSummary()`；建議 **立即關閉**人員 dialog（少遮擋、少一步）。
7. **`updatePersonSummary()`**：依目前選取人員顯示 `人員：{名稱}`。
8. **不修改** `parseShiftWorkbook`、`renderCalendar`、`applyFutureMonthFilter` 等核心邏輯。

`#month-filter-future-only` 留在檢視 dialog，`id` 可保留。`btnImport`、`fileInput`、**`#person-summary`** **始終在 header**。

### 4.4 Dialog 內容（Phase 1 最小集合）

#### `#dialog-people`（人員）

```html
<!-- 語意結構示意 -->
<div id="dialog-people" class="dialog" role="dialog" aria-labelledby="dialog-people-title" hidden>
  <header class="dialog__header">
    <h2 id="dialog-people-title">人員</h2>
    <button type="button" class="dialog__close" aria-label="關閉">×</button>
  </header>
  <div class="dialog__body person-radio-list" role="radiogroup" aria-labelledby="dialog-people-title">
    <!-- 由 JS 動態填入，匯入前可 disabled 或顯示「請先匯入」 -->
    <label class="person-radio">
      <input type="radio" name="current-person" value="維鈞" />
      <span>維鈞</span>
    </label>
    <!-- …每位人員一項… -->
    <label class="person-radio">
      <input type="radio" name="current-person" value="其他" />
      <span>其他</span>
    </label>
  </div>
</div>
```

**互動規則（Phase 1）**：

| 項目 | 規則 |
| ---- | ---- |
| 控制元件 | **Radio**（`name="current-person"`），每人一項；尾端固定 **「其他」** |
| 開啟時機 | 點底欄／右側欄「人員」；未匯入時可開啟但僅提示「請先匯入總排班表」或 radio 全 disabled |
| 選取後 | 月曆、圖例、header `#person-summary` 即時更新；**建議選完即關閉 dialog** |
| 長清單 | `.dialog__body` 內垂直捲動；標題列固定不捲（可選 `position: sticky` 於 header） |
| 與舊版差異 | **不再使用** dialog 內 `<select>`，避免「開面板 → 再開下拉」 |

#### `#dialog-view`（檢視）

```html
<div id="dialog-view" class="dialog" role="dialog" aria-labelledby="dialog-view-title" hidden>
  <header class="dialog__header">
    <h2 id="dialog-view-title">檢視設定</h2>
    <button type="button" class="dialog__close" aria-label="關閉">×</button>
  </header>
  <div class="dialog__body">
    <label class="month-filter-toggle">
      <input type="checkbox" id="month-filter-future-only" checked />
      只顯示本月及未來月份
    </label>
  </div>
</div>
```

- 勾選變更 → `renderCalendar()`；檢視項少，dialog 可不強制選完即關（使用者調完多項後點遮罩關閉即可）。

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
| 單選（Phase 1） | `人員：{目前 radio 選取之顯示名稱}`，例：`人員：維鈞`、`人員：其他` |
| 多選（Phase 3） | `人員：{名稱1}、{名稱2}、…`，例：`人員：維鈞、鴨子`；順序與勾選一致 |
| 多選但僅一人 | 仍為 `人員：維鈞`（單名不加頓號） |

- 分隔符號：**全形頓號 `、`**。
- **唯讀展示**；變更人員請用導航「人員」dialog（summary 本身不必可點，除非日後產品要點擊開 dialog）。

#### `#dialog-more`（更多）— Phase 1 不實作

- 導航保留「更多」按鈕以預留位置；**點擊無反應**。
- Phase 4 再新增 dialog 與匯出按鈕（見 §6.4）。

### 4.5 空狀態引導（建議，Phase 1 可選）

尚未匯入（`parsed === null`）時，`#calendar-root` 可顯示短文：

> 請點上方 **「匯入總排班表」**

匯入入口在 header，無需引導至底欄「更多」。

### 4.6 Phase 1 測試清單

| # | 案例 | 預期 |
| - | ---- | ---- |
| 1 | 點 header「匯入總排班表」 | 與改版前相同，可選檔並解析 |
| 2 | 匯入 `example/shiftTotalTable.xlsx` | 人員列表正確 |
| 3 | 點「人員」→ dialog 內 **radio 直接選人**（無下拉） | 月曆、圖例即時更新；header `人員：{名稱}` 一致；選後 dialog 關閉（若採用建議） |
| 3a | 人員很多時 | dialog 內容區可上下捲動；標題列仍可見 |
| 3b | 捲動頁面後 | header（含人員文字）隨內容捲走，**不**固定於視窗頂端 |
| 4 | 點「檢視」→ 置中 dialog 勾選／取消「只顯示本月及未來月份」 | 月份區塊與改版前一致 |
| 5 | 點「更多」 | **無 dialog 彈出、無錯誤** |
| 6 | 捲動至最後一個月份 | 導航仍可點；最後一個月不被底欄／側欄遮住 |
| 7 | 開啟 dialog 後點遮罩、關閉鈕、按 Esc | dialog 關閉，月曆可操作 |
| 8 | 手機直向（底欄模式） | 底欄不擋內容；dialog **置中**、夠大、可捲；非貼底 sheet |
| 8b | 手機橫向（右側欄模式） | 無底欄佔高；右側三鍵可點；置中 dialog 正常 |
| 8c | 桌面（≥768px，右側欄） | 右側欄固定；置中 dialog `max-width` 合理 |
| 9 | 選取「其他」 | 行為與 `develop-plan.md` 一致 |
| 10 | 旋轉螢幕直向↔橫向 | 導航自動切換底欄／右側欄；dialog 仍置中、功能正常 |

### 4.7 Phase 1 交付物

- 更新：`index.html`、`styles.css`、`src/main.js`（自 Bottom Sheet 版改為 **Dialog + radio**）
- 若部署 `docs/`：執行 build 後同步靜態輸出
- **不**變更：`src/parseShiftWorkbook.js`、解析資料模型

### 4.8 Phase 1 修訂：Sheet → Dialog（待實作）

| 項目 | 初版（已實作） | 修訂定案（待改 code） |
| ---- | -------------- | --------------------- |
| 面板 | Bottom Sheet 貼底 | **置中 Dialog** |
| 人員選擇 | `<select>` 於 sheet 內 | **Radio 清單**，點「人員」即可選 |
| DOM id | `#sheet-people`、`#sheet-view` | 建議改 `#dialog-people`、`#dialog-view`（或保留 id 僅改 class／行為） |
| JS API | `openSheet` / `closeAllSheets` | `openDialog` / `closeAllDialogs` |

---

## 5. 輕量提示與 header 人員文字

### 5.1 Header 目前人員（Phase 1 必做）

- 位置：**header 內** `#person-summary`，與標題、匯入按鈕同區。
- 性質：**唯讀摘要**，隨 header 捲動；**不是**獨立 sticky 狀態列。
- 與導航「人員」dialog 內 radio（或未來多選 checkbox）保持同步。

### 5.2 可選輕量提示（導航／dialog）

以下僅在 **導航按鈕**（底欄或右側欄）或 **dialog 內** 提供額外線索，Phase 1 可省略：

| 位置 | 時機 | 呈現 |
| ---- | ---- | ---- |
| 「人員」按鈕 | Phase 3 多選後，已選人數 ≠ 全部 | 按鈕角標數字（可選；header 已有全名列表時非必須） |
| 「檢視」按鈕 | 任一檢視選項偏離預設 | 小圓點 |
| Dialog 標題下方 | 打開檢視 dialog 時 | 一行小字摘要（僅 dialog 內） |

---

## 6. 未來功能與擺放位置

以下功能**尚未實作**。檢視／人員／匯出類選項放入對應**置中 Dialog**；**匯入**固定留在 header，不放入「更多」。

### 6.1 總覽表

| 功能 | 優先建議 | 放置位置 | 控制元件 | 備註 |
| ---- | -------- | -------- | -------- | ---- |
| 目前人員顯示 | Phase 1 | **header** `#person-summary` | 唯讀文字 | 單選：`人員：維鈞`；多選：`人員：維鈞、鴨子`；不 sticky |
| 人員多選 | Phase 3 | **人員** dialog | Checkbox 清單 + 搜尋 + 全選／清除 +「套用」 | 取代 radio 單選；同步更新 header；月曆合併顯示 |
| 只顯示本月及未來月份 | ✅ 已有 | **檢視** dialog | Checkbox | Phase 1 遷移 |
| 顯示／不顯示地點 | Phase 2 | **檢視** dialog → 區塊「卡片內容」 | Checkbox | 影響 `fillEventCard`，不必重算月份清單 |
| 顯示／不顯示期別 | Phase 2 | **檢視** dialog → 區塊「卡片內容」 | Checkbox | 同上 |
| 顯示／不顯示空白月份 | Phase 2 | **檢視** dialog → 區塊「月份範圍」 | Checkbox | 與「未來月份」同區；需定義「空白月」定義 |
| 月曆模式／清單模式 | Phase 2 | **檢視** dialog → 區塊「檢視模式」 | Segmented control（互斥） | 切換 `#calendar-root` 渲染器 |
| 重設檢視為預設 | Phase 2 | **檢視** dialog 底部 | 文字按鈕 | 還原各 checkbox／模式預設值 |
| 匯入總排班表 | ✅ 已有 | **header**（常駐） | 主按鈕 | **不遷移**；進站首要操作 |
| 匯出 PDF | Phase 4 | **更多** dialog | 次按鈕 | 依「目前人員 + 檢視篩選」；可用 print CSS 或 html2pdf |
| 匯出 Excel／CSV | Phase 4 | **更多** dialog | 次按鈕 | 瀏覽器下載；文案可寫「下載 CSV」 |
| 檢視偏好記憶 | Phase 2+ | （無獨立 UI） | `localStorage` | 鍵名如 `shiftSchedule.viewSettings` |
| 回到本月 | 可選 | 頂部 header 或 **檢視** dialog | 小連結／按鈕 | 捲動至當月區塊；非必要 |

### 6.2 「檢視」Dialog 分組（Phase 2 目標結構）

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

### 6.3 「人員」Dialog（Phase 3 目標結構）

```
人員                    ← 置中 dialog
已選 3 / 12 人          ← dialog 內輔助（可選）；header 同步顯示「人員：A、B、C」
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

### 6.4 「更多」Dialog（Phase 4 目標結構）

> 匯入不在此 dialog；匯入按鈕始終在 **header**。

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
| **Phase 1** | 響應式三鍵導航；人員／檢視 **置中 Dialog**（人員為 **radio**）；header 匯入 + `#person-summary`；「更多」暫無反應 | `index.html`、`styles.css`、`main.js`（殼層） |
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
let selectedPeople = [];    // Phase 3；Phase 1 用 selectedPerson 單值（radio）
```

- `renderCalendar()` 改讀 `viewSettings` 與 `selectedPeople`。
- `updatePersonSummary()`：Phase 1 讀 `selectedPerson`（radio）；Phase 3 改讀 `selectedPeople.join('、')` 前綴 `人員：`。
- Dialog 內 control 只負責更新狀態並呼叫 `render()`。

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
| Dialog | 人員／檢視／未來「更多」皆用**同一套置中 Dialog**；手機直向／橫向／桌面一致，不另做貼底 Sheet |
| 主內容寬度 | 仍可 `max-width: 900px` 置中；右側欄佔 viewport 右緣；Dialog 以 viewport 置中，寬度 `min(92vw, 420–480px)` |
| 焦點 | 開啟 dialog 時焦點移入第一個 radio／checkbox；關閉後焦點回到 `#main-nav` 觸發按鈕 |
| `aria` | `aria-expanded` 於導航按鈕；`aria-modal="true"`、`role="dialog"` 於 `.dialog`；人員區 `role="radiogroup"` |
| 捲動 | 僅 `.dialog__body` 捲動；背景 `body` 在 dialog 開啟時避免穿透捲動（`overflow: hidden`） |

---

## 10. 檔案清單

| 檔案 | Phase 1 | 後續 |
| ---- | ------- | ---- |
| `index.html` | `#main-nav`；`#dialog-people`（radio）、`#dialog-view`；header 匯入 + `#person-summary` | 「更多」dialog、匯出按鈕 |
| `styles.css` | 響應式 `#main-nav`、置中 `.dialog`、`.person-radio-list`、`.person-summary` | 清單模式、print 樣式 |
| `src/main.js` | `openDialog`／`closeAllDialogs`；`fillPersonRadios`；`updatePersonSummary()` | viewSettings、多選、匯出 |
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
| 2026-05-15 | **面板改置中 Dialog**（不用 Bottom Sheet）；人員改 **radio 清單**（不用 dialog 內 select）；檢視亦用置中 dialog；§4.8 對照初版實作 |
