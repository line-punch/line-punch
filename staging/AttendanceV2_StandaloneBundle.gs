/**
 * YC ATTENDANCE V2 STANDALONE STAGING BUNDLE
 * For a NEW standalone Apps Script project under the attendance Google account.
 * NEVER put this code inside the existing live attendance Apps Script project.
 * Uses Script Properties and SpreadsheetApp.openById(), never an active sheet.
 * This is a test-only proof of concept; not production-ready.
 */
/**
 * Standalone Apps Script TEST connection.
 * This deliberately never uses the active spreadsheet or any production Sheet.
 * Script Properties:
 *   ATTENDANCE_V2_TEST = enabled
 *   ATTENDANCE_V2_TEST_SHEET_ID = exact NEW BLANK test spreadsheet ID
 * This function is required in every request, including reads.
 */
function v2OpenDedicatedTestSheet_() {
  const props=PropertiesService.getScriptProperties();
  if (props.getProperty('ATTENDANCE_V2_TEST')!=='enabled')
    throw new Error('安全鎖定：測試環境尚未啟用');
  const id=String(props.getProperty('ATTENDANCE_V2_TEST_SHEET_ID')||'').trim();
  if(!/^[A-Za-z0-9_-]{20,}$/.test(id))
    throw new Error('安全鎖定：缺少有效的測試試算表 ID');
  const ss=SpreadsheetApp.openById(id);
  if(!ss || ss.getId()!==id || ss.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY')
    throw new Error('安全鎖定：只允許 V2 隔離測試試算表');
  return ss;
}

/**
 * YC ATTENDANCE V2 INTEGRATION TEST BUNDLE — 2026-10-21
 * ISOLATED TEST SPREADSHEET ONLY. NEVER USE WITH LIVE PRODUCTION SHEET.
 * Install with AttendanceV2_SecurePortal.html in a NEW bound GAS test project.
 * No LIVE LINE OAuth Channel or official Webhook should point to this project.
 * All user data in v2InstallSyntheticFixture_() are synthetic.
 */

// =============================
// AttendanceV2_TestFixture.gs
// =============================
/**
 * Isolated test spreadsheet schema generator ONLY.
 * Absolutely never call from a production spreadsheet or Apps Script project.
 * To enable, the bound spreadsheet must be named exactly
 * "YC_ATTENDANCE_V2_TEST_ONLY" and the following Script Properties must match:
 * ATTENDANCE_V2_TEST = enabled
 * ATTENDANCE_V2_TEST_SHEET_ID = ID of this same test spreadsheet.
 */
function v2AssertTestSheet_() {
  const ss=v2OpenDedicatedTestSheet_();
  const cfg=PropertiesService.getScriptProperties();
  if(!ss || ss.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY' ||
     cfg.getProperty('ATTENDANCE_V2_TEST')!=='enabled' ||
     cfg.getProperty('ATTENDANCE_V2_TEST_SHEET_ID')!==ss.getId()) {
    throw new Error('安全鎖定：目前不是授權的 V2 隔離測試表，拒絕寫入');
  }
  return ss;
}
function v2InstallSyntheticFixture_() {
  const ss=v2AssertTestSheet_();
  const definitions=[
    ['員工資料',['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點']],
    ['上班地點',['地點代碼','地點名稱','公司','GPS中心點','容許距離']],
    ['打卡紀錄',['時間戳記','日期','時間','員工ID','姓名','類型','地點代碼','地點名稱','GPS','備註','來源']],
    ['補打卡申請',['申請單號','員工ID','姓名','日期','公司','班別','時間','原因','狀態','申請時間','審核人','審核時間','核定打卡時間']],
    ['請假申請',['申請單號','員工ID','姓名','假別','開始日期','結束日期','天數/時數','原因','狀態','申請時間','審核人','審核時間']],
    ['審核通知名單',['員工ID','員工姓名','第一主管LINE ID','第二主管LINE ID','老闆LINE ID']],
    ['工作日曆',['日期','是否上班','備註','來源']],
    ['綁定邀請',['員工ID','驗證碼SHA256','有效期限','已使用時間','錯誤次數','產生者']]
  ];
  // Fail closed on any prior data; never overwrite a row or existing business tab.
  const existing=ss.getSheets();
  for(const sh of existing) {
    const emptyDefault=['Sheet1','工作表1'].indexOf(sh.getName())>=0 && sh.getLastRow()===0;
    if(!emptyDefault) throw new Error('測試表不是空白，請新建完全空白的測試試算表');
  }
  for(const [name,headers] of definitions) {
    const sh=ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  ss.getSheetByName('員工資料').appendRow([
    'TEST001','模擬員工甲','','','TEST_CO','測試部門','在職','TESTSITE'
  ]);
  // 0,0 deliberately prevents accidental real-world GPS punching.
  const loc=ss.getSheetByName('上班地點');
  loc.appendRow(['TESTSITE','測試場地','TEST_CO','0,0',30]);
  ss.getSheetByName('審核通知名單').appendRow(['TEST001','模擬員工甲','','','']);
  const dayRows=[];
  for(const year of [2026,2027]) {
    for(let t=Date.UTC(year,0,1);t<Date.UTC(year+1,0,1);t+=86400000) {
      const date=new Date(t),key=date.toISOString().slice(0,10);
      const weekend=[0,6].includes(date.getUTCDay());
      let working=!weekend;
      let note=weekend?'週末模擬休息':'模擬工作日';
      if(key==='2026-11-11') {working=false;note='測試用假日（非官方公告）';}
      if(key==='2026-11-14') {working=true;note='測試用星期六補班（非官方公告）';}
      dayRows.push([key,working?'是':'否',note,'SYNTHETIC_TEST_ONLY']);
    }
  }
  const calendar=ss.getSheetByName('工作日曆');
  calendar.getRange(2,1,dayRows.length,4).setValues(dayRows);
  SpreadsheetApp.flush();
  return {ok:true,createdSheets:definitions.map(x=>x[0]),calendarDays:dayRows.length,
    message:'測試資料表已建立。請勿將模擬工作日曆用於正式請假。'};
}
/** For a deliberate TEST opt-in only: attach the tester's verified LINE ID
 * to TEST001. Existing ID must match or be blank; refuses any other employee.
 */
function v2TestOptInLineIdentity(payload) {
  const ss=v2AssertTestSheet_();
  const identity=v2VerifyLineClaims_(payload&&payload.idToken);
  const sh=ss.getSheetByName('員工資料');
  if(!sh||sh.getLastRow()!==2||String(sh.getRange(2,1).getValue())!=='TEST001')
    throw new Error('測試員工資料表狀態不符，停止綁定');
  const old=String(sh.getRange(2,4).getValue()||'').trim();
  if(old && old!==identity.lineUserId)
    throw new Error('已有其他測試使用者，不允許覆蓋');
  if(!old)sh.getRange(2,4).setValue(identity.lineUserId);
  const managers=ss.getSheetByName('審核通知名單');
  if(!managers||managers.getLastRow()!==2) throw new Error('測試審核設定不符');
  managers.getRange(2,5).setValue(identity.lineUserId);
  return {ok:true,message:'僅在隔離測試表完成驗證身分設定'};
}


// =============================
// AttendanceV2_TestCompat.gs
// =============================
/** Test-only compatibility functions. Do NOT copy the production Code.gs.
 * Each helper refuses to operate unless the active Sheet is a V2 test fixture.
 */
function v2TestRows_(name) {
  const ss=v2AssertTestSheet_(),sh=ss.getSheetByName(name);
  if(!sh)throw Error('測試表缺少工作表：'+name);
  return sh.getDataRange().getValues();
}
function getEmployeeById_(id) {
  for(const row of v2TestRows_('員工資料').slice(1)){
    if(String(row[0]||'').trim()!==String(id||'').trim())continue;
    return {employeeId:String(row[0]||''),name:String(row[1]||''),
      phone:String(row[2]||''),lineUserId:String(row[3]||''),
      company:String(row[4]||''),department:String(row[5]||''),
      status:String(row[6]||''),allowedLocation:String(row[7]||'')};
  }
  return null;
}
function getNearestAllowedLocation_(emp,lat,lng){
  const allow=String(emp.allowedLocation||'').split(/[,\s、，]+/).filter(Boolean);
  let nearest=null;
  for(const row of v2TestRows_('上班地點').slice(1)){
    const code=String(row[0]||'').trim();
    if(!code || (allow.length && !allow.includes(code)))continue;
    const coords=String(row[3]||'').replace(/[()]/g,'').split(',');
    if(coords.length!==2)continue;
    const a=Number(coords[0]),b=Number(coords[1]),radius=Number(row[4]);
    if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(radius)||radius<=0)continue;
    const rad=Math.PI/180,R=6371000;
    const dlat=(a-lat)*rad,dlng=(b-lng)*rad;
    const q=Math.sin(dlat/2)**2 +Math.cos(lat*rad)*Math.cos(a*rad)*Math.sin(dlng/2)**2;
    const distance=Math.round(R*2*Math.asin(Math.min(1,Math.sqrt(q))));
    if(!nearest||distance<nearest.distance)
      nearest={code,name:String(row[1]||''),distance,allowDistance:radius};
  }
  return nearest;
}
function getManagers_(id) {
  for(const row of v2TestRows_('審核通知名單').slice(1)){
    if(String(row[0]||'').trim()===String(id||'').trim())
      return {m1:String(row[2]||''),m2:String(row[3]||''),boss:String(row[4]||'')};
  }
  return {};
}
function getNameByLineUserId_(uid){
  for(const row of v2TestRows_('員工資料').slice(1))
    if(String(row[3]||'')===String(uid||''))return String(row[1]||'');
  return '測試主管';
}
function combineDateTime_(dateValue,timeValue){
  v2AssertTestSheet_();
  const day=dateValue instanceof Date
    ? Utilities.formatDate(dateValue,'Asia/Taipei','yyyy-MM-dd')
    : String(dateValue||'').replace(/\//g,'-').slice(0,10);
  const time=timeValue instanceof Date
    ? Utilities.formatDate(timeValue,'Asia/Taipei','HH:mm')
    : String(timeValue||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return null;
  const result=new Date(day+'T'+time+':00+08:00');
  return Number.isNaN(result.getTime())?null:result;
}
function nowInfo_(){
  v2AssertTestSheet_();
  const ts=new Date(),zone='Asia/Taipei';
  return {ts,date:Utilities.formatDate(ts,zone,'yyyy/MM/dd'),
    time:Utilities.formatDate(ts,zone,'HH:mm:ss'),
    full:Utilities.formatDate(ts,zone,'yyyy/MM/dd HH:mm:ss')};
}
/* This file substitutes the necessary Code.gs pure helpers only for TEST.
 * It does not define any Webhook POST handler or import the unsafe JSONP API.
 */


// =============================
// AttendanceV2_WorkdayLeave.gs
// =============================
/**
 * Attendance V2 staged Apps Script helpers.
 * NOT DEPLOYED. Review and integrate into the actual Code.gs in a test project.
 * Calendar sheet "工作日曆" header: 日期 | 是否上班 | 備註 | 來源
 * Dates must be ISO yyyy-MM-dd; 是否上班: 是 / 否.
 * Import an official Taiwan holiday/workday calendar separately and validate
 * its applicability to the company before enabling this feature.
 */
function v2Ymd_(value) {
  const s = String(value || '').trim().replace(/\//g, '-');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error('日期格式錯誤');
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new Error('日期不存在');
  }
  return { key:s, date:date };
}
function v2Key_(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}
function v2WorkCalendar_() {
  const sh = v2OpenDedicatedTestSheet_().getSheetByName('工作日曆');
  if (!sh) throw new Error('尚未建立工作日曆，暫停多日請假');
  const rows = sh.getDataRange().getValues();
  const map = new Map();
  for (let i=1; i<rows.length; i++) {
    const raw = rows[i][0];
    if (!raw) continue;
    const key = raw instanceof Date
      ? Utilities.formatDate(raw, 'Asia/Taipei', 'yyyy-MM-dd')
      : v2Ymd_(raw).key;
    const value = String(rows[i][1]).trim();
    if (value !== '是' && value !== '否') throw new Error('工作日曆第'+(i+1)+'列設定錯誤');
    map.set(key, value === '是');
  }
  return map;
}
/**
 * Fail closed on missing dates. The official calendar import must populate
 * all dates in the request interval (including weekends) to avoid silently
 * treating a national holiday as an ordinary weekday.
 */
function v2ValidateLeaveRange_(startText,endText,unit,calendarOverride,todayOverride) {
  const start = v2Ymd_(startText);
  const end = v2Ymd_(endText || startText);
  if (end.date < start.date) throw new Error('結束日期不可早於開始日期');
  const today = todayOverride || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  if (start.key < today) throw new Error('請假不可選過去日期');
  const days = Math.round((end.date - start.date)/86400000)+1;
  if (days > 31) throw new Error('單張請假最多31個日曆天，請拆單');
  if (unit !== '全天' && days !== 1) throw new Error('非全天請假僅能申請單日');
  if (unit !== '全天' && unit !== '時數' && unit !== '上午' && unit !== '下午') throw new Error('不支援的請假單位');
  const calendar = calendarOverride || v2WorkCalendar_();
  const invalid = [];
  for (let i=0;i<days;i++) {
    const d = new Date(start.date.getTime()+i*86400000);
    const key = v2Key_(d);
    if (!calendar.has(key)) throw new Error('工作日曆缺少 '+key+'，請管理員先更新');
    if (!calendar.get(key)) invalid.push(key);
  }
  if (invalid.length) throw new Error('請假區間包含休息日：'+invalid.join('、')+'；請拆成不同申請單');
  return { startDate:start.key,endDate:end.key,days:days };
}
/**
 * Build the values for the existing 12-column "請假申請" schema.
 * Use in the server-side leave_ handler after verified employee identity,
 * LockService locking, and idempotency checks have been added.
 * A single application represents the entire consecutive working-day range.
 */
function v2LeaveRow_(no,employee,leaveType,unit,range,reason,nowText,startTime,endTime) {
  let quantity;
  if (unit === '全天') quantity = range.days + '天';
  else if (unit === '時數') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || '') || startTime >= endTime) throw new Error('請假時間區間錯誤');
    quantity = startTime + '-' + endTime;
  }
  else quantity = unit;
  return [
    no,employee.employeeId,employee.name,leaveType,
    v2Ymd_(range.startDate).date,v2Ymd_(range.endDate).date,
    quantity,reason,'待審核',nowText,'',''
  ];
}
/**
 * Integration requirements:
 * 1. Authenticate caller on the SERVER, not solely by empid/userId from JSONP.
 * 2. Use LockService and stable requestId before appendRow to prevent duplicates.
 * 3. Return application number, range and days only after durable append.
 * 4. Separate notification failure from data-write result.
 * 5. For managers, show startDate/endDate and total days in Flex/reply/history.
 * 6. Keep existing single-day rows readable.
 * 7. Test in a copy of the Sheet; do not run against production.
 */


