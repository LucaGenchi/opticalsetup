// Validate all paper links against the actual destination parser, not a copy.
// node tools/check-2pp-handoff.mjs /path/to/twophotonlithography
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {buildPaperHandoff} from '../sketch/js/two-photon-handoff.js';
if(!process.argv[2])throw new Error('Provide the destination repository checkout path');
const {parseOpticalSetupHandoff,opticalSetupImportNotice}=await import(pathToFileURL(join(resolve(process.argv[2]),'app/opticalsetup-handoff.js')));
const {papers}=JSON.parse(await readFile(new URL('../collections/2pp/papers.json',import.meta.url),'utf8'));
const keys={wavelengthNm:'wavelength',sourcePowerMw:'power',repetitionRateMHz:'repetitionRate',pulseDurationFs:'pulseDuration',numericalAperture:'na'};
let checked=0;
for(const p of papers){
 for(const settings of p.id==='gu-2025'?[p.settings,{...p.settings,numericalAperture:1}]:[p.settings]){
  const result=buildPaperHandoff(settings);if(!result.url)continue;
  const parsed=parseOpticalSetupHandoff(new URL(result.url).searchParams);
  assert.deepEqual(parsed.rejected,[],p.id);
  assert.deepEqual(parsed.params,Object.fromEntries(result.imported.map(f=>[keys[f.key],f.value])),p.id);
  assert.equal(parsed.basis,'paper',`${p.id}: destination requires the paper-basis companion change`);
  assert.match(opticalSetupImportNotice(parsed),/literature/);
  assert.doesNotMatch(opticalSetupImportNotice(parsed),/NA was copied from the single objective traced/);
  checked++;
 }
}
console.log(`Validated ${checked} partial presets against the destination parser`);
