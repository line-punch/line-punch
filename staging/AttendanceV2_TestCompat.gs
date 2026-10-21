/** Test-only compatibility functions. Do NOT copy the production Code.gs.
 * Each helper refuses to operate unless the active Sheet is a V2 test fixture.
 */
function v2TestRows_(name) {
  const ss=v2AssertTestSheet_(),sh=ss.getSheetByName(name);
  if(!sh)throw Error('測試表缺少工作表：'+name);
  return sh.getDataRange().getValues();
}
function getEmployeeById_(id) {
  for(const row of v2TestRows_('員工資料').slice(1)){
    if(String(row[0]||'').trim()!==String(id||'').trim())continue;
    return {employeeId:String(row[0]||''),name:String(row[1]||''),
      phone:String(row[2]||''),lineUserId:String(row[3]||''),
      company:String(row[4]||''),department:String(row[5]||''),
      status:String(row[6]||''),allowedLocation:String(row[7]||'')};
  }
  return null;
}
function getNearestAllowedLocation_(emp,lat,lng){
  const allow=String(emp.allowedLocation||'').split(/[,\s、，]+/).filter(Boolean);
  let nearest=null;
  for(const row of v2TestRows_('上班地點').slice(1)){
    const code=String(row[0]||'').trim();
    if(!code || (allow.length && !allow.includes(code)))continue;
    const coords=String(row[3]||'').replace(/[()]/g,'').split(',');
    if(coords.length!==2)continue;
    const a=Number(coords[0]),b=Number(coords[1]),radius=Number(row[4]);
    if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(radius)||radius<=0)continue;
    const rad=Math.PI/180,R=6371000;
    const dlat=(a-lat)*rad,dlng=(b-lng)*rad;
    const q=Math.sin(dlat/2)**2 +Math.cos(lat*rad)*Math.cos(a*rad)*Math.sin(dlng/2)**2;
    const distance=Math.round(R*2*Math.asin(Math.min(1,Math.sqrt(q))));
    if(!nearest||distance<nearest.distance)
      nearest={code,name:String(row[1]||''),distance,allowDistance:radius};
  }
  return nearest;
}
function getManagers_(id) {
  for(const row of v2TestRows_('審核通知名單').slice(1)){
    if(String(row[0]||'').trim()===String(id||'').trim())
      return {m1:String(row[2]||''),m2:String(row[3]||''),boss:String(row[4]||'')};
  }
  return {};
}
function getNameByLineUserId_(uid){
  for(const row of v2TestRows_('員工資料').slice(1))
    if(String(row[3]||'')===String(uid||''))return String(row[1]||'');
  return '測試主管';
}
function combineDateTime_(dateValue,timeValue){
  v2AssertTestSheet_();
  const day=dateValue instanceof Date
    ? Utilities.formatDate(dateValue,'Asia/Taipei','yyyy-MM-dd')
    : String(dateValue||'').replace(/\//g,'-').slice(0,10);
  const time=timeValue instanceof Date
    ? Utilities.formatDate(timeValue,'Asia/Taipei','HH:mm')
    : String(timeValue||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return null;
  const result=new Date(day+'T'+time+':00+08:00');
  return Number.isNaN(result.getTime())?null:result;
}
function nowInfo_(){
  v2AssertTestSheet_();
  const ts=new Date(),zone='Asia/Taipei';
  return {ts,date:Utilities.formatDate(ts,zone,'yyyy/MM/dd'),
    time:Utilities.formatDate(ts,zone,'HH:mm:ss'),
    full:Utilities.formatDate(ts,zone,'yyyy/MM/dd HH:mm:ss')};
}
/* This file substitutes the necessary Code.gs pure helpers only for TEST.
 * It does not define any Webhook POST handler or import the unsafe JSONP API.
 */
