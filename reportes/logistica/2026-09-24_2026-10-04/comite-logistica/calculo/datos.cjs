// Junta las cifras del comité 24/09–04/10 en un solo archivo (todas salen de las tablas canónicas o de cámaras).
const fs=require('fs');
const R='C:/Users/Pc/Desktop/JOSE/Programacion/Vicentin/rutas/dashboard/reportes/logistica/';
const PX=require(R+'2026-09-24_2026-10-04/revision-001/paquete.json');
const OLD=R+'2026-09-24_2026-09-30/comite-logistica/';
const M0=require(OLD+'metricas-camaras.json'), PO0=require(OLD+'pellet-operativo.json'), PH0=require(OLD+'pellet-historico.json');
const Moct=require('./metricas-oct.json'), POoct=require('./pellet-oct.json'), PLAN=require('./pellet-24-04-planilla.json');
const XX=require('./extras-24-04.json'), X7=require('./extras-24-30.json'), LT=require('./liqt-24-04.json');
const days=PX.periodo.days;
const pool=(a,b)=>{const n=(a.n||0)+(b.n||0);if(!n)return{mean:null,n:0};return{mean:Math.round(((a.mean||0)*(a.n||0)+(b.mean||0)*(b.n||0))/n),n}};
// girasol: cámaras 24–30 + 01–04 ponderado por n; publicado 24–30 + (pooled − cámaras 24–30)
const g0=M0.circuitos.cur.gir.tiempos, g1=Moct.circuitos.cur.gir.tiempos;
const gp={p1:pool(g0.p1,g1.p1),descarga:pool(g0.descarga,g1.descarga),tara:pool(g0.tara,g1.tara)};
const GPUB={ing:3,p1:177,pb:13,ap3:12,desc:249,tara:23};
const GI={ing:GPUB.ing,p1:GPUB.p1+gp.p1.mean-g0.p1.mean,pb:GPUB.pb,ap3:GPUB.ap3,desc:GPUB.desc+gp.descarga.mean-g0.descarga.mean,tara:GPUB.tara+gp.tara.mean-g0.tara.mean};
GI.total=GI.ing+GI.p1+GI.pb+GI.ap3+GI.desc+GI.tara;
GI.cam={c2430:{p1:g0.p1,descarga:g0.descarga,tara:g0.tara},c0104:{p1:g1.p1,descarga:g1.descarga,tara:g1.tara},pooled:gp};
// pellet: cámaras 24–30 (corrida previa) + 01/10 (eventos nuevos), ponderado por n
const P0=PO0.camaras, P1=POoct.camaras;
const periodo=Object.fromEntries(Object.keys(P0.periodo).map(k=>[k,pool(P0.periodo[k],P1.periodo[k])]));
const porVolcable={...P0.porVolcable};for(const [k,v] of Object.entries(P1.porVolcable))porVolcable[k]=(porVolcable[k]||0)+v;
const PO={periodo:{from:'2026-09-24',to:'2026-10-04',dias:[...PO0.periodo.dias,'2026-10-01']},planilla:PLAN.planilla,
 camaras:{viajes:P0.viajes+P1.viajes,conCalleLiquida:P0.conCalleLiquida+P1.conCalleLiquida,porVolcable,periodo,porDia:{...P0.porDia,'2026-10-01':P1.porDia['2026-10-01']},
 calleLiquidaPorOrden:{primero:[P0.calleLiquidaPorOrden.primero[0]+P1.calleLiquidaPorOrden.primero[0],P0.calleLiquidaPorOrden.primero[1]+P1.calleLiquidaPorOrden.primero[1]],siguientes:[P0.calleLiquidaPorOrden.siguientes[0]+P1.calleLiquidaPorOrden.siguientes[0],P0.calleLiquidaPorOrden.siguientes[1]+P1.calleLiquidaPorOrden.siguientes[1]]}}};
const pl=PLAN.planilla;
const PH=[...PH0.slice(0,-1),{id:'actual',desde:'2026-09-24',hasta:'2026-10-01',comite:'Actual',ciclo:periodo.ciclo.mean,viajes:pl.viajes,camiones:pl.patentes,dias:Object.keys(pl.viajesDia).length,toneladas30:pl.toneladas30,toneladasNetas:pl.toneladasReales,horas:pl.horasOperativo,tandas:pl.bloques.length,viajesPorCamion:+(pl.viajes/pl.patentes).toFixed(1),viajesPorCamionDia:+(pl.viajes/XX.pelletTransile.paresCamionDia).toFixed(2),maxViajesCamionDia:Math.max(...Object.values(pl.viajesPorCamionDia).map(x=>x.max)),toneladasPorHora:Math.round(pl.toneladas30/pl.horasOperativo)}];
const out={days,paquete:'reportes/logistica/2026-09-24_2026-10-04/revision-001/paquete.json',fuentes:PX.fuentes,
 extras:XX,extras2430:X7,liquidosTiempos:LT,girasol:GI,pelletOperativo:PO,pelletHistorico:PH,
 r29:{tramos:M0.circuitos.cur.r29.tiempos,nota:'Sin transile R29 del 01 al 04/10 (planilla): tramos de la corrida 24–30.'},
 camarasOct:{r7:Moct.circuitos.cur.r7.tiempos,gir:g1,liq:Moct.circuitos.cur.liq.tiempos}};
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log('GI',JSON.stringify(GI));console.log('pellet periodo',JSON.stringify(periodo));console.log('PH last',JSON.stringify(PH.at(-1)));console.log('vol',JSON.stringify(porVolcable));
