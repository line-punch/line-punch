/**
 * Attendance V2 staging - secure self-service leave history.
 * Never trust employeeId from a mobile client; derive employee from verified token.
 * Uses original 12-column 請假申請 schema, including older single-day rows.
 */
function v2LeaveHistorySecure(payload) {
  const employee=v2AuthenticatedEmployee_(payload&&payload.idToken);
  if(!employee.bound) throw Error('LINE 尚未綁定員工');
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假申請');
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
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('請假申請');
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
