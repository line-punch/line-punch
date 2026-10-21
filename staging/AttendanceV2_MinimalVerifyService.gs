/**
 * Attendance V2 – isolated MINIMAL verify-only GAS Web App.
 * Place in a NEW standalone Apps Script project named e.g.
 * YC_ATTENDANCE_V2_LOGIN_VERIFY_ONLY. Never add existing attendance backend.
 *
 * This app has no SpreadsheetApp, no employee information and no write APIs.
 * The response includes ONLY a boolean "verified" and the request nonce.
 *
 * Required Script Properties (set manually, not in GitHub):
 *   LINE_LOGIN_CHANNEL_ID = 2012136707
 *   ATTENDANCE_V2_BRIDGE_MODE = verify_only
 *
 * Web App: execute as owner; accessible to anyone ONLY after authorization and
 * owner's explicit approval of this minimal project's source and scopes.
 *
 * Browser GitHub Pages origin: https://line-punch.github.io
 * Warning: Cross-origin HTML form + iframe postMessage must be tested on iOS,
 * Android and desktop before relying on it. Not production-ready.
 */
var V2_VERIFY_EXPECTED_CHANNEL = '2012136707';
var V2_VERIFY_REPLY_ORIGIN = 'https://line-punch.github.io';
function v2VerifyConfig_() {
  var settings=PropertiesService.getScriptProperties();
  if (settings.getProperty('ATTENDANCE_V2_BRIDGE_MODE')!=='verify_only')
    throw Error('測試驗證未啟用');
  var channel=String(settings.getProperty('LINE_LOGIN_CHANNEL_ID')||'');
  if (channel!==V2_VERIFY_EXPECTED_CHANNEL)
    throw Error('測試 LINE Channel 設定不正確');
  return channel;
}
function v2VerifyJwt_(idToken) {
  var channel=v2VerifyConfig_();
  var token=String(idToken||'');
  if(token.length<30 || token.length>8192 || token.split('.').length!==3)
    throw Error('登入資料格式不正確');
  var reply=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'post',
    contentType:'application/x-www-form-urlencoded',
    payload:{id_token:token,client_id:channel},
    muteHttpExceptions:true
  });
  if(reply.getResponseCode()!==200)
    throw Error('LINE 登入驗證失敗');
  var claims;
  try{claims=JSON.parse(reply.getContentText())}
  catch(_){throw Error('LINE 驗證回應格式不正確')}
  var now=Math.floor(Date.now()/1000);
  if(!claims || claims.iss!=='https://access.line.me' ||
    String(claims.aud)!==channel ||
    !/^U[0-9a-f]{32}$/i.test(String(claims.sub||'')) ||
    !Number.isFinite(Number(claims.exp)) || Number(claims.exp)<=now ||
    !Number.isFinite(Number(claims.iat)) || Number(claims.iat)>now+300)
    throw Error('LINE 驗證資料不符合規則');
  // Don't return, print, log or store the LINE user ID or ID token.
  return true;
}
function v2VerifyRequest_(params) {
  v2VerifyConfig_();
  if(!params || typeof params!=='object')throw Error('無效請求');
  var nonce=String(params.nonce||'');
  if(!/^[0-9a-f]{40}$/.test(nonce))throw Error('無效請求識別碼');
  if(params.operation!=='verify')throw Error('不支援此操作');
  var json=String(params.payload||'');
  if(json.length<30 || json.length>10000)throw Error('無效請求內容');
  var payload;
  try{payload=JSON.parse(json)}catch(_){throw Error('無效 JSON')}
  if(!payload || Array.isArray(payload) || typeof payload!=='object' ||
    typeof payload.idToken!=='string')throw Error('缺少 LINE 登入資料');
  v2VerifyJwt_(payload.idToken);
  return {nonce:nonce,verified:true};
}
function v2Reply_(data) {
  var serialized=JSON.stringify(data)
    .replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028')
    .replace(/\u2029/g,'\\u2029');
  var html='<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"></head>'+
    '<body><script>window.top.postMessage('+serialized+','+
    JSON.stringify(V2_VERIFY_REPLY_ORIGIN)+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  var params=(e&&e.parameter)||{},nonce=String(params.nonce||'');
  var response;
  try{
    var data=v2VerifyRequest_(params);
    response={bridge:'YC_V2_STAGING_FORM_V1',nonce:data.nonce,
      ok:true,result:{ok:true,verified:data.verified}};
  }catch(_){
    // No stack traces, JWTs, LINE user IDs or employee records.
    response={bridge:'YC_V2_STAGING_FORM_V1',nonce:nonce,
      ok:false,error:'LINE 登入驗證未完成，請重新開啟測試入口'};
  }
  return v2Reply_(response);
}
function doGet() {
  // Deliberately no HTMLService client, preventing google.script.run access.
  return ContentService.createTextOutput('僅供 LINE 測試身分驗證，無網頁操作介面。')
    .setMimeType(ContentService.MimeType.TEXT);
}
