import json, re, bisect
from pathlib import Path
from collections import Counter, defaultdict
import pandas as pd
P=Path(__file__).parent
d=pd.read_excel(r'C:/Users/Usuario/AppData/Local/Temp/VehicleCaptureRecord202610021644394118890.xlsx').fillna('')
d['excel_row']=range(2,len(d)+2)
d['t']=pd.to_datetime(d['Capture Time'])
d=d.sort_values('t').reset_index(drop=True)
def known(x): return str(x).strip().lower() not in ('','unknown','unrecognized','no plate','noplate','sin patente')
def plate(x): return re.sub('[^A-Z0-9]','',str(x).upper())
d['p']=d['Plate No.'].map(plate)
d['valid']=d.p.str.match(r'^(?:[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[A-Z]{3}[0-9][A-Z][0-9]{2})$')
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
features=['Vehicle Color','Vehicle Brand','Vehicle Category']
trusted=d.valid & (d.conf>=80)
records=d.to_dict('records')
times=[r['t'].timestamp() for r in records]
results=[]
# Blind test: remove target plate; references must be other cameras, same site,
# +/-30min and independently strong OCR. Exact feature overlap only, no fuzzy plate.
# Scores are ranking values, NOT calibrated probabilities.
for i,r in enumerate(records):
    if r['valid'] and r['conf']>=80 or not r['valid']:
        lo=bisect.bisect_left(times,times[i]-1800); hi=bisect.bisect_right(times,times[i]+1800)
        candidates={}
        for j in range(lo,hi):
            s=records[j]
            if j==i or s['Device Name']==r['Device Name'] or s['Organization']!=r['Organization'] or not s['valid'] or s['conf']<80: continue
            available=[k for k in features if known(r[k]) and known(s[k])]
            matches=[k for k in available if r[k]==s[k]]
            if not matches: continue
            score=sum({'Vehicle Color':2,'Vehicle Brand':3,'Vehicle Category':1}[k] for k in matches)
            score-=sum({'Vehicle Color':2,'Vehicle Brand':3,'Vehicle Category':1}[k] for k in available if r[k]!=s[k])
            if score<2: continue
            dt=abs(times[i]-times[j]); rank=(score,-dt)
            if s['p'] not in candidates or rank>candidates[s['p']][0]: candidates[s['p']]=(rank,j,len(matches))
        ordered=sorted(candidates.items(),key=lambda x:x[1][0],reverse=True)
        top=ordered[0] if ordered else None
        # Unique maximal feature score, not merely closest timestamp.
        unique=bool(top) and (len(ordered)==1 or top[1][0][0]>ordered[1][1][0][0])
        results.append({'excel_row':r['excel_row'],'camera':r['Device Name'],'time':str(r['t']),'plate':r['p'],
            'test':bool(r['valid'] and r['conf']>=80),'candidates':len(ordered),'candidate':top[0] if top else '',
            'score':top[1][0][0] if top else None,'matched_features':top[1][2] if top else 0,
            'unique_top':unique,'correct':bool(top and top[0]==r['p']) if r['valid'] else None})
x=pd.DataFrame(results)
x.to_csv(P/'candidatos_exploratorios.csv',index=False,encoding='utf-8-sig')
camera=[]
for c,g in d.groupby('Device Name'):
    z=x[(x.camera==c)&x.test]; u=z[z.unique_top]
    a=x[(x.camera==c)&~x.test]
    camera.append({'camera':c,'captures':len(g),'nonstandard_plate':int((~g.valid).sum()),'low_ocr':int((g.conf<80).sum()),
      'color_known':int(g['Vehicle Color'].map(known).sum()),'brand_known':int(g['Vehicle Brand'].map(known).sum()),
      'category_known':int(g['Vehicle Category'].map(known).sum()),'blind_test_n':len(z),'unique_proposal_n':len(u),
      'unique_correct_n':int(u.correct.sum()),'nonstandard_with_candidate':int((a.candidates>0).sum())})
pd.DataFrame(camera).to_csv(P/'todos_los_puntos.csv',index=False,encoding='utf-8-sig')
z=x[x.test]; u=z[z.unique_top]; a=x[~x.test]
out={'source_rows':len(d),'date_min':str(d.t.min()),'date_max':str(d.t.max()),'cameras':d['Device Name'].nunique(),
 'blank_plates':int((d.p=='').sum()),'nonstandard_plates':int((~d.valid).sum()),'ocr_below80':int((d.conf<80).sum()),
 'missing_features':{k:int((~d[k].map(known)).sum()) for k in features},'white':int((d['Vehicle Color']=='White').sum()),
 'blind_test_n':len(z),'test_with_candidate':int((z.candidates>0).sum()),'top_correct':int(z.correct.sum()),
 'unique_top_n':len(u),'unique_top_correct':int(u.correct.sum()),'nonstandard_n':len(a),
 'nonstandard_with_candidate':int((a.candidates>0).sum()),'nonstandard_unique_top':int(a.unique_top.sum()),
 'nonstandard_no_candidate':int((a.candidates==0).sum()),'all_images_blank':bool((d[['Plate Image','Vehicle Image','Capture Image']]=='').all().all()),
 'per_camera':camera}
(P/'resultado.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k!='per_camera'},ensure_ascii=False))
