"""Contraste independiente operativo y coherencia de ruta completa de propuestas reales."""
import json
from pathlib import Path
from collections import Counter
import pandas as pd
P=Path(__file__).parent
s=json.loads((P/'multisenal_resultado.json').read_text(encoding='utf-8'))
ctx=json.loads((P/'contexto_enriquecido.json').read_text(encoding='utf-8-sig'))
mapping=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
catalog=json.loads((P/'circuit_catalog.json').read_text(encoding='utf-8-sig'))['catalog']
r=pd.read_csv(P/'cruces_multisenal_detalle.csv').fillna('')
qseq=[]
for code,c in catalog.items():
    for seq in [c.get('baseSequence',[])]+c.get('allowedSequences',[]):
        site='san_lorenzo' if code.startswith('SL') else 'ricardone';q=[]
        for k,x in enumerate(seq):
            q.append((site,x));n=seq[k+1] if k+1<len(seq) else None
            if site=='ricardone' and x=='S3' and n=='S0':site='san_lorenzo'
            elif site=='san_lorenzo' and x=='S7' and n=='S0':site='ricardone'
        qseq.append((code,q))
# Recover anchor cameras from Excel-row mapping via existing candidate records / source cache.
source=pd.read_csv(P/'candidatos_exploratorios.csv')
rowcam=dict(zip(source.excel_row,source.camera))
# Every anchor has strong OCR and therefore appears in the exploratory table.
def qual(row):
    camera=rowcam.get(int(row));m=mapping.get(camera,{})
    return (m.get('site'),str(m.get('sector','')).split('-')[-1])
def fullcodes(path):
    qq=[qual(row) for row in path];out=[]
    for code,seq in qseq:
        k=0
        for x in seq:
            if k<len(qq) and x==qq[k]:k+=1
        if k==len(qq):out.append(code)
    return sorted(set(out))
def local(value):
    if not value:return None
    try:
        t=pd.Timestamp(value)
        return t.tz_convert('America/Argentina/Buenos_Aires').tz_localize(None) if t.tzinfo else t
    except (ValueError,TypeError):return None
cols=[]
for _,v in r.iterrows():
    plate=v.candidate_plate;t=local(v.time);ops=ctx['operations_by_plate'].get(plate,[])
    matched=[]
    for op in ops:
        values=[local(op.get(k,'')) for k in ['external_ingreso_at','external_calado_at','external_salida_at','external_sl_balanza_entrada_at','external_sl_balanza_salida_at']]
        values=[x for x in values if x is not None]
        if len(values)>=2 and min(values)-pd.Timedelta(minutes=30)<=t<=max(values)+pd.Timedelta(minutes=30):matched.append(op)
    unique={o.get('external_operation_id',''):o for o in matched};matched=list(unique.values())
    products=sorted({o.get('product_normalized','') for o in matched if o.get('product_normalized')})
    platforms=sorted({o.get('platform_normalized','') for o in matched if o.get('platform_normalized')})
    contracts=sorted({o.get('contrato','') for o in matched if o.get('contrato')})
    ctgs=sorted({o.get('ctg','') for o in matched if o.get('ctg')})
    expected=sorted({o.get('resolved_executive_circuit_code','') for o in matched if o.get('resolution_source')=='EXCEL_PLATFORM_PRODUCT' and o.get('resolved_executive_circuit_code')})
    compatible=set(str(v.compatible_circuits).split(';'))
    support='SIN_OPERACION_EN_HORARIO' if not matched else 'OPERACIONES_AMBIGUAS' if len(matched)>1 else 'UNA_OPERACION_EN_HORARIO'
    cols.append({'operations_in_time':len(matched),'operation_context':support,'products':';'.join(products),'platforms':';'.join(platforms),
      'contracts':';'.join(contracts),'ctgs':';'.join(ctgs),'excel_expected_circuits':';'.join(expected),
      'excel_route_agrees':bool(set(expected)&compatible) if expected else '',
      'operation_match_warnings':';'.join(sorted({o.get('analysis_warning','') for o in matched if o.get('analysis_warning')})),
      'operational_window_tolerance_min':30})
r=pd.concat([r.reset_index(drop=True),pd.DataFrame(cols)],axis=1)
r['full_chain_codes']='';r['full_chain_rows']=''
# For threshold-passing unique identities, verify all proposed points simultaneously.
selected=r[r.status=='SUPERA_FILTRO_VALIDADO_CON_OCR']
for key,g in selected.groupby(['anchor_start_row','anchor_end_row','candidate_plate']):
    start,end,plate=key
    gg=g.sort_values('time').drop_duplicates('excel_row');path=[int(start)]+gg.excel_row.astype(int).tolist()+[int(end)]
    codes=fullcodes(path)
    r.loc[g.index,'full_chain_codes']=';'.join(codes);r.loc[g.index,'full_chain_rows']=';'.join(map(str,path))
    if not codes:r.loc[g.index,'status']='PUNTOS_COMPATIBLES_RUTA_COMPLETA_INCOMPATIBLE'
    else:r.loc[g.index,'status']='CANDIDATO_MULTISENAL_RUTA_COHERENTE'
# Do not turn a product/platform expectation into camera identity proof.
r['operation_context_used_for_validation']=False
r.to_csv(P/'cruces_multisenal_enriquecidos.csv',index=False,encoding='utf-8-sig')
selected=r[r.status=='CANDIDATO_MULTISENAL_RUTA_COHERENTE']
strong_routed=selected[selected.excel_route_agrees==True]
s['context_sources']=ctx['runs'];s['operational_context_attached']=True
s['real_enriched_status_rows']=dict(Counter(r.status))
s['real_coherent_unique_candidate_captures']=int(selected.excel_row.nunique())
s['real_coherent_with_excel_route_support']=int(strong_routed.excel_row.nunique())
s['real_candidates_with_operation_in_time']=int(r[r.operations_in_time>0].excel_row.nunique())
s['no_ocr_selected_method']='atributos_grafo_tiempos'
s['limitations'] += ['Los intervalos de evaluación tienen anclas en el mismo día y distancia máxima 6h; no se extrapolan a cruces nocturnos ni huecos mayores.','El contexto de contrato se incorpora sólo a propuestas reales; sus coincidencias de horarios/producto/plataforma no validan identidad.','El filtro elegido en calibración no garantiza el mismo rendimiento en la semana completa; se informa su resultado holdout.']
e=pd.read_csv(P/'comparacion_multisenal.csv')
for comparison in s['comparisons']:
    threshold=comparison['calibration_threshold'];z=e[(e.method==comparison['method'])&(e.split=='test')]
    if threshold:
        a=z[(z.score>=threshold[1])&(z.margin>=threshold[2])&(z.candidates>0)]
        comparison['accepted_exact_recovery']=int(a.exact_recovery.sum())
        comparison['accepted_holdout_ocr_precision']=float(a.ocr_identity_agrees.mean()) if len(a) else None
        comparison['accepted_capture_precision']=float(a.exact_recovery.mean()) if len(a) else None
(P/'multisenal_resultado_enriquecido.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:s[k] for k in ['real_coherent_unique_candidate_captures','real_coherent_with_excel_route_support','real_candidates_with_operation_in_time','real_enriched_status_rows']},ensure_ascii=True))
