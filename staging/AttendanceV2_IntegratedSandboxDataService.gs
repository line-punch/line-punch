/**
 * ATTENDANCE V2: ISOLATED TEST DATA API (NOT PRODUCTION).
 *
 * Deploy in a BRAND NEW standalone Apps Script project; do not mix with
 * YC_ATTENDANCE_V2_TEST_GAS (which has HTMLService public functions),
 * the read-only LINE verification service, or the live attendance project.
 *
 * Script Properties (in the new standalone project):
 *   ATTENDANCE_V2_DATA_TEST = enabled
 *   ATTENDANCE_V2_TEST_SHEET_ID = exact isolated test Sheet ID
 *   LINE_LOGIN_CHANNEL_ID = 2012136707
 *
 * doPost operations: whoami, bind, clock, clockStatus. doGet is plain text.
 * Every business call verifies LINE id_token and checks the test Sheet guard.
 * No employee roster, manager approvals, leave, notifications, or arbitrary
 * user-selected spreadsheet IDs in this service.
 *
 * Owner-only (run in editor, never exposed as a web operation):
 *   v2IssueTestInvitation (one 30-minute, random 32-hex invitation)
 *
 * Never log LINE ID tokens or print them in the reply.
 */
const V2D_CHANNEL = '2012136707';
const V2D_REPLY_ORIGIN = 'https://line-punch.github.io';
const V2D_SHEET_NAME = 'YC_ATTENDANCE_V2_TEST_ONLY';
const V2D_EMPLOYEE_ID = 'TEST001';
const V2D_LOCATION_CODE = 'TESTSITE';
const V2D_INVITE_TTL_MS = 30 * 60 * 1000;

function v2dProperties_() {
  return PropertiesService.getScriptProperties();
}
function v2dTestSheet_() {
  const p=v2dProperties_();
  if(p.getProperty('ATTENDANCE_V2_DATA_TEST')!=='enabled' ||
     p.getProperty('LINE_LOGIN_CHANNEL_ID')!==V2D_CHANNEL) {
    throw Error('隔離測試服務尚未啟用或設定錯誤');
  }
  const id=String(p.getProperty('ATTENDANCE_V2_TEST_SHEET_ID')||'').trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw Error('測試試算表設定錯誤');
  const sheet=SpreadsheetApp.openById(id);
  if(!sheet || sheet.getId()!==id || sheet.getName()!==V2D_SHEET_NAME)
    throw Error('只允許指定的隔離測試資料庫');
  const employees=sheet.getSheetByName('員工資料');
  const locations=sheet.getSheetByName('上班地點');
  const clocks=sheet.getSheetByName('打卡紀錄');
  if(!employees || !locations || !clocks ||
     employees.getLastRow()!==2 ||
     String(employees.getRange(2,1).getValue())!==V2D_EMPLOYEE_ID ||
     String(employees.getRange(2,8).getValue())!==V2D_LOCATION_CODE)
    throw Error('測試資料結構不符合預期，已停止操作');
  return sheet;
}
function v2dLineClaims_(tokenInput) {
  const token=String(tokenInput||'');
  if(token.length<30 || token.length>8192 || token.split('.').length!==3)
    throw Error('LINE 登入資訊無效');
  const response=UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify',{
    method:'post', contentType:'application/x-www-form-urlencoded',
    payload:{id_token:token,client_id:V2D_CHANNEL},muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw Error('LINE 登入驗證失敗');
  let claims;
  try{claims=JSON.parse(response.getContentText())}
  catch(_){throw Error('LINE 驗證回應錯誤')}
  const now=Math.floor(Date.now()/1000);
  if(!claims || claims.iss!=='https://access.line.me' ||
     String(claims.aud)!==V2D_CHANNEL ||
     !/^U[0-9a-f]{32}$/i.test(String(claims.sub||'')) ||
     !Number.isFinite(Number(claims.exp)) || Number(claims.exp)<=now ||
     !Number.isFinite(Number(claims.iat)) || Number(claims.iat)>now+300)
    throw Error('LINE 驗證內容不符合規則');
  return String(claims.sub);
}
function v2dEmployee_(ss,lineUserId) {
  const sh=ss.getSheetByName('員工資料');
  const row=sh.getRange(2,1,1,8).getValues()[0];
  const linked=String(row[3]||'').trim();
  if(linked && linked!==lineUserId)
    return {bound:false,employeeRow:row};
  if(!linked)return {bound:false,employeeRow:row};
  if(String(row[6]||'').trim()!=='在職')
    throw Error('測試員工帳號已停用');
  return {bound:true,employeeRow:row,employeeId:V2D_EMPLOYEE_ID,
    name:String(row[1]||'模擬員工甲')};
}
function v2dWhoami_(ss,lineUserId) {
  const emp=v2dEmployee_(ss,lineUserId);
  return emp.bound ? {ok:true,bound:true,employee:{
    employeeId:emp.employeeId,name:emp.name
  }} : {ok:true,bound:false};
}
function v2dHashCode_(code,salt) {
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(code)+':'+String(salt),Utilities.Charset.UTF_8);
  return digest.map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
