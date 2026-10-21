// Offline only: node staging/AttendanceV2_FormPostBridge.test.js
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/AttendanceV2_FormPostBridge.gs','utf8');
let guards=0,verifyCalls=0;
const calls={
  whoami(p){verifyCalls++;if(p.idToken!=='valid-id-token-with-a-synthetic-test-suffix-1234567')throw Error('LINE 驗證失敗');return {ok:true,bound:false}},
  attendance(){return {ok:true}},
  clock(){return {ok:true}},
  clockStatus(){return {ok:true}},
  leave(){return {ok:true}},
  leaveStatus(){return {ok:true}},
  leaveHistory(){return {ok:true}},
  reviewDetails(){return {ok:true}},
  review(){return {ok:true}}
};
const ctx={
 v2AssertTestSheet_:()=>{guards++},
 v2WhoamiSecure:calls.whoami,
 v2QueryAttendanceSecure:calls.attendance,
 v2ClockSecure:calls.clock,v2ClockStatusSecure:calls.clockStatus,
 v2SubmitLeaveResult:calls.leave,v2LeaveStatusSecure:calls.leaveStatus,
 v2LeaveHistorySecure:calls.leaveHistory,
 v2ReviewDetailsSecure:calls.reviewDetails,v2ReviewSecure:calls.review,
 HtmlService:{
   XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
   createHtmlOutput:html=>({html,setXFrameOptionsMode(mode){this.mode=mode;return this;}})
 }, JSON,Object,RegExp,String,Error,Array
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const nonce='a'.repeat(40);let count=0;
function ok(name,fn){fn();count++;console.log('PASS '+name)}
function parameters(extra={}){return {nonce,operation:'whoami',payload:JSON.stringify({idToken:'valid-id-token-with-a-synthetic-test-suffix-1234567'}),...extra}}
ok('verified test user accepted',()=>{const r=ctx.v2BridgeRequest_(parameters());assert.equal(r.result.ok,true)});
ok('invalid/empty token rejected',()=>assert.throws(()=>ctx.v2BridgeRequest_(parameters({payload:JSON.stringify({idToken:'invalid-token-long-enough-for-input-validation'})})),/驗證失敗/));
ok('bad nonce rejected',()=>assert.throws(()=>ctx.v2BridgeRequest_(parameters({nonce:'short'})),/請求識別無效/));
ok('method not allowlisted',()=>assert.throws(()=>ctx.v2BridgeRequest_(parameters({operation:'v2BindSecure'})),/無效的操作名稱|未開放此測試操作/));
ok('reject invalid JSON',()=>assert.throws(()=>ctx.v2BridgeRequest_(parameters({payload:'{"oops":'})),/請求長度不正確|請求不是有效 JSON/));
ok('doPost success response does not echo ID token',()=>{
 const page=ctx.doPost({parameter:parameters()});
 assert.equal(page.mode,'ALLOWALL');
 assert.equal(page.html.includes('valid-id-token-with-a-synthetic-test-suffix-1234567'),false);
 assert.equal(page.html.includes('YC_V2_STAGING_FORM_V1'),true);
 assert.equal(page.html.includes('https://line-punch.github.io'),true);
});
ok('doPost rejects unknown method without executing employee data code',()=>{
 const before=verifyCalls;
 const page=ctx.doPost({parameter:parameters({operation:'deleteSheet'})});
 assert.equal(verifyCalls,before);
 assert.equal(page.html.includes('"ok":false'),true);
});
ok('response HTML escapes embedded script-breakout characters',()=>{
 const page=ctx.v2BridgeReply_({bridge:'YC_V2_STAGING_FORM_V1',nonce,ok:false,error:'</script><img src=x onerror=alert(1)>'});
 assert.equal(page.html.includes('</script><img'),false);
 assert.equal(page.html.includes('\\u003c'),true);
});
ok('sandbox guard checked',()=>assert.ok(guards>=6));
console.log('TOTAL '+count+' passed');