// =============================
// AttendanceV2_Auth.gs
// =============================
/**
 * ATTENDANCE V2 - STAGING ONLY. Do not deploy into the existing JSONP /exec.
 * Use from an isolated Apps Script HTMLService page via google.script.run.
 * Required script property: LINE_LOGIN_CHANNEL_ID. Never log ID tokens.
 */
function v2VerifyLineClaims_(idToken) {
  // Fail closed if these staging modules are copied into the wrong project.
  v2AssertTestSheet_();
  const token = String(idToken || '');
  if (token.length < 30 || token.length > 8192 || token.split('.').length !== 3)
    throw new Error('LINE 登入資訊無效，請重新登入');
  const clientId = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
  if (!clientId || !/^\d+$/.test(clientId))
    throw new Error('系統尚未設定 LINE Login Channel ID');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method:'post', contentType:'application/x-www-form-urlencoded',
    payload:{id_token:token,client_id:clientId}, muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200)
    throw new Error('LINE 登入已失效或驗證失敗，請重新開啟系統');
  let claims;
  try { claims = JSON.parse(res.getContentText()); }
  catch (_) { throw new Error('LINE 驗證回應格式錯誤'); }
  const now = Math.floor(Date.now()/1000);
  if (claims.iss !== 'https://access.line.me' ||
      String(claims.aud) !== clientId ||
      !/^U[0-9a-f]{32}$/i.test(String(claims.sub||'')) ||
      !Number.isFinite(Number(claims.exp)) || Number(claims.exp)<=now ||
      !Number.isFinite(Number(claims.iat)) || Number(claims.iat)>now+300)
    throw new Error('LINE 身分驗證資料不正確');
  return {lineUserId:String(claims.sub)};
}
function v2AuthenticatedEmployee_(idToken) {
  const identity = v2VerifyLineClaims_(idToken);
  const sh = v2OpenDedicatedTestSheet_().getSheetByName('員工資料');
  if (!sh) throw new Error('找不到員工資料表');
  const rows = sh.getDataRange().getValues(), matches=[];
  for (let i=1;i<rows.length;i++)
    if (String(rows[i][3]||'').trim()===identity.lineUserId) matches.push(rows[i]);
  if (!matches.length) return {bound:false,lineUserId:identity.lineUserId};
  if (matches.length!==1) throw new Error('此 LINE 帳號對應多位員工，請聯絡管理員');
  const row=matches[0];
  if (String(row[6]||'').trim()!=='在職') throw new Error('此帳號目前無法使用員工系統');
  const employeeId=String(row[0]||'').trim();
  if (!employeeId) throw new Error('員工資料缺少識別碼');
  return {bound:true,lineUserId:identity.lineUserId,employeeId,
    name:String(row[1]||'').trim(),company:String(row[4]||'').trim(),
    department:String(row[5]||'').trim()};
}
function v2WhoamiSecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if (!employee.bound) return {ok:true,bound:false};
  return {ok:true,bound:true,employee:{
    employeeId:employee.employeeId,name:employee.name,
    company:employee.company,department:employee.department}};
}
function v2SubmitLeaveSecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if (!employee.bound) throw new Error('LINE 尚未完成員工綁定');
  const data=Object.assign({},payload||{});
  delete data.idToken;
  data.empid=employee.employeeId;
  return v2SubmitLeave_(data,employee);
}
function v2QueryAttendanceSecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if (!employee.bound) throw new Error('LINE 尚未完成員工綁定');
  const month=String(payload&&payload.month||'').trim();
  if (!/^\d{6}$/.test(month)) throw new Error('查詢月份格式錯誤');
  const now=new Date();
  const currentYear=Number(Utilities.formatDate(now,'Asia/Taipei','yyyy'));
  const currentMonth=Number(Utilities.formatDate(now,'Asia/Taipei','MM'));
  const diff=(currentYear-Number(month.slice(0,4)))*12+(currentMonth-Number(month.slice(4,6)));
  if (Number(month.slice(4,6))<1 || Number(month.slice(4,6))>12 || diff<0 || diff>2)
    throw new Error('只能查詢當月及前兩個月');
  const sh=v2OpenDedicatedTestSheet_().getSheetByName('打卡紀錄');
  if (!sh) throw new Error('找不到打卡紀錄表');
  const values=sh.getDataRange().getValues(), out=[];
  for (let i=1;i<values.length;i++) {
    const row=values[i];
    if (String(row[3]||'').trim()!==employee.employeeId) continue;
    const day=row[1] instanceof Date
      ? Utilities.formatDate(row[1],'Asia/Taipei','yyyyMMdd')
      : String(row[1]||'').replace(/[^0-9]/g,'').slice(0,8);
    if (day.slice(0,6)!==month) continue;
    const time=row[2] instanceof Date
      ? Utilities.formatDate(row[2],'Asia/Taipei','HH:mm:ss')
      : String(row[2]||'').trim();
    out.push({date:day.slice(0,4)+'/'+day.slice(4,6)+'/'+day.slice(6,8),
      time,type:String(row[5]||''),placeName:String(row[7]||'')});
  }
  return {ok:true,month,total:out.length,data:out};
}
/* Release blockers:
 * Existing JSONP GET and unsigned webhook POST must not remain write-capable.
 * A separate test deployment and full mobile compatibility test are required.
 */

