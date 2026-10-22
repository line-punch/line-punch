/**
 * READ-ONLY diagnostic of the original attendance system's 3-month archive.
 *
 * Important: this is an AUDIT, not an archive job. Do not delete, clear,
 * move or write employee data here. Intended for use by the authorised owner
 * in the ORIGINAL spreadsheet-bound Apps Script project, NOT in the isolated
 * TEST001 data service and NOT added to the production deployment.
 *
 * Checks two period interpretations without silently assuming one:
 *  (A) current + previous TWO calendar months;
 *  (B) since exactly THREE calendar months before today.
 *
 * Column B is the attendance date in BOTH 打卡紀錄 and 打卡紀錄_歷史.
 * Returns ONLY counts, date ranges and trigger handler names. It never logs
 * employee IDs, names, LINE user IDs, GPS coordinates or individual rows.
 * ScriptApp.getProjectTriggers sees only triggers in THIS script project.
 */
function v2aDateKey_(value) {
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))return '';
    return Utilities.formatDate(value,'Asia/Taipei','yyyy-MM-dd');
  }
  const m=String(value==null?'':value).trim().match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s.*)?$/);
  if(!m)return '';
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(month<1||month>12||day<1||day>31)return '';
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||
     d.getUTCDate()!==day)return '';
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+
    '-'+String(day).padStart(2,'0');
}
function v2aCutoffs_(today) {
  const key=v2aDateKey_(today);
  if(!key)throw Error('無法辨識今天的日期');
  const [year,month,day]=key.split('-').map(Number);
  const calendarStart=new Date(Date.UTC(year,month-3,1))
    .toISOString().slice(0,10); // current month + two prior months
  const priorMonth=new Date(Date.UTC(year,month-4,1));
  const priorLast=new Date(Date.UTC(year,month-3,0)).getUTCDate();
  const rollingStart=new Date(Date.UTC(
    priorMonth.getUTCFullYear(),priorMonth.getUTCMonth(),
    Math.min(day,priorLast))).toISOString().slice(0,10);
  return {today:key,calendarStart,rollingStart};
}
function v2aSummarizeDates_(dates,cutoffs) {
  const data={rows:dates.length,validDateRows:0,invalidDateRows:0,
    oldest:'',newest:'',olderThanCalendarWindow:0,
    olderThanRollingWindow:0,calendarWindowRows:0,monthlyCounts:{}};
  for(const raw of dates){
    const day=v2aDateKey_(raw);
    if(!day){data.invalidDateRows++;continue}
    data.validDateRows++;
    if(!data.oldest||day<data.oldest)data.oldest=day;
    if(!data.newest||day>data.newest)data.newest=day;
    const ym=day.slice(0,7);
    data.monthlyCounts[ym]=(data.monthlyCounts[ym]||0)+1;
    if(day<cutoffs.calendarStart)data.olderThanCalendarWindow++;
    else data.calendarWindowRows++;
    if(day<cutoffs.rollingStart)data.olderThanRollingWindow++;
  }
  return data;
}
function v2aAuditDates_(liveDates,historyDates,today,triggerInfo) {
  const cutoffs=v2aCutoffs_(today);
  const live=v2aSummarizeDates_(liveDates,cutoffs);
  const historical=v2aSummarizeDates_(historyDates,cutoffs);
  return {ok:true,readOnly:true,cutoffs,live,historical,
    requiresOwnerReview:
      live.olderThanCalendarWindow>0||
      live.invalidDateRows>0||
      historical.invalidDateRows>0,
    triggers:triggerInfo||[],
    guidance: '本報告僅核對現況，不能證明自動封存正常。請核對排程與歷史表，再決定封存邊界；禁止未備份就刪除打卡資料。'};
}
function v2aReadDateColumn_(sheet) {
  if(!sheet)throw Error('找不到打卡資料表');
  const last=sheet.getLastRow();
  const dates=[];
  for(let row=2;row<=last;row+=1000){
    const n=Math.min(1000,last-row+1);
    const values=sheet.getRange(row,2,n,1).getValues();
    for(const a of values)dates.push(a[0]);
  }
  return dates;
}
function v2AuditOriginalAttendanceArchiveReadonly(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw Error('請在原本打卡試算表綁定的 Apps Script 執行；不可在隔離 TEST001 使用');
  // This exact title is shown on the original user's production sheet.
  if(String(ss.getName()||'')!=='LINE打卡系統')
    throw Error('安全停止：此處不是正式 LINE打卡系統，僅可唯讀盤點正確檔案');
  const live=ss.getSheetByName('打卡紀錄');
  const history=ss.getSheetByName('打卡紀錄_歷史');
  if(!live||!history)throw Error('缺少打卡紀錄或打卡紀錄_歷史工作表');
  const current=v2aReadDateColumn_(live);
  const prior=v2aReadDateColumn_(history);
  const handlers=[];
  let visibility='同專案觸發器清單可查';
  try{
    const tasks=ScriptApp.getProjectTriggers();
    for(const task of tasks){
      handlers.push({
        handler:String(task.getHandlerFunction()||''),
        eventType:String(task.getEventType()||'')
      });
    }
  }catch(_){visibility='觸發器權限不足或無法讀取'}
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  const result=v2aAuditDates_(current,prior,today,handlers);
  result.triggerVisibility=visibility;
  Logger.log('三個月打卡封存唯讀稽核：'+JSON.stringify(result));
  return result;
}
// No doGet, doPost, ScriptApp.newTrigger, appendRow, setValue,
// deleteRows, clearContent, copyTo, or Drive backup actions in this file.
