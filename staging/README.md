# Attendance V2 — Staging Only

This folder is NOT production-ready. Never merge or deploy to the live LINE LIFF /exec URL without owner approval.

## Test environment requirements

1. Under the intended **yc.yeongacc00** Google account, create a **NEW BLANK** Google Sheet named exactly `YC_ATTENDANCE_V2_TEST_ONLY`. Do **not** copy the live attendance Sheet or any real employee, attendance or payroll data.
2. From that new blank Sheet, open **Extensions → Apps Script** to create a **bound Apps Script test project**. The modules below depend on `SpreadsheetApp.getActiveSpreadsheet()`. This is separate from the existing live attendance project.
   **Minimal two-file installation:** instead of copying each helper separately, add
   `AttendanceV2_TestBundle.gs` as ONE `.gs` file, plus the ONE
   `AttendanceV2_SecurePortal.html` page (create it as the Apps Script HTML
   file named `AttendanceV2_SecurePortal`). The bundle already includes the
   guarded synthetic fixture, all server-side helpers, and the dedicated test
   entry. **Do not also add the individual files**, or duplicate function
   declarations will conflict.
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
   - `AttendanceV2_TestFixture.gs` (requires explicit safety properties)
   - `AttendanceV2_TestCompat.gs` (the test-only substitutes for live Code.gs helpers)
   - `AttendanceV2_WorkdayLeave.test.gs` (Apps Script isolated validation tests)
4. **DO NOT copy production `Code.gs`, `index.html`, `doGet`, `doPost` or secrets.** The test-only `AttendanceV2_TestCompat.gs` provides the needed helper functions, protected by test-sheet guards.
5. Add `AttendanceV2_SecurePortal.html` as an HTML file named `AttendanceV2_SecurePortal` within the **test** project.
6. Set script properties `ATTENDANCE_V2_TEST=enabled` and `ATTENDANCE_V2_TEST_SHEET_ID=<the exact NEW blank Sheet ID>` **before** running setup. From the Apps Script editor, run `v2InstallSyntheticFixture_()` once. It creates 8 named Sheets and only synthetic `TEST001` employee, a non-functional location at `(0,0)`, and a simulated 2026–2027 work calendar. It refuses execution if the Sheet name/ID does not match or if the spreadsheet contains existing business data. **The fixture calendar is not an official holiday calendar.**
7. Set remaining **test script properties** privately: `LINE_LOGIN_CHANNEL_ID` (the numeric channel ID of the staging LINE Login Channel), `STAGING_LIFF_ID` (a **separate staging LIFF ID** with `openid` and `profile` scopes). Only for invitation-binding experiments, set `ATTENDANCE_BIND_PEPPER` (strong random secret; do not commit). `v2TestOptInLineIdentity` can bind a consenting **tester's** LINE identity to `TEST001` in the test Sheet only; it does not touch production.
8. Deploy the **test** bound Apps Script as a separate Web App. Configure ONLY a **separate staging LIFF app** to use its test `/exec` URL. Do not change the production LINE channel, live LIFF app or webhook. To test GPS punching, **first** set a suitable synthetic test location in `上班地點` and only with the consenting tester's permission; `(0,0)` is deliberately unusable. Cross-device compatibility of LIFF inside Apps Script HTMLService must be confirmed on iPhone and Android.
9. Run `testAttendanceV2Leave_()` in the test project and offline JS unit tests with Node 22:
   `node staging/AttendanceV2_Auth.test.js`, `node staging/AttendanceV2_Bind.test.js`, `node staging/AttendanceV2_Clock.test.js`, `node staging/AttendanceV2_DgpaCalendar.test.js`, `node staging/AttendanceV2_ReviewGuard.test.js`, `node staging/AttendanceV2_SubmitLeave.test.js`.
10. Never select or modify the existing live `yc.yeongacc00` attendance Spreadsheet/App Script project. Verify the test title and ID displayed before any installation run. Real staging integration tests must include login/relogin, first-time binding, GPS denial, timeouts, in-flight duplicate clicks, two simultaneous staff punches, review authorization, second supervisor clicks, old leave history, month rollovers, and restore from a copied Sheet.

