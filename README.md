# 資產管理 Portfolio Tracker

個人自用的多幣別資產管理 MVP。以**交易流水帳**為核心，自動推算持倉、成本、損益與現金，支援股票、ETF、債券、現金，涵蓋台股／美股與多幣別換算。

## 已實作功能

- 帳戶管理：證券戶、銀行戶、現金帳戶（各自帶幣別）
- 標的主檔：股票 / ETF / 債券 / 現金；債券可記錄票息、到期日、面額、信用評等
- 交易流水帳：買入、賣出、股利、利息、存入、提出、手續費、稅費、轉入轉出、股票分割
- 持倉計算：移動平均成本、已實現／未實現損益、投資報酬率
- 多幣別：以 TWD 為基準幣別，自動用匯率換算
- 資產配置：依標的類型、幣別、帳戶統計
- 市場資料：手動維護價格與匯率（同日期自動覆蓋）
- 提醒：缺價格或匯率時會標示並以成本／1 換算

## 技術棧

| 層 | 技術 |
|---|---|
| 後端 | Python 3.13 / Flask 3 / SQLAlchemy 2 / SQLite / Pydantic |
| 前端 | React 19 / TypeScript / Vite / Tailwind CSS v4 |
| 資料 | TanStack Query（快取與失效）、Recharts（圖表） |

## 專案結構

```
backend/
  app/
    __init__.py          app factory
    config.py            設定（DB 路徑、基準幣別）
    models.py            Account / Instrument / Transaction / Price / FxRate
    schemas.py           Pydantic 輸入驗證
    services/portfolio.py 持倉、成本、現金、配置計算核心
    api/                 REST endpoints
    cli.py               init-db / seed-demo / reset-db
  tests/test_portfolio.py 回歸測試
  data/app.db            SQLite 資料庫（自動建立）
frontend/
  src/
    pages/               總覽、交易、標的、帳戶、設定
    components/          Layout、UI、交易表單
    lib/                 API client、hooks、格式化
```

## 快速開始

前置需求：Python 3.11+、Node.js 20+。

```powershell
# 1. 安裝後端依賴
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# 2. 安裝前端依賴
cd frontend
npm install
cd ..

# 3. （選用）載入示範資料，讓畫面有內容
cd backend
..\.venv\Scripts\python.exe -m flask --app run.py seed-demo
cd ..
```

啟動（兩個終端機）：

```powershell
# 終端機 A：後端 http://127.0.0.1:5001
cd backend
..\.venv\Scripts\python.exe -m flask --app run.py run --port 5001

# 終端機 B：前端 http://localhost:5173
cd frontend
npm run dev
```

或直接執行 `.\dev.ps1` 一次開兩個視窗。

### 清空資料 / 重置

```powershell
cd backend
..\.venv\Scripts\python.exe -m flask --app run.py reset-db   # 會要求確認
```

## 計算規則

- **成本基礎**：移動平均法。
- **買入成本** = 數量 × 價格 + 手續費 + 稅費。
- **賣出已實現損益** = 賣出價金 − 手續費 − 稅費 − 平均成本 × 賣出數量。
- **現金餘額**：該帳戶所有交易的現金流加總（買入扣款、賣出入帳、股息利息入帳、存提款）。
- **市值** = 最新價格 × 數量；若該標的尚無價格，暫以平均成本估值並標記。
- **匯率**：`1 單位 base_currency = rate 單位 quote_currency`；若無直接匯率，會自動用反向匯率倒數。

## 主要 API

| Method | Path | 說明 |
|---|---|---|
| GET/POST | `/api/accounts` | 帳戶列表 / 新增 |
| PATCH/DELETE | `/api/accounts/:id` | 更新 / 刪除（有交易則阻擋） |
| GET/POST | `/api/instruments` | 標的列表 / 新增 |
| PATCH/DELETE | `/api/instruments/:id` | 更新 / 刪除 |
| GET/POST | `/api/transactions` | 交易列表（可篩選）/ 新增 |
| PATCH/DELETE | `/api/transactions/:id` | 更新 / 刪除 |
| GET | `/api/portfolio/summary` | 總資產、持倉、配置、現金、損益 |
| GET | `/api/portfolio/holdings` | 僅持倉與現金 |
| GET/POST | `/api/prices` | 價格列表 / 新增或覆蓋 |
| GET/POST | `/api/fx-rates` | 匯率列表 / 新增或覆蓋 |
| GET | `/api/meta` | 枚舉值、基準幣別 |

`/api/portfolio/summary` 支援 `?date=YYYY-MM-DD` 回溯指定日期，`?base=USD` 切換計價幣別。

## 測試

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
```

## 建議的下一步

1. **自動報價**：台股 TWSE OpenAPI、美股 Yahoo Finance，加一個每日排程更新 `prices`。
2. **自動匯率**：央行或 exchangerate API 更新 `fx_rates`。
3. **淨值走勢**：用歷史價格重算每日總資產，畫折線圖。
4. **報酬率**：TWR / XIRR、與基準指數比較。
5. **債券分析**：YTM、存續期間、到期現金流表。
6. **CSV 匯入匯出**：從券商對帳單批次匯入、備份。
7. **交易編輯 / 複製**：目前只支援新增與刪除。
8. **目標配置**：設定目標比例，計算再平衡建議。
9. **登入與加密**：若要放到雲端或手機存取。

## 注意事項

- 目前沒有登入機制，設計為本機單人使用。
- 所有資料在 `backend/data/app.db`，備份直接複製這個檔案即可。
- 價格與匯率需手動維護，尚未接任何外部 API。
