// Rebuild native apparatus drawings and the paper collection. No PDF assets
// are republished. Source hashes and original, reviewed notes are in JSON.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { encodeSharePayload } from '../sketch/js/share.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';
import { apparatus, auxiliary, auxiliaryEdges } from './2pp-apparatus.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'collections/2pp');
const CATEGORY = '2PP Paper Collection';
const records = JSON.parse(await readFile(join(DIR, 'papers.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(DIR, 'sources.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pretty = id => id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const link = p => p.doi.startsWith('arXiv:') ? `https://arxiv.org/abs/${p.doi.slice(6)}` : p.doi ? `https://doi.org/${p.doi}` : sources.documents.find(d => d.paper === p.id)?.url;
const wrap = (s, width = 28) => String(s).split('\n').flatMap(line => {
  const lines = [''];
  for (const word of line.split(' ')) {
    if (lines.at(-1).length + word.length > width && lines.at(-1)) lines.push('');
    lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
  }
  return lines;
}).join('\n');

function drawing(p, variant = '') {
  const elements = [], beams = [], refs = new Map();
  let serial = 0;
  const add = (type, x, y, params = {}, label = '') => {
    if (!registry[type]) throw new Error(`Unknown component ${type} in ${p.id}`);
    const el = createElement(type, x, y); el.id = `${p.id}-${variant || 'base'}-${++serial}`;
    Object.assign(el.params, params); el.label = label; el.showLabel = false;
    elements.push(el); return el;
  };
  const text = (x, y, value, fontSize = 11, fill = '#333333') => add('textlabel', x, y, { text: value, fontSize, fill });
  const line = (a, b, color = '#bf4747', dash = true) => {
    const outer = a.x > 500 ? 1005 : -20;
    const pts = a.y === b.y ? [a,b] : [a,{ x:outer,y:a.y },{ x:outer,y:b.y },b];
    beams.push({ id:`${p.id}-path-${beams.length}`,kind:'beam',pts,color,width:1.8,dash,arrow:true });
  };
  const shortTitle = `2PP · ${pretty(p.id)}${variant ? ` · ${variant} foci` : ''}`;
  text(0, -65, shortTitle, 23);
  text(0, -22, 'APPARATUS DRAWING · Optical sequence unfolded for readability\nDashed paths are annotations. Geometry and unspecified controls are schematic; source emission is off.', 11, '#333333');
  const settings = p.settings;
  const known = ['wavelengthNm','sourcePowerMw','pulseDurationFs','repetitionRateMHz'].every(k => Number.isFinite(settings[k]));
  const sourceNode = known ? {
    type:'pulsedlaser',label:`Fs laser\n${settings.wavelengthNm} nm · ${settings.pulseDurationFs} fs\n${settings.repetitionRateMHz} MHz · ${settings.sourcePowerMw / 1000} W`,
    params:{ enabled:false,wavelength:settings.wavelengthNm,avgPowerW:settings.sourcePowerMw/1000,pulseWidthFs:settings.pulseDurationFs,repRateMHz:settings.repetitionRateMHz },
  } : { type:'box',label:`Fs source\n${settings.wavelengthNm ? `${settings.wavelengthNm} nm` : 'NIR; unspecified'}\nSee verified settings`,params:{text:'Fs source',behavior:'pass',w:76,h:32} };
  const nodes = [sourceNode, ...structuredClone(apparatus[p.id])];
  if (p.id === 'fischer-2011') Object.assign(nodes[1].params,{modulate:true,modFreqMHz:0.004,chopDuty:0.03});
  const positions = [];
  nodes.forEach((n,i) => {
    const row = Math.floor(i / 6), col = row % 2 ? 5-i%6 : i%6;
    const pos = {x:65+col*170,y:80+row*155}; positions.push(pos);
    // Relays with unknown prescriptions stay visibly compact. The actual
    // focal lengths, where reported, are recorded on separate lens elements.
    if (n.type === 'telescope') Object.assign(n.params,{f1:-30,f2:60});
    if (n.type === 'objective' && n.params.immersion === 'custom') n.params.mediumIndex=1.5;
    const el=add(n.type,pos.x,pos.y,n.params,n.label);
    if (n.type === 'stage') el.rot=90;
    refs.set(n.label,pos);
    text(pos.x-72,pos.y+35,wrap(`${i+1}. ${n.label}`,22),13);
    if (i) line(positions[p.id==='gu-2025' && i===7?4:i-1],pos,settings.wavelengthNm<600?'#56843a':'#bf4747');
  });
  if(p.id==='gu-2025'){
    line({x:positions[6].x,y:positions[6].y-12},{x:positions[5].x,y:positions[5].y-12});
    line({x:positions[5].x,y:positions[5].y-12},{x:positions[4].x,y:positions[4].y-12});
  }
  const rows=Math.ceil(nodes.length/6), aux=auxiliary[p.id];
  let bottom=80+rows*155;
  if(aux){
    text(0,bottom,aux.label,15,'#333333');
    const auxPos=aux.nodes.map((n,i)=>{
      const pos={x:65+i*170,y:bottom+70};
      add(n.type,pos.x,pos.y,n.params,n.label);
      text(pos.x-72,pos.y+35,wrap(n.label,22),13);
      return pos;
    });
    const point=value=>typeof value==='number'?auxPos[value]:refs.get(value==='root'?aux.after:value);
    for(const [a,b]of auxiliaryEdges[p.id]){
      if(!point(a)||!point(b))throw new Error(`Missing branch in ${p.id}: ${a} → ${b}`);
      // Cross-row connections are keyed by numbered labels rather than
      // spanning the apparatus with ambiguous crossing lines.
      if(typeof a==='number' && typeof b==='number')line(point(a),point(b),'#66809c');
      else {
        const target=typeof a==='number'?a:b;
        const ref=typeof a==='string'?a:b;
        const label=ref==='root'?aux.after:ref;
        const mainIndex=nodes.findIndex(n=>n.label===label)+1;
        text(auxPos[target].x-66,auxPos[target].y-28,`${typeof a==='string'?'From':'To'} ${mainIndex}`,11,'#333333');
      }
    }
    bottom+=190;
  }
  if(p.id==='gu-2025')text(0,bottom,variant==='2500'?'50×50 metalenses · NA 1 · 200 µm lens size':'370×350 metalenses · NA 0.8 · 100 µm lens size',12);
  text(0,bottom+42,`Evidence and model limits: https://opticalsetup.com/collections/2pp/${p.id}/`,10,'#333333');
  text(0,bottom+65,wrap(p.modelLimits,130),10,'#333333');
  const scene=parseSketch(JSON.stringify({elements,beams}),registry);
  return {app:'optics2d',version:1,...scene};
}

await mkdir(join(ROOT,'Examples',CATEGORY),{recursive:true});
const rendered=[];
for(const p of records.papers){
  const variants=p.status==='reviewed'?(p.id==='gu-2025'?['129500','2500']:['']):[];
  const setups=[];
  for(const variant of variants){
    const name=`2PP ${pretty(p.id)}${variant?` ${variant} foci`:''}`;
    const filename=`${name}.json`,scene=drawing(p,variant),json=JSON.stringify(scene,null,2)+'\n';
    await writeFile(join(ROOT,'Examples',CATEGORY,filename),json);
    const payload=await encodeSharePayload(json);
    setups.push({name,variant,file:`/Examples/${encodeURIComponent(CATEGORY)}/${encodeURIComponent(filename)}`,href:`/sketch/#sketch=${payload}`,slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-')});
  }
  rendered.push({...p,setups});
}
await writeFile(join(DIR,'scene-manifest.json'),JSON.stringify(rendered.map(p=>({id:p.id,status:p.status,setups:p.setups.map(({href,...s})=>s)})),null,2)+'\n');

const head=(title,canonical)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · OpticalSetup</title><meta name="description" content="Paper-grounded two-photon lithography apparatus drawings, source evidence, modelling limits and editable OpticalSetup files."><link rel="canonical" href="https://opticalsetup.com${canonical}"><link rel="stylesheet" href="/collections/2pp/style.css"></head><body><header><a class="brand" href="/">OpticalSetup</a><nav aria-label="Main"><a href="/sketch/">Workbench</a><a href="/example-setups/">Examples</a><a href="/collections/2pp/">2PP collection</a></nav></header>`;
const end=`<footer>Original apparatus drawings and research notes. Source PDFs remain with their authors and publishers.<br><a href="/collections/2pp/sources.json">Download source manifest</a> · <a href="/collections/2pp/papers.json">Download research records</a></footer></body></html>`;
const tableRows=p=>p.map(r=>`<tr><td>${r.year}</td><th scope="row"><a href="${r.id}/">${esc(pretty(r.id))}</a><span>${esc(r.title)}</span></th><td>${esc(r.family)}</td><td>${r.setups.length?`${r.setups.length} editable ${r.setups.length===1?'drawing':'drawings'}`:'Full text needed'}</td></tr>`).join('');
const index=head('2PP paper collection','/collections/2pp/')+`<main><p class="eyebrow">Research collection · ${records.reviewDate}</p><h1>Two-photon lithography,<br>apparatus by apparatus.</h1><p class="lead">Inspect the optics behind the throughput benchmark, open an editable drawing, and follow every setup back to its paper.</p><div class="summary"><strong>17 references · 15 drawings · 3 awaiting full text</strong><p>Fourteen references have usable primary documents. Gu is based on the official supplement and public apparatus figures. The GT datasheet is a 2016 revision of a benchmark labelled 2014.</p></div><section aria-labelledby="papers"><h2 id="papers">Papers and apparatus</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Reference</th><th>Method</th><th>Coverage</th></tr></thead><tbody>${tableRows(rendered)}</tbody></table></div></section><section><h2>Read the drawing, then choose the model</h2><p>These are editable apparatus drawings with numbered components and annotated optical connections. Reported settings live in the evidence record. Distances, unknown lens prescriptions and unreported controls are schematic. Source emission is off so a drawn path cannot be mistaken for a simulated result.</p><p>The new diffractive splitter, microlens array and metalens array can be used separately in traced scenes. Their models describe a limited one-dimensional section; they do not calculate a hologram, temporal focus, high-NA field or polymerization threshold.</p><p><a class="button secondary" href="/sketch/?example=2pp-array-optics-models">Inspect the traced array models</a></p></section><section><h2>Continue in Two-Photon Lithography</h2><p>Each paper page lists which settings the lab can accept. Unsupported or unreported values stay omitted, and the lab keeps its defaults for those controls. A partial parameter import does not reproduce a multi-focus, projection or depletion experiment.</p><p><a href="${esc(records.sourceArticle)}">Original throughput-scaling article</a></p></section></main>`+end;
await writeFile(join(DIR,'index.html'),index);
for(const p of rendered){
  const docs=sources.documents.filter(d=>d.paper===p.id);
  const handoff=buildPaperHandoff(p.settings);
  const buttons=p.setups.map(s=>`<a class="button" href="${esc(s.href)}">Edit ${s.variant?Number(s.variant).toLocaleString('en-US')+'-focus ':''}drawing</a><a class="download" href="${esc(s.file)}" download>Download JSON</a>`).join(' ');
  const settings=Object.entries(p.settings).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const handoffSection=p.setups.length?`<section><h2>Try supported settings in the lab</h2><p>This imports literature values. It does not import a traced optical path or reconstruct this experiment. Power, scan, chemistry, bandwidth and polarization need separate choices. Source pulse duration can differ at the specimen.</p><div class="handoff"><div><h3>Imported</h3><ul>${handoff.imported.map(f=>`<li>${esc(f.label)}: ${f.value} ${esc(f.unit)}</li>`).join('')||'<li>No compatible verified settings</li>'}</ul></div><div><h3>Omitted; lab defaults remain</h3><ul>${handoff.omitted.map(f=>`<li>${esc(f.label)}${f.value!==null?`: ${f.value} ${esc(f.unit)}`:''} — ${esc(f.reason)}</li>`).join('')}</ul></div></div>${handoff.url?`<a class="button secondary" href="${esc(handoff.url)}">Open partial preset in Two-Photon Lithography</a>`:''}${p.id==='gu-2025'?`<p><a href="${esc(buildPaperHandoff({...p.settings,numericalAperture:1}).url)}">Use the 2,500-focus variant’s NA 1 instead</a></p>`:''}</section>`:'';
  const html=head(pretty(p.id),`/collections/2pp/${p.id}/`)+`<main><a class="back" href="../">← All 17 references</a><p class="eyebrow">${esc(p.family)} · ${p.year}</p><h1 class="paper-title">${esc(p.title)}</h1><p><a href="${esc(link(p))}">${esc(p.doi||'Vendor datasheet')}</a></p><div class="actions">${buttons}</div>${p.setups.length?`<div class="preview"><iframe title="${esc(pretty(p.id))} apparatus drawing" src="/sketch/?example=${esc(p.setups[0].slug)}" loading="lazy"></iframe></div><p class="caption">Interactive preview: inspect components. Use “Edit drawing” to move, add or remove them. Dashed connections are manual annotations; source tracing is off.</p>`:`<div class="summary"><strong>Full text needed</strong><p>No apparatus drawing is published for this reference. Its abstract and bibliographic record do not establish the complete optical setup.</p></div>`}<section><h2>How the setup works</h2><p>${esc(p.mechanism)}</p>${p.opticalTrain.length?`<ol>${p.opticalTrain.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:''}${p.auxiliaryPath?`<h3>Observation and auxiliary paths</h3><p>${esc(p.auxiliaryPath)}</p>`:''}</section><section><h2>Evidence inspected</h2><ul>${p.reviewed.map(s=>`<li>${esc(s)}</li>`).join('')||'<li>Bibliographic identity and abstract only.</li>'}</ul><ul>${docs.map(d=>`<li><a href="${esc(d.url)}">${esc(d.kind)} PDF</a> · ${d.pages} pages · SHA-256 <code>${d.sha256.slice(0,16)}…</code></li>`).join('')}${sources.additionalFigures.filter(f=>f.paper===p.id).map(f=>`<li><a href="${esc(f.url)}">${esc(f.label)}</a></li>`).join('')}</ul></section><section><h2>Limits and unresolved details</h2><p>${esc(p.modelLimits)}</p><ul>${p.unknowns.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>${settings?`<details><summary>Verified numerical inputs and units</summary><table><tbody>${settings}</tbody></table></details>`:''}</section>${handoffSection}</main>`+end;
  await mkdir(join(DIR,p.id),{recursive:true});await writeFile(join(DIR,p.id,'index.html'),html);
}
console.log(`Built ${rendered.length} reference pages and ${rendered.reduce((n,p)=>n+p.setups.length,0)} native drawings`);
