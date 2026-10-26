import test from 'node:test';import assert from 'node:assert/strict';import {routeFromHash} from '../../src/shared/routes.ts';
test('in-page skip link preserves the selected application route',()=>{assert.equal(routeFromHash('#bdr-content','clientes'),'clientes');assert.equal(routeFromHash('#/ajustes','clientes'),'ajustes');assert.equal(routeFromHash(''),'facturas');});
