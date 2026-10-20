/** STAGING ONLY. Parse official DGPA CSV to [日期, 是否上班, 備註, 來源].
 * Does not fetch remote resources or write production Sheets.
 * Supported DGPA fields: 西元日期/日期, 是否放假, 備註.
 */
function v2ParseDgpaCalendar_(csvText, year) {
  const y=Number(year);
  if(!Number.isInteger(y)||y<2020||y>2100)throw Error('年度不正確');
  const rows=Utilities.parseCsv(String(csvText||'').replace(/^\uFEFF/,''));
  if(!rows.length)throw Error('官方日曆資料為空');
  const h=rows[0].map(v=>String(v).trim().replace(/^\uFEFF/,''));
  const dateCol=h.findIndex(v=>v==='西元日期'||v==='日期');
  const flagCol=h.findIndex(v=>v==='是否放假');
  const noteCol=h.findIndex(v=>v==='備註');
  if(dateCol<0||flagCol<0)throw Error('官方日曆欄位格式已改變，停止匯入');
  const parsed=new Map();
  function normalizeDate(v){
    const s=String(v||'').trim();
    const m=/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(s)
      ||/^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if(!m)throw Error('無效日期：'+s);
    const key=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const d=new Date(key+'T00:00:00Z');
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==key)throw Error('日期不存在：'+s);
    return key;
  }
  for(let i=1;i<rows.length;i++){
    const line=rows[i];
    if(line.every(v=>String(v).trim()===''))continue;
    const key=normalizeDate(line[dateCol]);
    if(!key.startsWith(y+'-'))throw Error('包含其他年度的日期：'+key);
    if(parsed.has(key))throw Error('日期重複：'+key);
    const flag=String(line[flagCol]||'').trim();
    if(flag!=='0'&&flag!=='2')throw Error('未知放假代碼：'+flag);
    parsed.set(key,[key,flag==='0'?'是':'否',noteCol<0?'':String(line[noteCol]||''),'DGPA/'+y]);
  }
  const out=[],start=Date.UTC(y,0,1),end=Date.UTC(y+1,0,1);
  for(let t=start;t<end;t+=86400000){
    const key=new Date(t).toISOString().slice(0,10);
    if(!parsed.has(key))throw Error('缺少日期：'+key);
    out.push(parsed.get(key));
  }
  if(out.length!==parsed.size)throw Error('官方日曆日期筆數異常');
  return out;
}
function v2ApplyCompanyDays_(calendarRows,overrides){
  const map=new Map(calendarRows.map(row=>[row[0],row.slice()]));
  for(const x of overrides){
    const key=String(x.date||'').trim();
    if(!map.has(key))throw Error('公司調整日期不在已匯入日曆：'+key);
    if(x.workday!==true&&x.workday!==false)throw Error('公司上班日設定必須為布林值');
    const reason=String(x.reason||'').trim();
    if(!reason)throw Error('公司例外調整必須填寫原因');
    const row=map.get(key);row[1]=x.workday?'是':'否';row[2]=reason;row[3]='公司覆寫';
  }
  return Array.from(map.values());
}
