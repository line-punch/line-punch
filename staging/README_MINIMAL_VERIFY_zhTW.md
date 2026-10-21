# Attendance V2 — 專用 LINE Token 驗證服務（僅隔離測試）

## 為何不直接公開原測試 Apps Script？

`YC_ATTENDANCE_V2_TEST_GAS` 已有模擬員工、打卡、請假及主管審核函式。雖然它使用測試資料，但 Google Apps Script 的網頁應用程式如果選擇「執行身分：我、誰可以存取：任何人」，會讓外部能嘗試使用該專案的公開入口。為了達成此階段**只有登入驗證，完全不能寫資料**的目的，不能直接讓原測試專案公開。

## 最小獨立專案

1. 在打卡專用 Google 帳號下，於 Apps Script 首頁建立**全新獨立專案**，命名 `YC_ATTENDANCE_V2_LOGIN_VERIFY_ONLY`。
2. 用 [`AttendanceV2_MinimalVerifyService.gs`](./AttendanceV2_MinimalVerifyService.gs) **整份取代**新專案中的預設 `程式碼.gs`。不需要新增其他 `.gs` 或 HTML，不要複製已存在的出勤後端程式。
3. 新專案「專案設定 → 指令碼屬性」只需要：
   - `LINE_LOGIN_CHANNEL_ID` = `2012136707`
   - `ATTENDANCE_V2_BRIDGE_MODE` = `verify_only`
4. 驗證原始碼和權限畫面後，在使用者明確同意時，單獨部署這個**沒有任何試算表存取**的新 Web App。採「執行身分：我」，測試前確認適當「誰可以存取」權限。不應使用正式 Channel 或員工登入資訊。
5. 取得新測試 `/exec` 網址後，在 `line-punch/attendance-v2-test` 的**未發布分支** `feature/verify-only-backend-probe-20261021` 更新 `CONFIG.api`，先完成代碼及跨網域測試，再將它合併／發布至測試網站（不要修改正式打卡網站）。
6. 從獨立測試 LIFF `2012136707-2dDU0aSJ` 驗證真實 ID Token。成功只能顯示「後端身分驗證成功」，不提供任何打卡、請假、員工資料查詢。

## 安全條件

- 新服務只有 `doPost` 的 `verify`、文字 `doGet`，沒有 `SpreadsheetApp`、`google.script.run`、員工資料讀取及任何寫入動作。
- 不儲存或回傳 LINE ID Token、LINE userId、密碼、個資。
- 腳本屬性設定錯誤時一律拒絕。
- 目前 19/19 項離線模擬測試已通過，**尚未進行實際 Google／LINE 跨網站測試**。
- 保留原 `YC_ATTENDANCE_V2_TEST_GAS` 的「只有我自己」存取設定，**不得為此次登入測試放寬它的權限**。
- 正式 `line-punch/line-punch` main、正式 LIFF、正式打卡 Sheet 均不得修改。

原先使用者已貼入的 `AttendanceV2_FormPostBridge.gs` 可暫時留在既有測試專案中，但不要部署為 Anyone；它目前沒有啟用 `ATTENDANCE_V2_BRIDGE_MODE` 時會拒絕請求。上線／清理時再移除。
