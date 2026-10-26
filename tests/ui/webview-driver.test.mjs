import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVersion,compatibleDriver,preferDownloadedDriver} from '../../tools/webview-driver.mjs';
test('reads only an unambiguous four-part runtime version',()=>{
 assert.equal(parseVersion('131.0.2903.86\r\n'),'131.0.2903.86');
 for(const raw of ['', '131', '131.0.2903.86\n156.0.1.2', '131.0.2903.86; run something'])assert.equal(parseVersion(raw),null);
});
test('matches the WebView2 build rather than the separate Edge browser major version',()=>{
 assert.equal(compatibleDriver('131.0.2903.86','131.0.2903.112'),true);
 assert.equal(compatibleDriver('131.0.2903.86','156.0.1.2'),false);
 assert.equal(compatibleDriver('131.0.2903.86','131.0.3000.1'),false);
 assert.equal(compatibleDriver(null,'131.0.2903.86'),false);
});
test('prefers the version-specific driver over an incompatible binary in PATH',()=>{
 assert.deepEqual(preferDownloadedDriver(['path-driver.exe','downloaded-driver.exe'],'downloaded-driver.exe'),['downloaded-driver.exe','path-driver.exe']);
 assert.deepEqual(preferDownloadedDriver(['path-driver.exe'],''),['path-driver.exe']);
});
