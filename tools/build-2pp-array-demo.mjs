import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createElement,registry} from '../sketch/js/elements.js';
import {parseSketch} from '../sketch/js/state.js';
const elements=[];
const add=(type,x,y,params,label='')=>{const e=createElement(type,x,y);e.id=`array-demo-${elements.length}`;Object.assign(e.params,params);e.label=label;e.showLabel=Boolean(label);elements.push(e);return e;};
add('textlabel',-45,-75,{text:'Array optics · three distinct mechanisms',fontSize:20,fill:'#333333'});
add('textlabel',-45,-36,{text:'Traced 1D geometric models. These are teaching examples, not paper prescriptions.',fontSize:11,fill:'#333333'});
for(const [row,type,label]of [[0,'diffractivesplitter','Static DOE: angular splitting → common focusing lens'],[1,'microlensarray','Microlens array: a separate optical axis for each lenslet'],[2,'metalensarray','Metalens array: independent diffractive lenses']]){
 const y=row*165;
 add('cwlaser',0,y,{wavelength:800,beamMode:'beam',beamWidth:type==='diffractivesplitter'?8:40});
 add(type,125,y,{length:48,count:4,f:40,lines:60,orders:'-1,0,1',designWavelength:800,focusEff:100});
 if(type==='diffractivesplitter')add('lens',205,y,{f:60,dia:50.8});
 add('box',300,y,{w:12,h:105,text:'',behavior:'block',fill:'#d9dde1'});
 add('textlabel',-45,y+69,{text:label,fontSize:11,fill:'#333333'});
}
const scene=parseSketch(JSON.stringify({elements,beams:[]}),registry);
await writeFile(fileURLToPath(new URL('../Examples/2PP Paper Collection/2PP Array optics models.json',import.meta.url)),JSON.stringify({app:'optics2d',version:1,...scene},null,2)+'\n');
