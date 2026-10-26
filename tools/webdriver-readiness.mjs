/** Wait for the local W3C status endpoint; a running process alone is insufficient. */
export async function waitForWebDriver({url,driver,timeoutMs=30000,intervalMs=100}){
 const deadline=Date.now()+timeoutMs;let last='not ready';let spawnError;
 const failed=error=>{spawnError=error;};driver?.on('error',failed);
 try{
  while(Date.now()<deadline){
   if(spawnError)throw new Error(`WebDriver process failed: ${spawnError.message}`);
   if(driver&&(driver.exitCode!==null||driver.signalCode!==null))throw new Error(`WebDriver process exited before readiness: ${driver.exitCode ?? driver.signalCode}`);
   try{
    const response=await fetch(`${url}/status`,{signal:AbortSignal.timeout(Math.max(1,Math.min(1500,deadline-Date.now())))});
    const data=await response.json();
    if(response.ok&&data.value?.ready===true)return;
    last=`HTTP ${response.status}, ready=${data.value?.ready}`;
   }catch(error){last=`${error.message}${error.cause?.code?` (${error.cause.code})`:''}`;}
   await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(0,deadline-Date.now()))));
  }
  throw new Error(`Timed out waiting for WebDriver at ${url}: ${last}`);
 }finally{driver?.off('error',failed);}
}
