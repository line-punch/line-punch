/** Isolated, read-only tests for AttendanceV2_WorkdayLeave.gs.
 * Run ONLY in a separate Apps Script test project; no spreadsheet writes.
 */
function testAttendanceV2Leave_() {
  let passed = 0;
  function assert_(condition, msg) { if (!condition) throw new Error('FAIL: '+msg); passed++; }
  function rejects_(fn, fragment) {
    let error = '';
    try { fn(); } catch (e) { error = String(e.message || e); }
    assert_(error.includes(fragment), 'expected '+fragment+', got '+error);
  }
  const calendar = new Map([
    ['2026-11-06',true],  // Fri
    ['2026-11-07',false], // Sat
    ['2026-11-08',false], // Sun
    ['2026-11-09',true],  // Mon
    ['2026-11-10',true],  // Tue
    ['2026-11-11',false], // simulated holiday
    ['2026-11-12',true],
    ['2026-11-14',true]   // simulated government make-up Saturday
  ]);
  const today = '2026-10-20';
  const validate = (start,end,unit) => v2ValidateLeaveRange_(start,end,unit,calendar,today);
  assert_(validate('2026-11-09','2026-11-10','全天').days===2,'Mon-Tue two-day leave');
  assert_(validate('2026-11-06','2026-11-06','全天').days===1,'Friday single day');
  rejects_(()=>validate('2026-11-06','2026-11-10','全天'),'休息日');
  rejects_(()=>validate('2026-11-10','2026-11-12','全天'),'休息日');
  assert_(validate('2026-11-14','2026-11-14','全天').days===1,'Saturday make-up workday');
  rejects_(()=>validate('2026-11-13','2026-11-13','全天'),'缺少');
  rejects_(()=>validate('2026-11-10','2026-11-09','全天'),'早於');
  rejects_(()=>validate('2026-11-09','2026-11-10','時數'),'僅能申請單日');
  rejects_(()=>v2Ymd_('2026-02-30'),'不存在');
  const row=v2LeaveRow_('LEAVE-TEST',{employeeId:'TEST01',name:'測試員工'},'特休','全天',
    validate('2026-11-09','2026-11-10','全天'),'測試','2026/10/20 16:00','','');
  assert_(row.length===12 && row[6]==='2天' && row[8]==='待審核','legacy 12-column schema');
  rejects_(()=>v2LeaveRow_('X',{employeeId:'T',name:'T'},'事假','時數',
    validate('2026-11-09','2026-11-09','時數'),'','', '18:00','09:00'),'時間區間錯誤');
  Logger.log('Attendance V2 leave tests PASS: '+passed);
  return {ok:true,passed};
}
