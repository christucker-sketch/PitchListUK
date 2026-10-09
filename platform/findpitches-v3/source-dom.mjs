// Bounded inert HTML reader. Scripts are data, never evaluated; malformed/deep input fails closed.
const VOID=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…',bull:'•'};
export function decode(value) {
  return String(value??'').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(all,key)=>{
    if(key[0]!=='#')return ENTITIES[key.toLowerCase()]??all;
    const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
  });
}
export function parseHtml(html) {
  if(typeof html!=='string'||html.length>1048576)throw Error('source_html_size_limit');
  const root={tag:'root',attrs:{},children:[],start:0,end:html.length},stack=[root];let cursor=0,count=0;
  const tags=/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][a-z\d:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  for(let m;(m=tags.exec(html));) {
    if(m.index>cursor)stack.at(-1).children.push({tag:'#text',value:decode(html.slice(cursor,m.index)),children:[]});
    const token=m[0];cursor=tags.lastIndex;if(token.startsWith('<!'))continue;
    const name=token.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
    if(token.startsWith('</')) {for(let i=stack.length-1;i>0;i--)if(stack[i].tag===name){stack[i].end=cursor;stack.length=i;break;}continue;}
    if(++count>50000||stack.length>120)throw Error('source_html_structure_limit');
    const attrs={};for(const a of token.slice(name.length+1,-1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]??'');
    const node={tag:name,attrs,children:[],start:m.index,end:cursor};stack.at(-1).children.push(node);
    if(['script','style'].includes(name)) {
      const closing=new RegExp('</'+name+'\\s*>','ig');closing.lastIndex=cursor;const close=closing.exec(html);
      if(!close)throw Error('source_html_unclosed_raw_element');
      node.children.push({tag:'#text',value:html.slice(cursor,close.index),children:[]});node.end=closing.lastIndex;cursor=node.end;tags.lastIndex=cursor;continue;
    }
    if(!VOID.has(name)&&!token.endsWith('/>'))stack.push(node);
  }
  if(cursor<html.length)stack.at(-1).children.push({tag:'#text',value:decode(html.slice(cursor)),children:[]});
  return root;
}
export function excluded(node) {
  // Theme-wide "menu-inline" / "mobile-nav" classes on the document shell
  // describe layout, not a navigation subtree. Child nav/footer still stay excluded.
  if(['root','html','body'].includes(node.tag))return false;
  return ['nav','footer','header','script','style','noscript','template'].includes(node.tag)||/(?:^|[\s_-])(?:nav(?:bar|igation)?|footer|foot|menu|breadcrumb|related|recommendations?|cookie|modal)(?:[\s_-]|$)/i.test([node.attrs?.class,node.attrs?.id].filter(Boolean).join(' '))||String(node.attrs?.id??'')==='ls-ev-rel';
}
export function nodes(root,predicate,{scoped=false}={}) {
  const found=[];function walk(node){if(scoped&&excluded(node))return;if(predicate(node))found.push(node);for(const c of node.children??[])walk(c);}walk(root);return found;
}
export function text(node,{scoped=true}={}) {
  if(!node||scoped&&excluded(node))return '';
  if(node.tag==='#text')return node.value;
  return (node.children??[]).map(c=>text(c,{scoped})).join(' ').replace(/\s+/g,' ').trim();
}
export const first=(root,predicate,options)=>nodes(root,predicate,options)[0]??null;
export const hasClass=(node,name)=>String(node.attrs?.class??'').split(/\s+/).includes(name);
