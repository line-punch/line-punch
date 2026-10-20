// Run offline: node staging/AttendanceV2_ReviewGuard.test.js
// Tests are mocked; they do NOT contact production Google Sheet or LINE.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(opts={}) {
  const kind=opts.kind||'請假申請',status=opts.status||'待審核';
  const row=kind==='請假申請'
    ? ['REQ1','E01','員工','特休','2026-11-02','2026-11-03','2天','',status,'submitted','','']
    : ['REQ1','E01','員工','2026-11-02','YC','上班',opts.time||'09:00','原因',status,'submitted','','',''];
  const rows=[[],row];
  if(opts.duplicate)rows.push(row.slice());
  let writes=0,release=0;
  const sheet={
    getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
    getRange:(r,c,_h,w)=>({setValues:values=>{
      assert.equal(values[0].length,w);writes++;
      values[0].forEach((v,j)=>rows[r-1][c-1+j]=v);
    }})
  };
  const ctx={
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    Utilities:{formatDate:()=> '2026/10/20 12:00:00'},
    combineDateTime_:(_d,t)=>t==='09:00'?new Date('2026-11-02T01:00:00Z'):null,
    Date,Error,isNaN
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_ReviewGuard.gs','utf8'),ctx);
  const lock={tryLock:()=>!opts.busy,releaseLock:()=>release++};
  return {call:(d='核准',n='REQ1')=>ctx.v2Decide_(kind,n,d,'主管A',lock),
    state:()=>({rows,writes,release})};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name)}
test('approval updates one time',()=>{const t=fixture();assert.equal(t.call().changed,true);assert.equal(t.state().writes,1)});
test('second decision is idempotent',()=>{const t=fixture();t.call();const r=t.call('駁回');assert.equal(r.changed,false);assert.equal(r.status,'核准');assert.equal(t.state().writes,1)});
test('existing rejection cannot be approved',()=>{const t=fixture({status:'駁回'});assert.equal(t.call().changed,false);assert.equal(t.state().writes,0)});
test('not found',()=>{const t=fixture();assert.equal(t.call('核准','missing').code,'NOT_FOUND')});
test('duplicate number rejected',()=>{const t=fixture({duplicate:true});assert.throws(()=>t.call(),/單號重複/);assert.equal(t.state().writes,0)});
test('lock contention rejected',()=>{const t=fixture({busy:true});assert.throws(()=>t.call(),/忙碌/)});
test('submitted at preserved',()=>{const t=fixture();t.call();assert.equal(t.state().rows[1][9],'submitted')});
test('miss punch approval time written',()=>{const t=fixture({kind:'補打卡申請'});t.call();assert.equal(t.state().rows[1][12] instanceof Date,true)});
test('miss punch rejection clears approval',()=>{const t=fixture({kind:'補打卡申請'});t.call('駁回');assert.equal(t.state().rows[1][12],'')});
test('invalid punch time rejected',()=>{const t=fixture({kind:'補打卡申請',time:'bad'});assert.throws(()=>t.call(),/無效/);assert.equal(t.state().writes,0)});
test('invalid decision rejected',()=>{const t=fixture();assert.throws(()=>t.call('不明'),/動作/)});
test('lock released after error',()=>{const t=fixture({duplicate:true});assert.throws(()=>t.call());assert.equal(t.state().release,1)});
console.log('TOTAL '+count+' tests passed');