// =============================
// AttendanceV2_SubmitLeave.gs
// =============================
/** STAGING ONLY: caller must supply employee verified by a trusted server-side identity check.
 * Original 12-column leave schema is kept. Transaction ID is encoded in column A.
 */
function v2SubmitLeave_(p,employee){
  if(!employee||!employee.employeeId)throw Error('未驗證員工身分');
  if(p.empid&&String(p.empid)!==String(employee.employeeId))throw Error('員工身分不符');
  const id=String(p.requestId||'').trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))throw Error('缺少有效請求識別碼');
  const no='LEAVEV2_'+id;
  const leaveType=String(p.type||p.leaveType||'').trim();
  if(['事假','病假','特休','公假','婚假','喪假'].indexOf(leaveType)<0)throw Error('請選擇有效假別');
  const unit=String(p.unit||p.leaveUnit||'').trim();
  const start=String(p.startDate||p.leaveDate||'').trim();
  const end=String(p.endDate||start).trim();
  const reason=String(p.reason||'').trim();
  const range=v2ValidateLeaveRange_(start,end,unit);
  const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
  const desired=v2LeaveRow_(no,employee,leaveType,unit,range,reason,now,
    String(p.startTime||'').trim(),String(p.endTime||'').trim());
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('系統忙碌，請稍後查詢申請狀態');
  try {
    const sh=v2OpenDedicatedTestSheet_().getSheetByName('請假申請');
    if(!sh)throw Error('找不到請假申請表');
    const rows=sh.getDataRange().getValues();
    const fmt=d=>d instanceof Date
      ? Utilities.formatDate(d,'Asia/Taipei','yyyy-MM-dd')
      : String(d).trim().replace(/\//g,'-');
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][0]).trim()!==no)continue;
      const old=rows[i];
      if(String(old[1])!==String(employee.employeeId)||String(old[3])!==leaveType||
         fmt(old[4])!==range.startDate||fmt(old[5])!==range.endDate||
         String(old[6])!==String(desired[6])||String(old[7])!==reason){
        throw Error('請求識別碼已使用，但申請內容不同');
      }
      return {ok:true,alreadySubmitted:true,no,status:String(old[8]),
        startDate:range.startDate,endDate:range.endDate,days:range.days,
        message:'申請已收到，請勿重複送出'};
    }
    sh.appendRow(desired);
    sh.getRange(sh.getLastRow(),5,1,2).setNumberFormat('yyyy/MM/dd');
    SpreadsheetApp.flush();
    return {ok:true,alreadySubmitted:false,no,status:'待審核',
      startDate:range.startDate,endDate:range.endDate,days:range.days,
      notificationPending:true,message:'請假申請已寫入，待審核'};
  } finally { lock.releaseLock(); }
}
/* Do not connect this to legacy JSONP/GET. Complete verified identity, secure
 * transport and durable notification-outbox handling before any deployment. */

