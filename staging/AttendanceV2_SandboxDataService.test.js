// Offline-only, reproducible sandbox data-service tests.
// Run: node staging/AttendanceV2_SandboxDataService.test.js
// Uses synthetic LINE tokens/coordinates and a fake Google Sheet.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/AttendanceV2_SandboxDataService.gs','utf8');
function sheet(name,rows){
 return {name,rows,getLastRow(){return this.rows.length},
   getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())}},
   getRange(r,c,rowsCount=1,colsCount=1){const sh=this;return {
     getValue:()=>sh.rows[r-1]?.[c-1],
     getValues:()=>Array.from({length:rowsCount},(_,i)=>
       Array.from({length:colsCount},(_,j)=>sh.rows[r+i-1]?.[c+j-1])),
     setValue(value){if(!sh.rows[r-1])sh.rows[r-1]=[];
       sh.rows[r-1][c-1]=value;return this}
   }},
   appendRow(row){this.rows.push(row.slice())}
 };
}
const sheets={
 '員工資料':sheet('員工資料',[
  ['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點'],
  ['TEST001','模擬員工甲','','','TEST_CO','測試部門','在職','TESTSITE']]),
 '上班地點':sheet('上班地點',[
  ['地點代碼','地點名稱','公司','GPS中心點','容許距離'],
  ['TESTSITE','測試場地','TEST_CO','0,0',30]]),
 '打卡紀錄':sheet('打卡紀錄',[
  ['時間戳記','日期','時間','員工ID','姓名','類型','地點代碼','地點名稱','GPS','備註','來源']])
};
const ss={getId:()=> 'ISOLATED_SHEET_ID_1234567890ABCDE',
 getName:()=> 'YC_ATTENDANCE_V2_TEST_ONLY',
 getSheetByName:name=>sheets[name]||null};
const properties=new Map([
 ['ATTENDANCE_V2_DATA_TEST','enabled'],
 ['ATTENDANCE_V2_TEST_SHEET_ID',ss.getId()],
 ['LINE_LOGIN_CHANNEL_ID','2012136707']
]);
let currentUid='U'+'a'.repeat(32), claims=null,verifyCode=200,allowLock=true,
 opens=[],verifyCalls=0,uuidCount=0,logLines=[];
const settings={
 getProperty:name=>properties.get(name)||null,
 setProperties:obj=>{for(const [k,v] of Object.entries(obj))properties.set(k,String(v))},
 deleteProperty:name=>{properties.delete(name)}
};
const lock={tryLock(){return allowLock},releaseLock(){}};
const utcDate=()=>new Date().toISOString().slice(0,10);
const fakeDigest=text=>{
 // Deterministic mock digest. Both issuance and comparison must use same input.
 const value=String(text);let h=2166136261;
 for(const chr of value)h=Math.imul(h^chr.charCodeAt(0),16777619)>>>0;
 return Array.from({length:32},(_,n)=>((h>>>((n%4)*8))+(n*47))&255);
};
const ctx={
 Date,Math,JSON,Number,String,Array,Object,Error,RegExp,
 PropertiesService:{getScriptProperties:()=>settings},
 SpreadsheetApp:{openById:id=>{opens.push(id);if(id!==ss.getId())throw Error('Forbidden spreadsheet ID');return ss},flush(){}},
 LockService:{getScriptLock:()=>lock},
 UrlFetchApp:{fetch:(url,req)=>{
  verifyCalls++;
  if(req.payload.client_id!=='2012136707')throw Error('Unexpected channel');
  return {getResponseCode:()=>verifyCode,getContentText:()=>JSON.stringify(claims||{
    iss:'https://access.line.me',aud:'2012136707',sub:currentUid,
    exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)-60
  })};
 }},
 Utilities:{
  getUuid:()=>{uuidCount++;return ('00000000-0000-4000-8000-'+uuidCount.toString(16).padStart(12,'0'))},
  computeDigest:(alg,text)=>fakeDigest(text),
  DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
  formatDate:(date,zone,pattern)=>{
    // Simulate Apps Script's Asia/Taipei calendar-day formatting for any Date.
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date).map(p=>[p.type,p.value]));
    const key=parts.year+'-'+parts.month+'-'+parts.day;
    if(pattern==='yyyy/MM/dd')return key.replace(/-/g,'/');
    if(pattern==='HH:mm:ss')return '13:14:15';
    if(pattern==='yyyy-MM-dd')return key;
    throw Error('Unsupported test date format '+pattern);
  }
 },
 Logger:{log:x=>logLines.push(x)},
 HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
  createHtmlOutput:html=>({html,setXFrameOptionsMode(x){this.mode=x;return this}})},
 ContentService:{MimeType:{TEXT:'TEXT'},
  createTextOutput:text=>({text,setMimeType(x){this.mime=x;return this}})}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const fakeIdToken='header-for-sandbox.synthetic-employee-claim.signature-very-long';
