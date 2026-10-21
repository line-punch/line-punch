/**
 * Separate TEST Apps Script project only. Do not add this doGet to production.
 * Script property STAGING_LIFF_ID must refer to a separate LIFF app whose
 * Endpoint URL is this TEST project's /exec URL. Never reuse/change live LIFF.
 */
function doGet(e) {
  const properties=PropertiesService.getScriptProperties();
  try { v2AssertTestSheet_(); }
  catch(_) { return HtmlService.createHtmlOutput('非隔離測試環境，已拒絕載入'); }
  const template=HtmlService.createTemplateFromFile('AttendanceV2_SecurePortal');
  template.liffId=properties.getProperty('STAGING_LIFF_ID')||'';
  return template.evaluate().setTitle('員工打卡 V2 安全驗證測試');
}
/* TEST-only installation:
 * 1) New standalone Apps Script test project linked to a copied test Sheet.
 * 2) Copy AttendanceV2_Auth.gs and this entry, and the HTML as a file
 *    named AttendanceV2_SecurePortal.
 * 3) Set properties ATTENDANCE_V2_TEST=enabled, LINE_LOGIN_CHANNEL_ID,
 *    STAGING_LIFF_ID; do not paste secrets into GitHub.
 * 4) Deploy /exec only as a test app; configure a SEPARATE staging LIFF ID.
 * 5) No real employee data and no live webhook in this project.
 */