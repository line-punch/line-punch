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