/**
 * Run only from Google Apps Script editor for the dedicated DATA TEST project.
 * This method is NOT listed as a public POST operation and the web app has
 * a text-only doGet; no HTMLService page is exposed for google.script.run.
 * The generated secret is printed ONCE in the owner's execution log.
 */
function v2IssueTestInvitation() {
  const ss=v2dTestSheet_();
  const emp=ss.getSheetByName('員工資料').getRange(2,4).getValue();
  if(String(emp||'').trim())throw Error('模擬員工已綁定，不再核發邀請碼');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('系統忙碌，請稍後重新操作');
  try {
    const code=String(Utilities.getUuid()).replace(/-/g,'').toUpperCase();
    if(!/^[A-F0-9]{32}$/.test(code))throw Error('邀請碼產生失敗');
    const salt=String(Utilities.getUuid()).replace(/-/g,'');
    const props=v2dProperties_();
    props.setProperties({
      V2D_INVITE_HASH:v2dHashCode_(code,salt),
      V2D_INVITE_SALT:salt,
      V2D_INVITE_EXPIRES:String(Date.now()+V2D_INVITE_TTL_MS)
    });
    Logger.log('僅測試使用：TEST001 一次性邀請碼 '+code+'（30分鐘內有效，請勿公開分享）');
    return {ok:true,expiresMinutes:30};
  }finally{lock.releaseLock()}
}
function v2dBind_(ss,lineUserId,payload) {
  const code=String(payload&&payload.invitationCode||'').trim().toUpperCase();
  if(!/^[A-F0-9]{32}$/.test(code))throw Error('邀請碼格式不正確');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('綁定忙碌，稍後再試');
  try {
    const sh=ss.getSheetByName('員工資料');
    const old=String(sh.getRange(2,4).getValue()||'').trim();
    if(old===lineUserId)return {ok:true,bound:true,alreadyBound:true};
    if(old)throw Error('模擬員工已綁定其他測試帳號');
    const props=v2dProperties_();
    const hash=props.getProperty('V2D_INVITE_HASH')||'';
    const salt=props.getProperty('V2D_INVITE_SALT')||'';
    const exp=Number(props.getProperty('V2D_INVITE_EXPIRES')||0);
    if(!hash||!salt||!Number.isFinite(exp)||exp<=Date.now())
      throw Error('邀請碼不存在或已過期');
    if(v2dHashCode_(code,salt)!==hash)throw Error('邀請碼不正確');
    if(String(sh.getRange(2,7).getValue()||'').trim()!=='在職')
      throw Error('模擬員工帳號不在職');
    // Write first; a retry with the same LINE identity can confirm success.
    sh.getRange(2,4).setValue(lineUserId);
    SpreadsheetApp.flush();
    props.deleteProperty('V2D_INVITE_HASH');
    props.deleteProperty('V2D_INVITE_SALT');
    props.deleteProperty('V2D_INVITE_EXPIRES');
    return {ok:true,bound:true,alreadyBound:false};
  }finally{lock.releaseLock()}
}
function v2dClockFind_(rows,employeeId,requestId) {
  const source='LINE-V2:'+requestId;
  let row=null;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(String(r[10]||'')!==source)continue;
    if(String(r[3]||'')!==employeeId || row)
      throw Error('打卡請求編號衝突，請聯絡管理員');
    row=r;
  }
  return row;
}
function v2dClockSummary_(row,already) {
  const date=row[1] instanceof Date ?
    Utilities.formatDate(row[1],'Asia/Taipei','yyyy/MM/dd') :
    String(row[1]||'').replace(/-/g,'/');
  const time=row[2] instanceof Date ?
    Utilities.formatDate(row[2],'Asia/Taipei','HH:mm:ss') :
    String(row[2]||'');
  return {ok:true,found:true,alreadyRecorded:!!already,
    date,time,type:String(row[5]||''),placeName:String(row[7]||''),
    message:already?'已確認先前的測試打卡紀錄':'模擬打卡成功'};
}
function v2dClockId_(payload) {
  const id=String(payload&&payload.requestId||'').trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))
    throw Error('打卡請求編號無效');
  return id;
}
function v2dSite_(ss,latitude,longitude) {
  const sheet=ss.getSheetByName('上班地點');
  const data=sheet.getDataRange().getValues();
  const sites=data.slice(1).filter(r=>String(r[0]||'')===V2D_LOCATION_CODE);
  if(sites.length!==1)throw Error('模擬打卡地點設定不正確');
  const row=sites[0],parts=String(row[3]||'').split(',');
  if(parts.length!==2)throw Error('測試 GPS 中心點設定無效');
  const lat=Number(parts[0]),lng=Number(parts[1]),radius=Number(row[4]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng) ||
    lat< -90||lat>90||lng< -180||lng>180||
    (lat===0 && lng===0)||!Number.isFinite(radius) ||
    radius<10 || radius>300)throw Error('測試場地尚未完成 GPS 設定');
  const rad=Math.PI/180,R=6371000;
  const dLat=(latitude-lat)*rad,dLng=(longitude-lng)*rad;
  const a=Math.sin(dLat/2)**2+
    Math.cos(lat*rad)*Math.cos(latitude*rad)*Math.sin(dLng/2)**2;
  const distance=Math.round(R*2*Math.asin(Math.min(1,Math.sqrt(a))));
  return {code:V2D_LOCATION_CODE,name:String(row[1]||'測試場地'),
    distance,allowDistance:radius};
}
function v2dClock_(ss,lineUserId,payload,asStatus) {
  const id=v2dClockId_(payload);
  const employee=v2dEmployee_(ss,lineUserId);
  if(!employee.bound)throw Error('LINE 尚未綁定模擬員工');
  const type=String(payload&&payload.type||'');
  if(type!=='上班'&&type!=='下班')throw Error('打卡類型錯誤');
  if(asStatus){
    const sh=ss.getSheetByName('打卡紀錄');
    const match=v2dClockFind_(sh.getDataRange().getValues(),V2D_EMPLOYEE_ID,id);
    if(match&&String(match[5])!==type)throw Error('打卡請求編號類型不符');
    return match?v2dClockSummary_(match,true):
      {ok:true,found:false,message:'尚未查到打卡紀錄，請稍後再確認'};
  }
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('打卡忙碌，請稍後確認原請求');
  try{
    const sh=ss.getSheetByName('打卡紀錄'),rows=sh.getDataRange().getValues();
    const existing=v2dClockFind_(rows,V2D_EMPLOYEE_ID,id);
    if(existing){
      if(String(existing[5])!==type)throw Error('打卡請求編號類型不符');
      return v2dClockSummary_(existing,true);
    }
    // A bound employee's existing punch is authoritative even after leaving
    // the allowed GPS area. Check the server record before revalidating GPS.
    const now=new Date();
    const date=Utilities.formatDate(now,'Asia/Taipei','yyyy/MM/dd');
    const time=Utilities.formatDate(now,'Asia/Taipei','HH:mm:ss');
    for(const old of rows.slice(1)){
      // Google Sheets may auto-convert a written yyyy/MM/dd cell into a Date.
      // Compare the Taipei calendar day in both Date and textual cell cases.
      const oldDay=old[1] instanceof Date
        ? Utilities.formatDate(old[1],'Asia/Taipei','yyyy/MM/dd')
        : String(old[1]||'').replace(/-/g,'/');
      if(String(old[3])===V2D_EMPLOYEE_ID&&
        oldDay===date&&String(old[5])===type)
        return {ok:false,code:'ALREADY_CLOCKED',
          message:'今天已有同類型測試打卡，請查詢紀錄'};
    }
    if(payload.lat==null||payload.lng==null)throw Error('尚未取得 GPS 定位');
    // A delayed retry may reuse a stored request ID, but a first-time write
    // must use a fresh geolocation reading. Never accept old captured coordinates
    // just because a request was left pending in sessionStorage.
    const capturedAt=Number(payload.capturedAt);
    if(!Number.isFinite(capturedAt) || capturedAt<Date.now()-120000 ||
       capturedAt>Date.now()+15000)
      throw Error('GPS 定位已過期，請重新取得位置');
    const lat=Number(payload.lat),lng=Number(payload.lng),accuracy=Number(payload.accuracy);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||
      lng< -180||lng>180)throw Error('GPS 座標無效');
    if(!Number.isFinite(accuracy)||accuracy<=0||accuracy>150)
      throw Error('定位精度不足，請重新定位');
    const site=v2dSite_(ss,lat,lng);
    if(site.distance>site.allowDistance)throw Error('超出測試打卡允許範圍');
    const row=[now,date,time,V2D_EMPLOYEE_ID,employee.name,type,
      site.code,site.name,lat+','+lng,
      '模擬距離'+site.distance+'公尺；定位精度'+Math.round(accuracy)+'公尺',
      'LINE-V2:'+id];
    sh.appendRow(row);
    SpreadsheetApp.flush();
    return v2dClockSummary_(row,false);
  }finally{lock.releaseLock()}
}
/**
 * Read-only, LINE-authenticated TODAY attendance result.
 * Works after browser restart even if the original requestId is lost.
 * Uses Taiwan server calendar day, never a user-supplied date or employee ID.
 * Returns no GPS, LINE ID or request identifiers.
 *
 * Absence of a row is not proof that an in-flight write failed.
 */
