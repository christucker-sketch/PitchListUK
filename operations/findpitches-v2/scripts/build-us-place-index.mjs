#!/usr/bin/env node
// Offline Census import: node operations/findpitches-v2/scripts/build-us-place-index.mjs
// <2025_gaz_place_national.txt> <population-json-dir> <output.json>
// Population dir contains Census 2020 P1_001N JSON place tables for each state.
// Does not access D1, run discovery, deploy or expose opportunities.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { buildUsPlaceIndex } from '../../../platform/findpitches-v2/geography/us-place-index.mjs';

const [gazPath, populationDir, outputPath] = process.argv.slice(2);
if (!gazPath || !populationDir || !outputPath) {
  console.error('Usage: node operations/findpitches-v2/scripts/build-us-place-index.mjs <national-places.txt> <population-json-dir> <output.json>');
  process.exitCode = 2;
} else {
  const populationFiles=(await readdir(resolve(populationDir))).filter(name=>extname(name).toLowerCase()==='.json').sort();
  if (populationFiles.length === 0) throw new Error('No Census population JSON files found');
  const responses=await Promise.all(populationFiles.map(async name=>
    JSON.parse(await readFile(resolve(populationDir,name),'utf8'))));
  const index=buildUsPlaceIndex(await readFile(resolve(gazPath),'utf8'),responses);
  await writeFile(resolve(outputPath), JSON.stringify(index,null,2)+'\n', {flag:'wx'});
  const reconciliationPath=resolve(outputPath)+'.reconciliation.json';
  await writeFile(reconciliationPath,JSON.stringify({sources:index.sources,scope:index.scope,...index.reconciliation},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:resolve(outputPath),reconciliation:reconciliationPath,population_files:populationFiles.length,...index.scope}));
  if(index.scope.population_unresolved>0){
    console.warn(index.scope.population_unresolved+' places have no 2020 population match. They are preserved in the index with null population and require reconciliation; do not report major-city coverage as complete.');
  }
  if (index.scope.unclassified>0) {
    console.warn(index.scope.unclassified+' places have unclassified LSAD values; review before declaring incorporated-place coverage complete');
  }
}
