import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const docsRoot=fileURLToPath(new URL('../docs-site/',import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):e.name.endsWith('.md')?[join(dir,e.name)]:[])}
const roots=[join(docsRoot,'docs'),join(docsRoot,'i18n','es','docusaurus-plugin-content-docs','current')];
const errors=[];for(const root of roots)for(const file of walk(root)){const text=readFileSync(file,'utf8');for(const [,lang,code] of text.matchAll(/```(ts|typescript|bash|sh)\r?\n([\s\S]*?)```/g)){if(!code.trim())errors.push(`${file}: empty ${lang} example`);if(/<[^>]+>/.test(code)&&lang==='bash')errors.push(`${file}: bash example contains placeholder markup`)}}
if(errors.length)throw new Error(errors.join('\n'));console.log('documentation examples: structurally valid');