/** Typed validation response for the test UI.
 * Known input errors return a clear non-write result. Any unexpected exception
 * stays an unknown outcome until requestId status is queried.
 */
function v2SubmitLeaveResult(payload) {
  try {
    return v2SubmitLeaveSecure(payload);
  } catch(error) {
    const message=String(error&&error.message||'');
    const patterns=[
      /^請假區間包含休息日：/,
      /^請假不可選過去日期$/,
      /^結束日期不可早於開始日期$/,
      /^日期格式錯誤$/,
      /^日期不存在$/,
      /^單張請假最多31個日曆天/,
      /^非全天請假僅能申請單日$/,
      /^不支援的請假單位$/,
      /^請假時間區間錯誤$/,
      /^請選擇有效假別$/
    ];
    if(patterns.some(re=>re.test(message))) {
      return {ok:false,code:'VALIDATION',message,
        persisted:false};
    }
    // In particular never report "failed" for a write or network exception.
    throw error;
  }
}


// =============================
// AttendanceV2_LeaveHistory.gs
// =============================
/**
 * Attendance V2 staging - secure self-service leave history.
 * Never trust employeeId from a mobile client; derive employee from verified token.
 * Uses original 12-column 請假申請 schema, including older single-day rows.
 */
function v2LeaveHistorySecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if(!employee.bound) throw Error('LINE 尚未綁定員工');
  const sh=v2OpenDedicatedTestSheet_().getSheetByName('請假申請');
  if(!sh) throw Error('找不到請假申請表');
  const rows=sh.getDataRange().getValues(),out=[];
  function asDate(v) {
    if(v instanceof Date) return Utilities.formatDate(v,'Asia/Taipei','yyyy-MM-dd');
    const str=String(v||'').trim().replace(/\//g,'-');
    return /^\d{4}-\d{2}-\d{2}$/.test(str)?str:'';
  }
  for(let i=rows.length-1;i>=1&&out.length<20;i--) {
    const r=rows[i];
    if(String(r[1]||'').trim()!==employee.employeeId)continue;
    const startDate=asDate(r[4]),endDate=asDate(r[5])||startDate;
    out.push({no:String(r[0]||''),leaveType:String(r[3]||''),
      startDate,endDate,quantity:String(r[6]||''),
      reason:String(r[7]||''),status:String(r[8]||'')});
  }
  return {ok:true,employeeName:employee.name,data:out,count:out.length};
}
/* App test must verify only own employee records are returned,
 * and old rows with one date are shown as a single-day interval. */

