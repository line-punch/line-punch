/**
 * Attendance V2 staged Apps Script helpers.
 * NOT DEPLOYED. Review and integrate into the actual Code.gs in a test project.
 * Calendar sheet "工作日曆" header: 日期 | 是否上班 | 備註 | 來源
 * Dates must be ISO yyyy-MM-dd; 是否上班: 是 / 否.
 * Import an official Taiwan holiday/workday calendar separately and validate
 * its applicability to the company before enabling this feature.
 */
function v2Ymd_(value) {
  const s = String(value || '').trim().replace(/\//g, '-');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error('日期格式錯誤');
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new Error('日期不存在');
  }
  return { key:s, date:date };
}
function v2Key_(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}
function v2WorkCalendar_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('工作日曆');
  if (!sh) throw new Error('尚未建立工作日曆，暫停多日請假');
  const rows = sh.getDataRange().getValues();
  const map = new Map();
  for (let i=1; i<rows.length; i++) {
    const raw = rows[i][0];
    if (!raw) continue;
    const key = raw instanceof Date
      ? Utilities.formatDate(raw, 'Asia/Taipei', 'yyyy-MM-dd')
      : v2Ymd_(raw).key;
    const value = String(rows[i][1]).trim();
    if (value !== '是' && value !== '否') throw new Error('工作日曆第'+(i+1)+'列設定錯誤');
    map.set(key, value === '是');
  }
  return map;
}
/**
 * Fail closed on missing dates. The official calendar import must populate
 * all dates in the request interval (including weekends) to avoid silently
 * treating a national holiday as an ordinary weekday.
 */
function v2ValidateLeaveRange_(startText,endText,unit) {
  const start = v2Ymd_(startText);
  const end = v2Ymd_(endText || startText);
  if (end.date < start.date) throw new Error('結束日期不可早於開始日期');
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  if (start.key < today) throw new Error('請假不可選過去日期');
  const days = Math.round((end.date - start.date)/86400000)+1;
  if (days > 31) throw new Error('單張請假最多31個日曆天，請拆單');
  if (unit !== '全天' && days !== 1) throw new Error('非全天請假僅能申請單日');
  const calendar = v2WorkCalendar_();
  const invalid = [];
  for (let i=0;i<days;i++) {
    const d = new Date(start.date.getTime()+i*86400000);
    const key = v2Key_(d);
    if (!calendar.has(key)) throw new Error('工作日曆缺少 '+key+'，請管理員先更新');
    if (!calendar.get(key)) invalid.push(key);
  }
  if (invalid.length) throw new Error('請假區間包含休息日：'+invalid.join('、')+'；請拆成不同申請單');
  return { startDate:start.key,endDate:end.key,days:days };
}
/**
 * Build the values for the existing 12-column "請假申請" schema.
 * Use in the server-side leave_ handler after verified employee identity,
 * LockService locking, and idempotency checks have been added.
 * A single application represents the entire consecutive working-day range.
 */
function v2LeaveRow_(no,employee,leaveType,unit,range,reason,nowText,startTime,endTime) {
  let quantity;
  if (unit === '全天') quantity = range.days + '天';
  else if (unit === '時數') quantity = startTime + '-' + endTime;
  else quantity = unit;
  return [
    no,employee.employeeId,employee.name,leaveType,
    v2Ymd_(range.startDate).date,v2Ymd_(range.endDate).date,
    quantity,reason,'待審核',nowText,'',''
  ];
}
/**
 * Integration requirements:
 * 1. Authenticate caller on the SERVER, not solely by empid/userId from JSONP.
 * 2. Use LockService and stable requestId before appendRow to prevent duplicates.
 * 3. Return application number, range and days only after durable append.
 * 4. Separate notification failure from data-write result.
 * 5. For managers, show startDate/endDate and total days in Flex/reply/history.
 * 6. Keep existing single-day rows readable.
 * 7. Test in a copy of the Sheet; do not run against production.
 */
