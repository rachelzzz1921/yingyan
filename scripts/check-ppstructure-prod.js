#!/usr/bin/env node
'use strict';

const { runL1ProductionCheck } = require('../prototype/app/engine/l1-production');

runL1ProductionCheck().then(r => {
  console.log(JSON.stringify(r, null, 2));
  for (const c of r.checks) {
    console.log(`${c.pass ? '✅' : '⚠️ '} ${c.id}: ${c.detail}`);
  }
  console.log(`\n${r.ready_for_demo ? '✅' : '⚠️ '} production_tier=${r.production_tier}`);
  if (r.hint) console.log('   hint:', r.hint);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
