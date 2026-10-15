// Match the repository's static imports/re-exports and literal dynamic imports.
// A catalogue key ending in 'from' is data, not a module import.
export function runtimeImports(source) {
 return [...source.matchAll(/(?:\b(?:import|export)\s+(?:[\w${},*\s]+\s+from\s*)?|\bimport\s*\(\s*)(['"])([^'"]+)\1/g)].map(m=>m[2]);
}
