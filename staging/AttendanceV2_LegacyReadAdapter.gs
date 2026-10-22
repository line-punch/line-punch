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