## Unresolved release blockers

- Legacy public JSONP GET operations are still state-changing and depend on client-provided user identifiers. Do not switch production while they remain open to unauthorized writes.
- Current direct GAS webhook cannot verify LINE's `x-line-signature` header; replace approval/rejection postbacks with authenticated LIFF review (or add a signature-verifying proxy) before release.
- Automatic DGPA yearly calendar sync, holiday overrides administration, NFC dynamic SUN/SDM validation, notification outbox, and recovery policy remain pending.
- Some cases in the staged HTMLService LIFF approach may fail due to browser/iframe behavior. Confirm with real supported phones before relying on it.
- Never store LINE access tokens, user ID tokens, or NFC keys in the public repository.

## Recommended next user action (necessary only for cloud integration)

The currently connected Google Drive account in ChatGPT is
`ruichen0420.system@gmail.com`, **not**
`yc.yeongacc00@gmail.com`. Therefore no Google files were created under the
attendance account. Do not create them under the first account or grant it
access to live employee data just to run tests.

In an authenticated browser session for `yc.yeongacc00@gmail.com`:
1. Create a **new blank Google Sheet** named
   `YC_ATTENDANCE_V2_TEST_ONLY`. Do not copy the live attendance sheet.
2. Give the test sheet an Apps Script project via **Extensions → Apps Script**.
3. Use the two-file bundle approach above. Do not deploy yet.
4. Set the test-only properties with the new Sheet ID and an independent
   staging LINE Login/LIFF application.
5. Run `v2InstallSyntheticFixture_()` once; only after confirming the
   test sheet is empty and its ID/name match the safety properties.
6. Complete isolated integration and phone checks. Do not modify production
   LIFF Endpoint URL or Webhook URL.

A Google Drive connection alone does not give this chat a way to edit Apps
Script source; the bound Apps Script test code still requires an authorized
deployment method or a short one-time manual paste. The test app must not
be published to real employees.

## Latest verifiable checkpoint

- `AttendanceV2_TestBundle.gs` rebuilt after adding authenticated
  `v2LeaveStatusSecure` and classified `v2SubmitLeaveResult`.
- `AttendanceV2_SecurePortal.html` supports secure test login, explicit
  test identity opt-in, GPS test clock, after-timeout status lookup,
  continuous working-day leave, typed validation feedback, leave-status
  confirmation and supervisor review.
- The committed `AttendanceV2_IntegrationMock.test.js` passed 18/18 in
  a synthetic backend test runner, with no real LINE/Google API calls.
- JavaScript syntax of the committed HTML test portal passed.
- **Cloud Apps Script, staging LIFF, iPhone/Android and NFC tests not yet done.**
- The GitHub `main` branch is not part of this staging deployment.

## Current independent checks
- Staging Apps Script module syntax: 8/8 compile checks passed against committed source.
- GPS clock helper: 8/8 isolated mocked cases passed directly against committed source.
- Other mocked tests run locally in development; run the committed scripts again under the exact test project and keep logs before release.

**Production main branch is not changed by this folder.**

## Latest safe staging checkpoint (2026-10-21)
- New guarded fixture: `AttendanceV2_TestFixture.gs`; isolated pure helper replacements: `AttendanceV2_TestCompat.gs`.
- The LINE token verification entry requires `v2AssertTestSheet_()` to pass before processing.
- The isolated test portal now offers explicit opt-in to link one's own test LINE identity to synthetic `TEST001`.
- The GPS helper checks idempotent replays before rechecking the phone's GPS; a request that already succeeded can still be confirmed after the device moves or loses location.
- 9 direct tests against the committed fixture and work-calendar code passed under a synthetic Apps Script mock. This is **not** a deployed-cloud test.
- Test connection via Google Drive tools was not verified as the intended yc.yeongacc00 Google account; therefore no live Google files or test Sheets were created automatically.
