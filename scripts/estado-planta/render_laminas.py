# Renderiza láminas del deck a PNG con Chrome headless.
# Uso: RENDER_OUT=<carpeta png> python scripts/estado-planta/render_laminas.py <prefijo> <deck/project> [id-lámina ...]
# Escribe <prefijo>-<n>-<id>.png (y .html) en RENDER_OUT (por defecto ./png junto al script).
import json,os,sys,subprocess
sp=os.path.dirname(os.path.abspath(__file__)); out=os.environ.get('RENDER_OUT') or os.path.join(sp,'png'); os.makedirs(out,exist_ok=True)
B=r'C:\Program Files\Google\Chrome\Application\chrome.exe'
if not os.path.exists(B): B=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
css='*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:#fff}section{position:relative;width:1920px;height:1080px;overflow:hidden}section>*{position:relative}p,h1,h2,h3,table{margin:0}aside{display:none}img{max-width:none}'
name,d=sys.argv[1],sys.argv[2]; only=sys.argv[3:]
deck=json.load(open(os.path.join(d,'deck.json'),encoding='utf-8'))
for k,i in enumerate(deck['order']):
    f=os.path.join(d,'slides',i+'.html')
    if not os.path.exists(f) or (only and i not in only): continue
    h=f'<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Public+Sans:wght@400;600;700&family=Domine:wght@700&display=swap" rel=stylesheet><style>{css}</style>'+open(f,encoding='utf-8').read()
    hp=os.path.join(out,f'{name}-{k+1:02d}-{i}.html'); open(hp,'w',encoding='utf-8').write(h)
    subprocess.run([B,'--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1920,1080',f'--screenshot={hp[:-5]}.png','--virtual-time-budget=4000','file:///'+hp.replace(os.sep,'/')],capture_output=True,timeout=60)
