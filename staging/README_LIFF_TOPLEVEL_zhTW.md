# V2.0 LINE Login iframe 修復規劃（2026-10-21）

## 已證實的問題

使用者從**獨立的** Apps Script 網頁按「驗證 LINE 身分」後，
看到「access.line.me 拒絕連線」。這不是試算表寫入失敗。
Google Apps Script HTMLService 使用 sandbox iframe，而 LINE 身分登入頁面
拒絕在 iframe 中呈現。直接把 LIFF Endpoint 設為 GAS `/exec` 不可靠。

Google 說明：<https://developers.google.com/apps-script/guides/html/restrictions>
LINE 登入說明：<https://developers.line.biz/en/docs/liff/developing-liff-apps/>

## 解法（尚待雲端實測；不可直接上線）

1. **LINE LIFF 外層網頁（top-level）**改為另外建立的 GitHub Pages 測試倉庫，
   預計網址 `https://line-punch.github.io/attendance-v2-test/`。
   `staging/TopLevelLiffLogin/index.html` 已開發，只先做 LINE 身分驗證。
2. GAS 使用目前**獨立測試專案**繼續承擔驗證與試算表讀寫；
   `staging/AttendanceV2_FormPostBridge.gs` 新增 `doPost`。
   靜態測試頁透過原生 HTML form POST 的請求**內文**傳送 ID Token，
   不將 ID Token 放進 URL／GitHub 檔案；回覆透過
   `HtmlService.XFrameOptionsMode.ALLOWALL` 與
   `window.top.postMessage` 回傳到受信任的 GitHub Pages origin。
   後端所有業務操作仍須先驗證 LINE ID Token，且只允許指定操作；
   不使用原本不安全的 JSONP GET 寫入。
3. 待程式碼與權限審查完成後，才考慮調整測試 GAS Web App 為
   「執行身分：我；誰可以存取：任何人」。如果設定「只有我自己」，
   LINE 手機無 Google 登入權限可能無法取得回覆。
4. 更改**測試 LIFF**的 Endpoint URL 指向新的 GitHub Pages；
   絕對不可修改正式「公司打卡」LIFF Endpoint。
5. 完成桌機／iPhone／Android 測試，確認登入、驗證、未知回覆、
   無權限存取、同時打卡、請假、主管審核、關閉及重登後，
   才評估正式系統如何安全遷移。

## 目前程式資產

- `staging/TopLevelLiffLogin/index.html`
- `staging/AttendanceV2_FormPostBridge.gs`
- `staging/AttendanceV2_FormPostBridge.test.js`
- `staging/AttendanceV2_StandaloneBundle.gs`
- 測試 LIFF ID：`2012136707-2dDU0aSJ`
- 測試 LINE Login Channel ID：`2012136707`
- 正式 `line-punch/line-punch` 的 `main` 不可變動。

## 下一個人工步驟

使用 GitHub 的 `line-punch` 帳號新增**公開但不含任何員工資料或機密**
的獨立 repository：`attendance-v2-test`，只建立空白儲存庫即可。
完成後由 ChatGPT 的 GitHub 授權嘗試直接寫入已備好的
`index.html`；如果 GitHub connector 尚未授權新 repo，使用者需要
自行在連線設定允許存取它。接著設定 GitHub Pages。
目前原 repo 專供正式打卡，絕對不要更動它的 Pages source。

## 重要限制

- `HtmlService.XFrameOptionsMode.ALLOWALL` 會移除 X-Frame-Options
  防護，請僅在**無任何可見敏感操作**的回應橋接器使用；保留已做的
  LINE Token 驗證、操作白名單、來源限制與同一請求 ID。
- 尚未執行實際跨網站表單 POST、跨域 postMessage、第三方 Cookie、
  正式 Google Web App 分享權限、LINE App 手機相容性測試。
  模擬通過不能視為可直接部署。
- 測試員工自願綁定目前僅供隔離測試，在放寬任何人可存取權限前，
  須再限制誰可以綁定模擬員工，避免陌生使用者搶先占用測試帳號。
- 不在 GitHub 儲存任何 LINE Channel Secret、ID Token、個資、密碼。
