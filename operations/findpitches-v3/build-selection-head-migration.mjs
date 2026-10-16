import fs from 'node:fs';
import {selectionFieldsSql,selectionRecordsSql,selectionProducersSql,selectionOriginSql} from '../../platform/findpitches-v3/commercial-selection.mjs';
export function selectionHeadMigration(){
 const specs=[{table:'customer_selection_heads',input:'field_selections',columns:['fields_json','selected_record_ids_json'],expressions:[selectionFieldsSql,selectionRecordsSql]},
 {table:'customer_origin_heads',input:'entity_records',columns:['producers_json','origin'],expressions:[selectionProducersSql,selectionOriginSql]}];
 let sql='-- Disposable bounded read summaries; immutable evidence, selection audit and identity are retained.\n-- Live selection/link changes refresh summaries atomically, including deletions/moves.\n-- Quality holds/conflicts and all proof/time gates remain live on reads.\n';
 for(const {table,input,columns,expressions} of specs){
  const same=columns.map((c,i)=>`NEW.${c} IS ${expressions[i]('NEW.entity_id')}`).join(' AND ');
  const update=columns.map(c=>`${c}=excluded.${c}`).join(',');
  const refresh=entity=>`INSERT INTO ${table}(entity_id,${columns.join(',')}) VALUES(${entity},${expressions.map(f=>f(entity)).join(',')}) ON CONFLICT(entity_id) DO UPDATE SET ${update};`;
  sql+=`CREATE TABLE ${table}(entity_id TEXT PRIMARY KEY REFERENCES entities(id),${columns.map(c=>c==='origin'?'origin TEXT':c+' TEXT NOT NULL CHECK(json_valid('+c+'))').join(',')});\n`;
  for(const event of ['INSERT','UPDATE'])sql+=`CREATE TRIGGER ${table}_${event.toLowerCase()}_guard BEFORE ${event} ON ${table} WHEN ${event==='UPDATE'?'NEW.entity_id<>OLD.entity_id OR ':''}NOT (${same}) BEGIN SELECT RAISE(ABORT,'source_bound_selection_head_required'); END;\n`;
  for(const event of ['INSERT','UPDATE','DELETE'])sql+=`CREATE TRIGGER ${input}_refresh_customer_${event.toLowerCase()} AFTER ${event} ON ${input} BEGIN ${event==='UPDATE'?refresh('OLD.entity_id'):''}${refresh(event==='DELETE'?'OLD.entity_id':'NEW.entity_id')} END;\n`;
  sql+=`INSERT INTO ${table}(entity_id,${columns.join(',')}) SELECT e.id,${expressions.map(f=>f()).join(',')} FROM entities e;\n`;
 }
 return sql;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const file=new URL('./migrations/0027_customer_selection_heads.sql',import.meta.url),expected=selectionHeadMigration();if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==expected)throw Error('selection_head_migration_drift');}else fs.writeFileSync(file,expected);}