/** Confirm a previously submitted leave request using its immutable request ID.
 * Not-found is NOT proof of failed submission; the original write may be running.
 */
function v2LeaveStatusSecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if(!employee.bound)throw Error('LINE 尚未綁定員工');
  const requestId=String(payload&&payload.requestId||'').trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))
    throw Error('請假請求識別碼無效');
  const no='LEAVEV2_'+requestId;
  const sh=v2OpenDedicatedTestSheet_().getSheetByName('請假申請');
  if(!sh)throw Error('找不到請假申請表');
  const rows=sh.getDataRange().getValues();
  let found=null;
  for(let i=1;i<rows.length;i++) {
    const r=rows[i];
    if(String(r[0]||'').trim()!==no)continue;
    if(String(r[1]||'').trim()!==employee.employeeId)
      throw Error('該請求編號與登入員工不符');
    if(found)throw Error('請假請求編號重複，請聯絡管理員');
    found=r;
  }
  if(!found)return {ok:true,found:false,
    message:'尚未查到請假資料，可能仍在送出中'};
  function dateText(value) {
    if(value instanceof Date) return Utilities.formatDate(value,'Asia/Taipei','yyyy-MM-dd');
    return String(value||'').trim().replace(/\//g,'-').slice(0,10);
  }
  return {ok:true,found:true,no,leaveType:String(found[3]||''),
    startDate:dateText(found[4]),endDate:dateText(found[5]),
    quantity:String(found[6]||''),status:String(found[8]||''),
    message:'請假申請已確認寫入'};
}


// =============================
// AttendanceV2_Clock.gs
// =============================
/** STAGING ONLY. Requires verified LINE login and Code.gs GPS helpers.
 * Uses existing 打卡紀錄 columns A:K; K stores LINE-V2:<requestId>.
 * NOT for legacy JSONP GET requests. No production deployment.
 */
