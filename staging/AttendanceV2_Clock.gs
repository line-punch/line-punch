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
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('打卡系統忙碌，請稍後確認紀錄');
  try {
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('打卡紀錄');
    if(!sh)throw Error('找不到打卡紀錄表');
    const rows=sh.getDataRange().getValues();
    const previous=v2ClockFind_(rows,identity.employeeId,requestId);
    if(previous)return v2ClockSummary_(previous,true);
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
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('打卡紀錄');
  if(!sh)throw Error('找不到打卡紀錄表');
  const row=v2ClockFind_(sh.getDataRange().getValues(),identity.employeeId,requestId);
  return row?v2ClockSummary_(row,true):
    {ok:true,found:false,message:'尚未查到紀錄，請稍後再查詢'};
}
/* Release blockers: secure HTMLService transport, server-side LINE validation,
 * staging Sheet, concurrent writes, same-day cross-midnight policy and real
 * iOS/Android LIFF tests. */
