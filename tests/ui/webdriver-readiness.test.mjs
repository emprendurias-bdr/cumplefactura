import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {waitForWebDriver} from '../../tools/webdriver-readiness.mjs';
async function server(t,ready){
 const host=http.createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({value:{ready:ready()}}));});
 host.listen(0,'127.0.0.1');await once(host,'listening');t.after(()=>new Promise(resolve=>host.close(resolve)));return `http://127.0.0.1:${host.address().port}`;
}
test('waits for an actual ready WebDriver status instead of a fixed startup delay',async t=>{
 const readyAt=Date.now()+100;const url=await server(t,()=>Date.now()>=readyAt);
 await waitForWebDriver({url,timeoutMs:1000,intervalMs:20});assert.ok(Date.now()>=readyAt,'must not return while ready is false');
});
test('fails when the WebDriver never becomes ready',async t=>{
 const url=await server(t,()=>false);
 await assert.rejects(waitForWebDriver({url,timeoutMs:100,intervalMs:10}),/Timed out/);
});
test('reports a driver process that exits before readiness',async()=>{
 const driver=spawn(process.execPath,['-e','process.exit(9)']);await once(driver,'exit');
 await assert.rejects(waitForWebDriver({url:'http://127.0.0.1:9',driver,timeoutMs:200,intervalMs:10}),/exited.*9/);
});
