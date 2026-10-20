/**
 * STAGING ONLY. First-time LINE binding requires a single-use invitation.
 * Test spreadsheet: 員工資料 [員工ID,姓名,手機,LINE userId,公司,部門,狀態]
 * and 綁定邀請 [員工ID,驗證碼SHA256,有效期限,已使用時間,錯誤次數,產生者].
 * Requires secret script property ATTENDANCE_BIND_PEPPER.
 */
function v2HashInvitationCode_(code) {
  const pepper=PropertiesService.getScriptProperties().getProperty('ATTENDANCE_BIND_PEPPER');
  if (!pepper||pepper.length<20) throw new Error('系統尚未設定綁定安全金鑰');
  const raw=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(code||'').trim().toUpperCase()+':'+pepper,Utilities.Charset.UTF_8);
  return raw.map(v=>('0'+(v&255).toString(16)).slice(-2)).join('');
}
function v2BindSecure(payload) {
  const identity=v2VerifyLineClaims_(payload&&payload.idToken);
  const empid=String(payload&&payload.empid||'').trim();
  const code=String(payload&&payload.invitationCode||'').trim().toUpperCase();
  if (!empid||!/^[A-Z0-9-]{8,32}$/.test(code))
    throw new Error('員工資料或綁定驗證碼不正確');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('系統忙碌，請稍後重試');
  try {
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const empSheet=ss.getSheetByName('員工資料'),inviteSheet=ss.getSheetByName('綁定邀請');
    if (!empSheet||!inviteSheet) throw new Error('缺少員工綁定設定');
    const employees=empSheet.getDataRange().getValues();
    let target=-1;
    for(let i=1;i<employees.length;i++){
      const rowId=String(employees[i][0]||'').trim();
      const lineId=String(employees[i][3]||'').trim();
      if (lineId===identity.lineUserId&&rowId!==empid)
        throw new Error('此 LINE 帳號已綁定其他員工');
      if (rowId===empid) {
        if(target!==-1) throw new Error('員工資料重複，停止綁定');
        target=i;
      }
    }
    if(target<0) throw new Error('員工資料或綁定驗證碼不正確');
    const employee=employees[target];
    if(String(employee[6]||'').trim()!=='在職') throw new Error('此員工狀態不可綁定');
    const currentId=String(employee[3]||'').trim();
    if(currentId) {
      if(currentId===identity.lineUserId) return {ok:true,alreadyBound:true};
      throw new Error('此員工已綁定其他 LINE 帳號，請聯絡管理員');
    }
    const invites=inviteSheet.getDataRange().getValues();
    let inviteIndex=-1;
    for(let i=1;i<invites.length;i++) {
      if(String(invites[i][0]||'').trim()!==empid) continue;
      if(!invites[i][3]) {
        if(inviteIndex>=0) throw new Error('此員工有多張未使用邀請，請聯絡管理員');
        inviteIndex=i;
      }
    }
    if(inviteIndex<0) throw new Error('綁定邀請不存在或已使用');
    const invite=invites[inviteIndex];
    const expires=invite[2] instanceof Date ? invite[2].getTime():new Date(invite[2]).getTime();
    if(!Number.isFinite(expires)||expires<=Date.now()) throw new Error('綁定驗證碼已過期');
    const tries=Number(invite[4]||0);
    if(tries>=5) throw new Error('綁定嘗試次數過多，請聯絡管理員');
    const candidate=v2HashInvitationCode_(code);
    if(candidate!==String(invite[1]||'').trim().toLowerCase()) {
      inviteSheet.getRange(inviteIndex+1,5).setValue(tries+1);
      throw new Error('員工資料或綁定驗證碼不正確');
    }
    // Binding written first; a retry cannot bind this employee to another LINE.
    empSheet.getRange(target+1,4).setValue(identity.lineUserId);
    inviteSheet.getRange(inviteIndex+1,4).setValue(new Date());
    SpreadsheetApp.flush();
    return {ok:true,alreadyBound:false};
  } finally { lock.releaseLock(); }
}
/* NOT DEPLOYABLE until audited owner-only invitation issuance, revocation and
 * supervised re-binding are available. No birthdate PINs or raw codes in logs. */
