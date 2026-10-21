/**
 * YC attendance V2 — READ-ONLY staging bridge for LINE identity verification.
 * Test Apps Script project ONLY. Do not add to either production Apps Script.
 *
 * Browser: top-level GitHub Pages LIFF login posts LINE ID token in HTML form
 * body to isolated /exec; this returns an isolated HTMLService reply frame.
 * Reply is posted to https://line-punch.github.io with nonce matching.
 *
 * IMPORTANT: This version exposes only verify, not attendance/leave/clock
 * functions; it does not return LINE user IDs, ID tokens or employee records.
 *
 * To enable server verification, TEST project's Script Properties must contain:
 * ATTENDANCE_V2_BRIDGE_MODE = verify_only
 * (plus test Sheet ID, LINE_LOGIN_CHANNEL_ID etc. from the existing bundle).
 *
 * Do not widen GAS deployment to Anyone until doGet and every other public
 * entrypoint have been reviewed and the owner approves a limited test.
 */
function v2BridgeRequest_(params) {
  v2AssertTestSheet_(); // All calls must be confined to the isolated Sheet
  if (PropertiesService.getScriptProperties().getProperty('ATTENDANCE_V2_BRIDGE_MODE') !== 'verify_only') {
    throw Error('測試後端驗證尚未啟用');
  }
  if (!params || typeof params !== 'object') throw Error('請求格式錯誤');
  const nonce=String(params.nonce||'');
  if(!/^[a-f0-9]{40}$/.test(nonce)) throw Error('請求識別無效');
  if(String(params.operation||'')!=='verify') throw Error('未開放此測試操作');

  const raw=String(params.payload||'');
  if(raw.length<30 || raw.length>10000) throw Error('請求長度不正確');
  let data;
  try { data=JSON.parse(raw); } catch(_) { throw Error('請求格式錯誤'); }
  if(!data || Array.isArray(data) || typeof data!=='object' ||
     typeof data.idToken!=='string') throw Error('缺少 LINE 登入資料');

  // Verify cryptographic claims with LINE (channel aud/exp/sub/iss).
  // Do not return the claims or user identifiers to the browser.
  v2VerifyLineClaims_(data.idToken);
  return {nonce,result:{ok:true,verified:true}};
}
function v2BridgeReply_(payload) {
  // Escape HTML script-breaking text and Unicode line separators.
  const serialized=JSON.stringify(payload).replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>window.top.postMessage('+serialized+','+
      JSON.stringify('https://line-punch.github.io')+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  const params=e&&e.parameter||{};
  const nonce=String(params.nonce||'');
  let body;
  try {
    const verified=v2BridgeRequest_(params);
    body={bridge:'YC_V2_STAGING_FORM_V1',nonce:verified.nonce,
      ok:true,result:verified.result};
  } catch(error) {
    // Return a generic failure to avoid reflecting private token contents.
    body={bridge:'YC_V2_STAGING_FORM_V1',nonce,
      ok:false,error:'驗證失敗或測試後端尚未啟用，請聯絡管理員'};
  }
  return v2BridgeReply_(body);
}
/**
 * Important: HTMLService ALLOWALL deliberately allows the response to be
 * embedded, so the reply contains no employee data, tokens or write controls.
 * This is not a validated production transport until mobile tests pass.
 */
