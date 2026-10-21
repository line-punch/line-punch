/**
 * Isolated test spreadsheet schema generator ONLY.
 * Absolutely never call from a production spreadsheet or Apps Script project.
 * To enable, the bound spreadsheet must be named exactly
 * "YC_ATTENDANCE_V2_TEST_ONLY" and the following Script Properties must match:
 * ATTENDANCE_V2_TEST = enabled
 * ATTENDANCE_V2_TEST_SHEET_ID = ID of this same test spreadsheet.
 */
function v2AssertTestSheet_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const cfg=PropertiesService.getScriptProperties();
  if(!ss || ss.getName()!=='YC_ATTENDANCE_V2_TEST_ONLY' ||
     cfg.getProperty('ATTENDANCE_V2_TEST')!=='enabled' ||
     cfg.getProperty('ATTENDANCE_V2_TEST_SHEET_ID')!==ss.getId()) {
    throw new Error('安全鎖定：目前不是授權的 V2 隔離測試表，拒絕寫入');
  }
  return ss;
}
function v2InstallSyntheticFixture_() {
  const ss=v2AssertTestSheet_();
  const definitions=[
    ['員工資料',['員工ID','姓名','手機後六碼','LINE userId','公司','部門','狀態','可打卡地點']],
    ['上班地點',['地點代碼','地點名稱','公司','GPS中心點','容許距離']],
    ['打卡紀錄',['時間戳記','日期','時間','員工ID','姓名','類型','地點代碼','地點名稱','GPS','備註','來源']],
    ['補打卡申請',['申請單號','員工ID','姓名','日期','公司','班別','時間','原因','狀態','申請時間','審核人','審核時間','核定打卡時間']],
    ['請假申請',['申請單號','員工ID','姓名','假別','開始日期','結束日期','天數/時數','原因','狀態','申請時間','審核人','審核時間']],
    ['審核通知名單',['員工ID','員工姓名','第一主管LINE ID','第二主管LINE ID','老闆LINE ID']],
    ['工作日曆',['日期','是否上班','備註','來源']],
    ['綁定邀請',['員工ID','驗證碼SHA256','有效期限','已使用時間','錯誤次數','產生者']]
  ];
  // Fail closed on any prior data; never overwrite a row or existing business tab.
  const existing=ss.getSheets();
  for(const sh of existing) {
    const emptyDefault=['Sheet1','工作表1'].indexOf(sh.getName())>=0 && sh.getLastRow()===0;
    if(!emptyDefault) throw new Error('測試表不是空白，請新建完全空白的測試試算表');
  }
  for(const [name,headers] of definitions) {
    const sh=ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  ss.getSheetByName('員工資料').appendRow([
    'TEST001','模擬員工甲','','','TEST_CO','測試部門','在職','TESTSITE'
  ]);
  // 0,0 deliberately prevents accidental real-world GPS punching.
  const loc=ss.getSheetByName('上班地點');
  loc.appendRow(['TESTSITE','測試場地','TEST_CO','0,0',30]);
  ss.getSheetByName('審核通知名單').appendRow(['TEST001','模擬員工甲','','','']);
  const dayRows=[];
  for(const year of [2026,2027]) {
    for(let t=Date.UTC(year,0,1);t<Date.UTC(year+1,0,1);t+=86400000) {
      const date=new Date(t),key=date.toISOString().slice(0,10);
      const weekend=[0,6].includes(date.getUTCDay());
      let working=!weekend;
      let note=weekend?'週末模擬休息':'模擬工作日';
      if(key==='2026-11-11') {working=false;note='測試用假日（非官方公告）';}
      if(key==='2026-11-14') {working=true;note='測試用星期六補班（非官方公告）';}
      dayRows.push([key,working?'是':'否',note,'SYNTHETIC_TEST_ONLY']);
    }
  }
  const calendar=ss.getSheetByName('工作日曆');
  calendar.getRange(2,1,dayRows.length,4).setValues(dayRows);
  SpreadsheetApp.flush();
  return {ok:true,createdSheets:definitions.map(x=>x[0]),calendarDays:dayRows.length,
    message:'測試資料表已建立。請勿將模擬工作日曆用於正式請假。'};
}
/** For a deliberate TEST opt-in only: attach the tester's verified LINE ID
 * to TEST001. Existing ID must match or be blank; refuses any other employee.
 */
function v2TestOptInLineIdentity(payload) {
  const ss=v2AssertTestSheet_();
  const identity=v2VerifyLineClaims_(payload&&payload.idToken);
  const sh=ss.getSheetByName('員工資料');
  if(!sh||sh.getLastRow()!==2||String(sh.getRange(2,1).getValue())!=='TEST001')
    throw new Error('測試員工資料表狀態不符，停止綁定');
  const old=String(sh.getRange(2,4).getValue()||'').trim();
  if(old && old!==identity.lineUserId)
    throw new Error('已有其他測試使用者，不允許覆蓋');
  if(!old)sh.getRange(2,4).setValue(identity.lineUserId);
  const managers=ss.getSheetByName('審核通知名單');
  if(!managers||managers.getLastRow()!==2) throw new Error('測試審核設定不符');
  managers.getRange(2,5).setValue(identity.lineUserId);
  return {ok:true,message:'僅在隔離測試表完成驗證身分設定'};
}
