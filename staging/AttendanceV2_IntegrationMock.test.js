// Offline integrated mock tests for the exact V2 staging bundle.
// Run: node staging/AttendanceV2_IntegrationMock.test.js
// No network calls, no real employees, no credentials and no live Google writes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/AttendanceV2_TestBundle.gs','utf8');
function sheet(name){
  return {name,rows:[],getName(){return this.name},
    getLastRow(){return this.rows.length},
    getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())}},
    getRange(row,col){const self=this;return {
      getValue:()=>self.rows[row-1]?.[col-1],
      setValue(value){if(!self.rows[row-1])self.rows[row-1]=[];self.rows[row-1][col-1]=value},
      setValues(arr){for(let i=0;i<arr.length;i++){
        if(!self.rows[row+i-1])self.rows[row+i-1]=[];
        for(let j=0;j<arr[i].length;j++)self.rows[row+i-1][col+j-1]=arr[i][j];
      }},
      setNumberFormat(){} }},
    appendRow(values){this.rows.push(values.slice())},setFrozenRows(){}};
}
const sheets=[sheet('Sheet1')];
const ss={getName:()=> 'YC_ATTENDANCE_V2_TEST_ONLY',getId:()=> 'TEST-123',
  getSheets:()=>sheets,getSheetByName:n=>sheets.find(s=>s.name===n)||null,
  insertSheet:n=>{const next=sheet(n);sheets.push(next);return next}};
const uid='U'+'a'.repeat(32);
const props={ATTENDANCE_V2_TEST:'enabled',
  ATTENDANCE_V2_TEST_SHEET_ID:'TEST-123',LINE_LOGIN_CHANNEL_ID:'2009482137',
  STAGING_LIFF_ID:'test-LIFF'};
const fmt=(d,zone,format)=>{
  const value=d instanceof Date?d:new Date(d);
  if(format==='yyyy-MM-dd')return value.toISOString().slice(0,10);
  if(format==='yyyy/MM/dd')return value.toISOString().slice(0,10).replace(/-/g,'/');
  if(format==='yyyy/MM/dd HH:mm:ss')return '2026/10/21 12:34:56';
  if(format==='HH:mm:ss')return '12:34:56';
  if(format==='MM')return '10';
  if(format==='yyyy')return '2026';
  if(format==='yyyyMMdd')return '20261021';
  throw Error('Unexpected mock date format '+format);
};
const context={
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush:()=>{}},
  PropertiesService:{getScriptProperties:()=>({getProperty:n=>props[n]||null})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({
    iss:'https://access.line.me',aud:'2009482137',sub:uid,
    exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)-10})})},
  Utilities:{formatDate:fmt,parseCsv:x=>x.split(/\r?\n/).map(y=>y.split(',')),
    computeDigest:()=>[],DigestAlgorithm:{SHA_256:'test'},Charset:{UTF_8:'UTF_8'}},
  HtmlService:{createHtmlOutput:()=>({}),
    createTemplateFromFile:()=>({evaluate:()=>({setTitle:()=>({})})})},
  Date,Math,Number,Map,Set,Array,Object,Error,RegExp,String,JSON
};
const names=['v2InstallSyntheticFixture_','v2WhoamiSecure','v2TestOptInLineIdentity',
  'v2SubmitLeaveSecure','v2SubmitLeaveResult','v2LeaveHistorySecure','v2ReviewDetailsSecure',
  'v2ReviewSecure','v2ClockSecure','v2ClockStatusSecure','v2LeaveStatusSecure'];
const api=new Function(...Object.keys(context),
  src+'\nreturn {'+names.join(',')+'};')(...Object.values(context));
const token='headerABCDEF.payloadABCDEFGHI.signature0123456789';
let passes=0;function test(name,fn){fn();passes++;console.log('PASS '+name)}
test('synthetic fixture only',()=>{api.v2InstallSyntheticFixture_();assert.equal(sheets.length,9)});
test('initial identity unbound',()=>assert.equal(api.v2WhoamiSecure({idToken:token}).bound,false));
test('test identity opt-in',()=>assert.equal(api.v2TestOptInLineIdentity({idToken:token}).ok,true));
test('verified employee identity',()=>assert.equal(api.v2WhoamiSecure({idToken:token}).employee.employeeId,'TEST001'));
const base={idToken:token,requestId:'abc1234567890XYZ',type:'特休',
  unit:'全天',startDate:'2026-11-09',endDate:'2026-11-10',reason:'測試'};
let no;
test('two-day leave',()=>{const r=api.v2SubmitLeaveSecure(base);no=r.no;assert.equal(r.days,2)});
test('repeated leave not duplicated',()=>{assert.equal(api.v2SubmitLeaveSecure(base).alreadySubmitted,true);
  assert.equal(ss.getSheetByName('請假申請').rows.length,2)});
test('own history',()=>assert.equal(api.v2LeaveHistorySecure({idToken:token}).data[0].quantity,'2天'));
test('authoritative leave submission status',()=>{const r=api.v2LeaveStatusSecure({
  idToken:token,requestId:base.requestId});assert.equal(r.found,true);
  assert.equal(r.quantity,'2天');assert.equal(r.no,no)});
test('unsubmitted leave request status remains unknown',()=>{const r=api.v2LeaveStatusSecure({
  idToken:token,requestId:'somethingnew12345678'});assert.equal(r.found,false)});

test('manager reviews own test application',()=>assert.equal(
  api.v2ReviewDetailsSecure({idToken:token,type:'leave',no}).status,'待審核'));
test('manager approval',()=>assert.equal(
  api.v2ReviewSecure({idToken:token,type:'leave',no,decision:'核准'}).status,'核准'));
test('approved decision cannot be reversed',()=>assert.equal(
  api.v2ReviewSecure({idToken:token,type:'leave',no,decision:'駁回'}).changed,false));
test('weekend leave rejected',()=>assert.throws(()=>api.v2SubmitLeaveSecure({
  ...base,requestId:'otherleave1234567',startDate:'2026-11-06',endDate:'2026-11-09'}),/休息日/));
test('nonworkday returns actionable validation response',()=>{
  const r=api.v2SubmitLeaveResult({...base,requestId:'holiday1234567890',
    startDate:'2026-11-06',endDate:'2026-11-09'});
  assert.equal(r.code,'VALIDATION');assert.equal(r.persisted,false);
});
test('corrected dates can be submitted after validation rejection',()=>{
  const id='correctedtest1234567';
  const denied=api.v2SubmitLeaveResult({...base,requestId:id,startDate:'2026-11-06',endDate:'2026-11-09'});
  assert.equal(denied.code,'VALIDATION');
  const accepted=api.v2SubmitLeaveResult({...base,requestId:id});
  assert.equal(accepted.ok,true);assert.equal(accepted.days,2);
});

const clock={idToken:token,requestId:'clocktest12345678',type:'上班',lat:0,lng:0};
test('real-world coordinates rejected in synthetic location',()=>assert.throws(()=>
  api.v2ClockSecure({...clock,lat:25,lng:121}),/超出/));
test('synthetic site clock accepted',()=>assert.equal(api.v2ClockSecure(clock).found,true));
test('authoritative clock status',()=>assert.equal(api.v2ClockStatusSecure({
  idToken:token,requestId:clock.requestId}).alreadyRecorded,true));
console.log('TOTAL '+passes+' passed');
