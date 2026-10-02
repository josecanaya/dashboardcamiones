from copy import deepcopy
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE_TYPE, MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt


ROOT = Path(r"C:\Users\Usuario\Desktop\Dashboard_camiones")
SOURCE = ROOT / "artifacts" / "claude_import" / "Reconocimiento de cámaras · Septiembre.pptx"
OUTPUT = ROOT / "artifacts" / "claude_import" / "Reconocimiento de cámaras · Septiembre · v3.pptx"

FONT = "IBM Plex Sans"
INK = RGBColor(20, 47, 38)
MUTED = RGBColor(91, 105, 98)
WHITE = RGBColor(255, 255, 255)
SURFACE = RGBColor(247, 249, 247)
GRID = RGBColor(207, 216, 211)
GREEN = RGBColor(0, 100, 68)
GREEN_SOFT = RGBColor(225, 240, 232)
PURPLE = RGBColor(46, 27, 78)
PURPLE_SOFT = RGBColor(235, 231, 242)
ERROR_RED_BG = RGBColor(248, 225, 222)
ERROR_RED_FG = RGBColor(179, 38, 30)
ERROR_AMBER_BG = RGBColor(248, 238, 214)
ERROR_AMBER_FG = RGBColor(139, 94, 10)
EMPTY_FG = RGBColor(166, 175, 170)


def picture_elements(slide):
    return [deepcopy(shape._element) for shape in slide.shapes if shape.shape_type == MSO_SHAPE_TYPE.PICTURE]


def clear_slide(slide):
    for shape in list(slide.shapes):
        slide.shapes._spTree.remove(shape._element)


def restore_picture(slide, element):
    slide.shapes._spTree.append(deepcopy(element))