const nonce='b'.repeat(40);
const payload=(other={})=>({idToken:fakeIdToken,...other});
const req=(operation,other={})=>({
 nonce,operation,payload:JSON.stringify(payload(other))
});
let total=0;function test(desc,fn){fn();total++;console.log('PASS '+desc)}
test('reject disabled test service before opening any Sheet',()=>{
 const prior=opens.length;properties.set('ATTENDANCE_V2_DATA_TEST','off');
 assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/尚未啟用/);
 assert.equal(opens.length,prior);properties.set('ATTENDANCE_V2_DATA_TEST','enabled');
});
test('reject wrong configured test Sheet ID',()=>{
 const old=properties.get('ATTENDANCE_V2_TEST_SHEET_ID');
 properties.set('ATTENDANCE_V2_TEST_SHEET_ID','WRONG_SHEET_ID_1234567890');
 assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/Forbidden spreadsheet ID/);
 properties.set('ATTENDANCE_V2_TEST_SHEET_ID',old);
});
test('reject wrong configured channel',()=>{
 properties.set('LINE_LOGIN_CHANNEL_ID','2009482137');
 assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/設定錯誤/);
 properties.set('LINE_LOGIN_CHANNEL_ID','2012136707');
});
test('unbound whoami returns only bound=false',()=>{
 const data=ctx.v2dDispatch_(req('whoami')).result;
 assert.equal(data.ok,true);assert.equal(data.bound,false);
 assert.equal(data.employee,undefined);
});
test('invalid identity rejected before business dispatch',()=>{
 const prior=verifyCalls;
 assert.throws(()=>ctx.v2dDispatch_(req('whoami',{idToken:'plain_token_with_bad_JWT_format_long'})),/資訊無效/);
 assert.equal(verifyCalls,prior);
});
test('forged LINE channel claim rejected',()=>{
 claims={iss:'https://access.line.me',aud:'wrong-channel',sub:currentUid,
   exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)-60};
 assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/不符合規則/);claims=null;
});
test('expired LINE token rejected',()=>{
 claims={iss:'https://access.line.me',aud:'2012136707',sub:currentUid,
   exp:Math.floor(Date.now()/1000)-1,iat:Math.floor(Date.now()/1000)-60};
 assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/不符合規則/);claims=null;
});
test('non-200 LINE verification rejected',()=>{
 verifyCode=401;assert.throws(()=>ctx.v2dDispatch_(req('whoami')),/驗證失敗/);
 verifyCode=200;
});
test('unknown operation rejected before LINE verification',()=>{
 const prior=verifyCalls;
 for(const operation of ['leave','review','delete','listEmployees','invite','todayAllEmployees']){
   assert.throws(()=>ctx.v2dDispatch_(req(operation)),/未提供此測試功能/);
 }
 assert.equal(verifyCalls,prior);
});
test('manual invitation issuer generates 32-hex time-limited secret',()=>{
 const r=ctx.v2IssueTestInvitation();assert.equal(r.ok,true);
 const raw=logLines.at(-1);assert.ok(raw.includes('一次性邀請碼'));
 const code=raw.match(/[A-F0-9]{32}/)?.[0];
 assert.equal(code?.length,32);
 assert.equal(properties.has('V2D_INVITE_HASH'),true);
 assert.equal(properties.has('V2D_INVITE_EXPIRES'),true);
});
const invitationCode=logLines.at(-1).match(/[A-F0-9]{32}/)[0];
test('invalid invitation code refused',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('bind',{invitationCode:'0'.repeat(32)})),/邀請碼不正確/);
 assert.equal(sheets['員工資料'].rows[1][3],'');
});
test('wrongly formatted invitation code refused',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('bind',{invitationCode:'123456'})),/格式不正確/);
});
test('invitation expires and cannot bind',()=>{
 const saved=properties.get('V2D_INVITE_EXPIRES');
 properties.set('V2D_INVITE_EXPIRES','1');
 assert.throws(()=>ctx.v2dDispatch_(req('bind',{invitationCode})),/已過期/);
 properties.set('V2D_INVITE_EXPIRES',saved);
});
test('correct invitation binds the one synthetic employee',()=>{
 const data=ctx.v2dDispatch_(req('bind',{invitationCode})).result;
 assert.equal(data.ok,true);assert.equal(data.bound,true);
 assert.equal(data.alreadyBound,false);
 assert.equal(sheets['員工資料'].rows[1][3],currentUid);
 assert.equal(properties.has('V2D_INVITE_HASH'),false);
});
test('replay from same LINE user is idempotent',()=>{
 const data=ctx.v2dDispatch_(req('bind',{invitationCode})).result;
 assert.equal(data.alreadyBound,true);
});
test('other LINE user cannot take over binding',()=>{
 const original=currentUid;currentUid='U'+'b'.repeat(32);
 const data=ctx.v2dDispatch_(req('whoami')).result;
 assert.equal(data.bound,false);
 assert.throws(()=>ctx.v2dDispatch_(req('bind',{invitationCode})),/已綁定其他/);
 assert.equal(sheets['員工資料'].rows[1][3],original);
 currentUid=original;
});
test('bound whoami reports only TEST001',()=>{
 const data=ctx.v2dDispatch_(req('whoami')).result;
 assert.equal(data.bound,true);
 assert.equal(data.employee.employeeId,'TEST001');
 assert.equal(data.employee.name,'模擬員工甲');
 assert.equal(data.employee.lineUserId,undefined);
});

