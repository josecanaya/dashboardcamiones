import {describe,it,expect} from 'vitest'
import {buildLearningModel,ocrEdits,sanitizeLearning} from './cameraLearning.mjs'
const base={site:'ricardone',fragmentKey:'bad',action:'confirm',source:'operator',deviceCode:'RicCal03',readPlate:'CFK008',plate:'CFK006',learning:{identity:'same_vehicle',visualVerified:true,referencePlate:'CFK006',referenceDevice:'RicPreIngInFr',attributeErrors:[]}}
describe('aprendizaje humano en sombra',()=>{
 it('aprende sustituciones, inserciones y borrados por posición',()=>{
 expect(ocrEdits('CFK008','CFK006')).toEqual([{position:5,from:'8',to:'6'}])
 expect(ocrEdits('AAA00','AAA000')).toHaveLength(1)
 expect(ocrEdits('AAA0000','AAA000')).toHaveLength(1)
 })
 it('no promociona reglas y distingue históricos sin verificación',()=>{
 const m=buildLearningModel([{...base,learning:null},base])
 expect(m.autoPromotion).toBe(false);expect(m.positiveComparisons).toBe(1)
 expect(m.proposals[0].key).toBe('RicCal03|LLLNNN|5|8>6')
 })
 it('excluye casos reabiertos y conserva la decisión al agregar notas',()=>{
 expect(buildLearningModel([base,{...base,action:'review'}]).positiveComparisons).toBe(0)
 expect(buildLearningModel([base,{...base,action:'note'}]).positiveComparisons).toBe(1)
 })
 it('los descartes automáticos no son etiquetas negativas de identidad',()=>{
 expect(buildLearningModel([{...base,source:'automatic_relevance'}]).verifiedComparisons).toBe(0)
 })
 it('registra atributos por cámara solo si el operador identifica la fuente',()=>{
 const m=buildLearningModel([{...base,learning:{...base.learning,attributeErrors:[{kind:'color',side:'reference'},{kind:'tipo',side:'unknown'}]}}])
 expect(m.attributeErrorsByCamera).toEqual({'RicPreIngInFr|color':1})
 })
 it('no admite referencia inventada ni aprendizaje sin fotos',()=>{
 const l=sanitizeLearning({...base.learning,referenceDevice:'fake'}, {action:'confirm',plate:'CFK006'}, {readPlate:'CFK008',deviceCode:'RicCal03',candidates:[]})
 expect(l.identity).toBe('unknown');expect(l.visualVerified).toBe(false)
 })
 it('no etiqueta como vehículos diferentes una patente que acaba de vincular',()=>{
 const c={plate:'CFK006',photoDevice:'RicPreIngInFr',photoAt:'2026-10-08'}
 const l=sanitizeLearning({...base.learning,identity:'different_vehicle',referenceAt:c.photoAt}, {action:'confirm',plate:'CFK006'}, {readPlate:'CFK008',deviceCode:'RicCal03',candidates:[c]})
 expect(l.identity).toBe('unknown')
 })
})
