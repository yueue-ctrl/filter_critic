import {cpSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),output=path.join(root,'dist');
if(existsSync(output))rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
cpSync(path.join(root,'public'),output,{recursive:true,filter:source=>path.basename(source)!=='app.js'});
console.log('Built anonymous, stateless Critroom demo in dist/.');
