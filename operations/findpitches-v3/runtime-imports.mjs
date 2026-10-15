// Match the repository's static imports/re-exports and literal dynamic imports.
// A catalogue key ending in 'from' is data, not a module import.
export function runtimeImports(source) {
 const comment='(?:/\\*[\\s\\S]*?\\*/|//[^\\r\\n]*(?:\\r?\\n|$))';
 const gap='(?:\\s|'+comment+')*';
 const bindings='(?:[\\w${},*\\s]|'+comment+')*?';
 const pattern=new RegExp('(?:\\bimport'+gap+'\\('+gap+'|\\b(?:import|export)'+gap+bindings+'\\bfrom'+gap+'|(?:^|[;}\\r\\n])\\s*import'+gap+')([\'"])([^\'"]+)\\1','g');
 return [...source.matchAll(pattern)].map(m=>m[2]);
}
