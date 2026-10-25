import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const dir=process.env.DATA_DIR||'data';
const db=new DatabaseSync(path.join(dir,'critique.sqlite'));
const backups=path.join(dir,'backups');mkdirSync(backups,{recursive:true});
const backup=path.join(backups,`before-reset-${Date.now()}.sqlite`);
db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
db.exec('BEGIN');
try{
 for(const table of ['votes','takeaways','feedback','events','critiques','members','folder_members','projects','folders'])db.exec('DELETE FROM '+table);
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}
db.close();console.log('Test projects and feedback cleared. Accounts preserved. Backup: '+backup);
