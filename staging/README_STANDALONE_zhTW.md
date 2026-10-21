# 打卡系統 V2.0：獨立 Apps Script 測試專案（備案）

當 Google Sheet 的「擴充功能 → Apps Script」持續出現「找不到網頁」時，使用這個**獨立專案**方案，不再依賴試算表綁定。

## 先做這一步

1. 關閉「找不到網頁」分頁，回到可正常使用的 Apps Script「我的專案」。
2. 確認右上角登入的是**打卡專用 Google 帳號**。
3. 點選「新專案」，建立新的獨立 Apps Script 專案。
4. 建議命名 `YC_ATTENDANCE_V2_TEST_GAS`。
5. **先不要貼程式、部署或執行**，先確認這是新專案、與正式打卡專案不同。

## 開發完成後的預計安裝內容

- `AttendanceV2_StandaloneBundle.gs`：獨立測試後端，使用 `SpreadsheetApp.openById()`，不需要綁定試算表。
- `AttendanceV2_SecurePortal.html`：同專案的一個 HTML 檔案，名稱必須是 `AttendanceV2_SecurePortal`。
- 指定測試試算表：`YC_ATTENDANCE_V2_TEST_ONLY`（必須是新建立的空白表，不能複製正式員工資料）。

## 安全設定（要等後端完成後再操作）

在**新獨立專案**的「專案設定 → 指令碼屬性」設定：

- `ATTENDANCE_V2_TEST`：`enabled`
- `ATTENDANCE_V2_TEST_SHEET_ID`：**新空白測試 Google Sheet 的檔案 ID**；此值不是正式出勤表 ID。
- 以後才設定 `LINE_LOGIN_CHANNEL_ID` 和獨立的 `STAGING_LIFF_ID`。

後端每次開啟試算表都會驗證上述屬性、試算表 ID、試算表名稱；若不符便拒絕操作。

程式初次執行 `v2InstallSyntheticFixture_()` 時還會檢查試算表是否完全空白，拒絕覆蓋已有資料。

## 核對與限制

- 已對**獨立版程式包**執行本地模擬整合測試 20 項，全部通過。
- 尚未測試實際 Google 授權、Apps Script 雲端執行、iPhone/Android LINE LIFF。
- 測試資料一律使用模擬員工；不觸碰正式出勤資料。
- 不允許更動 GitHub `main`、正式 LIFF Endpoint URL 或現有 Webhook。
- 在隔離測試結果經過確認前，絕不合併或部署到正式系統。
