# Prompt para seguir en casa · lote de reconocimiento (19/10/2026)

Pegá esto en una sesión nueva de Claude Code abierta en el repo (rama `automatizacion`, hacé `git pull` antes):

---

Seguimos con el **algoritmo por lote** del informe «Reconocimiento de cámaras» (Ricardone y Puerto San
Lorenzo). Leé primero `scripts/demostracion/lote.mjs`, `scripts/deck-reconocimiento-pptx/README.md` y la
memoria `lote-faltantes-correcciones` si la tenés.

**Qué es el lote.** Los camiones del Excel/Sistema de la semana son el universo conocido; cada uno tiene
los pasos (nodos con cámara) de su circuito. Cada paso termina en: *leyó la cámara* (patente exacta u OCR,
mismo criterio que `informe-reconocimiento-camaras.ts` vía `isLikelyOcrPlateMatch`), *reconstruido*
(captura sin patente legible asignada por horario, franja del lote o atributos DSS), *deducido* (sin
captura, pero visto antes y después) o *falta*.

**Cómo decide hoy (commits del 19/10 en `automatizacion`):**
1. Visita = ingreso Excel −40 min → salida Excel +30 min; circuito según la planta del movimiento;
   registros con ingreso = salida y sin lecturas fuera del lote.
2. Primera pasada en orden de hora: universo = camiones con el paso pendiente; pesa tiempo de tramo,
   patente (letras cambiadas, caracteres de más, fragmentos que arrancan igual), perfil DSS armado de
   antemano (marca ×4,75/×0,2; color casi no discrimina, 58 % blancos), acoplado. Umbral **0,4**.
3. Duplicados (<20 min, otra cámara del mismo punto) no quedan libres; lectura exacta o casi exacta
   reemplaza una reconstrucción débil.
4. Segunda pasada **por franja**: visto antes y después de un punto → pasó en esa franja; captura única →
   eliminación; varias → decide patente + DSS entre los camiones de esa franja. Itera.
5. Prueba: a 1 de cada 4 lecturas buenas se les borra la patente (cuenta como cámara en los totales).

**Números semana 12–18/10** (540 camiones, 3.432 pasos): Ricardone 83 % leyó / 7 % reconstruido /
10 % deducido; puerto 81 / 6 / 13; falta solo **ADS392** (8 pasos, ninguna lectura, solo «A92» en el
volcable 5). «Leyó» coincide con «lee» de las láminas 3 y 7 del deck (0–4 puntos). Aciertos: prueba
94,1 % (primera pasada) y ~94 % (franja); coincidencia con el cruce 96 %.

**Lo que quiero hacer ahora:**
1. **Validar en otra semana**: correr `node scripts/demostracion/lote.mjs semana:2026-10-05:2026-10-11`
   y medir prueba + `medir-lote-vs-cruce.mjs` (si no hay cruce de esa semana, correr
   `scripts/cruce-sistema-truckflow/cruce.mjs --from 2026-10-05 --to 2026-10-11`; la caché
   `_lecturas.jsonl` no está en git, se regenera con `lecturas.mjs`).
2. **Más reconstrucción sin perder precisión**: usar las cámaras traseras (acoplado) como identificación,
   no solo como refuerzo; revisar los errores que quedan contra el cruce (lecturas por horario mal
   asignadas, p. ej. «274» → MIW979 era BQF823).
3. **ADS392**: revisar fotos del DSS del 13/10 19:00–21:00 (Ricardone Preingreso/Calada, puerto volcable 5).
4. Si cambian los números, regenerar las dos presentaciones con `scripts/deck-reconocimiento-pptx/`
   (completa y resumida en `reportes/camaras/2026-10-12_2026-10-18/presentacion/`).

Reglas: no inventar cifras; toda cifra sale de una corrida; medir prueba y cruce antes de dar algo por
bueno; respuestas en español, concisas.

---

Archivos clave: `scripts/demostracion/lote.mjs` · `scripts/demostracion/medir-lote-vs-cruce.mjs` ·
`scripts/deck-reconocimiento-pptx/` · `reportes/cruce-sistema-truckflow/2026-10-13_2026-10-19/` ·
`outputs/demostracion_lote/lote_semana_2026-10-12_2026-10-18.json` · `data/dss-export/2026-10-12_18/`.