function v2ClockRequestId_(payload) {
  const id=String(payload&&payload.requestId||'').trim();
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(id)) throw Error('缺少有效打卡請求識別碼');
  return id;
}
function v2ClockFind_(rows,employeeId,requestId) {
  const source='LINE-V2:'+requestId;
  let match=null;
  for(let i=1;i<rows.length;i++) {
    const row=rows[i];
    if(String(row[10]||'').trim()!==source) continue;
    if(String(row[3]||'').trim()!==employeeId) throw Error('打卡請求識別碼與員工資料衝突');
    if(match) throw Error('打卡識別碼對應多筆紀錄，請人工核對');
    match=row;
  }
  return match;
}
function v2ClockSummary_(row,replayed) {
  const date=row[1] instanceof Date
    ? Utilities.formatDate(row[1],'Asia/Taipei','yyyy/MM/dd')
    : String(row[1]||'').replace(/-/g,'/');
  const time=row[2] instanceof Date
    ? Utilities.formatDate(row[2],'Asia/Taipei','HH:mm:ss')
    : String(row[2]||'').trim();
  return {ok:true,found:true,alreadyRecorded:!!replayed,
    date,time,type:String(row[5]||''),name:String(row[4]||''),
    placeName:String(row[7]||''),
    message:replayed?'已查到先前成功的打卡紀錄':'打卡成功'};
}
function v2ClockSecure(payload) {
  const identity=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if(!identity.bound)throw Error('LINE 尚未綁定員工');
  const requestId=v2ClockRequestId_(payload);
  const type=String(payload&&payload.type||'').trim();
  if(type!=='上班' && type!=='下班')throw Error('不支援的打卡類型');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('打卡系統忙碌，請稍後確認紀錄');
  try {
    const sh=v2OpenDedicatedTestSheet_().getSheetByName('打卡紀錄');
    if(!sh)throw Error('找不到打卡紀錄表');
    const rows=sh.getDataRange().getValues();
    const previous=v2ClockFind_(rows,identity.employeeId,requestId);
    if(previous) {
      if(String(previous[5]||'').trim()!==type)
        throw Error('此請求編號已用於其他打卡類型');
      return v2ClockSummary_(previous,true);
    }
    // First-time request only: validate the current GPS coordinates and employee location.
    // A replay can be confirmed even if GPS is now unavailable or the employee moved.
    if(payload.lat==null || payload.lng==null) throw Error('尚未取得 GPS 定位');
    const lat=Number(payload.lat),lng=Number(payload.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||
        lat< -90||lat>90||lng< -180||lng>180)
      throw Error('GPS 定位資料無效');
    const employee=getEmployeeById_(identity.employeeId);
    if(!employee||employee.lineUserId!==identity.lineUserId||
        (employee.status&&employee.status!=='在職'))
      throw Error('員工資料狀態不正確');
    const nearest=getNearestAllowedLocation_(employee,lat,lng);
    if(!nearest)throw Error('找不到可打卡地點');
    if(nearest.distance>nearest.allowDistance)throw Error('超出打卡允許範圍');
    const now=nowInfo_();
    for(let i=1;i<rows.length;i++){
      const row=rows[i];
      const day=row[1] instanceof Date
        ? Utilities.formatDate(row[1],'Asia/Taipei','yyyy/MM/dd')
        : String(row[1]||'').replace(/-/g,'/');
      if(String(row[3]||'').trim()===identity.employeeId &&
         day===now.date && String(row[5]||'').trim()===type)
        return {ok:false,code:'ALREADY_CLOCKED',
          message:'今日已完成此類型打卡，請先查詢紀錄'};
    }
    const remark=String(payload.remark||'').slice(0,150);
    const row=[now.ts,now.date,now.time,identity.employeeId,identity.name,type,
      nearest.code,nearest.name,lat+','+lng,
      '距離：'+nearest.distance+'公尺'+(remark?'；'+remark:''),'LINE-V2:'+requestId];
    sh.appendRow(row);
    SpreadsheetApp.flush();
    return v2ClockSummary_(row,false);
  }finally{lock.releaseLock()}
}
/** Query status after timeout. Missing record is not proof of failed write:
 * previous request may still be in flight. Retry using SAME requestId.
 */
function v2ClockStatusSecure(payload) {
  const identity=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if(!identity.bound)throw Error('LINE 尚未綁定員工');
  const requestId=v2ClockRequestId_(payload);
  const sh=v2OpenDedicatedTestSheet_().getSheetByName('打卡紀錄');
  if(!sh)throw Error('找不到打卡紀錄表');
  const row=v2ClockFind_(sh.getDataRange().getValues(),identity.employeeId,requestId);
  return row?v2ClockSummary_(row,true):
    {ok:true,found:false,message:'尚未查到紀錄，請稍後再查詢'};
}
/* Release blockers: secure HTMLService transport, server-side LINE validation,
 * staging Sheet, concurrent writes, same-day cross-midnight policy and real
 * iOS/Android LIFF tests. */


// =============================
// AttendanceV2_ReviewGuard.gs
// =============================
/** Staging only. Never call before trusted webhook source and reviewer authorization have been verified. */
function v2Decide_(sheetName, requestNo, decision, reviewerLineId, reviewerName, lock) {
  if (['請假申請','補打卡申請'].indexOf(sheetName) === -1) throw Error('不支援的申請類型');
  if (['核准','駁回'].indexOf(decision) === -1) throw Error('不支援的審核動作');
  if (!requestNo || !reviewerLineId || !reviewerName) throw Error('缺少審核資訊');
  if (!lock.tryLock(15000)) throw Error('審核忙碌，請稍後再試');
  try {
    const sh = v2OpenDedicatedTestSheet_().getSheetByName(sheetName);
    if (!sh) throw Error('找不到申請資料表');
    const rows = sh.getDataRange().getValues();
    const matches = [];
    for (let i=1;i<rows.length;i++) if(String(rows[i][0]).trim()===requestNo) matches.push(i);
    if(matches.length>1) throw Error('申請單號重複，暫停審核');
    if(!matches.length) return {ok:false,code:'NOT_FOUND'};
    const i=matches[0],old=String(rows[i][8]).trim();
    const manager=getManagers_(String(rows[i][1]).trim());
    if (!manager || manager.boss!==reviewerLineId) throw Error('無審核權限');
    if(old==='核准'||old==='駁回') return {ok:true,changed:false,status:old,code:'ALREADY_REVIEWED'};
    if(old!=='待審核') throw Error('申請狀態不正確');
    const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
    let approved='';
    if(sheetName==='補打卡申請' && decision==='核准'){
      approved=combineDateTime_(rows[i][3],rows[i][6]);
      if(!(approved instanceof Date)||isNaN(approved.getTime())) throw Error('補打卡日期時間無效');
    }
    const values=[decision,rows[i][9],reviewerName,now];
    if(sheetName==='補打卡申請') values.push(approved);
    sh.getRange(i+1,9,1,values.length).setValues([values]);
    SpreadsheetApp.flush();
    return {ok:true,changed:true,status:decision,code:'REVIEWED',requestNo,reviewerName,reviewTime:now};
  } finally {
    lock.releaseLock();
  }
}
/* Before integration: validate webhook authenticity at trusted entrypoint,
 * pass the verified reviewer identity; this helper checks the request's boss reviewer from the sheet.
 * Source authenticity must still be verified before invoking.
 * Send LINE notifications only after database state is committed.
 * Never deploy without review, replay, authorization and concurrent tests. */


