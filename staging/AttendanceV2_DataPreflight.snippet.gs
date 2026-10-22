/**
 * V2 DATA TEST ONLY – run once from its private Apps Script editor.
 * NO spreadsheet writes, no LINE token requests, no invitation issuance.
 * Existing v2dTestSheet_ validates test-mode, Channel ID, and exact Sheet ID/name.
 */
function v2CheckSandboxDataSetup() {
  const ss = v2dTestSheet_();
  const employees = ss.getSheetByName('員工資料');
  const places = ss.getSheetByName('上班地點');
  const clocks = ss.getSheetByName('打卡紀錄');
  const bound = String(employees.getRange(2, 4).getValue() || '').trim() !== '';
  const center = String(places.getRange(2, 4).getValue() || '').trim();
  const summary = {
    ok: true,
    testSheet: ss.getName(),
    testEmployee: 'TEST001',
    binding: bound ? '已綁定' : '尚未綁定',
    gpsSite: center === '0,0' ? '尚未設定測試定位' : '已有測試定位設定',
    clockDataRows: Math.max(0, clocks.getLastRow() - 1)
  };
  Logger.log('V2 DATA TEST PREFLIGHT PASS：' + JSON.stringify(summary));
  return summary;
}
