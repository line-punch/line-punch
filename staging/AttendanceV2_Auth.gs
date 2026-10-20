/**
 * ATTENDANCE V2 - STAGING ONLY. Do not deploy into the existing JSONP /exec.
 * Use from an isolated Apps Script HTMLService page via google.script.run.
 * Required script property: LINE_LOGIN_CHANNEL_ID. Never log ID tokens.
 */
function v2VerifyLineClaims_(idToken) {
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
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('員工資料');
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
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('打卡紀錄');
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