function v2dTodayAttendance_(ss,lineUserId) {
  const emp=v2dEmployee_(ss,lineUserId);
  if(!emp.bound)throw Error('LINE 尚未綁定模擬員工');
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd');
  const sh=ss.getSheetByName('打卡紀錄');
  const values=sh.getDataRange().getValues();
  const found={'上班':null,'下班':null};
  const counts={'上班':0,'下班':0};
  for(let i=1;i<values.length;i++){
    const row=values[i];
    if(String(row[3]||'').trim()!==emp.employeeId)continue;
    // Sheets sometimes auto-converts yyyy/MM/dd to an actual Date cell.
    const day=row[1] instanceof Date
      ?Utilities.formatDate(row[1],'Asia/Taipei','yyyy/MM/dd')
      :String(row[1]||'').trim().replace(/-/g,'/');
    if(day!==today)continue;
    const type=String(row[5]||'').trim();
    if(type!=='上班'&&type!=='下班')continue;
    counts[type]++;
    if(counts[type]>1)
      throw Error('本日測試打卡紀錄重複，請管理員核對');
    const time=row[2] instanceof Date
      ?Utilities.formatDate(row[2],'Asia/Taipei','HH:mm:ss')
      :String(row[2]||'').trim();
    if(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))
      throw Error('本日測試打卡時間格式異常');
    found[type]={
      time:time,
      placeName:String(row[7]||'').trim().slice(0,80)
    };
  }
  return {ok:true,date:today,clockIn:found['上班'],clockOut:found['下班'],
    total:counts['上班']+counts['下班'],
    message:'僅顯示已查到的今日打卡紀錄；未顯示不代表正在處理的打卡失敗'};
}
function v2dDispatch_(params) {
  const ss=v2dTestSheet_();
  if(!params || typeof params!=='object')throw Error('無效請求');
  const nonce=String(params.nonce||'');
  if(!/^[0-9a-f]{40}$/.test(nonce))throw Error('無效請求識別碼');
  const operation=String(params.operation||'');
  if(!['whoami','bind','clock','clockStatus','todayAttendance','monthQuery','missHistory','leaveHistory','submitMiss','submitLeave'].includes(operation))
    throw Error('未提供此測試功能');
  const raw=String(params.payload||'');
  if(raw.length<30||raw.length>12000)throw Error('請求內容長度不正確');
  let data;
  try{data=JSON.parse(raw)}catch(_){throw Error('請求 JSON 格式錯誤')}
  if(!data||Array.isArray(data)||typeof data!=='object'||
    typeof data.idToken!=='string')throw Error('缺少 LINE 登入資料');
  // Authentication always occurs before dispatch.
  const lineUserId=v2dLineClaims_(data.idToken);
  if(operation==='whoami')return {nonce,result:v2dWhoami_(ss,lineUserId)};
  if(operation==='monthQuery')return {nonce,result:v2rQueryMonthly_(ss,lineUserId,data)};
  if(operation==='missHistory')return {nonce,result:v2rMissHistory_(ss,lineUserId)};
  if(operation==='leaveHistory')return {nonce,result:v2rLeaveHistory_(ss,lineUserId)};
  if(operation==='submitMiss'||operation==='submitLeave'){
    // Fail closed until test owner explicitly enables synthetic-only writes.
    if(v2dProperties_().getProperty('ATTENDANCE_V2_APPLICATION_TEST_WRITES')!=='enabled')
      throw Error('隔離表單寫入尚未開放');
    return {nonce,result:operation==='submitMiss'
      ?v2wMiss_(ss,lineUserId,data):v2wLeave_(ss,lineUserId,data)};
  }
  if(operation==='todayAttendance')return {nonce,result:v2dTodayAttendance_(ss,lineUserId)};
  if(operation==='bind')return {nonce,result:v2dBind_(ss,lineUserId,data)};
  if(operation==='clock')return {nonce,result:v2dClock_(ss,lineUserId,data,false)};
  return {nonce,result:v2dClock_(ss,lineUserId,data,true)};
}
function v2dResponse_(data) {
  // No LINE tokens, user IDs or stack traces ever echoed to caller.
  const js=JSON.stringify(data).replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script>window.top.postMessage('+js+','+
    JSON.stringify(V2D_REPLY_ORIGIN)+
    ');</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function v2dPublicFailure_(error) {
  // Only these deliberately known, pre-write validation failures may be
  // described as definitive. Any unexpected error remains UNKNOWN so the
  // operator can check the original request status, not blindly retry.
  const msg=String(error && error.message || '');
  const reasons={
    '邀請碼格式不正確':'BIND_FORMAT',
    '邀請碼不存在或已過期':'BIND_EXPIRED',
    '邀請碼不正確':'BIND_INVALID',
    '模擬員工已綁定其他測試帳號':'BIND_TAKEN',
    '模擬員工帳號不在職':'INACTIVE',
    'LINE 尚未綁定模擬員工':'NOT_BOUND',
    '尚未取得 GPS 定位':'GPS_MISSING',
    'GPS 座標無效':'GPS_INVALID',
    '定位精度不足，請重新定位':'GPS_ACCURACY',
    'GPS 定位已過期，請重新取得位置':'GPS_STALE',
    '測試場地尚未完成 GPS 設定':'SITE_NOT_READY',
    '超出測試打卡允許範圍':'OUT_OF_RANGE',
    '打卡類型錯誤':'TYPE_INVALID',
    '打卡請求編號無效':'REQUEST_ID_INVALID',
    '打卡請求編號類型不符':'REQUEST_ID_CONFLICT'
  };
  if(Object.prototype.hasOwnProperty.call(reasons,msg))
    return {code:reasons[msg],error:msg,persisted:false};
  if(/LINE 登入/.test(msg)||/LINE 驗證/.test(msg))
    return {code:'AUTH',error:'LINE 登入驗證失敗，請重新開啟測試入口',
      persisted:false};
  return {code:'UNKNOWN',error:'測試結果尚未確認，請查詢原請求或聯絡管理員'};
}
function doPost(e) {
  const params=(e&&e.parameter)||{},nonce=String(params.nonce||'');
  let reply;
  try{
    const data=v2dDispatch_(params);
    reply={bridge:'YC_V2_STAGING_FORM_V1',nonce:data.nonce,ok:true,
      result:data.result};
  }catch(error){
    reply={bridge:'YC_V2_STAGING_FORM_V1',nonce,ok:false,
      ...v2dPublicFailure_(error)};
  }
  return v2dResponse_(reply);
}
function doGet() {
  return ContentService.createTextOutput('獨立打卡 V2 模擬資料測試服務：無網頁操作介面。')
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * V2 DATA TEST ONLY – run once from its private Apps Script editor.
 * NO spreadsheet writes, no LINE token requests, no invitation issuance.
 * Existing v2dTestSheet_ validates test-mode, Channel ID, and exact Sheet ID/name.
 */
function v2CheckSandboxDataSetup() {
  const ss = v2dTestSheet_();
  const employees = ss.getSheetByName('員工資料');
  const places = ss.getSheetByName('上班地點');
  const clocks = ss.getSheetByName('打卡紀錄');
  const bound = String(employees.getRange(2, 4).getValue() || '').trim() !== '';
  const center = String(places.getRange(2, 4).getValue() || '').trim();
  const summary = {
    ok: true,
    testSheet: ss.getName(),
    testEmployee: 'TEST001',
    binding: bound ? '已綁定' : '尚未綁定',
    gpsSite: center === '0,0' ? '尚未設定測試定位' : '已有測試定位設定',
    clockDataRows: Math.max(0, clocks.getLastRow() - 1)
  };
  Logger.log('V2 DATA TEST PREFLIGHT PASS：' + JSON.stringify(summary));
  return summary;
}


/**
 * V2 legacy-function reuse adapter — READ-ONLY, ISOLATED TEST ONLY.
 * SOURCE: established LINE attendance app's existing 11 / 13 / 12 column
 * schemas and response shapes; no active-sheet access, no legacy JSONP.
 *
 * NEVER DEPLOY THIS FILE ALONE. Load into the isolated V2 DATA TEST service
 * after reviewing the owner account, postForm dispatch and test-sheet guard.
 * Every caller MUST first validate a LINE ID token with v2dLineClaims_.
 *
 * Required in the same isolated project:
 *   v2dTestSheet_(), v2dEmployee_(), v2dLineClaims_().
 */
function v2rBoundEmployee_(ss,lineUserId) {
  const emp=v2dEmployee_(ss,lineUserId);
  if(!emp || !emp.bound || emp.employeeId!=='TEST001')
    throw Error('LINE 尚未綁定隔離模擬員工');
  return emp;
}
function v2rSheet_(ss,name) {
  const sh=ss.getSheetByName(name);
  if(!sh)throw Error('缺少隔離資料表：'+name);
  return sh;
}
function v2rDate_(v) {
  if(v instanceof Date) return Utilities.formatDate(v,'Asia/Taipei','yyyy/MM/dd');
  const raw=String(v==null?'':v).trim().replace(/-/g,'/');
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(raw))return '';
  return raw;
}
function v2rTime_(v) {
  if(v instanceof Date) return Utilities.formatDate(v,'Asia/Taipei','HH:mm');
  return String(v==null?'':v).trim().slice(0,8);
}
function v2rMonth_(text) {
  const m=String(text||'').trim();
  if(!/^\d{6}$/.test(m))throw Error('月份格式錯誤');
  const year=Number(m.slice(0,4)),month=Number(m.slice(4,6));
  if(month<1||month>12)throw Error('月份格式錯誤');
  const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMM');
  const n=(Number(now.slice(0,4))-year)*12+(Number(now.slice(4,6))-month);
  if(n<0||n>2)throw Error('只能查詢當月及前兩個月');
  return m;
}
function v2rQueryMonthly_(ss,lineUserId,payload) {
  const emp=v2rBoundEmployee_(ss,lineUserId);
  const month=v2rMonth_(payload&&payload.month);
  const values=v2rSheet_(ss,'打卡紀錄').getDataRange().getValues(),out=[];
  for(let i=1;i<values.length;i++){
    const r=values[i];
    if(String(r[3]||'').trim()!==emp.employeeId)continue;
    const day=v2rDate_(r[1]);
    if(!day||day.replace(/\//g,'').slice(0,6)!==month)continue;
    out.push({date:day,time:v2rTime_(r[2]),
      type:String(r[5]||''),placeName:String(r[7]||'').slice(0,100)});
    if(out.length>300)throw Error('本月紀錄過多，請管理員核對');
  }
  return {ok:true,month,total:out.length,data:out};
}
function v2rMissHistory_(ss,lineUserId) {
  const emp=v2rBoundEmployee_(ss,lineUserId);
  const rows=v2rSheet_(ss,'補打卡申請').getDataRange().getValues();
  const out=[];
  for(let i=rows.length-1;i>=1;i--){
    const r=rows[i];
    if(String(r[1]||'').trim()!==emp.employeeId)continue;
    let approved='';
    if(r[12]){
      approved=r[12] instanceof Date
        ?Utilities.formatDate(r[12],'Asia/Taipei','yyyy/MM/dd HH:mm')
        :String(r[12]).trim().slice(0,60);
    }
    out.push({date:v2rDate_(r[3]),
      type:String(r[5]||''),time:v2rTime_(r[6]),
      approvedTime:approved,reason:String(r[7]||'').slice(0,500),
      status:String(r[8]||'')});
    if(out.length===10)break;
  }
  return {ok:true,data:out};
}
function v2rLeaveHistory_(ss,lineUserId) {
  const emp=v2rBoundEmployee_(ss,lineUserId);
  const rows=v2rSheet_(ss,'請假申請').getDataRange().getValues();
  const out=[];
  for(let i=rows.length-1;i>=1;i--){
    const r=rows[i];
    if(String(r[1]||'').trim()!==emp.employeeId)continue;
    out.push({date:v2rDate_(r[4]),
      type:String(r[3]||''),range:String(r[6]||'').slice(0,100),
      status:String(r[8]||''),reason:String(r[7]||'').slice(0,500)});
    if(out.length===10)break;
  }
  return {ok:true,data:out};
}
/* Integration rule: call these functions ONLY after v2dLineClaims_ obtains
 * lineUserId in a safe doPost dispatcher. Never expose legacy GET JSONP.
 * This adapter intentionally does not send, approve, revoke or edit forms.
 */


/**
 * ISOLATED TEST ONLY — reuse established missed-punch/leave columns, no LINE push.
 * Must be called only after LINE id_token was checked by v2dLineClaims_.
 * The one bound TEST001 employee is derived from verified LINE claims,
 * never from submitted empid/name/company/LINE userId.
 *
 * No management review / notification occurs here. Keep this code on
 * feature branch until approved isolated DATA TEST installation.
 */
function v2wRequestId_(payload){
  const id=String(payload&&payload.requestId||'').trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))throw Error('申請請求編號不正確');
  return id;
}
function v2wDay_(value){
  const day=String(value||'').trim().replace(/\//g,'-');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('申請日期格式不正確');
  const d=new Date(day+'T00:00:00+08:00');
  if(Number.isNaN(d.getTime())||
    Utilities.formatDate(d,'Asia/Taipei','yyyy-MM-dd')!==day)
    throw Error('申請日期不存在');
  return {key:day,date:d};
}
function v2wClockTime_(value){
  const t=String(value||'').trim();
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('申請時間格式不正確');
  return t;
}
function v2wFields_(ss,lineUserId){
  const emp=v2rBoundEmployee_(ss,lineUserId);
  const row=emp.employeeRow;
  if(!Array.isArray(row)||String(row[6]||'')!=='在職')
    throw Error('模擬員工已停用');
  return {id:emp.employeeId,name:emp.name,company:String(row[4]||'')};
}
function v2wKnown_(sh,id,empId){
  const rows=sh.getDataRange().getValues();
  let hit=null;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(String(r[0]||'')!==id)continue;
    if(hit||String(r[1]||'')!==empId)
      throw Error('申請編號衝突，請管理員核對');
    hit=r;
  }
  return hit;
}
function v2wMiss_(ss,lineUserId,payload){
  const emp=v2wFields_(ss,lineUserId);
  const id='MISS-V2-'+v2wRequestId_(payload);
  const day=v2wDay_(payload&&payload.date);
  const nowKey=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  const yKey=Utilities.formatDate(new Date(Date.now()-86400000),'Asia/Taipei','yyyy-MM-dd');
  if(day.key!==nowKey&&day.key!==yKey)throw Error('補打卡只能申請今天或昨天');
  const type=String(payload&&payload.type||'').trim();
  if(type!=='上班'&&type!=='下班')throw Error('補打卡類型錯誤');
  const time=v2wClockTime_(payload&&payload.time);
  const reason=String(payload&&payload.reason||'').trim();
  if(!reason||reason.length>500)throw Error('請填寫有效的補打卡原因');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('申請系統忙碌，請查詢原請求');
  try{
    const sh=v2rSheet_(ss,'補打卡申請');
    const old=v2wKnown_(sh,id,emp.id);
    if(old){
      if(v2rDate_(old[3])!==day.key.replace(/-/g,'/')||
         String(old[5])!==type||String(old[6])!==time)
        throw Error('申請編號與先前內容不同');
      return {ok:true,alreadyRecorded:true,applicationId:id,
        status:String(old[8]||''),message:'已查到原補打卡申請'};
    }
    const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
    sh.appendRow([id,emp.id,emp.name,day.date,emp.company,type,time,
      reason,'待審核',now,'','','']);
    SpreadsheetApp.flush();
    return {ok:true,alreadyRecorded:false,applicationId:id,status:'待審核',
      message:'隔離補打卡申請已保存（不通知主管）'};
  }finally{lock.releaseLock()}
}
function v2wLeave_(ss,lineUserId,payload){
  const emp=v2wFields_(ss,lineUserId);
  const id='LEAVE-V2-'+v2wRequestId_(payload);
  const day=v2wDay_(payload&&payload.leaveDate);
  const nowKey=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  if(day.key<nowKey)throw Error('請假不可選過去日期');
  const type=String(payload&&payload.type||'').trim();
  const allowed=['事假','病假','特休','公假','婚假','喪假'];
  if(!allowed.includes(type))throw Error('請假假別不正確');
  const unit=String(payload&&payload.unit||'').trim();
  const reason=String(payload&&payload.reason||'').trim();
  if(reason.length>500)throw Error('請假備註過長');
  let quantity='';
  if(unit==='全天')quantity='1天';
  else if(unit==='上午'||unit==='下午')quantity=unit;
  else if(unit==='時數'){
    const start=v2wClockTime_(payload&&payload.startTime);
    const end=v2wClockTime_(payload&&payload.endTime);
    if(end<=start)throw Error('請假結束時間必須晚於開始時間');
    quantity=start+'-'+end;
  }else throw Error('請假區間不正確');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('申請系統忙碌，請查詢原請求');
  try{
    const sh=v2rSheet_(ss,'請假申請'),old=v2wKnown_(sh,id,emp.id);
    if(old){
      if(v2rDate_(old[4])!==day.key.replace(/-/g,'/')||
         String(old[3])!==type||String(old[6])!==quantity)
        throw Error('申請編號與先前內容不同');
      return {ok:true,alreadyRecorded:true,applicationId:id,
        status:String(old[8]||''),message:'已查到原請假申請'};
    }
    const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
    sh.appendRow([id,emp.id,emp.name,type,day.date,day.date,
      quantity,reason,'待審核',now,'','']);
    SpreadsheetApp.flush();
    return {ok:true,alreadyRecorded:false,applicationId:id,status:'待審核',
      message:'隔離請假申請已保存（不通知主管）'};
  }finally{lock.releaseLock()}
}
/* Deliberately absent: manager approvals, push notifications, live employee
 * lookup, production spreadsheet IDs, and any doGet/JSONP write path.
 * Review authorization must be implemented and independently tested first.
 */
