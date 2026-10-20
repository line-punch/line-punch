// Run offline with Node: node staging/AttendanceV2_SubmitLeave.test.js
// Mocked Sheet and identity; no network or live data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const f=()=>{let rows=[['header']],writes=0,releases=0;
  const sheet={getDataRange:()=>({getValues:()=>rows.map(x=>x.slice())}),
    appendRow:row=>{rows.push(row);writes++},getLastRow:()=>rows.length,
    getRange:()=>({setNumberFormat:()=>{}})};
  const sandbox={
    Date,Error,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    Utilities:{formatDate:(date,tz,fmt)=>fmt==='yyyy-MM-dd'?date.toISOString().slice(0,10):'2026/10/20 09:00:00'},
    v2ValidateLeaveRange_:(start,end,unit)=>{if(end<start)throw Error('日期錯誤');
      return {startDate:start,endDate:end,days:start===end?1:2}},
    v2LeaveRow_:(no,emp,type,unit,r,reason,created)=>[
      no,emp.employeeId,emp.name,type,r.startDate,r.endDate,r.days+'天',reason,'待審核',created,'','']
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_SubmitLeave.gs','utf8'),sandbox);
  const emp={employeeId:'T001',name:'測試員工'};
  const data={requestId:'abcdefghi12345678',empid:'T001',type:'特休',
    unit:'全天',startDate:'2026-11-09',endDate:'2026-11-10',reason:'私人行程'};
  return {send:delta=>sandbox.v2SubmitLeave_({...data,...delta},emp),
    writes:()=>writes,releases:()=>releases,rows:()=>rows};
};
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name)}
check('first request written',()=>{const x=f(),r=x.send();assert.equal(r.alreadySubmitted,false);assert.equal(x.writes(),1);assert.equal(r.days,2)});
check('replay returns existing result',()=>{const x=f();x.send();assert.equal(x.send().alreadySubmitted,true);assert.equal(x.writes(),1)});
check('same ID with changed details refused',()=>{const x=f();x.send();assert.throws(()=>x.send({reason:'changed'}),/內容不同/)});
check('wrong employee refused',()=>{const x=f();assert.throws(()=>x.send({empid:'other'}),/身分不符/)});
check('too short ID refused',()=>{const x=f();assert.throws(()=>x.send({requestId:'x'}),/識別碼/)});
check('unsupported leave type refused',()=>{const x=f();assert.throws(()=>x.send({type:'invalid'}),/假別/)});
check('new ID allows distinct request',()=>{const x=f();x.send();x.send({requestId:'abcdefghi12345679'});assert.equal(x.writes(),2)});
check('lock released',()=>{const x=f();x.send();assert.equal(x.releases(),1)});
console.log('TOTAL: '+count+' passed');