// =============================
// AttendanceV2_SecureReview.gs
// =============================
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
  const sh=v2OpenDedicatedTestSheet_().getSheetByName(sheetName);
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

// =============================
// AttendanceV2_DgpaCalendar.gs
// =============================
/** STAGING ONLY. Parse official DGPA CSV to [日期, 是否上班, 備註, 來源].
 * Does not fetch remote resources or write production Sheets.
 * Supported DGPA fields: 西元日期/日期, 是否放假, 備註.
 */
function v2ParseDgpaCalendar_(csvText, year) {
  const y=Number(year);
  if(!Number.isInteger(y)||y<2020||y>2100)throw Error('年度不正確');
  const rows=Utilities.parseCsv(String(csvText||'').replace(/^\uFEFF/,''));
  if(!rows.length)throw Error('官方日曆資料為空');
  const h=rows[0].map(v=>String(v).trim().replace(/^\uFEFF/,''));
  const dateCol=h.findIndex(v=>v==='西元日期'||v==='日期');
  const flagCol=h.findIndex(v=>v==='是否放假');
  const noteCol=h.findIndex(v=>v==='備註');
  if(dateCol<0||flagCol<0)throw Error('官方日曆欄位格式已改變，停止匯入');
  const parsed=new Map();
  function normalizeDate(v){
    const s=String(v||'').trim();
    const m=/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(s)
      ||/^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if(!m)throw Error('無效日期：'+s);
    const key=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const d=new Date(key+'T00:00:00Z');
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==key)throw Error('日期不存在：'+s);
    return key;
  }
  for(let i=1;i<rows.length;i++){
    const line=rows[i];
    if(line.every(v=>String(v).trim()===''))continue;
    const key=normalizeDate(line[dateCol]);
    if(!key.startsWith(y+'-'))throw Error('包含其他年度的日期：'+key);
    if(parsed.has(key))throw Error('日期重複：'+key);
    const flag=String(line[flagCol]||'').trim();
    if(flag!=='0'&&flag!=='2')throw Error('未知放假代碼：'+flag);
    parsed.set(key,[key,flag==='0'?'是':'否',noteCol<0?'':String(line[noteCol]||''),'DGPA/'+y]);
  }
  const out=[],start=Date.UTC(y,0,1),end=Date.UTC(y+1,0,1);
  for(let t=start;t<end;t+=86400000){
    const key=new Date(t).toISOString().slice(0,10);
    if(!parsed.has(key))throw Error('缺少日期：'+key);
    out.push(parsed.get(key));
  }
  if(out.length!==parsed.size)throw Error('官方日曆日期筆數異常');
  return out;
}
function v2ApplyCompanyDays_(calendarRows,overrides){
  const map=new Map(calendarRows.map(row=>[row[0],row.slice()]));
  for(const x of overrides){
    const key=String(x.date||'').trim();
    if(!map.has(key))throw Error('公司調整日期不在已匯入日曆：'+key);
    if(x.workday!==true&&x.workday!==false)throw Error('公司上班日設定必須為布林值');
    const reason=String(x.reason||'').trim();
    if(!reason)throw Error('公司例外調整必須填寫原因');
    const row=map.get(key);row[1]=x.workday?'是':'否';row[2]=reason;row[3]='公司覆寫';
  }
  return Array.from(map.values());
}


// =============================
// AttendanceV2_Bind.gs
// =============================
/**
 * STAGING ONLY. First-time LINE binding requires a single-use invitation.
 * Test spreadsheet: 員工資料 [員工ID,姓名,手機,LINE userId,公司,部門,狀態]
 * and 綁定邀請 [員工ID,驗證碼SHA256,有效期限,已使用時間,錯誤次數,產生者].
 * Requires secret script property ATTENDANCE_BIND_PEPPER.
 */
function v2HashInvitationCode_(code) {
  const pepper=PropertiesService.getScriptProperties().getProperty('ATTENDANCE_BIND_PEPPER');
  if (!pepper||pepper.length<20) throw new Error('系統尚未設定綁定安全金鑰');
  const raw=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(code||'').trim().toUpperCase()+':'+pepper,Utilities.Charset.UTF_8);
  return raw.map(v=>('0'+(v&255).toString(16)).slice(-2)).join('');
}
function v2BindSecure(payload) {
  const identity=v2VerifyLineClaims_(payload&&payload.idToken);
  const empid=String(payload&&payload.empid||'').trim();
  const code=String(payload&&payload.invitationCode||'').trim().toUpperCase();
  if (!empid||!/^[A-Z0-9-]{8,32}$/.test(code))
    throw new Error('員工資料或綁定驗證碼不正確');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('系統忙碌，請稍後重試');
  try {
    const ss=v2OpenDedicatedTestSheet_();
    const empSheet=ss.getSheetByName('員工資料'),inviteSheet=ss.getSheetByName('綁定邀請');
    if (!empSheet||!inviteSheet) throw new Error('缺少員工綁定設定');
    const employees=empSheet.getDataRange().getValues();
    let target=-1;
    for(let i=1;i<employees.length;i++){
      const rowId=String(employees[i][0]||'').trim();
      const lineId=String(employees[i][3]||'').trim();
      if (lineId===identity.lineUserId&&rowId!==empid)
        throw new Error('此 LINE 帳號已綁定其他員工');
      if (rowId===empid) {
        if(target!==-1) throw new Error('員工資料重複，停止綁定');
        target=i;
      }
    }
    if(target<0) throw new Error('員工資料或綁定驗證碼不正確');
    const employee=employees[target];
    if(String(employee[6]||'').trim()!=='在職') throw new Error('此員工狀態不可綁定');
    const currentId=String(employee[3]||'').trim();
    if(currentId) {
      if(currentId===identity.lineUserId) return {ok:true,alreadyBound:true};
      throw new Error('此員工已綁定其他 LINE 帳號，請聯絡管理員');
    }
    const invites=inviteSheet.getDataRange().getValues();
    let inviteIndex=-1;
    for(let i=1;i<invites.length;i++) {
      if(String(invites[i][0]||'').trim()!==empid) continue;
      if(!invites[i][3]) {
        if(inviteIndex>=0) throw new Error('此員工有多張未使用邀請，請聯絡管理員');
        inviteIndex=i;
      }
    }
    if(inviteIndex<0) throw new Error('綁定邀請不存在或已使用');
    const invite=invites[inviteIndex];
    const expires=invite[2] instanceof Date ? invite[2].getTime():new Date(invite[2]).getTime();
    if(!Number.isFinite(expires)||expires<=Date.now()) throw new Error('綁定驗證碼已過期');
    const tries=Number(invite[4]||0);
    if(tries>=5) throw new Error('綁定嘗試次數過多，請聯絡管理員');
    const candidate=v2HashInvitationCode_(code);
    if(candidate!==String(invite[1]||'').trim().toLowerCase()) {
      inviteSheet.getRange(inviteIndex+1,5).setValue(tries+1);
      throw new Error('員工資料或綁定驗證碼不正確');
    }
    // Binding written first; a retry cannot bind this employee to another LINE.
    empSheet.getRange(target+1,4).setValue(identity.lineUserId);
    inviteSheet.getRange(inviteIndex+1,4).setValue(new Date());
    SpreadsheetApp.flush();
    return {ok:true,alreadyBound:false};
  } finally { lock.releaseLock(); }
}
/* NOT DEPLOYABLE until audited owner-only invitation issuance, revocation and
 * supervised re-binding are available. No birthdate PINs or raw codes in logs. */


