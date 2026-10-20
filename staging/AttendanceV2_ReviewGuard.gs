/** Staging only. Never call before trusted webhook source and reviewer authorization have been verified. */
function v2Decide_(sheetName, requestNo, decision, reviewerLineId, reviewerName, lock) {
  if (['請假申請','補打卡申請'].indexOf(sheetName) === -1) throw Error('不支援的申請類型');
  if (['核准','駁回'].indexOf(decision) === -1) throw Error('不支援的審核動作');
  if (!requestNo || !reviewerLineId || !reviewerName) throw Error('缺少審核資訊');
  if (!lock.tryLock(15000)) throw Error('審核忙碌，請稍後再試');
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sh) throw Error('找不到申請資料表');
    const rows = sh.getDataRange().getValues();
    const matches = [];
    for (let i=1;i<rows.length;i++) if(String(rows[i][0]).trim()===requestNo) matches.push(i);
    if(matches.length>1) throw Error('申請單號重複，暫停審核');
    if(!matches.length) return {ok:false,code:'NOT_FOUND'};
    const i=matches[0],old=String(rows[i][8]).trim();
    const manager=getManagers_(String(rows[i][1]).trim());
    if (!manager || manager.boss!==reviewerLineId) throw Error('無審核權限');
    if(old==='核准'||old==='駁回') return {ok:true,changed:false,status:old,code:'ALREADY_REVIEWED'};
    if(old!=='待審核') throw Error('申請狀態不正確');
    const now=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss');
    let approved='';
    if(sheetName==='補打卡申請' && decision==='核准'){
      approved=combineDateTime_(rows[i][3],rows[i][6]);
      if(!(approved instanceof Date)||isNaN(approved.getTime())) throw Error('補打卡日期時間無效');
    }
    const values=[decision,rows[i][9],reviewerName,now];
    if(sheetName==='補打卡申請') values.push(approved);
    sh.getRange(i+1,9,1,values.length).setValues([values]);
    SpreadsheetApp.flush();
    return {ok:true,changed:true,status:decision,code:'REVIEWED',requestNo,reviewerName,reviewTime:now};
  } finally {
    lock.releaseLock();
  }
}
/* Before integration: validate webhook authenticity at trusted entrypoint,
 * pass the verified reviewer identity; this helper checks the request's boss reviewer from the sheet.
 * Source authenticity must still be verified before invoking.
 * Send LINE notifications only after database state is committed.
 * Never deploy without review, replay, authorization and concurrent tests. */
