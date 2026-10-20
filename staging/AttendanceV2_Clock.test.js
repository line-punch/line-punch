// Run offline: node staging/AttendanceV2_Clock.test.js
// Synthetic records only; never connects to live Google/LINE.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const uid='U'+'a'.repeat(32);
function setup(o={}){
 let rows=[Array(11).fill('Header')],writes=0,unlocks=0;
 if(o.conflict)rows.push(['','2026/10/20','08:30','T002','B','上班','','','','','LINE-V2:clockid1234567890']);
 const near={code:'YC',name:'總公司',distance:o.far?400:20,allowDistance:50};
 const sheet={getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),appendRow:r=>{rows.push(r);writes++}};
 const ctx={Date,Math,String,Number,Error,RegExp,
   v2AuthenticatedEmployee_:()=>o.unbound?{bound:false}:{bound:true,employeeId:'T001',name:'Tester A',lineUserId:uid},
   getEmployeeById_:()=>({employeeId:'T001',name:'Tester A',lineUserId:o.otherBound?'U'+'b'.repeat(32):uid,status:'在職',allowedLocation:'YC'}),
   getNearestAllowedLocation_:()=>near,
   nowInfo_:()=>({ts:new Date('2026-10-20T02:00:00Z'),date:'2026/10/20',time:'10:00:00'}),
   LockService:{getScriptLock:()=>({tryLock:()=>!o.busy,releaseLock:()=>unlocks++})},
   SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>n==='打卡紀錄'&&!o.noSheet?sheet:null}),flush:()=>{}},
   Utilities:{formatDate:(_d,_tz,fmt)=>fmt==='yyyy/MM/dd'?'2026/10/20':'10:00:00'}
 };
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_Clock.gs','utf8'),ctx);
 const req={idToken:'mock-token',requestId:'clockid1234567890',type:'上班',lat:25.05,lng:121.50};
 return {clock:p=>ctx.v2ClockSecure({...req,...p}),status:p=>ctx.v2ClockStatusSecure({...req,...p}),
  writes:()=>writes,rows:()=>rows,unlocks:()=>unlocks};
}
let n=0;function test(name,fn){fn();n++;console.log('PASS',name)}
test('one clock writes one row',()=>{const x=setup();assert.equal(x.clock().ok,true);assert.equal(x.writes(),1);assert.equal(x.rows()[1].length,11)});
test('same request returns prior success',()=>{const x=setup();x.clock();assert.equal(x.clock().alreadyRecorded,true);assert.equal(x.writes(),1)});
test('new id same type blocked',()=>{const x=setup();x.clock();assert.equal(x.clock({requestId:'anotherid1234567890'}).code,'ALREADY_CLOCKED')});
test('clock out allowed',()=>{const x=setup();x.clock();assert.equal(x.clock({requestId:'clockout1234567890',type:'下班'}).ok,true)});
test('outside range rejected',()=>assert.throws(()=>setup({far:true}).clock(),/超出打卡/));
test('invalid lat rejected',()=>assert.throws(()=>setup().clock({lat:1000}),/定位資料無效/));
test('null lat rejected',()=>assert.throws(()=>setup().clock({lat:null}),/尚未取得/));
test('invalid type rejected',()=>assert.throws(()=>setup().clock({type:'午休開始'}),/不支援/));
test('short ID rejected',()=>assert.throws(()=>setup().clock({requestId:'x'}),/識別碼/));
test('unbound rejected',()=>assert.throws(()=>setup({unbound:true}).clock(),/尚未綁定/));
test('other employee bound rejected',()=>assert.throws(()=>setup({otherBound:true}).clock(),/員工資料/));
test('status finds successful clock',()=>{const x=setup();x.clock();assert.equal(x.status().found,true)});
test('missing status remains unknown',()=>assert.equal(setup().status().found,false));
test('lock contention fails closed',()=>assert.throws(()=>setup({busy:true}).clock(),/忙碌/));
test('request ID conflict fails closed',()=>assert.throws(()=>setup({conflict:true}).clock(),/衝突/));
test('lock released after success',()=>{const x=setup();x.clock();assert.equal(x.unlocks(),1)});
test('lock released after duplicate',()=>{const x=setup();x.clock();x.clock();assert.equal(x.unlocks(),2)});
test('sheet missing rejected',()=>assert.throws(()=>setup({noSheet:true}).clock(),/找不到打卡/));
console.log('TOTAL '+n+' passed');
