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
