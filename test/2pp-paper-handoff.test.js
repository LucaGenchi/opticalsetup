import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaperHandoff, PAPER_HANDOFF_FIELDS, buildTwoPhotonHandoffUrl } from '../sketch/js/two-photon-handoff.js';
import { createElement } from '../sketch/js/elements.js';

test('exports only supported exact settings and identifies the literature basis', () => {
  const r=buildPaperHandoff({wavelengthNm:800,repetitionRateMHz:0.001,pulseDurationFs:35,numericalAperture:1.25,sourcePowerMw:4000});
  const q=new URL(r.url).searchParams;
  assert.equal(q.get('basis'),'paper');
  assert.deepEqual(r.imported.map(f=>f.key),['wavelengthNm','numericalAperture']);
  assert.equal(q.has('repetitionRateMHz'),false);
  assert.equal(q.has('pulseDurationFs'),false);
  assert.equal(q.has('sourcePowerMw'),false);
  assert.ok(r.omitted.every(f=>f.reason.startsWith('Outside lab range')));
});

test('unknown, malformed and out-of-range settings never become guessed defaults', () => {
  assert.equal(buildPaperHandoff().url,null);
  assert.equal(buildPaperHandoff(null).url,null);
  for(const f of PAPER_HANDOFF_FIELDS){
    for(const value of [null,undefined,NaN,Infinity,'800',f.min-1,f.max+1]){
      const r=buildPaperHandoff({[f.key]:value});assert.equal(r.url,null,`${f.key} ${value}`);
    }
    for(const value of [f.min,f.max]){
      const q=new URL(buildPaperHandoff({[f.key]:value}).url).searchParams;
      assert.equal(Number(q.get(f.key)),value);
      assert.match(q.get(f.key),/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
    }
  }
});

test('reused handoff URLs do not retain unsupported stale settings',()=>{
 const r=buildPaperHandoff({wavelengthNm:800},'https://example.test/lab?sourcePowerMw=10&repetitionRateMHz=80');
 const q=new URL(r.url).searchParams;assert.equal(q.has('sourcePowerMw'),false);assert.equal(q.has('repetitionRateMHz'),false);
});

test('ordinary traced handoffs use the destination low-NA bound too',()=>{
 const source=createElement('pulsedlaser');
 const q=new URL(buildTwoPhotonHandoffUrl(source,undefined,{numericalAperture:0.1})).searchParams;
 assert.equal(q.get('numericalAperture'),'0.1');assert.equal(q.has('basis'),false);
});
