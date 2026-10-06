// Development/test D1 facade backed by real SQLite. Never opens a V2 database.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export function openLocalD1(file=':memory:') {
  const sqlite=new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const migrations=new URL('./migrations/',import.meta.url);
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_v3_migrations(name TEXT PRIMARY KEY);');
  for(const path of fs.readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()) {
    if(sqlite.prepare('SELECT name FROM local_v3_migrations WHERE name=?').get(path))continue;
    sqlite.exec('BEGIN IMMEDIATE');
    try {sqlite.exec(fs.readFileSync(new URL(path,migrations),'utf8'));sqlite.prepare('INSERT INTO local_v3_migrations VALUES (?)').run(path);sqlite.exec('COMMIT');}
    catch(error){sqlite.exec('ROLLBACK');sqlite.close();throw error;}
  }
  function statement(query,values=[]) {
    const execute=mode=>{
      const prepared=sqlite.prepare(query);
      if(mode==='first')return prepared.get(...values)??null;
      if(mode==='all')return {results:prepared.all(...values),success:true,meta:{changes:0}};
      if(mode==='batch'&&/\bRETURNING\b/i.test(query)) {const rows=prepared.all(...values);return {results:rows,success:true,meta:{changes:rows.length}};}
      const result=prepared.run(...values);
      return {results:[],success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
    };
    return {bind:(...args)=>statement(query,args),run:async()=>execute('run'),first:async()=>execute('first'),all:async()=>execute('all'),_execute:execute};
  }
  return {
    prepare:query=>statement(query),
    batch:async statements=>{
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results=statements.map(s=>s._execute('batch'));sqlite.exec('COMMIT');return results; }
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
    exec:async query=>sqlite.exec(query),
    close:()=>sqlite.close(),
    sqlite,
  };
}
