export function extractHtmlMetadataText(html) {
  const source=String(html||'');
  const values=[];
  const re=/<meta\b([^>]+)>/gi;
  let match;
  while((match=re.exec(source))){
    const attrs=parseAttributes(match[1]);
    const key=String(attrs.name||attrs.property||'').trim().toLowerCase();
    if(!['description','og:description','og:title','twitter:description','twitter:title'].includes(key))continue;
    const value=decodeEntities(String(attrs.content||'')).replace(/\s+/g,' ').trim();
    if(value&&value.length<=1000)values.push(value);
  }
  return [...new Set(values)].join('\n');
}

function parseAttributes(value){
  const attrs={};
  const re=/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  let match;
  while((match=re.exec(String(value||'')))){
    attrs[String(match[1]).toLowerCase()]=match[2]??match[3]??match[4]??'';
  }
  return attrs;
}

function decodeEntities(value){
  return String(value||'')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ');
}
