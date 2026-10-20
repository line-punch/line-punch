# Attendance V2 — Staging Only

This folder is NOT production-ready. Never merge or deploy to the live LINE LIFF /exec URL without owner approval.

## Test environment requirements

1. Create a COPY of the attendance Google Sheet with **synthetic** test employee rows. Do not share real payroll or employee credentials.
2. In that copied Sheet, create a **bound Apps Script test project**. The modules below depend on `SpreadsheetApp.getActiveSpreadsheet()`.
3. Include the following Apps Script server files in the test project:
   - `AttendanceV2_Auth.gs`
   - `AttendanceV2_WorkdayLeave.gs`
   - `AttendanceV2_SubmitLeave.gs`
   - `AttendanceV2_Clock.gs`
   - `AttendanceV2_ReviewGuard.gs`
   - `AttendanceV2_SecureReview.gs`
   - `AttendanceV2_TestEntry.gs`
   - `AttendanceV2_DgpaCalendar.gs` (parser only; does not sync on its own)
   - `AttendanceV2_Bind.gs` (not enabled until an owner-only invitation issuer is implemented)
4. Reuse the following helper functions from the **current** verified Code.gs, without copying its `doGet/doPost` or opening a second endpoint: `getEmployeeById_`, `getNearestAllowedLocation_`, `getManagers_`, `getNameByLineUserId_`, `combineDateTime_`, `nowInfo_`, plus their pure dependencies and the `Asia/Taipei` constants.
5. Add `AttendanceV2_SecurePortal.html` as an HTML file named `AttendanceV2_SecurePortal` within the **test** project.
6. The test sheet should contain matching headers and test rows:
   - `員工資料`, `上班地點`, `打卡紀錄`, `補打卡申請`, `請假申請`, `審核通知名單`, `工作日曆` and optionally `綁定邀請`.
   - Fill the workday calendar for every date in the tested leave range, including Saturdays, Sundays and national holidays. Keep the original 12-column leave layout and 11-column attendance layout.
   - Use only the user's own opted-in test LINE account(s); real staff must not be used for experimental writes.
7. Set **test script properties** privately: `ATTENDANCE_V2_TEST=enabled`, `LINE_LOGIN_CHANNEL_ID` (numeric LINE Login Channel ID), `STAGING_LIFF_ID` (a **separate staging LIFF ID** with `openid` and `profile` scopes), and for binding experiments `ATTENDANCE_BIND_PEPPER` (strong random secret; do not commit).
8. Deploy the **test** bound Apps Script as a separate Web App. Configure ONLY the staging LIFF Endpoint URL to its test `/exec` URL. Do not change the production LINE channel, live LIFF app or webhook. Cross-device compatibility of LIFF inside Apps Script HTMLService must be confirmed on iPhone and Android.
9. Run `testAttendanceV2Leave_()` in the test project and offline JS unit tests with Node 22:
   `node staging/AttendanceV2_Auth.test.js`, `node staging/AttendanceV2_Bind.test.js`, `node staging/AttendanceV2_Clock.test.js`, `node staging/AttendanceV2_DgpaCalendar.test.js`, `node staging/AttendanceV2_ReviewGuard.test.js`, `node staging/AttendanceV2_SubmitLeave.test.js`.
10. Real staging integration tests must include login/relogin, first-time binding, GPS denial, timeouts, in-flight duplicate clicks, two simultaneous staff punches, review authorization, second supervisor clicks, old leave history, month rollovers, and restore from a copied Sheet.

## Unresolved release blockers

- Legacy public JSONP GET operations are still state-changing and depend on client-provided user identifiers. Do not switch production while they remain open to unauthorized writes.
- Current direct GAS webhook cannot verify LINE's `x-line-signature` header; replace approval/rejection postbacks with authenticated LIFF review (or add a signature-verifying proxy) before release.
- Automatic DGPA yearly calendar sync, holiday overrides administration, NFC dynamic SUN/SDM validation, notification outbox, and recovery policy remain pending.
- Some cases in the staged HTMLService LIFF approach may fail due to browser/iframe behavior. Confirm with real supported phones before relying on it.
- Never store LINE access tokens, user ID tokens, or NFC keys in the public repository.

## Current independent checks
- Staging Apps Script module syntax: 8/8 compile checks passed against committed source.
- GPS clock helper: 8/8 isolated mocked cases passed directly against committed source.
- Other mocked tests run locally in development; run the committed scripts again under the exact test project and keep logs before release.

**Production main branch is not changed by this folder.**
