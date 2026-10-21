// Run: node staging/AttendanceV2_Auth.test.js
// Offline verification with fake LINE responses and synthetic employee records.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const token='a'.repeat(60)+'.'+'b'.repeat(60)+'.'+'c'.repeat(60);
const uid='U'+'a'.repeat(32),now=Math.floor(Date.now()/1000);
function fixture(opts={}){
  const calls=[],employees=[
    ['ID','Name','Phone','LINE','Company','Department','Status'],
    ['T001','Test A','',uid,'YC','Office','在職'],
    ['T002','Test B','','U'+'b'.repeat(32),'YC','Office','在職']
  ];
  if(opts.duplicate)employees.push(['T003','Test C','',uid,'YC','Office','在職']);
  if(opts.departed)employees[1][6]='離職';
  const records=[[],['','2026/10/20','08:30','T001','','上班','','HQ'],
    ['','2026/10/20','08:35','T002','','上班','','HQ'],
    ['','2026/09/30','17:30','T001','','下班','','HQ']];
  let submitted=null;
  const context={Date,Math,Object,Number,String,Error,RegExp,
    v2AssertTestSheet_:()=>true, // isolated test-only guard mock
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> '2009482137'})},
    UrlFetchApp:{fetch:(url,request)=>{calls.push({url,request});return {
      getResponseCode:()=>opts.status||200,
      getContentText:()=>JSON.stringify(Object.assign({
        iss:'https://access.line.me',aud:'2009482137',sub:uid,
        exp:now+3600,iat:now-60},opts.claims||{}))
    };}},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>
      ({'員工資料':{getDataRange:()=>({getValues:()=>employees})},
        '打卡紀錄':{getDataRange:()=>({getValues:()=>records})}})[name]||null})},
    Utilities:{formatDate:(_d,_tz,fmt)=>({yyyy:'2026',MM:'10'}[fmt]||'2026/10/20')},
    v2SubmitLeave_:(data,employee)=>{submitted={data,employee};return {ok:true}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_Auth.gs','utf8'),context);
  return {ctx:context,calls,submitted:()=>submitted};
}
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS',name)}
check('correct employee',()=>assert.equal(fixture().ctx.v2WhoamiSecure({idToken:token}).employee.employeeId,'T001'));
check('no token in URL',()=>{const x=fixture();x.ctx.v2WhoamiSecure({idToken:token});assert.equal(x.calls[0].request.method,'post');assert.equal(x.calls[0].url.includes(token),false)});
check('invalid issuer rejected',()=>assert.throws(()=>fixture({claims:{iss:'fake'}}).ctx.v2WhoamiSecure({idToken:token}),/驗證資料/));
check('invalid audience rejected',()=>assert.throws(()=>fixture({claims:{aud:'fake'}}).ctx.v2WhoamiSecure({idToken:token}),/驗證資料/));
check('expired token rejected',()=>assert.throws(()=>fixture({claims:{exp:now-1}}).ctx.v2WhoamiSecure({idToken:token}),/驗證資料/));
check('invalid token rejected',()=>assert.throws(()=>fixture().ctx.v2WhoamiSecure({idToken:'x'}),/無效/));
check('failed LINE API rejected',()=>assert.throws(()=>fixture({status:400}).ctx.v2WhoamiSecure({idToken:token}),/驗證失敗/));
check('duplicate employee binding rejected',()=>assert.throws(()=>fixture({duplicate:true}).ctx.v2WhoamiSecure({idToken:token}),/多位員工/));
check('departed employee rejected',()=>assert.throws(()=>fixture({departed:true}).ctx.v2WhoamiSecure({idToken:token}),/無法使用/));
check('client employee ID overwritten',()=>{const x=fixture();x.ctx.v2SubmitLeaveSecure({idToken:token,empid:'T002'});assert.equal(x.submitted().data.empid,'T001')});
check('attendance limited to employee',()=>assert.equal(fixture().ctx.v2QueryAttendanceSecure({idToken:token,month:'202610'}).total,1));
check('prior month accepted',()=>assert.equal(fixture().ctx.v2QueryAttendanceSecure({idToken:token,month:'202609'}).total,1));
check('old months rejected',()=>assert.throws(()=>fixture().ctx.v2QueryAttendanceSecure({idToken:token,month:'202605'}),/只能查詢/));
check('invalid month rejected',()=>assert.throws(()=>fixture().ctx.v2QueryAttendanceSecure({idToken:token,month:'202613'}),/只能查詢/));
console.log('TOTAL '+passed+' tests passed');
