import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function parseVersion(value){
 const raw=String(value??'').trim();return /^\d+\.\d+\.\d+\.\d+$/.test(raw)?raw:null;
}
export function compatibleDriver(runtime,driver){
 const r=parseVersion(runtime),d=parseVersion(driver);
 return Boolean(r&&d&&r.split('.').slice(0,3).join('.')===d.split('.').slice(0,3).join('.'));
}
export function preferDownloadedDriver(paths,downloaded){return [...new Set([...(downloaded?[downloaded]:[]),...paths])];}
export function installedWebViewVersion(){
 if(process.platform!=='win32')return null;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./get-webview-version.ps1',import.meta.url))],{encoding:'utf8',timeout:10000,windowsHide:true});
 return result.status===0?parseVersion(result.stdout):null;
}
export function executableDriverVersion(path){
 const result=spawnSync(path,['--version'],{encoding:'utf8',timeout:10000,windowsHide:true});
 const match=result.status===0?/\b(\d+\.\d+\.\d+\.\d+)\b/.exec(result.stdout):null;
 return match?parseVersion(match[1]):null;
}
