// Offline unit tests: node staging/AttendanceV2_FormPostBridge.test.js
// No real LINE, GAS or Sheets calls.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/AttendanceV2_FormPostBridge.gs','utf8');
const TOKEN='eyJhbGciOiJIUzI1NiJ9.synthetic-user-id-token.payload-signature-long';
let guardCalls=0,verifyCalls=0;
let mode='verify_only';
const ctx={
  v2AssertTestSheet_:()=>{guardCalls++},
  v2VerifyLineClaims_:token=>{
    verifyCalls++;
    if(token!==TOKEN)throw Error('token rejected:'+token);
    return {lineUserId:'U'+'a'.repeat(32)};
  },
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>
    key==='ATTENDANCE_V2_BRIDGE_MODE'?mode:null})},
  HtmlService:{
    XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
    createHtmlOutput:html=>({html,setXFrameOptionsMode(x){this.mode=x;return this;}})
  }, JSON,Object,RegExp,String,Error,Array
};
vm.createContext(ctx);
vm.runInContext(src,ctx);
const nonce='a'.repeat(40),input=(extra={})=>({
  nonce,operation:'verify',payload:JSON.stringify({idToken:TOKEN}),...extra
});
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('valid LINE token gives verification flag only',()=>{
  const r=ctx.v2BridgeRequest_(input());
  assert.equal(r.result.ok,true);
  assert.equal(r.result.verified,true);
  assert.equal(r.result.lineUserId,undefined);
});
test('bridge disabled fails closed',()=>{
  mode='';
  assert.throws(()=>ctx.v2BridgeRequest_(input()),/測試後端驗證尚未啟用/);
  mode='verify_only';
});
test('invalid token rejected by LINE verifier',()=>{
  assert.throws(()=>ctx.v2BridgeRequest_(input({
    payload:JSON.stringify({idToken:'bad-token-long-enough-for-bridge-validation'})
  })),/token rejected/);
});
test('missing LINE token rejected',()=>assert.throws(()=>
  ctx.v2BridgeRequest_(input({payload:JSON.stringify({other:'x'.repeat(40)})})),
  /缺少 LINE 登入資料/));
test('empty or short nonce rejected',()=>assert.throws(()=>
  ctx.v2BridgeRequest_(input({nonce:'short'})),/請求識別無效/));
test('forbid all clock leave or review write operations',()=>{
  const before=verifyCalls;
  for(const operation of ['clock','leave','review','bind','attendance','clockStatus']){
    assert.throws(()=>ctx.v2BridgeRequest_(input({operation})),/未開放此測試操作/);
  }
  assert.equal(verifyCalls,before);
});
test('invalid JSON rejected',()=>assert.throws(()=>
  ctx.v2BridgeRequest_(input({payload:'x'.repeat(40)})),/請求格式錯誤/));
test('oversized request rejected',()=>assert.throws(()=>
  ctx.v2BridgeRequest_(input({payload:'x'.repeat(10001)})),/請求長度不正確/));
test('doPost succeeds without exposing the LINE token',()=>{
  const reply=ctx.doPost({parameter:input()});
  assert.equal(reply.mode,'ALLOWALL');
  assert.ok(reply.html.includes('YC_V2_STAGING_FORM_V1'));
  assert.ok(reply.html.includes('https://line-punch.github.io'));
  assert.equal(reply.html.includes(TOKEN),false);
  assert.equal(reply.html.includes('U'+'a'.repeat(32)),false);
});
test('doPost hides a rejected token value in error response',()=>{
  const reply=ctx.doPost({parameter:input({payload:JSON.stringify({
    idToken:'bad-token-long-enough-for-bridge-validation'
  })})});
  assert.ok(reply.html.includes('"ok":false'));
  assert.equal(reply.html.includes('bad-token'),false);
});
test('HTML reply escapes script-closing HTML',()=>{
  const reply=ctx.v2BridgeReply_({
    bridge:'YC_V2_STAGING_FORM_V1',nonce,
    ok:false,error:'</script><img src=x onerror=alert(1)>'
  });
  assert.equal(reply.html.includes('</script><img'),false);
  assert.ok(reply.html.includes('\\u003c'));
});
test('each request checks isolated test sheet guard',()=>assert.ok(guardCalls>=11));
console.log('TOTAL '+passed+' passed');
