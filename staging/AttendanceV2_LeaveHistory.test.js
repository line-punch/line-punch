// Run offline: node staging/AttendanceV2_LeaveHistory.test.js
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const records=[
  ['申請單號','員工ID','姓名','假別','開始日期','結束日期','天數','原因','狀態'],
  ['OLD1','TEST001','Tester','特休','2026/10/22','2026/10/22','1天','','核准'],
  ['OTHER','TEST002','Other','特休','2026/11/01','2026/11/01','1天','PRIVATE','待審核'],
  ['NEW2','TEST001','Tester','事假','2026/11/09','2026/11/10','2天','行程','待審核']
];
const ctx={
  v2AuthenticatedEmployee_:()=>({bound:true,employeeId:'TEST001',name:'Tester'}),
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>records})})})},
  Utilities:{formatDate:(v)=>new Date(v).toISOString().slice(0,10)},
  Date,String,Error,RegExp
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/AttendanceV2_LeaveHistory.gs','utf8'),ctx);
let n=0;function check(title,fn){fn();console.log('PASS '+title);n++}
check('only own rows',()=>assert.equal(ctx.v2LeaveHistorySecure({idToken:'mock'}).count,2));
check('reverse chronological',()=>assert.equal(ctx.v2LeaveHistorySecure({idToken:'mock'}).data[0].no,'NEW2'));
check('multi-day preserved',()=>assert.equal(ctx.v2LeaveHistorySecure({idToken:'mock'}).data[0].endDate,'2026-11-10'));
check('legacy dates readable',()=>assert.equal(ctx.v2LeaveHistorySecure({idToken:'mock'}).data[1].startDate,'2026-10-22'));
check('other employee reason hidden',()=>assert.equal(JSON.stringify(ctx.v2LeaveHistorySecure({idToken:'mock'})).includes('PRIVATE'),false));
console.log('TOTAL '+n+' passed');
