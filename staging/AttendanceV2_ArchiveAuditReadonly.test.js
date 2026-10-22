// Offline only. Run: node staging/AttendanceV2_ArchiveAuditReadonly.test.js
// No connection to Google Sheets and no production data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/AttendanceV2_ArchiveAuditReadonly.gs','utf8');
const originalDates=['2026-06-15','2026-07-22','2026-07-31','2026-08-01','2026-09-01','2026-10-22'];
const archivedDates=['2026-02-12','2026-06-15','2026-07-15'];
const triggerMap=[{name:'scheduledArchive',event:'CLOCK'},
 {name:'reviewOnSubmit',event:'ON_FORM_SUBMIT'}];
let sheetTitle='LINE打卡系統',triggerThrows=false,mutations=0,log=[];
function fakeSheet(dates) {
 return {getLastRow:()=>dates.length+1,getRange:(start,col,count,width)=>{
    assert.equal(col,2);assert.equal(width,1);
    return {getValues:()=>dates.slice(start-2,start-2+count).map(x=>[x])};
 }};
}
const context={
  Date,Number,String,Array,Object,JSON,Math,Error,
  Utilities:{formatDate:(d,tz,pattern)=>{
    assert.equal(tz,'Asia/Taipei');
    if(pattern!=='yyyy-MM-dd')throw Error('Unexpected date format');
    return new Intl.DateTimeFormat('en-CA',{
      timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'
    }).format(d).replace(/\//g,'-');
  }},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({
    getName:()=>sheetTitle,
    getSheetByName:n=>n==='打卡紀錄'?fakeSheet(originalDates):
      n==='打卡紀錄_歷史'?fakeSheet(archivedDates):null
  })},
  ScriptApp:{getProjectTriggers:()=>{
    if(triggerThrows)throw Error('no trigger permission');
    return triggerMap.map(x=>({
      getHandlerFunction:()=>x.name,getEventType:()=>x.event
    }));
  }},
  Logger:{log:m=>log.push(m)}
};
vm.createContext(context);
vm.runInContext(source,context);
let num=0;function test(name,fn){fn();num++;console.log('PASS '+name)}
test('October cutoff distinguishes current+two previous calendar months from rolling three months',()=>{
 const cut=context.v2aCutoffs_('2026-10-22');
 assert.equal(cut.calendarStart,'2026-08-01');
 assert.equal(cut.rollingStart,'2026-07-22');
});
test('February and year boundary cutoff works with 31st-day clamping',()=>{
 const c=context.v2aCutoffs_('2026-03-31');
 assert.equal(c.calendarStart,'2026-01-01');
 assert.equal(c.rollingStart,'2025-12-31');
});
test('date parser accepts Date, yyyy/MM/dd and yyyy-MM-dd strings',()=>{
 assert.equal(context.v2aDateKey_('2026/07/15'),'2026-07-15');
 assert.equal(context.v2aDateKey_('2026-07-15 07:09:00'),'2026-07-15');
 assert.equal(context.v2aDateKey_(new Date('2026-10-22T10:00:00+08:00')),
   '2026-10-22');
});
test('invalid dates do not appear in counts as correct archived data',()=>{
 for(const invalid of ['2026-02-30','2026-13-01','2026/00/03','bad','']){
   assert.equal(context.v2aDateKey_(invalid),'');
 }
});
test('October counts old live dates and old archived rows without touching them',()=>{
 const snapshot=context.v2aAuditDates_(originalDates,archivedDates,'2026-10-22',[]);
 assert.equal(snapshot.live.rows,6);
 assert.equal(snapshot.live.olderThanCalendarWindow,3);
 assert.equal(snapshot.live.olderThanRollingWindow,1);
 assert.equal(snapshot.historical.rows,3);
 assert.equal(snapshot.historical.olderThanCalendarWindow,3);
 assert.equal(snapshot.requiresOwnerReview,true);
 assert.equal(snapshot.readOnly,true);
});
test('rolling cutoff includes exactly boundary day',()=>{
 const cut=context.v2aCutoffs_('2026-10-22');
 assert.equal(context.v2aSummarizeDates_(['2026-07-22'],cut).olderThanRollingWindow,0);
 assert.equal(context.v2aSummarizeDates_(['2026-07-21'],cut).olderThanRollingWindow,1);
});
test('empty archive cannot be assumed functioning just because live rows are recent',()=>{
 const a=context.v2aAuditDates_(['2026-10-22'],[],'2026-10-22',[]);
 assert.equal(a.requiresOwnerReview,false);
 assert.ok(a.guidance.includes('不能證明自動封存正常'));
 assert.equal(a.historical.rows,0);
});
test('read-only audit exposes no individual user data or geolocation',()=>{
 const res=context.v2aAuditDates_(
   originalDates.concat('invalid'),archivedDates,'2026-10-22',[]);
 assert.equal(res.live.invalidDateRows,1);
 assert.equal(JSON.stringify(res).includes('TEST001'),false);
 assert.equal(JSON.stringify(res).includes('LINE userId'),false);
 assert.equal(JSON.stringify(res).includes('GPS'),false);
});
test('live production-bound audit returns aggregate results plus its OWN script trigger handlers',()=>{
 const result=context.v2AuditOriginalAttendanceArchiveReadonly();
 assert.equal(result.ok,true);
 assert.equal(result.live.rows,originalDates.length);
 assert.equal(result.historical.rows,archivedDates.length);
 assert.equal(result.triggers.length,2);
 assert.equal(result.triggers[0].handler,'scheduledArchive');
 assert.ok(log.some(x=>x.startsWith('三個月打卡封存唯讀稽核：')));
 assert.equal(mutations,0);
});
test('trigger permissions unavailable are reported, never treated as proof no triggers',()=>{
 triggerThrows=true;
 const result=context.v2AuditOriginalAttendanceArchiveReadonly();
 assert.equal(result.triggerVisibility,'觸發器權限不足或無法讀取');
 assert.equal(result.triggers.length,0);
 triggerThrows=false;
});
test('wrong spreadsheet refuses to audit other company or test database',()=>{
 sheetTitle='YC_ATTENDANCE_V2_TEST_ONLY';
 assert.throws(()=>context.v2AuditOriginalAttendanceArchiveReadonly(),/安全停止/);
 sheetTitle='LINE打卡系統';
});
test('module has no write and deployment entrypoints',()=>{
 assert.equal(/^\s*function\s+do(?:Get|Post)\s*\(/m.test(source),false);
 assert.equal(/\b(?:appendRow|deleteRows|clearContent|setValues|setValue|newTrigger|copyTo)\s*\(/.test(source),false);
});
console.log('TOTAL '+num+' passed');
