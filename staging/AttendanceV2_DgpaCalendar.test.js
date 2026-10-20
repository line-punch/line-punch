// Run offline: node staging/AttendanceV2_DgpaCalendar.test.js
// This uses invented calendar test dates, never production payroll or employee data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={Utilities:{parseCsv:t=>t.trim().split(/\r?\n/).map(x=>x.split(','))},
  Date,Error,Map,String,Number};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_DgpaCalendar.gs','utf8'),ctx);
function csv(year=2026){
  const rows=['西元日期,星期,是否放假,備註'];
  for(let ms=Date.UTC(year,0,1);ms<Date.UTC(year+1,0,1);ms+=86400000){
    const d=new Date(ms),date=d.toISOString().slice(0,10),day=d.getUTCDay();
    rows.push(date+','+day+','+([0,6].includes(day)?2:0)+',');
  }
  return rows.join('\n');
}
let count=0;function test(n,fn){fn();count++;console.log('PASS',n)}
test('365 days',()=>assert.equal(ctx.v2ParseDgpaCalendar_(csv(),2026).length,365));
test('leap year',()=>assert.equal(ctx.v2ParseDgpaCalendar_(csv(2028),2028).length,366));
test('Saturday workday',()=>{const text=csv().replace('2026-11-14,6,2,','2026-11-14,6,0,補班');
  assert.equal(ctx.v2ParseDgpaCalendar_(text,2026).find(x=>x[0]==='2026-11-14')[1],'是')});
test('Sunday off',()=>assert.equal(ctx.v2ParseDgpaCalendar_(csv(),2026).find(x=>x[0]==='2026-11-15')[1],'否'));
test('missing date rejects',()=>assert.throws(()=>ctx.v2ParseDgpaCalendar_(csv().replace('2026-11-14,6,2,\n',''),2026),/缺少日期/));
test('unsupported holiday flag rejects',()=>assert.throws(()=>ctx.v2ParseDgpaCalendar_(csv().replace('2026-11-14,6,2,','2026-11-14,6,7,'),2026),/放假代碼/));
test('duplicate date rejects',()=>assert.throws(()=>ctx.v2ParseDgpaCalendar_(csv()+'\n2026-11-14,6,2,',2026),/日期重複/));
test('wrong year rejects',()=>assert.throws(()=>ctx.v2ParseDgpaCalendar_(csv(),2027),/其他年度/));
test('company override',()=>{const rows=ctx.v2ApplyCompanyDays_(ctx.v2ParseDgpaCalendar_(csv(),2026),
  [{date:'2026-11-14',workday:true,reason:'公司補班'}]);
  assert.equal(rows.find(x=>x[0]==='2026-11-14')[1],'是')});
test('override needs reason',()=>assert.throws(()=>ctx.v2ApplyCompanyDays_(
  ctx.v2ParseDgpaCalendar_(csv(),2026),[{date:'2026-11-14',workday:true}]),/原因/));
console.log('TOTAL '+count+' tests passed');
