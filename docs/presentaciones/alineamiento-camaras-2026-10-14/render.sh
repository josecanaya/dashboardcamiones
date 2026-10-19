rm -f render/*.html png/*.png
PYTHONIOENCODING=utf-8 python - <<'PY'
import re
h=open('reunion.html',encoding='utf-8').read()
head=h.split('<main class="deck">')[0]
frames=re.findall(r'<div class="frame" aria-label="Lámina \d+">(.*?)</div>\n(?=<div class="frame"|</main>)',h,re.S)
css='<style>html,body{margin:0;padding:0;background:#fff}.one{position:relative;width:1920px;height:1080px;overflow:hidden}.one>section{position:absolute;left:0;top:0;width:1920px;height:1080px;box-sizing:border-box}.one *{box-sizing:border-box;margin:0}.one table{border-collapse:collapse}.one th,.one td{padding:16px 20px;text-align:left;vertical-align:top;line-height:1.35;border-bottom:1px solid #C9C5B8}.one th{font-weight:700}</style>'
for i,f in enumerate(frames,1):
    open(f'render/s{i:02d}.html','w',encoding='utf-8').write(head.split('<style>')[0]+css+'<div class="one">'+f.replace('src="img/','src="../img/')+'</div>')
PY
C="/c/Program Files/Google/Chrome/Application/chrome.exe"
for f in render/*.html; do b=$(basename $f .html); "$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1920,1080 --virtual-time-budget=4000 --allow-file-access-from-files --screenshot="$(cygpath -w "$PWD/png/$b.png")" "file:///$(cygpath -m "$PWD/$f")" >/dev/null 2>&1; done
PYTHONIOENCODING=utf-8 python - <<'PY'
from pptx import Presentation
from pptx.util import Emu
import glob
p=Presentation(); p.slide_width=Emu(12192000); p.slide_height=Emu(6858000)
for f in sorted(glob.glob('png/s*.png')):
    s=p.slides.add_slide(p.slide_layouts[6]); s.shapes.add_picture(f,0,0,width=p.slide_width,height=p.slide_height)
p.save(r'C:\Users\Usuario\Desktop\Dashboard_camiones\docs\presentaciones\alineamiento-camaras-2026-10-14\Alineamiento Proyecto Camaras - 14-10.pptx'); print(len(p.slides),'pptx')
PY
cp build.py reunion.html render.sh "C:/Users/Usuario/Desktop/Dashboard_camiones/docs/presentaciones/alineamiento-camaras-2026-10-14/"
