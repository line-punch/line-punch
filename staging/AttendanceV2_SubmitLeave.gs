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
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假申請');
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
