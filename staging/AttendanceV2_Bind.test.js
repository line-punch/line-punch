// node staging/AttendanceV2_Bind.test.js  (fake LINE identities & fake sheets only)
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),a=require('node:assert/strict');
const uid='U'+'a'.repeat(32),key='ABCDEF1234567890',pepper='x'.repeat(32);
function setup(options={}){
  let writes=0,releases=0;
  const employees=[[],['T001','Person','','','YC','','在職'],['T002','Second','','U'+'b'.repeat(32),'YC','','在職']];
  if(options.duplicate)employees.push(['T001','duplicate','','','','','在職']);
  if(options.existing)employees[1][3]='U'+'b'.repeat(32);
  if(options.departed)employees[1][6]='離職';
  const hash=crypto.createHash('sha256').update(key+':'+pepper).digest('hex');
  const invitations=[[],['T001',hash,new Date(Date.now()+(options.expired?-60000:3600000)),options.used?'used':'',options.tries||0,'Owner']];
  if(options.duplicateInvite)invitations.push(invitations[1].slice());
  const sheet=(rows)=>({getDataRange:()=>({getValues:()=>rows}),getRange:(r,c)=>({setValue:v=>{rows[r-1][c-1]=v;writes++}})});
  const context={Date,Math,Number,Error,String,RegExp,
    v2VerifyLineClaims_:()=>({lineUserId:uid}),
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>pepper})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
      computeDigest:(_a,text)=>Array.from(crypto.createHash('sha256').update(text).digest())},
    LockService:{getScriptLock:()=>({tryLock:()=>!options.busy,releaseLock:()=>releases++})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>
      name==='員工資料'?sheet(employees):name==='綁定邀請'?sheet(invitations):null}),flush:()=>{}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_Bind.gs','utf8'),context);
  return {bind:(changes={})=>context.v2BindSecure({empid:'T001',invitationCode:key,...changes}),employees,invitations,
    writes:()=>writes,releases:()=>releases};
}
let count=0;function check(n,fn){fn();count++;console.log('PASS',n)}
check('first binding',()=>{const t=setup();a.equal(t.bind().ok,true);a.equal(t.employees[1][3],uid)});
check('duplicate call stable',()=>{const t=setup();t.bind();a.equal(t.bind().alreadyBound,true);a.equal(t.writes(),2)});
check('wrong invitation denied',()=>{const t=setup();a.throws(()=>t.bind({invitationCode:'WRONGCODE00'}),/不正確/);a.equal(t.invitations[1][4],1)});
check('attempt limit',()=>a.throws(()=>setup({tries:5}).bind(),/次數過多/));
check('expired code',()=>a.throws(()=>setup({expired:true}).bind(),/已過期/));
check('used code',()=>a.throws(()=>setup({used:true}).bind(),/已使用/));
check('duplicate employee refused',()=>a.throws(()=>setup({duplicate:true}).bind(),/員工資料重複/));
check('duplicate invite refused',()=>a.throws(()=>setup({duplicateInvite:true}).bind(),/多張未使用/));
check('departed employee refused',()=>a.throws(()=>setup({departed:true}).bind(),/不可綁定/));
check('other binding preserved',()=>a.throws(()=>setup({existing:true}).bind(),/已綁定其他 LINE/));
check('lock busy rejected',()=>a.throws(()=>setup({busy:true}).bind(),/忙碌/));
check('lock released after error',()=>{const t=setup();a.throws(()=>t.bind({invitationCode:'WRONGCODE00'}));a.equal(t.releases(),1)});
console.log('TOTAL '+count+' passed');
