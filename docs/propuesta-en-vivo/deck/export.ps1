param([string]$deck = "deck.pptx", [string]$outdir = "png")
$w = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $w $outdir
if (Test-Path $out) { Remove-Item -Recurse -Force $out -Confirm:$false }
New-Item -ItemType Directory -Force $out | Out-Null
$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Open((Join-Path $w $deck), $true, $false, $false)
$i = 0
foreach ($s in $pres.Slides) { $i++; $s.Export((Join-Path $out ("s{0:D2}.png" -f $i)), "PNG", 1600, 900) }
$pres.Close(); $pp.Quit()
python -c "
from PIL import Image
import glob,sys
fs=sorted(glob.glob(sys.argv[1]+'/s*.png'))
ims=[Image.open(f).resize((800,450)) for f in fs]
for part in range(0,len(ims),8):
  chunk=ims[part:part+8]
  sheet=Image.new('RGB',(1600,450*((len(chunk)+1)//2)),'white')
  for k,im in enumerate(chunk): sheet.paste(im,((k%2)*800,(k//2)*450))
  sheet.save(sys.argv[1]+f'/sheet{part//8+1}.png')
print(len(fs))
" $out
