/** Node offline test: node staging/AttendanceV2_MinimalVerifyService.test.js */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/AttendanceV2_MinimalVerifyService.gs','utf8');
const now=Math.floor(Date.now()/1000);
let props={LINE_LOGIN_CHANNEL_ID:'2012136707',
  ATTENDANCE_V2_BRIDGE_MODE:'verify_only'};
let responseCode=200,claims=null,fetchCalls=0;
const uid='U'+'a'.repeat(32);
const good={iss:'https://access.line.me',aud:'2012136707',
  sub:uid,exp:now+3600,iat:now-100};
let lastPost=null;
const context={
  Date,Number,JSON,RegExp,String,Error,Math,Object,Array,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]})},
  UrlFetchApp:{fetch:(url,opts)=>{
    fetchCalls++;lastPost={url,opts};
    return {getResponseCode:()=>responseCode,
      getContentText:()=>JSON.stringify(claims||good)};
  }},
  HtmlService:{
    XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},
    createHtmlOutput:html=>({
      html,setXFrameOptionsMode(mode){this.mode=mode;return this;}
    })
  },
  ContentService:{
    MimeType:{TEXT:'TEXT'},
    createTextOutput:text=>({text,setMimeType(type){this.mime=type;return this;}})
  }
};
vm.createContext(context);vm.runInContext(src,context);
const nonce='a'.repeat(40);
const token='eyJhbGciOiJIUzI1NiJ9.synthetic-long-payload.signature';
const input=(override={})=>({
  nonce,operation:'verify',payload:JSON.stringify({idToken:token}),...override
});
let count=0;function test(desc,fn){fn();count++;console.log('PASS '+desc)}
test('valid LINE token yields boolean only',()=>{
 const r=context.v2VerifyRequest_(input());
 assert.equal(r.verified,true);assert.equal(r.nonce,nonce);
 assert.equal(r.sub,undefined);
});
test('LINE verify HTTPS POST in request body',()=>{
 assert.equal(lastPost.url,'https://api.line.me/oauth2/v2.1/verify');
 assert.equal(lastPost.opts.method,'post');
 assert.equal(lastPost.opts.payload.id_token,token);
 assert.equal(lastPost.opts.payload.client_id,'2012136707');
});
test('unconfigured bridge fails closed',()=>{
 props.ATTENDANCE_V2_BRIDGE_MODE='';assert.throws(()=>context.v2VerifyRequest_(input()),/測試驗證未啟用/);
 props.ATTENDANCE_V2_BRIDGE_MODE='verify_only';
});
test('incorrect Channel ID fails closed',()=>{
 props.LINE_LOGIN_CHANNEL_ID='2009482137';
 assert.throws(()=>context.v2VerifyRequest_(input()),/測試 LINE Channel 設定不正確/);
 props.LINE_LOGIN_CHANNEL_ID='2012136707';
});
test('malformed token rejected before fetch',()=>{
 const n=fetchCalls;
 assert.throws(()=>context.v2VerifyRequest_(input({payload:JSON.stringify({idToken:'not-a-jwt-token-long-enough'})})),/登入資料格式不正確/);
 assert.equal(fetchCalls,n);
});
test('non-200 response rejected',()=>{
 responseCode=401;assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 登入驗證失敗/);
 responseCode=200;
});
test('wrong audience rejected',()=>{
 claims={...good,aud:'0000000000'};
 assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 驗證資料不符合規則/);claims=null;
});
test('wrong issuer rejected',()=>{
 claims={...good,iss:'https://bad.example'};
 assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 驗證資料不符合規則/);claims=null;
});
test('expired token rejected',()=>{
 claims={...good,exp:now-30};
 assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 驗證資料不符合規則/);claims=null;
});
test('unexpected user ID rejected',()=>{
 claims={...good,sub:'FAKE'};
 assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 驗證資料不符合規則/);claims=null;
});
test('future iat rejected',()=>{
 claims={...good,iat:now+1000};
 assert.throws(()=>context.v2VerifyRequest_(input()),/LINE 驗證資料不符合規則/);claims=null;
});
test('unknown action rejected before LINE call',()=>{
 const n=fetchCalls;
 for(const operation of ['bind','clock','leave','review','whoami','query']){
   assert.throws(()=>context.v2VerifyRequest_(input({operation})),/不支援此操作/);
 }
 assert.equal(fetchCalls,n);
});
test('bad nonce rejected before LINE call',()=>{
 const n=fetchCalls;
 assert.throws(()=>context.v2VerifyRequest_(input({nonce:'a'})),/無效請求識別碼/);
 assert.equal(fetchCalls,n);
});
test('bad JSON rejected',()=>assert.throws(()=>context.v2VerifyRequest_(input({payload:'x'.repeat(40)})),/無效 JSON/));
test('doPost has no personal data or token response',()=>{
 const r=context.doPost({parameter:input()});
 assert.equal(r.mode,'ALLOWALL');
 assert.ok(r.html.includes('"verified":true'));
 assert.ok(r.html.includes('https://line-punch.github.io'));
 assert.equal(r.html.includes(token),false);
 assert.equal(r.html.includes(uid),false);
});
test('doPost rejects malicious request without leaking tokens or traces',()=>{
 const r=context.doPost({parameter:input({operation:'clock'})});
 assert.ok(r.html.includes('"ok":false'));
 assert.equal(r.html.includes('Error:'),false);
});
test('malicious HTML is escaped',()=>{
 const r=context.v2Reply_({nonce,ok:false,error:'</script><img src=x onerror=alert(1)>'});
 assert.equal(r.html.includes('</script><img'),false);
 assert.ok(r.html.includes('\\u003c'));
});
test('doGet provides plain text only',()=>{
 const r=context.doGet();
 assert.equal(r.mime,'TEXT');assert.equal(r.html,undefined);
});
test('no public employee or Sheet APIs included',()=>{
 for(const op of ['SpreadsheetApp.', 'v2ClockSecure','v2SubmitLeaveSecure',
   'v2ReviewSecure','getEmployeeById_','v2BindSecure','google.script.run']){
   assert.equal(src.includes(op),false,'Found '+op);
 }
});
console.log('TOTAL '+count+' passed');
