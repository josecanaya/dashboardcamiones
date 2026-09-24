"""
Extrae de la plantilla PPTX el estilo de cada texto conectado a datos.

Por qué existe: al actualizar un texto en Google Slides hay que borrarlo e insertar el nuevo,
y el texto insertado NO hereda el formato del anterior. Sin el estilo explícito los números
quedaban con el tamaño que Slides elige al ajustar la caja (en la práctica, ilegibles).

La plantilla (`Plantilla_BASE.pptx`) es la fuente de verdad del diseño, así que el estilo se
toma de ahí, objeto por objeto, y se guarda en `estilos_textos.json` junto a `vinculos.json`.
El sync lo reaplica después de cada escritura.

Uso:
    python scripts/extract-text-styles.py
"""
import json
import re
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MANUAL = RAIZ / "reportes" / "logistica" / "prueba_manual"
PLANTILLA = MANUAL / "Plantilla_BASE.pptx"
VINCULOS = MANUAL / "vinculos.json"
SALIDA = MANUAL / "estilos_textos.json"

# Colores de tema usados por la plantilla, resueltos a RGB (theme1.xml de la plantilla).
# Se resuelven acá porque la API de Slides no acepta referencias al tema del PPTX.
COLOR_ATTR = re.compile(r'<a:solidFill>\s*<a:(srgbClr|schemeClr) val="([^"]+)"')


def colores_del_tema(z: zipfile.ZipFile) -> dict:
    tema = next(n for n in z.namelist() if re.match(r"ppt/theme/theme\d+\.xml$", n))
    xml = z.read(tema).decode("utf8")
    colores = {}
    for nombre in ("dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4",
                   "accent5", "accent6", "hlink", "folHlink"):
        m = re.search(rf"<a:{nombre}>\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)=\"([0-9A-Fa-f]{{6}})\"", xml)
        if m:
            colores[nombre] = m.group(1).upper()
    return colores


def forma(xml_slide: str, shape_id: int) -> str | None:
    """El `<p:sp>` con ese id, sin engancharse con el siguiente.

    Las formas que se agregaron al convertir las láminas 2, 3 y 34 traen su propia
    declaración de namespace (`<p:sp xmlns:p=…>`), así que la etiqueta puede tener atributos.
    """
    for bloque in re.findall(r"<p:sp(?:\s[^>]*)?>.*?</p:sp>", xml_slide, re.S):
        if re.search(rf'<p:cNvPr id="{shape_id}"', bloque):
            return bloque
    return None


def estilo(bloque: str, tema: dict) -> dict:
    """Estilo del primer tramo de texto: es el que define cómo se ve la cifra."""
    rpr = re.search(r"<a:rPr([^>]*?)(/>|>(.*?)</a:rPr>)", bloque, re.S)
    ppr = re.search(r'<a:pPr[^>]*algn="(\w+)"', bloque)
    salida = {}
    if rpr:
        atributos, cuerpo = rpr.group(1), rpr.group(3) or ""
        if m := re.search(r'sz="(\d+)"', atributos):
            salida["size"] = int(m.group(1)) / 100
        if m := re.search(r'\bb="(\d)"', atributos):
            salida["bold"] = m.group(1) == "1"
        if m := COLOR_ATTR.search(cuerpo):
            tipo, valor = m.groups()
            rgb = valor.upper() if tipo == "srgbClr" else tema.get(valor)
            if rgb:
                salida["color"] = rgb
        if m := re.search(r'<a:latin typeface="([^"]+)"', cuerpo):
            salida["font"] = m.group(1)
    if ppr:
        salida["align"] = {"ctr": "CENTER", "r": "END", "l": "START", "just": "JUSTIFIED"}.get(ppr.group(1))
    # Márgenes internos de la caja (EMU). Slides no agranda la caja al texto como hacía
    # PowerPoint (`spAutoFit`), así que el sync necesita el ancho útil para decidir si la
    # cifra entra en una línea o hay que achicar la fuente.
    if body := re.search(r"<a:bodyPr([^>]*)", bloque):
        for lado in ("lIns", "rIns"):
            if m := re.search(rf'{lado}="(\d+)"', body.group(1)):
                salida[lado] = int(m.group(1))
    return {k: v for k, v in salida.items() if v is not None}


def main() -> None:
    vinculos = json.loads(VINCULOS.read_text(encoding="utf8"))
    conectados = [t for t in vinculos["texts"] if t.get("label") and not t["label"].startswith("Objeto ")]
    z = zipfile.ZipFile(PLANTILLA)
    tema = colores_del_tema(z)
    cache: dict[int, str] = {}
    estilos, sin_forma = {}, []
    for t in conectados:
        slide = int(t["slide"])
        if slide not in cache:
            cache[slide] = z.read(f"ppt/slides/slide{slide}.xml").decode("utf8")
        bloque = forma(cache[slide], int(t["object"]))
        if not bloque:
            sin_forma.append(f"{slide}/{t['object']}")
            continue
        estilos[f"{slide}/{t['object']}"] = estilo(bloque, tema)
    SALIDA.write_text(json.dumps(estilos, indent=1, ensure_ascii=False), encoding="utf8")
    print(f"{len(estilos)} estilos de {len(conectados)} textos conectados → {SALIDA.name}")
    if sin_forma:
        print(f"sin forma en la plantilla: {', '.join(sin_forma)}")


if __name__ == "__main__":
    main()
