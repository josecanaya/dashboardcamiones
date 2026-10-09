/** Aprendizaje supervisado versionado; las propuestas nunca cambian decisiones en vivo. */
export const LEARNING_VERSION='camera-learning-shadow-v1'
const norm=p=>String(p??'').replace(/[^A-Za-z0-9]/g,'').toUpperCase()
export function sanitizeLearning(input, body, item) {
  if (!input || body.action!=='confirm') return null
  const candidate=item?.candidates?.find(c=>c.plate===norm(input.referencePlate) && c.photoDevice===input.referenceDevice && c.photoAt===input.referenceAt)
  const capture=body.photos?.captura, reference=body.photos?.referencia
  const sameCapture=!!item && capture?.device===item.deviceCode && capture?.plate===item.readPlate
  const sameReference=!!candidate && reference?.device===candidate.photoDevice && reference?.plate===candidate.plate
  const visualVerified= input.visualVerified===true && sameCapture && sameReference && !!capture?.sceneFile && !!reference?.sceneFile
  const identity=['same_vehicle','different_vehicle'].includes(input.identity) && candidate ? input.identity : 'unknown'
  // Diferente vehículo solo es válido si se conserva la lectura propia. Nunca etiqueta un match como negativo.
  const consistent=identity==='same_vehicle' ? [item?.readPlate,candidate?.plate].includes(norm(body.plate)) : identity==='different_vehicle' ? norm(body.plate)===item?.readPlate : false
  return {version:LEARNING_VERSION,mode:'shadow',identity:consistent ? identity:'unknown',visualVerified,
    referencePlate:candidate?.plate??null,referenceDevice:candidate?.photoDevice??null,referenceAt:candidate?.photoAt??null,
    inventoryVersion:candidate?.inventory?.version??null,visitId:candidate?.inventory?.visitId??null,
    attributeErrors:(Array.isArray(input.attributeErrors)?input.attributeErrors:[]).slice(0,3).filter(e=>['color','marca','tipo'].includes(e?.kind)).map(e=>({kind:e.kind,side:['capture','reference','both'].includes(e.side)?e.side:'unknown'}))}
}
/** Alineación de edición completa, por posición; no crea alias permanentes. */
export function ocrEdits(read, correct) {
  const a=norm(read),b=norm(correct),d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0))
  for(let i=0;i<=a.length;i++) d[i][0]=i
  for(let j=0;j<=b.length;j++) d[0][j]=j
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]))
  const edits=[];let i=a.length,j=b.length
  while(i||j) {
    if(i&&j && d[i][j]===d[i-1][j-1]+Number(a[i-1]!==b[j-1])) {if(a[i-1]!==b[j-1])edits.push({position:j-1,from:a[i-1],to:b[j-1]});i--;j--}
    else if(i && d[i][j]===d[i-1][j]+1){edits.push({position:j,from:a[i-1],to:''});i--}
    else {edits.push({position:j-1,from:'',to:b[j-1]});j--}
  }
  return edits.reverse()
}
export function buildLearningModel(logRows) {
  const latest=new Map()
  for(const r of logRows) { if(!r.fragmentKey || r.action==='note')continue;latest.set(`${r.site}|${r.fragmentKey}`,r) }
  const final=[...latest.values()].filter(r=>r.action==='confirm' && r.source!=='automatic_relevance' && r.readPlate && r.plate)
  const verified=final.filter(r=>r.learning?.visualVerified && ['same_vehicle','different_vehicle'].includes(r.learning.identity))
  const proposals={}, negatives={},attributes={}
  const positives=verified.filter(r=>r.learning.identity==='same_vehicle')
  for(const r of positives) {
    const correctingReference=r.plate===r.readPlate && r.learning.referencePlate!==r.plate
    const read=correctingReference?r.learning.referencePlate:r.readPlate
    const camera=correctingReference?r.learning.referenceDevice:r.deviceCode
    for(const e of ocrEdits(read,r.plate)) {
      const key=`${camera}|${r.plate.replace(/[A-Z]/g,'L').replace(/[0-9]/g,'N')}|${e.position}|${e.from}>${e.to}`
      proposals[key]=(proposals[key]??0)+1
    }
  }
  for(const r of verified.filter(r=>r.learning.identity==='different_vehicle')) {
    const key=`${r.deviceCode}|${r.readPlate}>${r.learning.referencePlate}`;negatives[key]=(negatives[key]??0)+1
  }
  for(const r of verified) for(const e of r.learning.attributeErrors??[]) {
    const cameras=e.side==='capture'?[r.deviceCode]:e.side==='reference'?[r.learning.referenceDevice]:e.side==='both'?[r.deviceCode,r.learning.referenceDevice]:[]
    for(const c of cameras){const key=`${c}|${e.kind}`;attributes[key]=(attributes[key]??0)+1}
  }
  const weak=final.filter(r=>!r.learning?.visualVerified)
  const exploratory={}
  for(const r of weak.filter(r=>r.plate!==r.readPlate)) for(const e of ocrEdits(r.readPlate,r.plate)){const key=`${r.deviceCode}|${r.plate.replace(/[A-Z]/g,'L').replace(/[0-9]/g,'N')}|${e.position}|${e.from}>${e.to}`;exploratory[key]=(exploratory[key]??0)+1}
  const byCamera={};for(const r of weak)if(r.plate!==r.readPlate)byCamera[r.deviceCode??'sin_contexto']=(byCamera[r.deviceCode??'sin_contexto']??0)+1
  return {version:LEARNING_VERSION,mode:'shadow',autoPromotion:false,logRows:logRows.length,finalHumanConfirmations:final.length,
    verifiedComparisons:verified.length,positiveComparisons:positives.length,negativeComparisons:verified.length-positives.length,
    legacyExploratoryCorrections:weak.filter(r=>r.plate!==r.readPlate).length,legacyByCamera:byCamera,exploratoryProposals:Object.entries(exploratory).map(([key,n])=>({key,n,status:'legacy_without_verified_comparison'})).sort((a,b)=>b.n-a.n),
    proposals:Object.entries(proposals).map(([key,n])=>({key,n,status:'requires_independent_validation'})),negativePairs:negatives,attributeErrorsByCamera:attributes,
    validation:{status:'insufficient_independent_labels',policy:'Separar temporalmente y por visita; excluir referencias futuras, casos reabiertos y decisiones automáticas; no activar propuestas con esta muestra.'}}
}
