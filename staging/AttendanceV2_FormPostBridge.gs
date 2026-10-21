/**
 * ATTENDANCE V2 - STAGING ONLY - HTML form POST bridge for LIFF hosted at
 * a top-level, separate static HTTPS origin (NOT inside Apps Script iframe).
 *
 * Use with the existing standalone test bundle. No production activation.
 * One POST request -> one HtmlService page -> window.top.postMessage reply.
 *
 * Requirements: Apps Script Web App executes as owner, accessible to "Anyone".
 * Every operation authenticates the LINE idToken on GAS server.
 * ATTENDANCE_V2_TEST, ATTENDANCE_V2_TEST_SHEET_ID test guards remain mandatory.
 *
 * IMPORTANT: Deployment/access changes are blocked pending owner approval
 * and integration security review.
 */
function v2BridgeOps_() {
  return Object.freeze({
    whoami: v2WhoamiSecure,
    attendance: v2QueryAttendanceSecure,
    clock: v2ClockSecure,
    clockStatus: v2ClockStatusSecure,
    leave: v2SubmitLeaveResult,
    leaveStatus: v2LeaveStatusSecure,
    leaveHistory: v2LeaveHistorySecure,
    reviewDetails: v2ReviewDetailsSecure,
    review: v2ReviewSecure
  });
}
function v2BridgeRequest_(params) {
  v2AssertTestSheet_();
  if (!params || typeof params !== 'object') throw Error('請求格式錯誤');
  const nonce=String(params.nonce||'');
  if(!/^[A-Za-z0-9_-]{24,90}$/.test(nonce)) throw Error('請求識別無效');
  const operation=String(params.operation||'');
  if(!/^[a-zA-Z]{3,30}$/.test(operation)) throw Error('無效的操作名稱');
  const methods=v2BridgeOps_();
  if(!Object.prototype.hasOwnProperty.call(methods,operation)) {
    throw Error('未開放此測試操作');
  }
  const raw=String(params.payload||'');
  if(raw.length<30 || raw.length>10000) throw Error('請求長度不正確');
  let data;
  try{data=JSON.parse(raw)}catch(_){throw Error('請求不是有效 JSON')}
  if(!data || Array.isArray(data) || typeof data!=='object') throw Error('請求內容無效');
  if(!Object.prototype.hasOwnProperty.call(data,'idToken')) throw Error('缺少 LINE 登入資料');
  // Each server method performs its own verified LINE token/employee check.
  return {nonce,operation,result:methods[operation](data)};
}
function v2BridgeReply_(payload) {
  // Prevent breaking out of the generated inline SCRIPT, even if error text
  // contains arbitrary HTML. Do not serialize any token into the response.
  const json=JSON.stringify(payload).replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>window.top.postMessage('+json+','+
    JSON.stringify('https://line-punch.github.io')+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  const p=e&&e.parameter||{};
  const nonce=String(p.nonce||'');
  let envelope;
  try {
    const result=v2BridgeRequest_(p);
    envelope={bridge:'YC_V2_STAGING_FORM_V1',nonce:result.nonce,ok:true,result:result.result};
  } catch(error) {
    // No token/payload values returned. Always reply to trusted hosting origin.
    const safeError=String(error&&error.message||'發生錯誤').slice(0,180);
    envelope={bridge:'YC_V2_STAGING_FORM_V1',nonce,ok:false,error:safeError};
  }
  return v2BridgeReply_(envelope);
}
/**
 * Security note: the HTTPS response permits embedding via ALLOWALL, so NEVER
 * add sensitive visible controls here. The bridge replies only to the known
 * Github Pages origin and all operations are validated with LINE idTokens.
 * This is NOT a substitute for real mobile, replay and CSRF/adversarial tests.
 */