test('todayAttendance initially shows no stored punches for bound user',()=>{
 const size=sheets['打卡紀錄'].rows.length;
 const r=ctx.v2dDispatch_(req('todayAttendance')).result;
 assert.equal(r.ok,true);assert.equal(r.total,0);
 assert.equal(r.clockIn,null);assert.equal(r.clockOut,null);
 assert.equal(size,sheets['打卡紀錄'].rows.length);
});
test('todayAttendance refuses unbound user',()=>{
 const old=currentUid;currentUid='U'+'b'.repeat(32);
 assert.throws(()=>ctx.v2dDispatch_(req('todayAttendance')),/尚未綁定/);
 currentUid=old;
});
test('todayAttendance ignores other employee ID',()=>{
 const rows=sheets['打卡紀錄'].rows;
 rows.push([new Date(),utcDate().replace(/-/g,'/'),'09:00:00','OTHER','Other','上班',
    'TESTSITE','測試場地','gps','', 'OTHER']);
 assert.equal(ctx.v2dDispatch_(req('todayAttendance')).result.total,0);
 rows.pop();
});
test('todayAttendance excludes earlier day',()=>{
 const rows=sheets['打卡紀錄'].rows;
 rows.push([new Date(),new Date(Date.now()-86400000),'09:00:00',
    'TEST001','模擬員工甲','上班','TESTSITE','測試場地','gps','', 'OTHER']);
 assert.equal(ctx.v2dDispatch_(req('todayAttendance')).result.total,0);
 rows.pop();
});
const reqId='clock_request_test_123456';
test('unconfigured 0,0 GPS site blocks punching',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:reqId,lat:25,lng:121,accuracy:10,capturedAt:Date.now()
 })),/尚未完成 GPS 設定/);
 assert.equal(sheets['打卡紀錄'].rows.length,1);
});
sheets['上班地點'].rows[1][3]='25,121';
test('out-of-radius GPS blocked',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:reqId,lat:25.01,lng:121.01,accuracy:15,capturedAt:Date.now()
 })),/超出測試打卡允許範圍/);
});
test('stale GPS cannot start a new punch',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:reqId,lat:25,lng:121,accuracy:10,
  capturedAt:Date.now()-180000
 })),/GPS 定位已過期/);
 assert.equal(sheets['打卡紀錄'].rows.length,1);
});
test('TESTSITE 50m radius accepts a roughly 33m GPS distance',()=>{
 sheets['上班地點'].rows[1][4]=50;
 const result=ctx.v2dSite_(ss,25.0003,121);
 assert.equal(result.allowDistance,50);
 assert.ok(result.distance>=30 && result.distance<=36);
 assert.ok(result.distance<=result.allowDistance);
});
test('TESTSITE 50m radius rejects a roughly 67m GPS distance',()=>{
 const r=ctx.v2dSite_(ss,25.0006,121);
 assert.ok(r.distance>=60);
 assert.equal(r.allowDistance,50);
 assert.ok(r.distance>r.allowDistance);
});

