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
