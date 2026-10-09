"""Read-only source audit. Outputs only this investigation directory."""
import json, datetime as dt, re, statistics
from pathlib import Path
from collections import Counter, defaultdict
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).parent
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
weeks=[]; buckets=Counter(); circuits=Counter()
for p in sorted((ROOT/'runs/windows').iterdir()):
    try: a,b=map(dt.date.fromisoformat,p.name.split('_'))
    except Exception: continue
    if a.weekday()!=0 or (b-a).days!=6 or not (p/'manifest.json').exists(): continue
    m=read(p/'manifest.json'); f=p/'tables/final_circuits.json'
    if m.get('status')!='ok' or not f.exists(): continue
    rows=read(f)['rows']; c=Counter(r.get('executive_circuit_code') or 'NONE' for r in rows)
    buckets.update(r.get('executive_bucket') for r in rows); circuits.update(c)
    weeks.append(dict(run_id=p.name,rulesVersion=m.get('rulesVersion'),rows=len(rows),circuits=dict(c)))
events={}; days=[]
for p in sorted((ROOT/'data/truckflow').glob('????-??-??/event-list.json')):
    j=read(p); records=j if isinstance(j,list) else j.get('records',[]); days.append(dict(day=p.parent.name,rows=len(records),fetchedAt=None if isinstance(j,list) else j.get('fetchedAt')))
    for e in records:
        if e.get('eventCategory')!='physical' or not e.get('deviceCode'): continue
        key=e.get('id') or (e.get('journeyUid'),e.get('deviceCode'),e.get('occurredAt'))
        events[key]=e
device_counts=Counter(e.get('deviceCode') for e in events.values()); by_uid=defaultdict(list)
for e in events.values():
    try: t=dt.datetime.fromisoformat(e['occurredAt'])
    except Exception: continue
    by_uid[e.get('journeyUid')].append((t,e.get('deviceCode'),e.get('sectorCode'),e.get('truckPlate')))
pairs=Counter(); pair_times=defaultdict(list); samples=defaultdict(list); scale_visits=Counter(); exit_after=Counter(); repeats=Counter()
for uid,g in by_uid.items():
    g.sort(); devices=[x[1] for x in g]
    for a,b in zip(g,g[1:]):
        if a[1]==b[1]: continue
        gap=(b[0]-a[0]).total_seconds()/60
        if gap<=0 or gap>480: continue
        if a[1].startswith('RicB') or b[1].startswith('RicB'):
            key=(a[1],b[1]); pairs[key]+=1;pair_times[key].append(gap)
            if len(samples[key])<2:samples[key].append(dict(journey_uid=uid,plate=a[3],from_time=a[0].isoformat(),to_time=b[0].isoformat()))
        if a[1]=='RicEgrCamFrente':exit_after[b[1]]+=1
    ix=[i for i,d in enumerate(devices) if re.fullmatch('RicB[123](Ingreso|Egreso)',d)]
    if ix:
        has_in=any('Ingreso' in devices[i] for i in ix);has_eg=any('Egreso' in devices[i] for i in ix)
        scale_visits['with_both' if has_in and has_eg else 'only_ingreso' if has_in else 'only_egreso']+=1
        for i,j in zip(ix,ix[1:]):
            if devices[i]==devices[j]: continue
            a,b=g[i],g[j];gap=(b[0]-a[0]).total_seconds()/60
            if not 0<gap<=480:continue
            direction=('IN' if 'Ingreso' in a[1] else 'OUT')+'>'+('IN' if 'Ingreso' in b[1] else 'OUT')
            processing=any(re.match(r'Ric(Volcable|C16|S[678])',d) for d in devices[i+1:j])
            repeats[f'{direction};intermediate_process={processing}']+=1
result=dict(weekly_runs=weeks,executive_bucket_counts=dict(buckets),executive_circuits=dict(circuits),source_days=days,physical_events_deduplicated=len(events),journey_uid_count=len(by_uid),device_counts=dict(device_counts),scale_journeys=dict(scale_visits),consecutive_scale_direction=dict(repeats),scale_adjacent_transitions=[dict(from_device=a,to_device=b,n=n,median_minutes=round(statistics.median(pair_times[(a,b)]),3),examples=samples[(a,b)]) for (a,b),n in pairs.most_common()],after_ric_exit_same_uid=dict(exit_after))
(OUT/'historical_nodes_evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['weekly_runs','source_days','scale_adjacent_transitions','device_counts']},ensure_ascii=False,indent=2))
print('weekly_runs',len(weeks),'versions',dict(Counter(w['rulesVersion'] for w in weeks)))
print('source_days',len(days),days[0]['day'],days[-1]['day'])
print('top_scale_transitions',json.dumps(result['scale_adjacent_transitions'][:25],ensure_ascii=False,indent=2))
