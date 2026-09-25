# Estado general de la planta · semana 17–23/09/2026

Presentación semanal de logística (18 láminas) armada como Slides artifact de claude.ai.

- Deck publicado: https://claude.ai/artifact/JQMuUJEUApHwqAVYdPrQL5 (privado; se comparte desde Share, y se exporta a PPTX/PDF desde Share › Export).
- Fuente de datos: reporte «Comité de Logística 17-22 sep 2026 (v3)» y su planilla «Datos informe logistica 17-22 sep (rev 8)» (Drive, carpeta *Comite de Logistica 25-9*), más `../revision-004/paquete.json` (calles de calada, silos, circuitos). Contexto histórico: `agentes/conocimiento/HISTORICO_COMITES.md`.
- `project/deck.json` y `project/slides/<id>.html` son exactamente los archivos publicados en el artifact.

## Regenerar

```bash
python scripts/estado-planta/gen_deck.py reportes/logistica/2026-09-17_2026-09-23/estado-planta
```

Las cifras de la semana están cargadas a mano en `scripts/estado-planta/gen_deck.py`. Los logos
(`scripts/estado-planta/logos.py`, a partir de `public/branding`) ya están subidos como assets del
artifact y el generador los referencia por `/_blob/<id>`. Para un deck nuevo hay que volver a subirlos
y actualizar esos ids.

Criterios de estilo: verde NVA y violeta corporativo, logos de NVA y Bimtrazer en todas las láminas,
ninguna mención a fallas de cámara, foco en la semana y el histórico solo como contexto.
