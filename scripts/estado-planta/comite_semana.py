"""Comité de Logística de una semana, de punta a punta, en un comando.

  python scripts/estado-planta/comite_semana.py --desde 2026-10-05 --hasta 2026-10-11 [--excel <xlsx> ...] [--sin-etl]

1. Ingesta los Excel de MovimientosPorContrato (scripts/ingest-movimientos.ts del repo de datos → data/movimientos/<día>).
2. Reprocesa la ventana semanal (POST /api/etl/runs con force; levanta el server si no está arriba).
3. Recalcula: paquete del dashboard, soja R7, pellet, líquidos (cámaras y criterio por producto), sectores.
4. Arma datos.json y el deck (deck/project/), y muestra un resumen con la cobertura de la planilla.
Publicar el deck es aparte (lo hace Claude con la herramienta de artifacts: deck/assets.json dice a cuál).

VICENTIN_ROOT = raíz con data/ y runs/ (por defecto, el repo principal si esto corre en un worktree de .claude/worktrees).
"""
import argparse, datetime, glob, json, os, shutil, subprocess, sys, time, urllib.request

try: sys.stdout.reconfigure(encoding='utf-8')   # consola de Windows en cp1252
except Exception: pass
WT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
def repo_root():
    if os.environ.get('VICENTIN_ROOT'): return os.path.abspath(os.environ['VICENTIN_ROOT'])
    parts = WT.replace('\\', '/').split('/.claude/worktrees/')
    return os.path.abspath(parts[0]) if len(parts) > 1 else WT
ROOT = repo_root()
API = 'http://127.0.0.1:8787'
TSX = os.path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
ENV = {**os.environ, 'VICENTIN_ROOT': ROOT, 'PYTHONIOENCODING': 'utf-8'}
shift = lambda d, n: (datetime.date.fromisoformat(d) + datetime.timedelta(days=n)).isoformat()

def run(cmd, cwd=WT, quiet=True):
    print('  $', ' '.join(os.path.relpath(c, WT) if os.path.isabs(c) and c.startswith(WT) else c for c in cmd), flush=True)
    r = subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:]); sys.exit(f'Falló: {cmd[0]} {cmd[1] if len(cmd) > 1 else ""}')
    if not quiet: print(r.stdout[-4000:])
    return r.stdout

