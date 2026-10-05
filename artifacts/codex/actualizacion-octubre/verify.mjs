import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PresentationFile, FileBlob } from '@oai/artifact-tool';
const directory=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const data=JSON.parse(await fs.readFile(path.join(directory,'analysis.json'),'utf8'));
for(const row of data.groups){
  assert.equal(row.daily.reduce((total,day)=>total+day.estimate,0),row.estimate);
  assert.equal(row.base+row.estimate,row.cumulative);
  assert.equal(row.training.reduce((total,day)=>total+day.y,0),row.base);
  assert.ok(row.low<=row.estimate && row.estimate<=row.high);
}
assert.equal(data.groups.reduce((total,row)=>total+row.estimate,0),503);
const presentation=await PresentationFile.importPptx(await FileBlob.load(path.join(directory,'entrega/Logistica-actualizada-1-3-octubre-2026.pptx')));
assert.equal(presentation.slides.items.length,38);
await fs.mkdir(path.join(directory,'build/final-render'),{recursive:true});
for(let index=0;index<presentation.slides.items.length;index++){
  const preview=await presentation.export({slide:presentation.slides.items[index],format:'png',scale:1});
  await fs.writeFile(path.join(directory,`build/final-render/slide-${index+1}.png`),new Uint8Array(await preview.arrayBuffer()));
}
console.log('Arithmetic verified; 38 final slides rendered.');
