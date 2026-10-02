"""Exporta propuestas coherentes y verifica la entrega multiseñal."""
import json
from pathlib import Path
import pandas as pd
P=Path(__file__).parent
s=json.loads((P/'multisenal_resultado_enriquecido.json').read_text(encoding='utf-8'))
r=pd.read_csv(P/'cruces_multisenal_enriquecidos.csv').fillna('')
a=r[r.status=='CANDIDATO_MULTISENAL_RUTA_COHERENTE'].copy()
def excel_agrees(row):
    expected=set(str(row.excel_expected_circuits).split(';'))-{''}
    full=set(str(row.full_chain_codes).split(';'))-{''}
    return bool(expected & full)
a['excel_full_route_agrees']=a.apply(excel_agrees,axis=1)
s['real_full_route_with_excel_support']=int(a[a.excel_full_route_agrees].excel_row.nunique())
a.to_csv(P/'propuestas_reconstruidas.csv',index=False,encoding='utf-8-sig')
e=pd.read_csv(P/'comparacion_multisenal.csv')
assert r.excel_row.nunique()==s['real_candidate_captures']
assert a.excel_row.nunique()==s['real_coherent_unique_candidate_captures']
assert not a.strong_ocr_conflict.any() and (a.different_anchor_identities==1).all()
assert sum(x['captures'] for x in s['per_camera'])==s['captures']
for c in s['comparisons']:
    z=e[(e.method==c['method'])&(e.split=='test')]
    assert len(z)==c['test_queries']
    assert int(z.ocr_identity_agrees.sum())==c['ocr_identity_agrees']
for c in s['per_camera']:
    c['coherent_candidate_captures']=int(a[a.camera==c['camera']].excel_row.nunique())
    c['ambiguous_captures']=int(r[(r.camera==c['camera'])&(r.status=='AMBIGUO_ENTRE_IDENTIDADES')].excel_row.nunique())
pd.DataFrame(s['per_camera']).to_csv(P/'multisenal_todos_los_puntos.csv',index=False,encoding='utf-8-sig')
(P/'multisenal_resultado_enriquecido.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':'OK','coherent_captures':int(a.excel_row.nunique()),'excel_full_route_support':s['real_full_route_with_excel_support']},ensure_ascii=True))