test('50m geofence includes measured 49m but excludes 51m',()=>{
 const radius=sheets['上班地點'].rows[1][4];
 assert.equal(radius,50);
 const inside=ctx.v2dSite_(ss,25+(49/111194.93),121);
 const outside=ctx.v2dSite_(ss,25+(51/111194.93),121);
 assert.equal(inside.allowDistance,50);
 assert.equal(inside.distance,49);
 assert.equal(outside.distance,51);
 assert.ok(inside.distance<=50 && outside.distance>50);
});
test('invalid 50m site center and too-wide radius both fail closed',()=>{
 const row=sheets['上班地點'].rows[1],prevCenter=row[3],prevRadius=row[4];
 try {
   row[3]='0,0';
   assert.throws(()=>ctx.v2dSite_(ss,25,121),/測試場地尚未完成/);
   row[3]=prevCenter;row[4]=301;
   assert.throws(()=>ctx.v2dSite_(ss,25,121),/測試場地尚未完成/);
   row[4]=9;
   assert.throws(()=>ctx.v2dSite_(ss,25,121),/測試場地尚未完成/);
 }finally{row[3]=prevCenter;row[4]=prevRadius}
});
test('duplicate TESTSITE location rows reject ambiguous geofence',()=>{
 const rows=sheets['上班地點'].rows,prior=rows.length;
 rows.push([...rows[1]]);
 try{assert.throws(()=>ctx.v2dSite_(ss,25,121),/模擬打卡地點設定不正確/)}
 finally{rows.pop()}
 assert.equal(rows.length,prior);
});
test('future-dated GPS capture is rejected before a first write',()=>{
 const n=sheets['打卡紀錄'].rows.length;
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
   type:'上班',requestId:'future_capture_123456',
   lat:25,lng:121,accuracy:10,capturedAt:Date.now()+30000
 })),/GPS 定位已過期/);
 assert.equal(sheets['打卡紀錄'].rows.length,n);
});
test('missing or invalid GPS accuracy blocks a new punch',()=>{
 const rows=sheets['打卡紀錄'].rows,n=rows.length;
 for(const accuracy of [0,-1,151]){
   assert.throws(()=>ctx.v2dDispatch_(req('clock',{
     type:'上班',requestId:'invalidaccuracy_123456',
     lat:25,lng:121,accuracy,capturedAt:Date.now()
   })),/定位精度不足/);
 }
 assert.equal(rows.length,n);
});
test('OUT_OF_RANGE yields definite no-write status and never leaks token',()=>{
 const before=sheets['打卡紀錄'].rows.length;
 const r=ctx.doPost({parameter:req('clock',{
   type:'上班',requestId:'outside_radius_123456',
   lat:25.01,lng:121.01,accuracy:10,capturedAt:Date.now()
 })});
 assert.ok(r.html.includes('"code":"OUT_OF_RANGE"'));
 assert.ok(r.html.includes('"persisted":false'));
 assert.equal(r.html.includes(fakeIdToken),false);
 assert.equal(sheets['打卡紀錄'].rows.length,before);
});
test('poor accuracy rejected',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:reqId,lat:25,lng:121,accuracy:999,capturedAt:Date.now()
 })),/定位精度不足/);
});

test('previous-day punch does not block a fresh calendar-day TEST001 clock',()=>{
 const sh=sheets['打卡紀錄'],n=sh.rows.length;
 const yesterday=new Date(Date.now()-86400000);
 const prior=[new Date(),yesterday,'09:00:00','TEST001','模擬員工甲',
   '上班','TESTSITE','測試場地','test-only','', 'LINE-V2:yesterday'];
 sh.rows.push(prior);
 try {
   const result=ctx.v2dDispatch_(req('clock',{
     type:'上班',requestId:'new_workday_12345678',lat:25,lng:121,
     accuracy:12,capturedAt:Date.now()
   })).result;
   assert.equal(result.ok,true);
   assert.equal(result.alreadyRecorded,false);
   assert.equal(sh.rows.length,n+2);
 } finally {
   sh.rows.length=n;
 }
});
test('read-only todayAttendance ignores previous calendar-day shift',()=>{
 const sh=sheets['打卡紀錄'],n=sh.rows.length;
 sh.rows.push([new Date(),new Date(Date.now()-86400000),
   '23:59:00','TEST001','模擬員工甲','上班',
   'TESTSITE','測試場地','test-only','', 'LINE-V2:yesterday']);
 try {
   const result=ctx.v2dDispatch_(req('todayAttendance')).result;
   assert.equal(result.clockIn,null);
   assert.equal(result.total,0);
 }finally{sh.rows.length=n}
});
test('valid GPS punch writes exactly one 11-column row',()=>{
 const r=ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:reqId,lat:25,lng:121,accuracy:10,capturedAt:Date.now()
 })).result;
 assert.equal(r.ok,true);assert.equal(r.found,true);assert.equal(r.alreadyRecorded,false);
 assert.equal(sheets['打卡紀錄'].rows.length,2);
 assert.equal(sheets['打卡紀錄'].rows[1].length,11);
 assert.equal(sheets['打卡紀錄'].rows[1][10],'LINE-V2:'+reqId);
});

