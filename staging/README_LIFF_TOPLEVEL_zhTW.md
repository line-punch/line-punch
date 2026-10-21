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

## 2026-10-21 最新驗證與下一階段

**真實 LINE 登入前端測試已通過。** 使用者已透過個人 LINE 開發者帳號取得測試 Channel 權限，並在 GitHub Pages 測試頁看到「✅ LINE 登入已在瀏覽器完成」。這不代表後端已驗證或可進行打卡。

- 新測試 repo：`line-punch/attendance-v2-test`；已啟用 GitHub Pages。
- 測試 LIFF Endpoint：`https://line-punch.github.io/attendance-v2-test/`，且使用 `2012136707-2dDU0aSJ`。
- GitHub Pages **main** 仍為僅前端登入測試，`enableServerVerification:false`。
- `attendance-v2-test` 中獨立的新分支
  `feature/verify-only-backend-probe-20261021` 已準備下一階段客戶端驗證，但尚未發佈。
- 此倉庫內 `staging/AttendanceV2_FormPostBridge.gs` 已改為**只有 `verify` 一個唯讀操作**，
  不包含 clock/leave/review/bind。後端只回傳 `{ok:true,verified:true}`，
  不回傳 LINE userId、員工名稱、ID Token 或其他個資。
- 安全測試：最新唯讀橋接器 12/12 模擬案例通過（包含拒絕寫入、未啟用時拒絕、token 資料不回傳）。
- **尚未安裝/部署** read-only `doPost` 到測試 GAS，現有測試部署無需重建資料表。
- 橋接程式另需測試 GAS Script Property `ATTENDANCE_V2_BRIDGE_MODE=verify_only`，
  否則拒絕所有操作。測試 GAS 既有兩個檔案不必重貼。

### 跨網站真實測試順序

1. 將 `AttendanceV2_FormPostBridge.gs` 新增至 **獨立** GAS 測試專案（不能加入正式專案）。
2. 設定 `ATTENDANCE_V2_BRIDGE_MODE=verify_only`；保留所有既有測試 Sheet、Channel、LIFF 設定。
3. **先維持** GAS 部署「誰可以存取：只有我自己」，使用同一 Google 登入的桌機測試跨網站請求是否能收到回覆。
4. 僅在權限與 `doGet` 舊測試入口的安全性審核完成、使用者同意後，才考慮將測試 Web App 改為 `Anyone`。
5. 再將測試 GitHub Pages 的已準備登入後端分支發布到新 repo 的 main，從桌機／手機驗證。
6. 若發生逾時，要記錄「結果未確認」而非宣稱登入或寫入失敗。此階段**沒有任何寫入操作**。

### 已知權限風險

測試 GAS 專案仍含多個受 LINE Token 驗證的業務入口，以及舊 HTMLService `doGet`。
若直接改成 `Anyone`，即使唯讀 `doPost` 限制操作，其餘入口可能仍暴露；
正式擴大存取前必須先隔離或封閉這些入口。不能因為單元測試通過而忽略這點。
