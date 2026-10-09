import {describe,it,expect} from 'vitest'
import {visitRowsAt,assessVisitCandidate} from './visitInventory.mjs'
const row=(logical,device,t)=>({logical,device,t:t*60000})
const candidate={journeyKey:'reused',sameNode:false,nextProbability:1,nodeProbability:1,onTime:true,automaticEligible:true}
describe('inventario por visita y paso pendiente',()=>{
 it('UID repetido: la entrada siguiente empieza una nueva instancia',()=>{
 const rows=[row('S0','RicIngCamFrente',0),row('S2','RicCal03',10),row('S3','RicEgrCamFrente',20),row('S0','RicIngCamFrente',50),row('S1','RicPreIngInFr',60)]
 expect(visitRowsAt(rows,65*60000).map(r=>r.logical)).toEqual(['S0','S1'])
 expect(visitRowsAt(rows,15*60000).map(r=>r.logical)).toEqual(['S0','S2'])
 })
 it('el ingreso a SL conserva el puente entre plantas',()=>{
 const rows=[row('S0','RicIngCamFrente',0),row('S2','RicCal03',10),row('S3','RicEgrCamFrente',20),row('SL_S0','SLZIngCamFrente',50)]
 expect(visitRowsAt(rows,60*60000)).toHaveLength(4)
 })
 it('una pausa de más de ocho horas separa vueltas, sin cortar por medianoche',()=>{
 expect(visitRowsAt([row('S1','RicPreIngInFr',0),row('S2','RicCal03',490)],500*60000)).toHaveLength(1)
 expect(visitRowsAt([row('S1','RicPreIngInFr',1439),row('S2','RicCal03',1450)],1460*60000)).toHaveLength(2)
 })
 it('otro carril de egreso no se considera doble lectura automática',()=>{
 const result=assessVisitCandidate({...candidate,sameNode:true},row('SL_S7','SLZSalidaC1Fte',11),[row('SL_S7','SLZSalidaC2Fte',10)])
 expect(result.status).toBe('exception');expect(result.lane).toBe('C1')
 })
 it('frente y trasera del mismo carril sí comparten paso',()=>{
 expect(assessVisitCandidate({...candidate,sameNode:true},row('SL_S7','SLZSalidaC1Tras',11),[row('SL_S7','SLZSalidaC1Fte',10)]).status).toBe('expected')
 })
 it('balanza ingresso y egreso no se igualan solo por S4',()=>{
 expect(assessVisitCandidate({...candidate,sameNode:true},row('S4','RicB2Egreso',20),[row('S4','RicB1Ingreso',10)]).status).toBe('exception')
 })
 it('permite B1 ingreso, proceso y B2 egreso sin exigir mismo carril',()=>{
 expect(assessVisitCandidate(candidate,row('S4','RicB2Egreso',40),[row('S4','RicB1Ingreso',10),row('S5','RicVolcable1',30)]).status).toBe('expected')
 })
 it('egreso registrado consume la espera de descarga',()=>{
 expect(assessVisitCandidate(candidate,row('S5','RicVolcable1',40),[row('S4','RicB2Egreso',30)]).status).toBe('exception')
 })
 it('un nodo alcanzable pero no siguiente queda como cobertura incompleta',()=>{
 const r=assessVisitCandidate({...candidate,nextProbability:0},row('S5','RicVolcable1',40),[row('S2','RicCal03',10)])
 expect(r.status).toBe('expected');expect(r.shadow).toMatchObject({mode:'evaluacion'});expect(r.shadow.reason).toContain('faltan pasos')
 })
 it('no usa la referencia posterior ni un paso consumido para autoasignar',()=>{
 expect(assessVisitCandidate({...candidate,seenAfter:true},row('S5','RicVolcable1',40),[]).status).toBe('exception')
 expect(assessVisitCandidate({...candidate,nextProbability:0,nodeProbability:0},row('S5','RicVolcable1',40),[row('S4','RicB2Egreso',30)]).status).toBe('exception')
 })
})
