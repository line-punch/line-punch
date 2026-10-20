# Attendance V2 staging specification (2026-10-20)

Status: design and isolated development only. **Do not deploy to production or merge to main without explicit approval.**

## Existing topology
- LIFF endpoint: GitHub Pages on main branch.
- GitHub index.html contains the active frontend; app.js appears legacy and is not referenced by the active index.html.
- Apps Script handles JSONP GET actions: whoami, bind, clock, miss, leave, query, leaveHistory, missHistory; LINE postback handles manager review.
- Backend source is not versioned in this repository. Any server changes require a separate staged Apps Script deployment before end-to-end testing.

## Confirmed risks to address
1. Frontend init treats any response other than `who.ok && who.bound` as unbound, including `ok:false`; show an error and retry, not the first-time binding form.
2. Current frontend has in-page text loading but no per-button disabled/in-flight state. Implement a common async action wrapper and a distinct uncertain-result state for timeouts.
3. JSONP GET is used for state-changing actions; callback URLs can be logged and retried. Add server-side authenticated authorization, request IDs, locks and idempotency; don't assume a client-provided userId or employeeId proves identity.
4. Backend clock checks last-minute/one-per-day without a lock, so concurrent requests can race.
5. Backend leave currently sets start and end to the same date and uses a single-day quantity; upgrade to date range while retaining legacy rows.
6. Manager postback review requires authorization against a reviewer allowlist, plus locking/compare-and-set before approval or rejection.
7. Notification failures should not be confused with failed data writes; persist decision first, return authoritative result, retry notification separately.
8. GPS failure fallback must not silently mark a punch successful.

## Three feature workstreams
### A. NFC backup
- One site, mixed iPhone and Android; GPS remains default.
- Prototype secure NTAG 424 DNA dynamic SUN/SDM verification in an isolated endpoint; validate signature/MAC, counter, expiry/replay protection and per-employee authorization. Do not trust a fixed URL or plain tag UID.
- Avoid logging secret keys, raw LINE tokens, or personally identifiable records.
- Hardware field test needed; dynamic tag does not by itself eliminate relay/forwarding.

### B. Multi-day leave
- Add startDate/endDate with single-day and hourly leave backward compatibility.
- One request, one approval. Show both dates in manager notice, employee history and approval response.
- Confirmed policy: a leave request may cover only consecutive scheduled working days; nonworking days must not fall inside its date range. Example Friday plus Monday–Tuesday requires two requests, totaling three working days. The UI must reject a range containing rest days once the authoritative work schedule is known. Do not infer weekends are always rest days; verify schedules and holidays. Overlaps, half-day and cross-midnight rules still require validation.
- Preserve existing sheet columns and legacy data; migrations must be reversible.

### C. Interaction feedback
- Every LIFF button shows pressed/processing/success/error/unknown; prevent duplicate clicks.
- Timeouts are *unknown outcome* until checked against authoritative record using a request ID.
- Manager LINE Flex postback buttons cannot show an arbitrary client-side spinner; send an acknowledgement/reply or switch to a LIFF review page for immediate loading state. Enforce idempotency server-side.

## Release gates
1. Baseline snapshots: main commit, Apps Script deployed version, sheet schema (without employee data).
2. Isolated unit tests and API contract checks.
3. Staged Apps Script with test sheet; staged GitHub Pages or separate preview URL.
4. iPhone/Android NFC hardware tests and spoof/replay tests.
5. Review approval/rejection, leave history, GPS failure, unknown network outcome, simultaneous punches.
6. Owner acceptance, then explicitly approved production deployment with rollback plan.

## Confirmed company calendar policy (2026-10-20)
- All employees have Saturday/Sunday off; no shift scheduling.
- Observe Taiwan national holidays. Date ranges must contain only working days; reject any range containing a weekend or applicable national holiday, and require separate leave requests around the break.
- Maintain a versioned yearly holiday calendar and optional company exceptions (make-up workdays, special closures) rather than hard-coding dates. Do not assume government make-up workdays apply without company confirmation.
- Determine deducted days on the server; client date picker validation is advisory only.

## Saturday make-up working days
- Do not blanket-block Saturdays. Resolve each date using an authoritative company working-day calendar.
- Periodically import official Taiwan government calendar as a proposed baseline, with source/version, last-sync timestamp, and failure alerts. Official calendar is not automatically binding on private-company schedules.
- Company-specific overrides have precedence; approved Saturday workdays can be selected for leave, weekends/holidays designated off cannot.
- No silent automatic changes to previously approved leave; validate on submission and approval against the effective calendar.

