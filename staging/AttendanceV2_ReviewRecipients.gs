/**
 * READ-ONLY notification/review routing based on EXISTING formal sheet:
 * 審核通知名單 columns:
 * A 員工ID, B 員工姓名, C 通知主管1 LINE userId,
 * D 通知主管2 LINE userId, E 審核主管 LINE userId.
 *
 * Legacy system sends TEXT notice to C and D (deduping C/D) and approval
 * Flex to E. Only E may approve/reject after server-side LINE verification.
 *
 * Never expose returned LINE IDs to a public UI, log, GitHub or applicant.
 * This module performs no LINE sends or spreadsheet edits.
 */
function v2nExistingRecipients_(ss,employeeId) {
  const id=String(employeeId||'').trim();
  if(!id)throw Error('缺少員工ID');
  const sheet=ss.getSheetByName('審核通知名單');
  if(!sheet)throw Error('缺少審核通知名單');
  const rows=sheet.getDataRange().getValues();
  let match=null;
  for(let i=1;i<rows.length;i++) {
    const r=rows[i];
    if(String(r[0]||'').trim()!==id)continue;
    if(match)throw Error('審核通知名單中同一員工重複設定');
    match=r;
  }
  if(!match)throw Error('員工尚未設定通知及審核主管');
  const notify=[];
  for(const col of [2,3]) {
    const uid=String(match[col]||'').trim();
    if(uid&&!notify.includes(uid))notify.push(uid);
  }
  const boss=String(match[4]||'').trim();
  return {
    employeeId:id,
    notificationTextRecipients:notify, // C, D only
    approvalFlexRecipient:boss,        // E only
    hasReviewer:!!boss
  };
}
function v2nCanApprove_(ss,employeeId,verifiedLineUserId) {
  const plan=v2nExistingRecipients_(ss,employeeId);
  const uid=String(verifiedLineUserId||'').trim();
  return !!uid && !!plan.approvalFlexRecipient &&
    plan.approvalFlexRecipient===uid;
}
/* Usage integration:
 * - A new missed/leave request: write database once; create durable outbox
 *   for C/D text and E actionable approval link as returned by this helper.
 * - Approval: validate the verified reviewer token AND check E against the
 *   application's employee ID, under lock, before editing the application.
 * - Final approval: create durable employee-notification outbox entry.
 * No production webhook POST may bypass this check.
 */