// =============================
// AttendanceV2_TestEntry.gs
// =============================
/**
 * Separate TEST Apps Script project only. Do not add this doGet to production.
 * Script property STAGING_LIFF_ID must refer to a separate LIFF app whose
 * Endpoint URL is this TEST project's /exec URL. Never reuse/change live LIFF.
 */
function doGet(e) {
  const properties=PropertiesService.getScriptProperties();
  try { v2AssertTestSheet_(); }
  catch(_) { return HtmlService.createHtmlOutput('非隔離測試環境，已拒絕載入'); }
  const template=HtmlService.createTemplateFromFile('AttendanceV2_SecurePortal');
  template.liffId=properties.getProperty('STAGING_LIFF_ID')||'';
  return template.evaluate().setTitle('員工打卡 V2 安全驗證測試');
}
/* TEST-only installation:
 * 1) New standalone Apps Script test project linked to a copied test Sheet.
 * 2) Copy AttendanceV2_Auth.gs and this entry, and the HTML as a file
 *    named AttendanceV2_SecurePortal.
 * 3) Set properties ATTENDANCE_V2_TEST=enabled, LINE_LOGIN_CHANNEL_ID,
 *    STAGING_LIFF_ID; do not paste secrets into GitHub.
 * 4) Deploy /exec only as a test app; configure a SEPARATE staging LIFF ID.
 * 5) No real employee data and no live webhook in this project.
 */

// =============================
// AttendanceV2_WorkdayLeave.test.gs
// =============================
/** Isolated, read-only tests for AttendanceV2_WorkdayLeave.gs.
 * Run ONLY in a separate Apps Script test project; no spreadsheet writes.
 */
function testAttendanceV2Leave_() {
  let passed = 0;
  function assert_(condition, msg) { if (!condition) throw new Error('FAIL: '+msg); passed++; }
  function rejects_(fn, fragment) {
    let error = '';
    try { fn(); } catch (e) { error = String(e.message || e); }
    assert_(error.includes(fragment), 'expected '+fragment+', got '+error);
  }
  const calendar = new Map([
    ['2026-11-06',true],  // Fri
    ['2026-11-07',false], // Sat
    ['2026-11-08',false], // Sun
    ['2026-11-09',true],  // Mon
    ['2026-11-10',true],  // Tue
    ['2026-11-11',false], // simulated holiday
    ['2026-11-12',true],
    ['2026-11-14',true]   // simulated government make-up Saturday
  ]);
  const today = '2026-10-20';
  const validate = (start,end,unit) => v2ValidateLeaveRange_(start,end,unit,calendar,today);
  assert_(validate('2026-11-09','2026-11-10','全天').days===2,'Mon-Tue two-day leave');
  assert_(validate('2026-11-06','2026-11-06','全天').days===1,'Friday single day');
  rejects_(()=>validate('2026-11-06','2026-11-10','全天'),'休息日');
  rejects_(()=>validate('2026-11-10','2026-11-12','全天'),'休息日');
  assert_(validate('2026-11-14','2026-11-14','全天').days===1,'Saturday make-up workday');
  rejects_(()=>validate('2026-11-13','2026-11-13','全天'),'缺少');
  rejects_(()=>validate('2026-11-10','2026-11-09','全天'),'早於');
  rejects_(()=>validate('2026-11-09','2026-11-10','時數'),'僅能申請單日');
  rejects_(()=>v2Ymd_('2026-02-30'),'不存在');
  const row=v2LeaveRow_('LEAVE-TEST',{employeeId:'TEST01',name:'測試員工'},'特休','全天',
    validate('2026-11-09','2026-11-10','全天'),'測試','2026/10/20 16:00','','');
  assert_(row.length===12 && row[6]==='2天' && row[8]==='待審核','legacy 12-column schema');
  rejects_(()=>v2LeaveRow_('X',{employeeId:'T',name:'T'},'事假','時數',
    validate('2026-11-09','2026-11-09','時數'),'','', '18:00','09:00'),'時間區間錯誤');
  Logger.log('Attendance V2 leave tests PASS: '+passed);
  return {ok:true,passed};
}