## Confirmed default for government-announced Saturday make-up days
- Company normally follows officially announced Saturday make-up workdays; mark those Saturdays as working days by default and permit leave applications.
- Company-specific exceptions can override the default, with an audit trail.
- Confirm the official calendar's applicability and effective dates before importing; never blindly treat all government office schedules as legally binding for a private company.

## V2 development checkpoint — 2026-10-20
- Branch contains staged frontend changes (leave start/end, persistent per-form transaction ID,
  click-in-progress feedback, visible identity errors, unknown outcome handling).
- Added AttendanceV2_SubmitLeave.gs helper. It stores a request ID in the existing
  application number column A to make retries idempotent; 12-column layout unchanged.
- Added AttendanceV2_ReviewGuard.gs helper. The reviewer must match the server-side
  manager list for the request owner. Review state is checked and updated under one lock.
- Added Node mock tests: AttendanceV2_ReviewGuard.test.js and
  AttendanceV2_SubmitLeave.test.js, alongside a standalone GAS leave validator test.
  Mock-based local logic checks are NOT a replacement for integration tests.
- The government source candidate for official workday calendar is DGPA dataset 14718
  at https://data.gov.tw/dataset/14718 ; field "是否放假": 0 = workday, 2 = holiday.
  Calendar importer, yearly sync and company overrides remain unimplemented.
- **Security release blockers**: The current production interface sends state-changing
  JSONP GET requests using client-provided employee/LINE IDs; this does not authenticate
  the employee. The current Apps Script doPost handler also lacks validated webhook
  authenticity. Do not wire these staging helpers to production until an authenticated,
  non-JSONP request path and verified review source are established.
- **Operational release blockers**: no staged GAS web deployment, copied test spreadsheet,
  official full-year calendar import, durable notification outbox, phone testing, or
  end-to-end payroll/leave history regression yet.
- No production branch, LIFF endpoint, live Sheet, or deployed Apps Script was changed.

## Additional staging work
- Frontend now uses stable session-scoped request IDs for leave submissions and displays
  an "unconfirmed" state on write-request network errors instead of claiming failure.
- Added AttendanceV2_DgpaCalendar.gs and isolated test script. Parser validates
  all 365/366 dates, known holiday codes (0/2), duplicate/missing dates, leap
  years and company override records. This is a pure parser, NOT automatic sync.
- Official calendar reference: https://data.gov.tw/dataset/14718
- Local mock tests: review 12/12, leave submission 10/10, calendar 10/10.
  These were run against local equivalent development code, not a deployed GAS
  project or a live phone/LINE test; repository test scripts are committed for
  later reproducible validation.
- No release until authenticated transport/webhook verification and end-to-end
  tests on a separate Apps Script deployment and copied Sheet are complete.

## Security prototype checkpoint (2026-10-20 evening)
- Added `staging/AttendanceV2_Auth.gs` and `staging/AttendanceV2_Auth.test.js`:
  LINE ID tokens are verified server-side via LINE OAuth2 verify API, using
  `LINE_LOGIN_CHANNEL_ID` from Apps Script script properties, before deriving
  employee identity and allowing leave submission or attendance queries.
  A caller-supplied employee ID is not trusted. Attendance query is restricted
  to the authenticated employee and current plus previous two months.
- Added `staging/AttendanceV2_SecureReview.gs` to support an authenticated
  LIFF manager review flow. The old unsigned webhook's ability to approve/reject
  is a release-blocking vulnerability until retired.
- Added `staging/AttendanceV2_Bind.gs` and companion mock test; first-time
  binding requires a single-use invitation code, limited attempts and a
  verified LINE identity. Existing bindings cannot be overwritten on request.
  Invitation issuance and secure re-binding remain TODO before deployment.
- Added `staging/AttendanceV2_TestEntry.gs` and
  `staging/AttendanceV2_SecurePortal.html`, designed ONLY for a separate
  Apps Script test project and a separate staging LIFF app. Never point the
  production LIFF app at an untested Apps Script URL.
- Local isolated test runs of development equivalents: LINE auth 14/14;
  invitation-binding 15/15. This is NOT a verified LINE API, Google
  `google.script.run`, or iPhone/Android integration result.
- **Public repository notice:** never commit access tokens, employee records,
  invite code values, script properties, payroll figures or private test data.
- **Further blockers:** confirm LINE LIFF behavior with Apps Script HTMLService
  test URL; create copied test spreadsheet; retire vulnerable legacy JSONP GET
  writes and unsigned webhook decisions; add authenticated clock and missed
  punch APIs; complete notification outbox, NFC verification, real testing and
  explicit owner acceptance.