test('todayAttendance remembers first clock without requestId',()=>{
 const len=sheets['打卡紀錄'].rows.length;
 const r=ctx.v2dDispatch_(req('todayAttendance')).result;
 assert.equal(r.total,1);assert.equal(r.clockIn.time,'13:14:15');
 assert.equal(r.clockIn.placeName,'測試場地');assert.equal(r.clockOut,null);
 assert.equal(sheets['打卡紀錄'].rows.length,len);
 for(const secret of [currentUid,reqId,'25,121',fakeIdToken])
   assert.equal(JSON.stringify(r).includes(secret),false);
});
test('todayAttendance handles date cells as Date objects',()=>{
 const row=sheets['打卡紀錄'].rows[1],old=row[1];
 row[1]=new Date();
 assert.equal(ctx.v2dDispatch_(req('todayAttendance')).result.total,1);
 row[1]=old;
});

test('confirmed request replay works even after worker moves outside GPS fence',()=>{
 const before=sheets['打卡紀錄'].rows.length;
 const r=ctx.v2dDispatch_(req('clock',{
   type:'上班',requestId:reqId,lat:65,lng:1,accuracy:999,
   capturedAt:Date.now()-86400000
 })).result;
 assert.equal(r.ok,true);
 assert.equal(r.alreadyRecorded,true);
 assert.equal(r.type,'上班');
 assert.equal(sheets['打卡紀錄'].rows.length,before);
});
test('same request retries without fresh GPS or extra write',()=>{
 const r=ctx.v2dDispatch_(req('clock',{type:'上班',requestId:reqId})).result;
 assert.equal(r.alreadyRecorded,true);
 assert.equal(sheets['打卡紀錄'].rows.length,2);
});
test('same request ID with different punch type rejected',()=>{
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{type:'下班',requestId:reqId})),/類型不符/);
});
test('Sheets Date-typed date cell still blocks same-day duplicate punch',()=>{
 const row=sheets['打卡紀錄'].rows[1],saved=row[1];
 row[1]=new Date();
 const result=ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:'date_typed_duplicate_456',
  lat:25,lng:121,accuracy:12,capturedAt:Date.now()
 })).result;
 assert.equal(result.code,'ALREADY_CLOCKED');
 assert.equal(sheets['打卡紀錄'].rows.length,2);
 row[1]=saved;
});

test('after leaving test geofence, repeated same-day type reports already clocked',()=>{
 const rows=sheets['打卡紀錄'].rows,before=rows.length;
 const r=ctx.v2dDispatch_(req('clock',{
   type:'上班',requestId:'already_clocked_offsite_123',
   lat:25.5,lng:121.5,accuracy:20,capturedAt:Date.now()
 })).result;
 assert.equal(r.ok,false);assert.equal(r.code,'ALREADY_CLOCKED');
 assert.equal(r.message,'今天已有同類型測試打卡，請查詢紀錄');
 assert.equal(rows.length,before);
});
test('after successful clock, missing GPS cannot hide already clocked status',()=>{
 const rows=sheets['打卡紀錄'].rows,before=rows.length;
 const r=ctx.v2dDispatch_(req('clock',{
   type:'上班',requestId:'already_clocked_no_gps_123'
 })).result;
 assert.equal(r.code,'ALREADY_CLOCKED');
 assert.equal(rows.length,before);
});
test('second same-day same-type request does not double-write',()=>{
 const r=ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:'anotherclock_request_100',lat:25,lng:121,accuracy:20,capturedAt:Date.now()
 })).result;
 assert.equal(r.ok,false);assert.equal(r.code,'ALREADY_CLOCKED');
 assert.equal(sheets['打卡紀錄'].rows.length,2);
});