def server_up():
    try: urllib.request.urlopen(API + '/api/etl/runs', timeout=5); return True
    except Exception: return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--desde', required=True); ap.add_argument('--hasta', required=True)
    ap.add_argument('--excel', nargs='*', default=[])
    ap.add_argument('--anterior', default=os.path.join(ROOT, 'reportes', 'logistica', '2026-09-24_2026-10-04', 'comite-logistica'),
                    help='carpeta del comité anterior (datos.json + calculo-pc/) para los comparativos')
    ap.add_argument('--calibracion', default='2026-09-30:2026-10-04', help='días con planilla y cámaras para calibrar (si faltan los archivos)')
    ap.add_argument('--sin-etl', action='store_true', help='no reprocesar la corrida')
    a = ap.parse_args()
    D = os.path.join(WT, 'reportes', 'logistica', f'{a.desde}_{a.hasta}', 'comite-logistica'); C = os.path.join(D, 'calculo')
    os.makedirs(C, exist_ok=True)
    RUN = os.path.join(ROOT, 'runs', 'windows', f'{a.desde}_{a.hasta}')
    print(f'Comité {a.desde} → {a.hasta} · datos en {ROOT}')

    # 1 · planilla
    if a.excel:
        print('1 · Ingesta de planillas')
        out = run(['node', TSX, 'scripts/ingest-movimientos.ts'] + sum((['--excel', os.path.abspath(x)] for x in a.excel), []), cwd=ROOT)
        for l in out.splitlines():
            if l.startswith('[ingest]'): print('   ', l)
    # 2 · corrida
    if not a.sin_etl:
        print('2 · Corrida ETL de la semana')
        if not server_up():
            print('   server apagado: lo levanto')
            subprocess.Popen(['node', 'server/truckflow-local-server.mjs'], cwd=ROOT, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=getattr(subprocess, 'DETACHED_PROCESS', 0) | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0))
            for _ in range(60):
                time.sleep(2)
                if server_up(): break
            else: sys.exit('El server no levantó (npm run server:truckflow)')
        req = urllib.request.Request(API + '/api/etl/runs', method='POST', headers={'Content-Type': 'application/json'},
                                     data=json.dumps({'from': a.desde, 'to': a.hasta, 'force': True, 'skipSupabase': True}).encode())
        res = json.load(urllib.request.urlopen(req, timeout=1800))
        if not res.get('runId'): sys.exit(f'La corrida falló: {res}')
    man = json.load(open(os.path.join(RUN, 'manifest.json'), encoding='utf-8'))
    print(f'   {man["runId"]} · {man["rulesVersion"]} · {man["input"]["eventCount"]} eventos · {man["input"]["movimientosRows"]} movimientos · {man["status"]}')

    # 3 · cálculos
    print('3 · Cálculos')
    big = ['node', '--max-old-space-size=4096']
    cf, ct = a.calibracion.split(':'); cl = f'{cf[8:10]}-{ct[8:10]}'
    run(['node', TSX, 'scripts/estado-planta/paquete-periodo.ts', os.path.join(C, 'paquete.json'), a.desde, a.hasta, f'{RUN}:{a.desde}:{a.hasta}'])
    for s, f in (('r7-camaras', 'r7-camaras'), ('pellet-camaras', 'pellet-camaras'), ('liquidos-camaras', 'liquidos-camaras')):
        run(big + [f'scripts/estado-planta/{s}.cjs', a.desde, a.hasta, os.path.join(C, f + '.json')])
        cal = os.path.join(C, f'{f}-calibracion-{cl}.json')
        if not glob.glob(os.path.join(C, f'{f}-calibracion-*.json')):
            run(big + [f'scripts/estado-planta/{s}.cjs', cf, ct, cal])
    run(['node', 'scripts/estado-planta/liquidos-criterio.cjs', a.desde, a.hasta, os.path.join(C, 'liquidos-criterio.json')])
    if not os.path.exists(os.path.join(C, 'liquidos-criterio-anterior.json')):
        ad = json.load(open(os.path.join(a.anterior, 'datos.json'), encoding='utf-8'))['days']
        run(['node', 'scripts/estado-planta/liquidos-criterio.cjs', ad[0], ad[-1], os.path.join(C, 'liquidos-criterio-anterior.json')])
    run(big + ['scripts/estado-planta/metricas-camaras.cjs', os.path.join(C, 'metricas-camaras.json'), shift(a.desde, -7), a.desde,
               str((datetime.date.fromisoformat(a.hasta) - datetime.date.fromisoformat(a.desde)).days + 1)])

    # 4 · datos y deck
    print('4 · datos.json y deck')
    run([sys.executable, 'scripts/estado-planta/datos_comite_semana.py', D, a.desde, a.hasta, RUN, a.anterior])
    g = json.loads(run([sys.executable, 'scripts/estado-planta/gen_comite_logistica_semana.py', D]).strip().splitlines()[-1])
    X = json.load(open(os.path.join(D, 'datos.json'), encoding='utf-8'))
    P = X['planilla']
    print('\nResumen')
    print(f'  modo: {X["modo"]}  (planilla completa: {P["completa"]}; último Excel: {P["ultimoExcel"]}; corrida con planilla: {P["corridaConPlanilla"]})')
    print('  movimientos de planilla por día de ingreso: ' + ', '.join(f'{d[8:10]}/{d[5:7]} {n}' for d, n in P['porDia'].items()))
    if P['diasSinMovimientos']: print('  ATENCIÓN días sin planilla: ' + ', '.join(P['diasSinMovimientos']))
    k = X['r7']['camaras'].get('calibracion')
    if k: print(f'  soja R7: planilla {k["planillaR7"]} operaciones · cámaras {X["r7"]["camaras"]["viajes"]} viajes leídos ({round(X["r7"]["camaras"]["viajes"] / k["planillaR7"] * 100)} %)')
    print(f'  deck: {g["slides"]} láminas en {os.path.relpath(os.path.join(D, "deck", "project"), WT)} · R7 {g["R7"]["est"]} · {g["R7"]["total"]} min · pellet {g["pellet"]["viajes"]} viajes · líquidos {g["liq"]}')
    asf = os.path.join(D, 'deck', 'assets.json')
    print('  publicar en: ' + (json.load(open(asf, encoding='utf-8')).get('artifact', '?') if os.path.exists(asf) else 'artifact nuevo (copiar assets del anterior)'))

if __name__ == '__main__':
    main()
