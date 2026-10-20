/**
 * Staging-only reviewer API. Use ONLY from Apps Script HTMLService.
 * Display these actions in an authenticated LIFF review page.
 * Never invoke through legacy unsigned LINE webhook or public JSONP.
 */
function v2ReviewDetailsSecure(payload) {
  const identity=v2VerifyLineClaims_(payload && payload.idToken);
  const no=String(payload&&payload.no||'').trim();
  const type=String(payload&&payload.type||'').trim();
  const sheetName=type==='leave'?'請假申請':type==='miss'?'補打卡申請':'';
  if (!sheetName || !/^([a-zA-Z0-9_-]){8,100}$/.test(no)) throw Error('申請類型或單號不正確');
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw Error('找不到申請資料表');
  const data=sh.getDataRange().getValues();
  let match=null;
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]).trim()!==no) continue;
    if (match) throw Error('申請單號重複，停止查詢');
    match=data[i];
  }
  if (!match) return {ok:false,code:'NOT_FOUND'};
  const managers=getManagers_(String(match[1]).trim());
  if (!managers || String(managers.boss||'')!==identity.lineUserId) throw Error('無審核權限');
  return {ok:true,no,type,status:String(match[8]||''),employeeName:String(match[2]||''),
    leaveType:type==='leave'?String(match[3]||''):undefined,
    startDate:type==='leave'?v2FormatYmd_(match[4]):v2FormatYmd_(match[3]),
    endDate:type==='leave'?v2FormatYmd_(match[5]):undefined,
    leaveQuantity:type==='leave'?String(match[6]||''):undefined,
    punchType:type==='miss'?String(match[5]||''):undefined,
    punchTime:type==='miss'?String(match[6]||''):undefined};
}
function v2FormatYmd_(value) {
  if (value instanceof Date) return Utilities.formatDate(value,'Asia/Taipei','yyyy-MM-dd');
  return String(value||'').slice(0,10).replace(/\//g,'-');
}
function v2ReviewSecure(payload) {
  const identity=v2VerifyLineClaims_(payload && payload.idToken);
  const type=String(payload&&payload.type||'').trim();
  const sheetName=type==='leave'?'請假申請':type==='miss'?'補打卡申請':'';
  if (!sheetName) throw Error('申請類型不正確');
  const decision=String(payload&&payload.decision||'').trim();
  const no=String(payload&&payload.no||'').trim();
  if (!/^([a-zA-Z0-9_-]){8,100}$/.test(no)) throw Error('申請單號不正確');
  const reviewer=getNameByLineUserId_(identity.lineUserId);
  const reviewerName=reviewer===identity.lineUserId?'授權主管':reviewer;
  return v2Decide_(sheetName,no,decision,identity.lineUserId,
    reviewerName,LockService.getScriptLock());
}
/* Required before production:
 * - On manager Flex card, replace direct postback mutation with an authenticated
 *   LIFF review URL and explicit confirm, pending, success and failure states.
 * - Disable mutation of the same application through the old unsigned webhook.
 * - Write a notification outbox in the same transaction before sending LINE.
 * - Run a copied-Sheet test with two simultaneous reviewers and no real users.
 */