test('todayAttendance reads exactly one clock in and one clock out',()=>{
 const rows=sheets['打卡紀錄'].rows,n=rows.length;
 rows.push([new Date(),rows[1][1],'18:46:00','TEST001','模擬員工甲',
   '下班','TESTSITE','測試場地','secret-gps','', 'LINE-V2:second']);
 const r=ctx.v2dDispatch_(req('todayAttendance')).result;
 assert.equal(r.total,2);assert.equal(r.clockIn.time,'13:14:15');
 assert.equal(r.clockOut.time,'18:46:00');
 assert.equal(JSON.stringify(r).includes('secret-gps'),false);
 assert.equal(rows.length,n+1);rows.pop();
});
test('todayAttendance raises alarm rather than hiding duplicate rows',()=>{
 const rows=sheets['打卡紀錄'].rows;
 rows.push([...rows[1]]);
 assert.throws(()=>ctx.v2dDispatch_(req('todayAttendance')),/紀錄重複/);
 rows.pop();
});
test('todayAttendance rejects malformed recorded time',()=>{
 const row=sheets['打卡紀錄'].rows[1],old=row[2];
 row[2]='bad-time';
 assert.throws(()=>ctx.v2dDispatch_(req('todayAttendance')),/時間格式異常/);
 row[2]=old;
});
test('clockStatus finds committed request after response loss',()=>{
 const r=ctx.v2dDispatch_(req('clockStatus',{
  type:'上班',requestId:reqId})).result;
 assert.equal(r.found,true);assert.equal(r.alreadyRecorded,true);
});
test('clockStatus for pending ID stays unknown',()=>{
 const r=ctx.v2dDispatch_(req('clockStatus',{
  type:'上班',requestId:'pending_clock_req_100'})).result;
 assert.equal(r.found,false);
});
test('unbound different LINE identity cannot clock or query status',()=>{
 const original=currentUid;currentUid='U'+'b'.repeat(32);
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'上班',requestId:'outsiderclock_100000'})),/尚未綁定/);
 assert.throws(()=>ctx.v2dDispatch_(req('clockStatus',{
  type:'上班',requestId:reqId})),/尚未綁定/);
 currentUid=original;
});
test('server lock failure blocks writes',()=>{
 const n=sheets['打卡紀錄'].rows.length;
 allowLock=false;
 assert.throws(()=>ctx.v2dDispatch_(req('clock',{
  type:'下班',requestId:'clock_busy_req_10000',
  lat:25,lng:121,accuracy:10,capturedAt:Date.now()
 })),/忙碌/);
 allowLock=true;
 assert.equal(sheets['打卡紀錄'].rows.length,n);
});
test('doPost replies only to fixed Github origin without token or LINE user ID',()=>{
 const r=ctx.doPost({parameter:req('whoami')});
 assert.equal(r.mode,'ALLOWALL');
 assert.ok(r.html.includes('https://line-punch.github.io'));
 assert.equal(r.html.includes(fakeIdToken),false);
 assert.equal(r.html.includes(currentUid),false);
 assert.ok(r.html.includes('YC_V2_STAGING_FORM_V1'));
});
test('known GPS rejection has definite no-write status',()=>{
 const p=ctx.doPost({parameter:req('clock',{
  type:'下班',requestId:'stale_new_request_200',lat:25,lng:121,
  accuracy:10,capturedAt:Date.now()-180000
 })});
 assert.ok(p.html.includes('"code":"GPS_STALE"'));
 assert.ok(p.html.includes('"persisted":false'));
});
test('doPost error does not leak token or details',()=>{
 const r=ctx.doPost({parameter:req('leave',{reason:'do-not-echo-this'})});
 assert.ok(r.html.includes('"ok":false'));
 assert.equal(r.html.includes('do-not-echo-this'),false);
 assert.equal(r.html.includes(fakeIdToken),false);
});
test('doGet provides plain text only, not Google script.run UI',()=>{
 const r=ctx.doGet();
 assert.equal(r.mime,'TEXT');assert.equal(r.html,undefined);
});
test('every data-service access uses only script-property isolated Sheet ID',()=>{
 assert.equal(opens.every(id=>id===ss.getId()||id==='WRONG_SHEET_ID_1234567890'),true);
 assert.equal(source.includes('SpreadsheetApp.getActiveSpreadsheet'),false);
});
console.log('TOTAL '+total+' passed');
