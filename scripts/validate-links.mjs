import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const docsRoot=fileURLToPath(new URL('../docs-site/',import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):e.name.endsWith('.md')?[join(dir,e.name)]:[])}
const roots=[join(docsRoot,'docs'),join(docsRoot,'i18n','es','docusaurus-plugin-content-docs','current')];
const errors=[];for(const root of roots)for(const file of walk(root)){const text=readFileSync(file,'utf8');for(const m of text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)){const target=m[1];if(target.startsWith('http')||target.startsWith('mailto:')||target.startsWith('#'))continue;if(target==='/panda/api/'&&existsSync(join(docsRoot,'static','api','index.html')))continue;const candidates=[join(dirname(file),target),join(dirname(file),target+'.md'),join(root,target+'.md')];if(!candidates.some(existsSync))errors.push(`${file}: ${target}`)}}
if(errors.length)throw new Error(`Broken documentation links:\n${errors.join('\n')}`);console.log('documentation links: valid');
