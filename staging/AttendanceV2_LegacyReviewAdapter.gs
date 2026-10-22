/**
 * V2 STAGING: reuse original 13-/12-column manager approval, but enforce
 * server-verified LINE reviewer and the TEST001 boss reviewer list.
 * Not a LINE webhook. Do NOT connect unsigned legacy postback or JSONP.
 * Notification delivery is intentionally absent pending outbox design.
 */
function v2rvApplicationSheet_(ss,type) {
  const map={miss:'補打卡申請',leave:'請假申請'};
  if(!Object.prototype.hasOwnProperty.call(map,String(type||'')))
    throw Error('審核類型不正確');
  return v2rSheet_(ss,map[type]);
}
function v2rvAuthorized_(ss,reviewerLineId,employeeId) {
  const rows=v2rSheet_(ss,'審核通知名單').getDataRange().getValues();
  let match=null;
  for(let i=1;i<rows.length;i++) {
    const r=rows[i];
    if(String(r[0]||'').trim()!==employeeId)continue;
    if(match)throw Error('主管通知設定重複，停止審核');
    match=r;
  }
  if(!match||!String(match[4]||'').trim()||
     String(match[4]).trim()!==String(reviewerLineId||'')) {
    throw Error('無審核權限');
  }
  return {reviewerName:'授權主管'};
}
function v2rvFind_(ss,type,no,uid) {
  const appId=String(no||'').trim();
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(appId))throw Error('申請單號格式不正確');
  const sheet=v2rvApplicationSheet_(ss,type);
  const rows=sheet.getDataRange().getValues();
  let found=null,index=-1;
  for(let i=1;i<rows.length;i++){
    if(String(rows[i][0]||'').trim()!==appId)continue;
    if(found)throw Error('申請單號重複，停止審核');
    found=rows[i];index=i+1;
  }
  if(!found)return {ok:false,code:'NOT_FOUND'};
  v2rvAuthorized_(ss,uid,String(found[1]||'').trim());
  return {ok:true,row:found,index,sheet};
}
function v2rvReviewDetails_(ss,uid,data){
  const type=String(data&&data.type||'').trim();
  const found=v2rvFind_(ss,type,data&&data.no,uid);
  if(!found.ok)return found;
  const r=found.row;
  return {ok:true,no:String(r[0]),type,status:String(r[8]||''),
    employeeName:String(r[2]||'').slice(0,100),
    date:type==='leave'?v2rDate_(r[4]):v2rDate_(r[3]),
    endDate:type==='leave'?v2rDate_(r[5]):undefined,
    leaveType:type==='leave'?String(r[3]||''):undefined,
    leaveQuantity:type==='leave'?String(r[6]||''):undefined,
    punchType:type==='miss'?String(r[5]||''):undefined,
    punchTime:type==='miss'?v2rTime_(r[6]):undefined,
    reason:String(r[7]||'').slice(0,500)};
}
function v2rvDecision_(ss,uid,data){
  const type=String(data&&data.type||'').trim();
  const decision=String(data&&data.decision||'').trim();
  if(!['核准','駁回'].includes(decision))throw Error('不支援的審核決定');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw Error('審核系統忙碌，稍後再確認');
  try{
    const found=v2rvFind_(ss,type,data&&data.no,uid);
    if(!found.ok)return found;
    const r=found.row,old=String(r[8]||'').trim();
    if(old==='核准'||old==='駁回')return {ok:true,changed:false,
      no:String(r[0]||''),status:old,message:'這張申請已處理'};
    if(old!=='待審核')throw Error('申請狀態不正確');
    const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
    const values=[decision,r[9],'授權主管',now];
    if(type==='miss'){
      let approved='';
      if(decision==='核准'){
        const date=v2rDate_(r[3]),time=v2rTime_(r[6]);
        if(!date||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time))
          throw Error('核定補打卡日期時間錯誤');
        approved=new Date(date.replace(/\//g,'-')+'T'+
          (time.length===5?time+':00':time)+'+08:00');
        if(Number.isNaN(approved.getTime()))throw Error('核定補打卡日期時間錯誤');
      }
      values.push(approved);
    }
    found.sheet.getRange(found.index,9,1,values.length).setValues([values]);
    SpreadsheetApp.flush();
    return {ok:true,changed:true,no:String(r[0]||''),status:decision,
      reviewerName:'授權主管',reviewTime:now,
      notificationPending:true,
      message:'隔離申請已核定（尚未發出正式通知）'};
  }finally{lock.releaseLock()}
}
/* Deployment gates for reviewDetails/review must be OFF by default.
 * Never call by unauthenticated LINE webhook or public GET. Even POST
 * requests must first verify token and be matched against boss reviewers.
 * For production, create durable notification outbox and do a migration
 * of manager Flex links from direct postback to authenticated LIFF review UI.
 */