def add_text(slide, text, x, y, w, h, size=14, bold=False, color=INK,
             align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.MIDDLE, margin=0.04):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    box.text_frame.clear()
    box.text_frame.margin_left = Inches(margin)
    box.text_frame.margin_right = Inches(margin)
    box.text_frame.margin_top = Inches(margin)
    box.text_frame.margin_bottom = Inches(margin)
    box.text_frame.vertical_anchor = valign
    p = box.text_frame.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def add_rect(slide, x, y, w, h, fill, line=None, radius=True, transparency=0):
    shape_type = MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE if radius else MSO_AUTO_SHAPE_TYPE.RECTANGLE
    shape = slide.shapes.add_shape(shape_type, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.fill.transparency = transparency
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(0.7)
    return shape


def add_brand_footer(slide, logos, page):
    for element in logos[-2:]:
        restore_picture(slide, element)
    add_text(
        slide,
        "× roja = corrección urgente · × amarilla = mejora programable · Noche baja = iluminación · Ambos turnos bajos = encuadre/posición",
        1.80, 6.76, 9.45, 0.34, size=8.9, color=MUTED, align=PP_ALIGN.CENTER,
    )
    add_text(slide, str(page), 12.45, 6.78, 0.22, 0.28, size=10, color=MUTED, align=PP_ALIGN.RIGHT)


def add_header(slide, plant, color, title):
    pill = add_rect(slide, 0.89, 0.76, 2.35, 0.34, color, radius=True)
    pill.adjustments[0] = 0.18
    add_text(slide, "SEGUIMIENTO POR SECTOR", 1.00, 0.79, 2.13, 0.26, size=11, bold=True, color=WHITE)
    add_text(slide, plant, 3.42, 0.79, 2.2, 0.26, size=11, bold=True, color=color)
    add_text(slide, title, 0.89, 1.18, 11.8, 0.52, size=28, bold=True, color=INK)
    add_text(
        slide,
        "La tilde marca dónde hace falta intervenir. La lectura se consolida por sector, no por cámara individual.",
        0.89, 1.72, 11.6, 0.38, size=12, color=MUTED,
    )


def add_matrix(slide, rows, plant, color, soft, page):
    logos = picture_elements(slide)
    clear_slide(slide)
    add_rect(slide, 0, 0, 13.333, 7.5, RGBColor(252, 253, 252), radius=False)
    add_header(slide, plant, color, "Cuatro controles para priorizar las correcciones")

    x0, y0 = 0.89, 2.26
    col_widths = [3.55, 1.15, 1.68, 1.68, 1.68, 1.68]
    headers = ["Sector", "Urgencia", "Iluminación", "Encuadre", "Posición", "Limpieza"]
    row_h = 0.45 if len(rows) <= 9 else 0.35
    body_size = 11.2 if len(rows) <= 9 else 9.8
    urgency_size = 9.5 if len(rows) <= 9 else 8.5
    mark_size = 15 if len(rows) <= 9 else 13
    total_w = sum(col_widths)
    add_rect(slide, x0, y0, total_w, row_h, soft, line=GRID, radius=False)
    cursor = x0
    for label, width in zip(headers, col_widths):
        add_text(
            slide, label, cursor + 0.07, y0 + 0.03, width - 0.14, row_h - 0.06,
            size=11.5, bold=True, color=INK,
            align=PP_ALIGN.LEFT if label == "Sector" else PP_ALIGN.CENTER,
        )
        cursor += width

    urgency_style = {
        "Alta": (RGBColor(248, 225, 222), RGBColor(179, 38, 30)),
        "Media": (RGBColor(248, 238, 214), RGBColor(139, 94, 10)),
        "Baja": (RGBColor(223, 240, 229), RGBColor(0, 100, 68)),
    }
    for r, (sector, urgency, flags) in enumerate(rows):
        y = y0 + row_h * (r + 1)
        fill = WHITE if r % 2 == 0 else SURFACE
        add_rect(slide, x0, y, total_w, row_h, fill, line=GRID, radius=False)
        add_text(slide, sector, x0 + 0.08, y + 0.02, col_widths[0] - 0.16, row_h - 0.04, size=body_size, bold=True)
        cursor = x0 + col_widths[0]
        urgency_fill, urgency_text = urgency_style[urgency]
        pill_h = min(0.31, row_h - 0.08)
        add_rect(slide, cursor + 0.14, y + (row_h - pill_h) / 2, col_widths[1] - 0.28, pill_h, urgency_fill, radius=True)
        add_text(slide, urgency, cursor + 0.16, y + (row_h - pill_h) / 2, col_widths[1] - 0.32, pill_h, size=urgency_size, bold=True, color=urgency_text, align=PP_ALIGN.CENTER)
        cursor += col_widths[1]
        mark_bg, mark_fg = (
            (ERROR_RED_BG, ERROR_RED_FG) if urgency == "Alta" else (ERROR_AMBER_BG, ERROR_AMBER_FG)
        )
        for flag, width in zip(flags, col_widths[2:]):
            if flag:
                mark_h = min(0.34, row_h - 0.06)
                add_rect(slide, cursor + width / 2 - mark_h / 2, y + (row_h - mark_h) / 2, mark_h, mark_h, mark_bg, radius=True)
                add_text(slide, "×", cursor + width / 2 - mark_h / 2, y + (row_h - mark_h) / 2, mark_h, mark_h, size=mark_size, bold=True, color=mark_fg, align=PP_ALIGN.CENTER)
            else:
                add_text(slide, "—", cursor, y + 0.02, width, row_h - 0.04, size=11, color=EMPTY_FG, align=PP_ALIGN.CENTER)
            cursor += width

    add_brand_footer(slide, logos, page)


def rebuild_objectives(slide):
    pics = picture_elements(slide)
    background = pics[0]
    logos = pics[-2:]
    clear_slide(slide)
    restore_picture(slide, background)
    add_rect(slide, 0, 0, 13.333, 7.5, RGBColor(0, 48, 38), radius=False, transparency=18)

    add_text(slide, "OBJETIVOS FINALES", 0.89, 0.74, 11.6, 0.28, size=11, bold=True, color=RGBColor(190, 215, 204))
    add_text(slide, "Objetivos de lectura y cobertura del recorrido", 0.89, 1.08, 11.6, 0.68, size=29, bold=True, color=WHITE)
    add_text(
        slide,
        "El seguimiento deja de mirar cámaras aisladas y pasa a medir cobertura efectiva del recorrido.",
        0.89, 1.74, 11.4, 0.38, size=13.5, color=RGBColor(224, 235, 230),
    )

    cards_top = [
        ("DE DÍA", "95 %", "hoy 83 %"),
        ("DE NOCHE", "90 %", "hoy 67 %"),
        ("TODAS LAS CÁMARAS", "95 %", "hoy 75 %"),
    ]
    for x, (label, value, note), fill, value_color, label_color, note_color in zip(
        [0.89, 4.82, 8.75], cards_top,
        [WHITE, PURPLE, WHITE], [GREEN, WHITE, GREEN],
        [INK, WHITE, INK], [MUTED, RGBColor(222, 213, 235), MUTED],
    ):
        add_rect(slide, x, 2.25, 3.69, 1.45, fill, radius=True, transparency=3 if fill == WHITE else 0)
        add_text(slide, label, x + 0.24, 2.42, 3.18, 0.25, size=10, bold=True, color=label_color)
        add_text(slide, value, x + 0.24, 2.68, 3.18, 0.55, size=29, bold=True, color=value_color)
        add_text(slide, note, x + 0.24, 3.24, 3.18, 0.26, size=10.5, color=note_color)

    cards_bottom = [
        ("CAMIONES IDENTIFICADOS", "100 %", "al menos una lectura", 2.09, WHITE, GREEN, INK, MUTED),
        ("COBERTURA DEL RECORRIDO", "100 %", "en al menos 4 puntos", 6.75, PURPLE, WHITE, WHITE, RGBColor(222, 213, 235)),
    ]
    for label, value, note, x, fill, value_color, label_color, note_color in cards_bottom:
        add_rect(slide, x, 3.93, 4.49, 1.36, fill, radius=True, transparency=3 if fill == WHITE else 0)
        add_text(slide, label, x + 0.25, 4.08, 3.98, 0.24, size=10, bold=True, color=label_color)
        add_text(slide, value, x + 0.25, 4.32, 2.05, 0.55, size=29, bold=True, color=value_color)
        add_text(slide, note, x + 2.13, 4.40, 2.05, 0.36, size=11, color=note_color)

    add_text(
        slide,
        "Medición propuesta: universo de movimientos según Excel y puntos esperados según el circuito asignado.",
        0.89, 5.35, 11.6, 0.34, size=10.5, color=WHITE,
    )
    for element in logos:
        restore_picture(slide, element)


def fix_section_labels(prs):
    for slide in prs.slides:
        candidates = [shape for shape in slide.shapes if shape.shape_type == MSO_SHAPE_TYPE.FREEFORM and getattr(shape, "text", "").strip()]
        for old in candidates:
            text = old.text.strip()
            left, top, width, height = old.left, old.top, old.width, old.height
            try:
                color = old.fill.fore_color.rgb
            except (TypeError, AttributeError):
                color = GREEN
            slide.shapes._spTree.remove(old._element)
            pill = slide.shapes.add_shape(
                MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
                left, top, width + Inches(0.05), height,
            )
            pill.fill.solid()
            pill.fill.fore_color.rgb = color
            pill.line.fill.background()
            pill.adjustments[0] = 0.18
            pill.text_frame.clear()
            pill.text_frame.margin_left = Inches(0.10)
            pill.text_frame.margin_right = Inches(0.10)
            pill.text_frame.margin_top = 0
            pill.text_frame.margin_bottom = 0
            pill.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = pill.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            run = p.add_run()
            run.text = text
            run.font.name = FONT
            run.font.size = Pt(9.5)
            run.font.bold = True
            run.font.color.rgb = WHITE


def rename_salida_as_egreso(prs):
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        for paragraph in cell.text_frame.paragraphs:
                            for run in paragraph.runs:
                                if run.text.strip() == "Salida":
                                    run.text = run.text.replace("Salida", "Egreso")
            elif hasattr(shape, "text_frame"):
                for paragraph in shape.text_frame.paragraphs:
                    for run in paragraph.runs:
                        if run.text.strip() == "Salida":
                            run.text = run.text.replace("Salida", "Egreso")


def main():
    prs = Presentation(SOURCE)

    puerto = [
        ("Balanza de egreso", "Alta", (True, True, True, False)),
        ("Volcables", "Alta", (True, False, False, False)),
        ("Balanza de ingreso", "Media", (True, False, False, False)),
        ("Ingreso", "Baja", (False, False, False, False)),
        ("Carga OSL", "Alta", (True, True, True, False)),
        ("Líquidos", "Media", (False, True, True, False)),
        ("Egreso", "Baja", (False, False, False, False)),
    ]
    ricardone = [
        ("Ingreso", "Media", (True, False, False, False)),
        ("Preingreso", "Baja", (False, False, False, True)),
        ("Calada", "Baja", (False, False, False, True)),
        ("Balanza de ingreso", "Media", (False, True, True, False)),
        ("Playa 3", "Media", (True, True, True, False)),
        ("Descarga S7", "Baja", (True, False, False, False)),
        ("Tolva silo Chief", "Alta", (True, True, True, False)),
        ("Volcable 1", "Baja", (False, False, False, True)),
        ("Volcable 2", "Media", (False, True, True, False)),
        ("Balanza de egreso", "Baja", (False, False, False, False)),
        ("Egreso", "Media", (True, False, False, False)),
    ]

    add_matrix(prs.slides[7], puerto, "Puerto San Lorenzo", PURPLE, PURPLE_SOFT, 8)
    add_matrix(prs.slides[8], ricardone, "Ricardone", GREEN, GREEN_SOFT, 9)
    rebuild_objectives(prs.slides[10])
    rename_salida_as_egreso(prs)
    fix_section_labels(prs)
    prs.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
