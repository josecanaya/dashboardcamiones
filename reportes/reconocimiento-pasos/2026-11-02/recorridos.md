# Recorridos paso por paso — 2026-11-02

357 camiones, 554 viajes. Completos (todos los pasos de su recorrido vistos, sin pasos de más): 170 (31 %).
Huecos entre dos lecturas que dejó el reconocedor: 318. La captura busca camión completó 73 con capturas que había dejado sin identificar (mismo nodo, entre las dos lecturas del camión: único camión posible o patente claramente parecida).
El recorrido de referencia de cada grupo sale de los viajes del día (el que se repite y contiene a más viajes), no del catálogo de circuitos. 108 viajes de grupos sin un recorrido que se repita quedan sin comparar.
Generado con scripts/recorridos-faltantes.mjs.

## Recorrido real de cada grupo

| Grupo | Viajes | Recorrido de referencia | Viajes que entran en él |
|---|---|---|---|
| Girasol | 198 | Ingreso → Preingreso → Salida 2 → Playa 3 → Balanza → Ingreso SL → Balanza ingreso SL → Volcables SL → Balanza egreso SL → Egreso SL | 157 (79 %) |
| Soja | 180 | Ingreso → Preingreso → Calada → Salida 2 → Ingreso SL → Balanza ingreso SL → Volcables SL → Balanza egreso SL → Egreso SL | 177 (98 %) |
| Permitido (varios) | 32 | Ingreso → Preingreso → Salida 2 → Balanza → Playa 3 → Balanza → Ingreso SL → Balanza ingreso SL → Volcables SL → Balanza egreso SL → Egreso SL | 20 (63 %) |
| balanza | 28 | Ingreso SL → Calada SL → Balanza ingreso SL → Carga OSL → Calada SL → Balanza ingreso SL → Balanza egreso SL → Egreso SL | 18 (64 %) |
| Permitido (glicerina) | 8 | Ingreso SL → Balanza ingreso SL → Renova → Balanza egreso SL → Egreso SL | 5 (63 %) |

## Qué paso falta, por grupo

| Grupo | Nodo | Esperados | Leídos | Completados con captura sin asignar | % visto | Faltan en el medio | Sin entrada | Sin salida |
|---|---|---|---|---|---|---|---|---|
| balanza | Ingreso SL | 26 | 20 | 0 | 77 % | 0 | 4 | 2 |
| balanza | Calada SL | 50 | 29 | 0 | 58 % | 14 | 2 | 5 |
| balanza | Balanza ingreso SL | 50 | 28 | 0 | 56 % | 15 | 2 | 5 |
| balanza | Carga OSL | 25 | 17 | 3 | 80 % | 1 | 1 | 3 |
| balanza | Balanza egreso SL | 25 | 21 | 0 | 84 % | 0 | 1 | 3 |
| balanza | Egreso SL | 25 | 20 | 0 | 80 % | 0 | 0 | 5 |
| Girasol | Ingreso | 172 | 119 | 0 | 69 % | 0 | 53 | 0 |
| Girasol | Preingreso | 174 | 139 | 2 | 81 % | 13 | 19 | 1 |
| Girasol | Salida 2 | 168 | 132 | 2 | 80 % | 7 | 18 | 9 |
| Girasol | Playa 3 | 168 | 86 | 5 | 54 % | 46 | 18 | 13 |
| Girasol | Balanza | 169 | 97 | 9 | 63 % | 33 | 17 | 13 |
| Girasol | Ingreso SL | 185 | 156 | 4 | 86 % | 4 | 3 | 18 |
| Girasol | Balanza ingreso SL | 185 | 138 | 3 | 76 % | 23 | 3 | 18 |
| Girasol | Volcables SL | 187 | 160 | 1 | 86 % | 6 | 2 | 18 |
| Girasol | Balanza egreso SL | 184 | 145 | 10 | 84 % | 5 | 2 | 22 |
| Girasol | Egreso SL | 182 | 159 | 0 | 87 % | 0 | 0 | 23 |
| Permitido (glicerina) | Ingreso SL | 7 | 7 | 0 | 100 % | 0 | 0 | 0 |
| Permitido (glicerina) | Balanza ingreso SL | 7 | 5 | 1 | 86 % | 1 | 0 | 0 |
| Permitido (glicerina) | Renova | 8 | 6 | 2 | 100 % | 0 | 0 | 0 |
| Permitido (glicerina) | Balanza egreso SL | 8 | 7 | 0 | 88 % | 0 | 0 | 1 |
| Permitido (glicerina) | Egreso SL | 7 | 6 | 0 | 86 % | 0 | 0 | 1 |
| Permitido (varios) | Ingreso | 30 | 8 | 0 | 27 % | 0 | 22 | 0 |
| Permitido (varios) | Preingreso | 30 | 8 | 1 | 30 % | 3 | 18 | 0 |
| Permitido (varios) | Salida 2 | 30 | 12 | 1 | 43 % | 0 | 17 | 0 |
| Permitido (varios) | Balanza | 62 | 18 | 1 | 31 % | 10 | 26 | 7 |
| Permitido (varios) | Playa 3 | 31 | 6 | 0 | 19 % | 5 | 13 | 7 |
| Permitido (varios) | Ingreso SL | 31 | 21 | 0 | 68 % | 0 | 3 | 7 |
| Permitido (varios) | Balanza ingreso SL | 32 | 19 | 0 | 59 % | 3 | 3 | 7 |
| Permitido (varios) | Volcables SL | 32 | 13 | 0 | 41 % | 10 | 2 | 7 |
| Permitido (varios) | Balanza egreso SL | 32 | 22 | 0 | 69 % | 0 | 2 | 8 |
| Permitido (varios) | Egreso SL | 32 | 23 | 0 | 72 % | 0 | 0 | 9 |
| Soja | Ingreso | 149 | 119 | 0 | 80 % | 0 | 30 | 0 |
| Soja | Preingreso | 149 | 129 | 4 | 89 % | 2 | 13 | 1 |
| Soja | Calada | 145 | 123 | 5 | 88 % | 6 | 10 | 1 |
| Soja | Salida 2 | 144 | 123 | 4 | 88 % | 5 | 10 | 2 |
| Soja | Ingreso SL | 145 | 122 | 6 | 88 % | 2 | 8 | 7 |
| Soja | Balanza ingreso SL | 143 | 120 | 2 | 85 % | 8 | 5 | 8 |
| Soja | Volcables SL | 140 | 94 | 5 | 71 % | 23 | 5 | 13 |
| Soja | Balanza egreso SL | 142 | 123 | 2 | 88 % | 0 | 4 | 13 |
| Soja | Egreso SL | 144 | 128 | 0 | 89 % | 0 | 0 | 16 |

## Camión por camión

### RAW481 · carta (Girasol) · 6 viajes · faltan 29

- 01:04–04:00: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 01:04 Ingreso SL ✓ › Balanza ingreso SL ✗ › 03:30 Volcables SL ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 03:57 Preingreso, 04:00 Salida 2
- 07:40–09:32: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:40 Ingreso SL ✓ › 08:59 Balanza ingreso SL ✓ › 09:16 Volcables SL ✓ › 09:29 Balanza egreso SL ✓ › 09:32 Egreso SL ✓
- 10:12–13:09: Ingreso ✗ entrada › 10:12 Preingreso ✓ › 10:14 Salida 2 ✓ › 10:31 Playa 3 ✓ › Balanza ✗ › 11:03 Ingreso SL ✓ › 12:07 Balanza ingreso SL ✓ › 12:53 Volcables SL ✓ › 13:07 Balanza egreso SL ✓ › 13:09 Egreso SL ✓
- 13:21–16:29: 13:21 Ingreso ✓ › 13:23 Preingreso ✓ › 13:25 Salida 2 ✓ › 13:32 Playa 3 ✓ › Balanza ✗ › 15:06 Ingreso SL ✓ › Balanza ingreso SL ✗ › Volcables SL ✗ › 16:27 Balanza egreso SL ✓ › 16:29 Egreso SL ✓
- 16:39–16:41: Ingreso ✗ entrada › 16:39 Preingreso ✓ › 16:41 Salida 2 ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 17:02–17:26: 17:02 Ingreso ✓ › Preingreso ✗ › 17:26 Salida 2 ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AAE877 · Permitido (varios) · 4 viajes · faltan 26

- 04:40–05:46: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › 04:40 Volcables SL ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 05:46 Salida 2
- 08:11–10:48: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 08:11 Ingreso SL ✓ › 09:16 Balanza ingreso SL ✓ › 10:01 Volcables SL ✓ › 10:17 Balanza egreso SL ✓ › 10:19 Egreso SL ✓ · de más: 10:35 Salida 2, 10:44 Balanza, 10:48 Playa 3
- 11:38–13:53: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 11:38 Ingreso SL ✓ › 12:59 Balanza ingreso SL ✓ › 13:37 Volcables SL ✓ › 13:52 Balanza egreso SL ✓ › 13:53 Egreso SL ✓
- 14:09–18:22: Ingreso ✗ entrada › 14:09 Preingreso ✓ › 14:11 Salida 2 ✓ › Balanza ✗ › 14:18 Playa 3 ✓ › Balanza ✗ › 16:43 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:03 Volcables SL ✓ › 18:20 Balanza egreso SL ✓ › 18:22 Egreso SL ✓

### CXV575 · Permitido (varios) · 3 viajes · faltan 26

- 10:22–11:39: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › 10:22 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 11:44–14:42: 11:44 Ingreso ✓ › Preingreso ✗ › 12:00 Salida 2 ✓ › 12:06 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 14:45–15:08: 14:45 Ingreso ✓ › Preingreso ✗ › 15:03 Salida 2 ✓ › 15:06 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AE260HD · Permitido (varios) · 3 viajes · faltan 22

- 07:32–09:55: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:32 Ingreso SL ✓ › 07:44 Balanza ingreso SL ✓ › Volcables SL ✗ › 09:16 Balanza egreso SL ✓ › 09:20 Egreso SL ✓ · de más: 09:10 Carga y descarga SL, 09:55 Balanza
- 09:58–11:48: 09:58 Ingreso ✓ › Preingreso ✗ › 11:25 Salida 2 ✓ › 11:48 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 11:51–15:04: 11:51 Ingreso ✓ › 13:02 Preingreso ✓ (captura sin asignar) «896» › 14:43 Salida 2 ✓ (captura sin asignar) «GBB» › 15:04 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### SAT582 · carta (Girasol) · 3 viajes · faltan 17

- 07:42–14:33: Ingreso ✗ entrada › Preingreso ✗ entrada › 07:42 Salida 2 ✓ › Playa 3 ✗ › 07:45 Balanza ✓ › 08:37 Ingreso SL ✓ › 10:34 Balanza ingreso SL ✓ › 10:50 Volcables SL ✓ › 11:00 Balanza egreso SL ✓ › 11:03 Egreso SL ✓ · de más: 07:50 Playa 3, 12:44 Salida 2, 12:50 Balanza
- 14:53–16:48: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 14:53 Ingreso SL ✓ › 15:13 Balanza ingreso SL ✓ › 16:10 Volcables SL ✓ › 16:26 Balanza egreso SL ✓ › 16:28 Egreso SL ✓ · de más: 16:48 Salida 2
- 19:34–19:34: 19:34 Ingreso ✓ › Preingreso ✗ salida › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### ESB427 · carta (Girasol) · 5 viajes · faltan 15

- 02:02–05:25: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:02 Ingreso SL ✓ › 02:21 Balanza ingreso SL ✓ › 05:04 Volcables SL ✓ › 05:20 Balanza egreso SL ✓ (captura sin asignar) «E1Q99E2» › 05:25 Egreso SL ✓
- 05:35–07:42: Ingreso ✗ entrada › 05:35 Preingreso ✓ › 05:38 Salida 2 ✓ › Playa 3 ✗ › Balanza ✗ › Ingreso SL ✗ › Balanza ingreso SL ✗ › Volcables SL ✗ › Balanza egreso SL ✗ › 05:40 Egreso SL ✓ · de más: 07:42 Balanza
- 07:57–10:15: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:57 Ingreso SL ✓ › 09:13 Balanza ingreso SL ✓ › 09:52 Volcables SL ✓ › 10:13 Balanza egreso SL ✓ › 10:15 Egreso SL ✓
- 10:28–13:55: Ingreso ✗ entrada › 10:28 Preingreso ✓ › 10:33 Salida 2 ✓ › 10:45 Playa 3 ✓ › 11:25 Balanza ✓ › 11:41 Ingreso SL ✓ › 13:00 Balanza ingreso SL ✓ › 13:38 Volcables SL ✓ › 13:53 Balanza egreso SL ✓ › 13:55 Egreso SL ✓
- 14:09–18:55: Ingreso ✗ entrada › 14:09 Preingreso ✓ › 14:11 Salida 2 ✓ › 14:19 Playa 3 ✓ › 16:33 Balanza ✓ › 16:55 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:13 Volcables SL ✓ › 18:53 Balanza egreso SL ✓ › 18:55 Egreso SL ✓

### VHL423 · carta (Girasol) · 3 viajes · faltan 15

- 00:54–13:14: 11:51 Ingreso ✓ › Preingreso ✗ › 11:59 Salida 2 ✓ › Playa 3 ✗ › 13:14 Balanza ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 00:54 Volcables SL, 02:07 Balanza egreso SL
- 13:32–15:22: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 13:32 Ingreso SL ✓ › 14:43 Balanza ingreso SL ✓ › 15:02 Volcables SL ✓ › 15:21 Balanza egreso SL ✓ › 15:22 Egreso SL ✓
- 15:34–21:58: Ingreso ✗ entrada › 15:34 Preingreso ✓ › Salida 2 ✗ › 15:43 Playa 3 ✓ › 18:17 Balanza ✓ › 18:48 Ingreso SL ✓ › 21:15 Balanza ingreso SL ✓ › Volcables SL ✗ › 21:58 Balanza egreso SL ✓ › Egreso SL · sigue · de más: 15:39 Balanza

### BVS300 · carta (Girasol) · 5 viajes · faltan 13

- 02:33–06:31: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:33 Ingreso SL ✓ › Balanza ingreso SL ✗ › 05:59 Volcables SL ✓ › 06:29 Balanza egreso SL ✓ › 06:30 Egreso SL ✓
- 06:40–10:46: 06:40 Ingreso ✓ › 06:42 Preingreso ✓ › 06:44 Salida 2 ✓ › 07:26 Playa 3 ✓ › 08:07 Balanza ✓ › 08:24 Ingreso SL ✓ › 10:29 Balanza ingreso SL ✓ › 10:32 Volcables SL ✓ › 10:45 Balanza egreso SL ✓ › 10:46 Egreso SL ✓
- 10:56–14:15: 10:56 Ingreso ✓ › 11:01 Preingreso ✓ › 11:03 Salida 2 ✓ › Playa 3 ✗ › 11:41 Balanza ✓ › 11:57 Ingreso SL ✓ › 13:50 Balanza ingreso SL ✓ › 13:59 Volcables SL ✓ › 14:11 Balanza egreso SL ✓ › 14:15 Egreso SL ✓
- 14:23–16:42: 14:23 Ingreso ✓ › 14:25 Preingreso ✓ › 14:27 Salida 2 ✓ › 14:35 Playa 3 ✓ › Balanza ✗ › Ingreso SL ✗ › Balanza ingreso SL ✗ › 15:54 Volcables SL ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 16:42 Balanza
- 17:00–20:03: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 17:00 Ingreso SL ✓ › Balanza ingreso SL ✗ › 19:41 Volcables SL ✓ › 20:01 Balanza egreso SL ✓ › 20:03 Egreso SL ✓

### WPB419 · carta (Girasol) · 5 viajes · faltan 13

- 01:59–07:36: 05:25 Ingreso ✓ › 05:27 Preingreso ✓ › 05:30 Salida 2 ✓ › 05:38 Playa 3 ✓ › 07:36 Balanza ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 01:59 Ingreso SL, 04:56 Volcables SL
- 07:50–09:57: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:50 Ingreso SL ✓ › 09:09 Balanza ingreso SL ✓ › 09:44 Volcables SL ✓ › 09:55 Balanza egreso SL ✓ › 09:57 Egreso SL ✓
- 10:05–18:51: 10:05 Ingreso ✓ › 10:16 Preingreso ✓ › 10:19 Salida 2 ✓ › 10:37 Playa 3 ✓ › 16:36 Balanza ✓ › 16:56 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:31 Volcables SL ✓ › 18:48 Balanza egreso SL ✓ › 18:51 Egreso SL ✓
- 19:01–22:41: 19:01 Ingreso ✓ › Preingreso ✗ › 19:09 Salida 2 ✓ › Playa 3 ✗ › 19:14 Balanza ✓ › 20:23 Ingreso SL ✓ (captura sin asignar) «H31» › 21:50 Balanza ingreso SL ✓ › 22:28 Volcables SL ✓ › 22:41 Balanza egreso SL ✓ › Egreso SL · sigue · de más: 19:18 Playa 3
- 22:59–23:01: 22:59 Ingreso ✓ › 23:01 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### XBL711 · carta (Girasol) · 3 viajes · faltan 13

- 04:22–07:50: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › 04:22 Volcables SL ✓ › 05:31 Balanza egreso SL ✓ › 05:34 Egreso SL ✓ · de más: 05:46 Salida 2, 05:52 Playa 3, 07:50 Balanza
- 08:10–10:19: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 08:10 Ingreso SL ✓ › 09:14 Balanza ingreso SL ✓ › 09:52 Volcables SL ✓ › 10:16 Balanza egreso SL ✓ › 10:19 Egreso SL ✓
- 10:28–20:47: 10:28 Ingreso ✓ › Preingreso ✗ › 10:34 Salida 2 ✓ › 10:46 Playa 3 ✓ › 11:53 Balanza ✓ › 12:09 Ingreso SL ✓ › 13:52 Balanza ingreso SL ✓ › 14:06 Volcables SL ✓ › 14:25 Balanza egreso SL ✓ › 20:47 Egreso SL ✓ · de más: 14:27 Ingreso SL, 14:42 Salida 2, 14:47 Balanza, 14:51 Playa 3, 17:39 Balanza ingreso SL, 20:17 Volcables SL, 20:45 Balanza egreso SL

### AH829SU · Permitido (varios) · 2 viajes · faltan 11

- 09:08–10:28: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 09:08 Ingreso SL ✓ › 10:21 Balanza ingreso SL ✓ › Volcables SL ✗ › 10:26 Balanza egreso SL ✓ › 10:28 Egreso SL ✓ · de más: 09:45 Calada SL, 09:48 Renova
- 10:37–13:02: 10:37 Ingreso ✓ › 10:40 Preingreso ✓ › 10:44 Salida 2 ✓ › Balanza ✗ › Playa 3 ✗ › Balanza ✗ › 10:52 Ingreso SL ✓ › 11:00 Balanza ingreso SL ✓ › Volcables SL ✗ › 12:59 Balanza egreso SL ✓ › 13:02 Egreso SL ✓ · de más: 10:54 Calada SL, 11:09 Renova

### HNE318 · carta (Girasol) · 6 viajes · faltan 11

- 00:15–02:41: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 00:15 Ingreso SL ✓ › 00:18 Balanza ingreso SL ✓ (captura sin asignar) «IVEC0» › 02:03 Volcables SL ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 02:38 Ingreso, 02:41 Preingreso
- 05:47–09:04: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 05:47 Ingreso SL ✓ › 08:13 Balanza ingreso SL ✓ › 08:39 Volcables SL ✓ › 09:01 Balanza egreso SL ✓ › 09:04 Egreso SL ✓
- 09:13–12:31: 09:13 Ingreso ✓ › 09:15 Preingreso ✓ › 09:17 Salida 2 ✓ › 09:28 Playa 3 ✓ › 10:01 Balanza ✓ › 10:14 Ingreso SL ✓ › 11:11 Balanza ingreso SL ✓ › 12:09 Volcables SL ✓ › 12:30 Balanza egreso SL ✓ › 12:31 Egreso SL ✓ · de más: 09:23 Balanza
- 12:40–16:11: 12:40 Ingreso ✓ › 12:42 Preingreso ✓ › 12:44 Salida 2 ✓ › Playa 3 ✗ › 12:52 Balanza ✓ › 14:44 Ingreso SL ✓ › 14:51 Balanza ingreso SL ✓ › 15:40 Volcables SL ✓ › 16:08 Balanza egreso SL ✓ › 16:11 Egreso SL ✓
- 16:27–21:44: Ingreso ✗ entrada › 16:27 Preingreso ✓ › 16:29 Salida 2 ✓ › Playa 3 ✗ › 16:38 Balanza ✓ › 17:28 Ingreso SL ✓ (captura sin asignar) «1A1W0» › 21:44 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue
- 22:23–23:36: 22:23 Ingreso ✓ › 22:25 Preingreso ✓ › 22:27 Salida 2 ✓ › 22:33 Playa 3 ✓ (captura sin asignar) «IVAE0» › Balanza ✗ › 23:30 Ingreso SL ✓ › 23:32 Balanza ingreso SL ✓ (captura sin asignar) «HNG34» › 23:36 Volcables SL ✓ › Balanza egreso SL · sigue › Egreso SL · sigue

### LFT141 · Permitido (varios) · 3 viajes · faltan 11

- 02:55–11:14: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › 02:55 Balanza ✓ › Playa 3 ✗ › Balanza ✗ › 03:11 Ingreso SL ✓ › 05:52 Balanza ingreso SL ✓ › 07:29 Volcables SL ✓ › 07:47 Balanza egreso SL ✓ › 07:49 Egreso SL ✓ · de más: 10:20 Salida 2, 10:41 Playa 3, 11:14 Balanza
- 11:29–13:43: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 11:29 Ingreso SL ✓ › 12:50 Balanza ingreso SL ✓ › 13:29 Volcables SL ✓ › 13:41 Balanza egreso SL ✓ › 13:43 Egreso SL ✓
- 14:02–18:42: Ingreso ✗ entrada › 14:02 Preingreso ✓ › 14:04 Salida 2 ✓ › Balanza ✗ › 14:11 Playa 3 ✓ › 16:32 Balanza ✓ › 16:49 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:02 Volcables SL ✓ › 18:39 Balanza egreso SL ✓ › 18:42 Egreso SL ✓ · de más: 16:58 Balanza

### MUX517 · carta (Soja) · 2 viajes · faltan 11

- 11:25–11:37: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › 11:25 Balanza ingreso SL ✓ › Volcables SL ✗ › 11:34 Balanza egreso SL ✓ › 11:37 Egreso SL ✓
- 11:49–17:25: 11:49 Ingreso ✓ › 11:51 Preingreso ✓ › 14:36 Calada ✓ › 17:25 Salida 2 ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AH808WH · carta (Soja) · 2 viajes · faltan 10

- 16:46–20:03: Ingreso ✗ entrada › 16:46 Preingreso ✓ › 17:25 Calada ✓ › 17:51 Salida 2 ✓ › 18:00 Ingreso SL ✓ › 19:51 Balanza ingreso SL ✓ › Volcables SL ✗ › 19:58 Balanza egreso SL ✓ › 20:03 Egreso SL ✓
- 20:12–20:12: 20:12 Ingreso ✓ › Preingreso ✗ salida › Calada ✗ salida › Salida 2 ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AH831XA · Permitido (varios) · 1 viaje · faltan 10

- 14:43–14:43: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › 14:43 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### DOK500 · Permitido (varios) · 1 viaje · faltan 10

- 12:35–14:59: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 12:35 Egreso SL ✓

### LPZ703 · Permitido (varios) · 1 viaje · faltan 10

- 11:05–16:28: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 11:05 Egreso SL ✓ · de más: 16:28 Balanza

### MSE565 · Permitido (varios) · 1 viaje · faltan 10

- 09:37–13:35: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › 09:37 Balanza ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### RDL445 · carta (Girasol) · 4 viajes · faltan 10

- 04:56–09:37: 04:56 Ingreso ✓ › 04:57 Preingreso ✓ › 05:00 Salida 2 ✓ › 05:06 Playa 3 ✓ › 07:22 Balanza ✓ › 07:41 Ingreso SL ✓ › 09:05 Balanza ingreso SL ✓ › 09:25 Volcables SL ✓ › 09:35 Balanza egreso SL ✓ › 09:37 Egreso SL ✓
- 10:12–13:15: Ingreso ✗ entrada › 10:12 Preingreso ✓ › 10:14 Salida 2 ✓ › 10:32 Playa 3 ✓ › 10:54 Balanza ✓ › 11:09 Ingreso SL ✓ › 12:41 Balanza ingreso SL ✓ › 13:00 Volcables SL ✓ › 13:14 Balanza egreso SL ✓ › 13:15 Egreso SL ✓ · de más: 10:28 Balanza
- 13:25–16:36: Ingreso ✗ entrada › 13:25 Preingreso ✓ › 13:26 Salida 2 ✓ › 13:34 Playa 3 ✓ › 15:05 Balanza ✓ › 15:20 Ingreso SL ✓ › 15:23 Balanza ingreso SL ✓ › 16:22 Volcables SL ✓ › 16:35 Balanza egreso SL ✓ › 16:36 Egreso SL ✓ · de más: 13:31 Balanza
- 16:47–16:49: Ingreso ✗ entrada › 16:47 Preingreso ✓ › 16:49 Salida 2 ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### ROS380 · carta (Girasol) · 5 viajes · faltan 10

- 02:11–05:56: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:11 Ingreso SL ✓ › 02:25 Balanza ingreso SL ✓ › 05:33 Volcables SL ✓ › 05:54 Balanza egreso SL ✓ (captura sin asignar) «OD7240» › 05:56 Egreso SL ✓
- 06:05–10:45: 06:05 Ingreso ✓ › 06:08 Preingreso ✓ › 06:11 Salida 2 ✓ › 06:18 Playa 3 ✓ › 07:58 Balanza ✓ › 08:18 Ingreso SL ✓ › 10:24 Balanza ingreso SL ✓ › 10:29 Volcables SL ✓ › 10:44 Balanza egreso SL ✓ › 10:45 Egreso SL ✓
- 10:55–14:10: 10:55 Ingreso ✓ › 11:00 Preingreso ✓ › 11:02 Salida 2 ✓ › Playa 3 ✗ › 11:12 Balanza ✓ (captura sin asignar) «W261» › 11:55 Ingreso SL ✓ › 13:49 Balanza ingreso SL ✓ › 13:54 Volcables SL ✓ › 14:08 Balanza egreso SL ✓ › 14:10 Egreso SL ✓
- 14:21–19:17: Ingreso ✗ entrada › 14:21 Preingreso ✓ › 14:24 Salida 2 ✓ › 14:32 Playa 3 ✓ › 16:37 Balanza ✓ › 16:56 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:28 Volcables SL ✓ › 19:05 Balanza egreso SL ✓ › 19:17 Egreso SL ✓
- 19:29–19:34: 19:29 Ingreso ✓ › 19:31 Preingreso ✓ › 19:34 Salida 2 ✓ › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### UPW705 · carta (Girasol) · 3 viajes · faltan 10

- 15:15–15:15: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › 15:15 Balanza ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 19:22–22:54: 19:22 Ingreso ✓ › 19:25 Preingreso ✓ › 19:47 Salida 2 ✓ › 20:05 Playa 3 ✓ › Balanza ✗ › 21:23 Ingreso SL ✓ › 21:52 Balanza ingreso SL ✓ › 22:37 Volcables SL ✓ › 22:51 Balanza egreso SL ✓ › 22:54 Egreso SL ✓ · de más: 19:36 Calada
- 23:04–23:06: 23:04 Ingreso ✓ › 23:06 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### VJG112 · carta (Girasol) · 6 viajes · faltan 10

- 00:30–02:39: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 00:30 Ingreso SL ✓ › 00:34 Balanza ingreso SL ✓ › 01:52 Volcables SL ✓ › 01:56 Balanza egreso SL ✓ (captura sin asignar) «P512» › 02:39 Egreso SL ✓
- 02:50–09:10: 02:50 Ingreso ✓ › 02:53 Preingreso ✓ › Salida 2 ✗ › Playa 3 ✗ › Balanza ✗ › 06:02 Ingreso SL ✓ › 08:16 Balanza ingreso SL ✓ › 08:48 Volcables SL ✓ › 09:07 Balanza egreso SL ✓ › 09:10 Egreso SL ✓
- 09:20–12:54: 09:20 Ingreso ✓ › 09:22 Preingreso ✓ › 09:25 Salida 2 ✓ › 09:35 Playa 3 ✓ › 10:14 Balanza ✓ › 10:37 Ingreso SL ✓ › 12:01 Balanza ingreso SL ✓ › 12:34 Volcables SL ✓ › 12:49 Balanza egreso SL ✓ › 12:54 Egreso SL ✓ · de más: 09:22 Ingreso
- 13:10–16:17: Ingreso ✗ entrada › 13:10 Preingreso ✓ › 13:13 Salida 2 ✓ › Playa 3 ✗ › 14:44 Balanza ✓ › 15:04 Ingreso SL ✓ › 15:08 Balanza ingreso SL ✓ › 16:00 Volcables SL ✓ › 16:15 Balanza egreso SL ✓ › 16:17 Egreso SL ✓
- 16:31–22:38: Ingreso ✗ entrada › 16:31 Preingreso ✓ › 16:34 Salida 2 ✓ › Playa 3 ✗ › Balanza ✗ › 21:12 Ingreso SL ✓ › 21:48 Balanza ingreso SL ✓ › Volcables SL ✗ › 22:36 Balanza egreso SL ✓ (captura sin asignar) «CH9» › 22:38 Egreso SL ✓
- 22:50–22:53: Ingreso ✗ entrada › 22:50 Preingreso ✓ › 22:53 Salida 2 ✓ › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### CBF677 · carta (Girasol) · 1 viaje · faltan 9

- 20:56–20:56: Ingreso ✗ entrada › 20:56 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### JSP646 · carta (Girasol) · 2 viajes · faltan 9

- 19:03–19:03: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 19:03 Egreso SL ✓
- 22:04–22:10: 22:04 Ingreso ✓ › 22:10 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### LIF292 · carta (Girasol) · 1 viaje · faltan 9

- 20:43–20:50: Ingreso ✗ entrada › 20:43 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 20:50 Calada

### MDH547 · carta (Girasol) · 1 viaje · faltan 9

- 07:20–07:20: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 07:20 Egreso SL ✓

### SPH945 · carta (Girasol) · 4 viajes · faltan 9

- 03:21–07:54: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 03:21 Ingreso SL ✓ › 05:59 Balanza ingreso SL ✓ › 07:30 Volcables SL ✓ › 07:52 Balanza egreso SL ✓ › 07:54 Egreso SL ✓
- 08:03–11:19: 08:03 Ingreso ✓ › 08:05 Preingreso ✓ (captura sin asignar) «HERMA» › 08:07 Salida 2 ✓ › 08:16 Playa 3 ✓ › Balanza ✗ › 08:57 Ingreso SL ✓ › 10:37 Balanza ingreso SL ✓ › 10:59 Volcables SL ✓ › 11:17 Balanza egreso SL ✓ › 11:19 Egreso SL ✓
- 11:29–14:47: 11:29 Ingreso ✓ › 11:31 Preingreso ✓ › 11:33 Salida 2 ✓ › Playa 3 ✗ › 12:20 Balanza ✓ › 12:37 Ingreso SL ✓ › 14:07 Balanza ingreso SL ✓ › 14:30 Volcables SL ✓ › 14:46 Balanza egreso SL ✓ › 14:47 Egreso SL ✓
- 15:04–23:25: Ingreso ✗ entrada › 15:04 Preingreso ✓ › 15:07 Salida 2 ✓ › 15:16 Playa 3 ✓ › Balanza ✗ › 17:47 Ingreso SL ✓ › 18:29 Balanza ingreso SL ✓ › 21:08 Volcables SL ✓ › 23:25 Balanza egreso SL ✓ › Egreso SL · sigue · de más: 21:29 Ingreso SL, 22:59 Balanza ingreso SL, 23:03 Volcables SL

### UWX998 · carta (Girasol) · 5 viajes · faltan 9

- 00:48–00:48: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › Balanza egreso SL · antes de las 00 › 00:48 Egreso SL ✓
- 01:03–08:29: 01:03 Ingreso ✓ › 01:05 Preingreso ✓ › 01:07 Salida 2 ✓ (captura sin asignar) «DX998» › Playa 3 ✗ › Balanza ✗ › 05:02 Ingreso SL ✓ › 06:15 Balanza ingreso SL ✓ › 08:14 Volcables SL ✓ › 08:28 Balanza egreso SL ✓ › 08:29 Egreso SL ✓
- 08:45–11:47: Ingreso ✗ entrada › 08:45 Preingreso ✓ › 08:48 Salida 2 ✓ › 09:01 Playa 3 ✓ › 09:23 Balanza ✓ › 09:42 Ingreso SL ✓ › 10:58 Balanza ingreso SL ✓ › 11:31 Volcables SL ✓ › 11:45 Balanza egreso SL ✓ › 11:47 Egreso SL ✓
- 11:59–15:39: Ingreso ✗ entrada › 11:59 Preingreso ✓ › 12:04 Salida 2 ✓ › Playa 3 ✗ › 13:16 Balanza ✓ › 13:36 Ingreso SL ✓ › 14:46 Balanza ingreso SL ✓ › 15:22 Volcables SL ✓ › 15:37 Balanza egreso SL ✓ › 15:39 Egreso SL ✓
- 15:49–18:41: 15:49 Ingreso ✓ › 15:50 Preingreso ✓ › 15:53 Salida 2 ✓ › Playa 3 ✗ › 16:30 Balanza ✓ › 17:55 Ingreso SL ✓ › Balanza ingreso SL ✗ › Volcables SL ✗ › 18:41 Balanza egreso SL ✓ › Egreso SL ✗ salida

### UYM942 · carta (Girasol) · 3 viajes · faltan 9

- 08:22–11:27: Ingreso ✗ entrada › 08:22 Preingreso ✓ › 08:24 Salida 2 ✓ › 08:34 Playa 3 ✓ › 08:53 Balanza ✓ › 09:14 Ingreso SL ✓ › 10:47 Balanza ingreso SL ✓ › 11:12 Volcables SL ✓ › 11:25 Balanza egreso SL ✓ › 11:27 Egreso SL ✓
- 11:35–18:02: 11:35 Ingreso ✓ › Preingreso ✗ › 11:39 Salida 2 ✓ › Playa 3 ✗ › 12:30 Balanza ✓ › 12:47 Ingreso SL ✓ › 14:26 Balanza ingreso SL ✓ › 14:45 Volcables SL ✓ › 14:56 Balanza egreso SL ✓ › 14:58 Egreso SL ✓ · de más: 15:21 Playa 3, 18:02 Balanza
- 18:20–21:20: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 18:20 Ingreso SL ✓ › Balanza ingreso SL ✗ › 21:20 Volcables SL ✓ › Balanza egreso SL · sigue › Egreso SL · sigue

### AA712ZU · carta (Soja) · 1 viaje · faltan 8

- 03:15–16:04: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 03:15 Egreso SL ✓

### AA809NI · carta (Girasol) · 1 viaje · faltan 8

- 20:52–20:58: 20:52 Ingreso ✓ › 20:58 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AB148YV · Permitido (varios) · 1 viaje · faltan 8

- 08:28–10:14: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 08:28 Ingreso SL ✓ › 09:29 Balanza ingreso SL ✓ › Volcables SL ✗ › 10:14 Balanza egreso SL ✓ › Egreso SL ✗ salida

### AB931GO · carta (Soja) · 1 viaje · faltan 8

- 20:36–20:36: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › 20:36 Balanza ingreso SL ✓ › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AC258IH · carta (Girasol) · 1 viaje · faltan 8

- 18:23–18:27: 18:23 Ingreso ✓ › 18:25 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 18:27 Calada

### AG669JE · carta (Soja) · 1 viaje · faltan 8

- 15:41–15:41: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 15:41 Egreso SL ✓

### AH091UQ · balanza (SGC) · 1 viaje · faltan 8

- 04:43–17:16: Ingreso SL ✗ salida › Calada SL ✗ salida › Balanza ingreso SL ✗ salida › Carga OSL ✗ salida › Calada SL ✗ salida › Balanza ingreso SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 04:43 Ingreso, 04:48 Preingreso, 06:00 Calada, 13:28 Salida 2, 13:37 Balanza, 13:47 Playa 3, 14:06 Silo Keppler, 17:16 Balanza

### AH717AW · carta (Girasol) · 1 viaje · faltan 8

- 16:06–16:51: 16:06 Ingreso ✓ › 16:13 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 16:51 Calada

### CIE516 · carta (Girasol) · 4 viajes · faltan 8

- 02:49–07:44: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:49 Ingreso SL ✓ › Balanza ingreso SL ✗ › 07:12 Volcables SL ✓ › 07:43 Balanza egreso SL ✓ › 07:44 Egreso SL ✓
- 07:51–11:25: 07:51 Ingreso ✓ › Preingreso ✗ › Salida 2 ✗ › 08:05 Playa 3 ✓ › Balanza ✗ › 08:43 Ingreso SL ✓ › 10:36 Balanza ingreso SL ✓ › 10:56 Volcables SL ✓ › 11:23 Balanza egreso SL ✓ › 11:25 Egreso SL ✓
- 11:32–14:57: 11:32 Ingreso ✓ › 11:34 Preingreso ✓ (captura sin asignar) «MWWH» › 11:37 Salida 2 ✓ › Playa 3 ✗ › 12:28 Balanza ✓ › 12:40 Ingreso SL ✓ › 14:18 Balanza ingreso SL ✓ › 14:42 Volcables SL ✓ › 14:55 Balanza egreso SL ✓ › 14:57 Egreso SL ✓
- 15:06–20:50: Ingreso ✗ entrada › 15:06 Preingreso ✓ › 15:09 Salida 2 ✓ › 15:18 Playa 3 ✓ › 17:48 Balanza ✓ › 18:02 Ingreso SL ✓ › 18:27 Balanza ingreso SL ✓ › 20:50 Volcables SL ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### DIH255 · carta (Girasol) · 4 viajes · faltan 8

- 03:50–09:30: 03:50 Ingreso ✓ › 03:51 Preingreso ✓ › 03:54 Salida 2 ✓ › Playa 3 ✗ › Balanza ✗ › 06:37 Ingreso SL ✓ › 08:22 Balanza ingreso SL ✓ › 09:11 Volcables SL ✓ › 09:27 Balanza egreso SL ✓ › 09:30 Egreso SL ✓
- 09:37–13:15: 09:37 Ingreso ✓ › 10:12 Preingreso ✓ › 10:14 Salida 2 ✓ › 10:27 Playa 3 ✓ › 10:53 Balanza ✓ › 11:07 Ingreso SL ✓ › 12:08 Balanza ingreso SL ✓ › 13:00 Volcables SL ✓ › 13:13 Balanza egreso SL ✓ › 13:15 Egreso SL ✓
- 13:23–16:43: 13:23 Ingreso ✓ › 13:24 Preingreso ✓ › 13:26 Salida 2 ✓ › 13:32 Playa 3 ✓ › 15:02 Balanza ✓ › 15:19 Ingreso SL ✓ › 15:21 Balanza ingreso SL ✓ › 16:22 Volcables SL ✓ › 16:41 Balanza egreso SL ✓ › 16:43 Egreso SL ✓
- 16:51–17:31: 16:51 Ingreso ✓ › 16:53 Preingreso ✓ › 17:24 Salida 2 ✓ › Playa 3 ✗ › 17:31 Balanza ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### GSX018 · carta (Soja) · 1 viaje · faltan 8

- 07:01–07:01: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 07:01 Egreso SL ✓

### LKT119 · carta (Girasol) · 1 viaje · faltan 8

- 17:54–18:01: 17:54 Ingreso ✓ › 17:59 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 18:01 Calada

### MQC562 · carta (Soja) · 1 viaje · faltan 8

- 04:05–04:05: Ingreso ✗ entrada › Preingreso ✗ entrada › 04:05 Calada ✓ › Salida 2 ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### OJU822 · balanza (SGC) · 1 viaje · faltan 8

- 00:36–00:36: Ingreso SL ✗ salida › Calada SL ✗ salida › Balanza ingreso SL ✗ salida › Carga OSL ✗ salida › Calada SL ✗ salida › Balanza ingreso SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 00:36 Balanza

### PEA114 · carta (Girasol) · 1 viaje · faltan 8

- 01:58–16:44: 15:58 Ingreso ✓ › 16:01 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 01:58 Volcables SL, 16:44 Calada

### STF654 · carta (Girasol) · 1 viaje · faltan 8

- 02:13–09:01: Ingreso · antes de las 00 › 02:13 Preingreso ✓ › Salida 2 ✗ salida › Playa 3 ✗ salida › Balanza ✗ salida › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida · de más: 09:01 Ingreso

### SVH582 · carta (Soja) · 2 viajes · faltan 8

- 07:11–07:11: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › Balanza egreso SL ✗ entrada › 07:11 Egreso SL ✓
- 12:53–14:53: 12:53 Ingreso ✓ › 12:55 Preingreso ✓ › 13:38 Calada ✓ › 13:50 Salida 2 ✓ › 14:00 Ingreso SL ✓ › 14:06 Balanza ingreso SL ✓ › 14:39 Volcables SL ✓ › 14:52 Balanza egreso SL ✓ › 14:53 Egreso SL ✓

### AC442HP · balanza (SGC) · 1 viaje · faltan 7

- 06:38–06:38: Ingreso SL ✗ entrada › Calada SL ✗ entrada › Balanza ingreso SL ✗ entrada › Carga OSL ✗ entrada › Calada SL ✗ entrada › Balanza ingreso SL ✗ entrada › Balanza egreso SL ✗ entrada › 06:38 Egreso SL ✓

### AE374FK · Permitido (varios) · 1 viaje · faltan 7

- 08:31–11:13: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 08:31 Ingreso SL ✓ › 09:31 Balanza ingreso SL ✓ › Volcables SL ✗ › 11:10 Balanza egreso SL ✓ › 11:13 Egreso SL ✓ · de más: 09:34 Renova

### BHL749 · carta (Girasol) · 3 viajes · faltan 7

- 08:23–11:37: 08:23 Ingreso ✓ › Preingreso ✗ › 08:28 Salida 2 ✓ › 08:38 Playa 3 ✓ › 09:02 Balanza ✓ › 09:20 Ingreso SL ✓ › 10:51 Balanza ingreso SL ✓ › 11:23 Volcables SL ✓ › 11:36 Balanza egreso SL ✓ › 11:37 Egreso SL ✓
- 11:47–15:28: 11:47 Ingreso ✓ › 11:49 Preingreso ✓ › 11:53 Salida 2 ✓ › Playa 3 ✗ › 13:03 Balanza ✓ › 13:19 Ingreso SL ✓ › 14:41 Balanza ingreso SL ✓ › 15:02 Volcables SL ✓ › 15:27 Balanza egreso SL ✓ › 15:28 Egreso SL ✓
- 15:37–17:29: 15:37 Ingreso ✓ › 15:39 Preingreso ✓ › 15:56 Salida 2 ✓ › 16:34 Playa 3 ✓ › 17:29 Balanza ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### DTG181 · carta (Girasol) · 3 viajes · faltan 7

- 03:41–08:05: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 03:41 Ingreso SL ✓ › 06:06 Balanza ingreso SL ✓ › 07:42 Volcables SL ✓ › 08:03 Balanza egreso SL ✓ › 08:05 Egreso SL ✓
- 08:16–12:57: 08:16 Ingreso ✓ › 09:05 Preingreso ✓ › 09:08 Salida 2 ✓ › 09:17 Playa 3 ✓ › 10:07 Balanza ✓ › 10:27 Ingreso SL ✓ › 11:53 Balanza ingreso SL ✓ › 12:25 Volcables SL ✓ › 12:55 Balanza egreso SL ✓ › 12:57 Egreso SL ✓ · de más: 09:12 Balanza
- 14:34–21:13: 14:34 Ingreso ✓ › Preingreso ✗ › 14:40 Salida 2 ✓ › 14:51 Playa 3 ✓ › 17:11 Balanza ✓ › 17:30 Ingreso SL ✓ › Balanza ingreso SL ✗ › 20:09 Volcables SL ✓ › 20:20 Balanza egreso SL ✓ › 20:22 Egreso SL ✓ · de más: 14:45 Balanza, 21:13 Salida 2

### HGK066 · Permitido (varios) · 1 viaje · faltan 7

- 12:03–12:52: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 12:03 Ingreso SL ✓ › 12:20 Balanza ingreso SL ✓ › Volcables SL ✗ › 12:46 Balanza egreso SL ✓ › 12:52 Egreso SL ✓

### JDH880 · balanza (SGC) · 2 viajes · faltan 7

- 07:40–11:44: Ingreso SL ✗ entrada › 07:40 Calada SL ✓ › 07:47 Balanza ingreso SL ✓ › 11:06 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 11:41 Balanza egreso SL ✓ › 11:44 Egreso SL ✓
- 17:23–20:41: 17:23 Ingreso SL ✓ › 17:29 Calada SL ✓ › Balanza ingreso SL ✗ › 17:54 Carga OSL ✓ (captura sin asignar) «486» › Calada SL ✗ › Balanza ingreso SL ✗ › 20:41 Balanza egreso SL ✓ › Egreso SL ✗ salida

### KOQ228 · Permitido (varios) · 1 viaje · faltan 7

- 07:29–14:06: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:29 Ingreso SL ✓ › 08:03 Balanza ingreso SL ✓ › Volcables SL ✗ › 14:03 Balanza egreso SL ✓ › 14:06 Egreso SL ✓ · de más: 07:57 Calada SL, 13:57 Carga OSL

### KQG451 · Permitido (varios) · 1 viaje · faltan 7

- 07:27–07:56: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Balanza ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 07:27 Ingreso SL ✓ › 07:43 Balanza ingreso SL ✓ › Volcables SL ✗ › 07:54 Balanza egreso SL ✓ › 07:56 Egreso SL ✓

### NLR442 · Permitido (varios) · 2 viajes · faltan 7

- 11:16–14:26: Ingreso ✗ entrada › Preingreso ✗ entrada › 11:16 Salida 2 ✓ › 12:08 Balanza ✓ › Playa 3 ✗ › Balanza ✗ › 12:25 Ingreso SL ✓ › 13:59 Balanza ingreso SL ✓ › 14:19 Volcables SL ✓ › 14:24 Balanza egreso SL ✓ › 14:26 Egreso SL ✓
- 14:40–20:10: Ingreso ✗ entrada › 14:40 Preingreso ✓ › 14:42 Salida 2 ✓ › Balanza ✗ › 14:51 Playa 3 ✓ › 16:48 Balanza ✓ › 17:04 Ingreso SL ✓ › Balanza ingreso SL ✗ › 19:58 Volcables SL ✓ › 20:09 Balanza egreso SL ✓ › 20:10 Egreso SL ✓

### RXV065 · carta (Girasol) · 4 viajes · faltan 7

- 03:35–07:55: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 03:35 Ingreso SL ✓ › 06:01 Balanza ingreso SL ✓ › 07:34 Volcables SL ✓ › 07:53 Balanza egreso SL ✓ › 07:55 Egreso SL ✓
- 08:07–11:22: 08:07 Ingreso ✓ › 08:09 Preingreso ✓ › 08:11 Salida 2 ✓ › 08:20 Playa 3 ✓ › Balanza ✗ › 08:57 Ingreso SL ✓ › 10:43 Balanza ingreso SL ✓ › 11:05 Volcables SL ✓ › 11:20 Balanza egreso SL ✓ › 11:22 Egreso SL ✓
- 11:29–14:48: 11:29 Ingreso ✓ › 11:31 Preingreso ✓ › 11:34 Salida 2 ✓ › Playa 3 ✗ › 12:23 Balanza ✓ › 12:38 Ingreso SL ✓ › 14:10 Balanza ingreso SL ✓ › 14:32 Volcables SL ✓ › 14:47 Balanza egreso SL ✓ › 14:48 Egreso SL ✓
- 14:58–20:57: 14:58 Ingreso ✓ › 15:05 Preingreso ✓ › 15:08 Salida 2 ✓ › 15:17 Playa 3 ✓ › 17:33 Balanza ✓ › 17:48 Ingreso SL ✓ › 18:01 Balanza ingreso SL ✓ › 20:39 Volcables SL ✓ › 20:56 Balanza egreso SL ✓ › 20:57 Egreso SL ✓

### SNE399 · carta (Girasol) · 5 viajes · faltan 7

- 00:06–08:15: 00:06 Ingreso ✓ › 00:08 Preingreso ✓ › 00:10 Salida 2 ✓ (captura sin asignar) «393» › Playa 3 ✗ › Balanza ✗ › 03:59 Ingreso SL ✓ (captura sin asignar) «SNP99» › 06:09 Balanza ingreso SL ✓ › 08:01 Volcables SL ✓ › 08:14 Balanza egreso SL ✓ › 08:15 Egreso SL ✓
- 08:27–11:42: 08:27 Ingreso ✓ › 08:29 Preingreso ✓ › 08:31 Salida 2 ✓ › 08:38 Playa 3 ✓ › 09:04 Balanza ✓ › 09:21 Ingreso SL ✓ › 10:55 Balanza ingreso SL ✓ › 11:28 Volcables SL ✓ › 11:40 Balanza egreso SL ✓ › 11:42 Egreso SL ✓
- 11:51–15:08: 11:51 Ingreso ✓ › 11:55 Preingreso ✓ › 11:59 Salida 2 ✓ › Playa 3 ✗ › 12:29 Balanza ✓ (captura sin asignar) «419» › 13:13 Ingreso SL ✓ › 14:39 Balanza ingreso SL ✓ › 14:52 Volcables SL ✓ › 15:07 Balanza egreso SL ✓ › 15:08 Egreso SL ✓
- 15:18–21:38: 15:18 Ingreso ✓ › 15:20 Preingreso ✓ › 15:22 Salida 2 ✓ › 15:29 Playa 3 ✓ › Balanza ✗ › 18:22 Ingreso SL ✓ › 18:32 Balanza ingreso SL ✓ › 21:22 Volcables SL ✓ › 21:38 Balanza egreso SL ✓ › 21:38 Egreso SL ✓
- 21:49–23:32: 21:49 Ingreso ✓ › 21:50 Preingreso ✓ › 21:52 Salida 2 ✓ › 21:57 Playa 3 ✓ (captura sin asignar) «UEC0» › Balanza ✗ › 23:03 Ingreso SL ✓ › 23:05 Balanza ingreso SL ✓ › Volcables SL ✗ › Balanza egreso SL ✗ › 23:32 Egreso SL ✓

### TBE594 · carta (Soja) · 1 viaje · faltan 7

- 05:01–05:03: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › Balanza ingreso SL ✗ entrada › Volcables SL ✗ entrada › 05:01 Balanza egreso SL ✓ › 05:03 Egreso SL ✓

### TVH101 · carta (Girasol) · 6 viajes · faltan 7

- 02:45–07:27: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:45 Ingreso SL ✓ › Balanza ingreso SL ✗ › 07:04 Volcables SL ✓ › 07:07 Balanza egreso SL ✓ (captura sin asignar) «ELEX» › 07:27 Egreso SL ✓
- 07:35–10:57: 07:35 Ingreso ✓ › 07:36 Preingreso ✓ › 07:38 Salida 2 ✓ › 07:45 Playa 3 ✓ › 08:12 Balanza ✓ › 08:31 Ingreso SL ✓ › 10:32 Balanza ingreso SL ✓ › 10:42 Volcables SL ✓ › 10:56 Balanza egreso SL ✓ › 10:57 Egreso SL ✓
- 11:06–14:23: 11:06 Ingreso ✓ › 11:07 Preingreso ✓ › 11:09 Salida 2 ✓ › Playa 3 ✗ › 11:57 Balanza ✓ › 12:13 Ingreso SL ✓ › 13:55 Balanza ingreso SL ✓ › 14:12 Volcables SL ✓ › 14:22 Balanza egreso SL ✓ › 14:23 Egreso SL ✓
- 14:32–20:16: Ingreso ✗ entrada › 14:32 Preingreso ✓ › 14:35 Salida 2 ✓ › 14:48 Playa 3 ✓ › 17:01 Balanza ✓ › 17:16 Ingreso SL ✓ › Balanza ingreso SL ✗ › 20:01 Volcables SL ✓ › 20:07 Balanza egreso SL ✓ (captura sin asignar) «IWV40» › 20:16 Egreso SL ✓
- 20:29–22:50: 20:29 Ingreso ✓ › 20:31 Preingreso ✓ › 20:33 Salida 2 ✓ › Playa 3 ✗ › 21:17 Balanza ✓ › 21:31 Ingreso SL ✓ › 21:55 Balanza ingreso SL ✓ › 22:38 Volcables SL ✓ › Balanza egreso SL ✗ › 22:50 Egreso SL ✓
- 23:01–23:01: Ingreso ✗ entrada › 23:01 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### UKL882 · carta (Girasol) · 4 viajes · faltan 7

- 03:46–07:59: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 03:46 Ingreso SL ✓ › 06:07 Balanza ingreso SL ✓ › 07:47 Volcables SL ✓ › 07:57 Balanza egreso SL ✓ › 07:59 Egreso SL ✓
- 08:08–11:23: 08:08 Ingreso ✓ › 08:10 Preingreso ✓ › 08:12 Salida 2 ✓ › 08:20 Playa 3 ✓ › 09:01 Balanza ✓ (captura sin asignar) «PJJ» › 09:03 Ingreso SL ✓ › 10:44 Balanza ingreso SL ✓ › 11:12 Volcables SL ✓ › 11:21 Balanza egreso SL ✓ › 11:23 Egreso SL ✓
- 11:31–14:49: 11:31 Ingreso ✓ › 11:33 Preingreso ✓ › 11:36 Salida 2 ✓ › Playa 3 ✗ › 11:37 Balanza ✓ (captura sin asignar) «INJ» › 12:40 Ingreso SL ✓ › 14:14 Balanza ingreso SL ✓ › 14:39 Volcables SL ✓ › 14:48 Balanza egreso SL ✓ › 14:49 Egreso SL ✓
- 15:06–21:10: Ingreso ✗ entrada › 15:06 Preingreso ✓ › 15:09 Salida 2 ✓ › 15:18 Playa 3 ✓ › 17:42 Balanza ✓ › 17:58 Ingreso SL ✓ › 18:26 Balanza ingreso SL ✓ › 20:58 Volcables SL ✓ › 21:09 Balanza egreso SL ✓ › 21:10 Egreso SL ✓

### AGR963 · balanza (SGC) · 2 viajes · faltan 6

- 07:39–10:54: Ingreso SL ✗ entrada › 07:39 Calada SL ✓ › 07:45 Balanza ingreso SL ✓ › 10:12 Carga OSL ✓ (captura sin asignar) «GR963» › Calada SL ✗ › Balanza ingreso SL ✗ › 10:50 Balanza egreso SL ✓ › 10:54 Egreso SL ✓
- 15:54–20:28: 15:54 Ingreso SL ✓ › 15:56 Calada SL ✓ › 16:01 Balanza ingreso SL ✓ › 19:49 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 20:28 Balanza egreso SL ✓ › Egreso SL ✗ salida · de más: 16:04 Renova

### CGS172 · carta (Girasol) · 3 viajes · faltan 6

- 05:08–10:02: 05:08 Ingreso ✓ › 05:10 Preingreso ✓ › 05:12 Salida 2 ✓ › 05:19 Playa 3 ✓ › 07:37 Balanza ✓ › 07:51 Ingreso SL ✓ › 09:10 Balanza ingreso SL ✓ › 09:44 Volcables SL ✓ › 09:58 Balanza egreso SL ✓ › 10:02 Egreso SL ✓
- 10:12–15:51: 10:12 Ingreso ✓ › 10:17 Preingreso ✓ › 10:20 Salida 2 ✓ › 10:43 Playa 3 ✓ › 11:11 Balanza ✓ › 11:27 Ingreso SL ✓ › 12:48 Balanza ingreso SL ✓ › 13:26 Volcables SL ✓ › 13:37 Balanza egreso SL ✓ › 13:39 Egreso SL ✓ · de más: 13:52 Salida 2, 13:58 Playa 3, 15:51 Balanza
- 16:07–18:08: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › Playa 3 ✗ entrada › Balanza ✗ entrada › 16:07 Ingreso SL ✓ › Balanza ingreso SL ✗ › 17:45 Volcables SL ✓ › 18:03 Balanza egreso SL ✓ › 18:05 Egreso SL ✓

### GZI868 · balanza (SGC) · 1 viaje · faltan 6

- 11:11–14:23: 11:11 Ingreso SL ✓ › Calada SL ✗ › 14:23 Balanza ingreso SL ✓ › Carga OSL ✗ salida › Calada SL ✗ salida › Balanza ingreso SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### IMV473 · carta (Soja) · 2 viajes · faltan 6

- 01:53–03:48: 01:53 Ingreso ✓ › 01:56 Preingreso ✓ › 03:36 Calada ✓ › 03:48 Salida 2 ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 03:52–12:43: 03:52 Ingreso ✓ › 03:54 Preingreso ✓ › Calada ✗ › 11:21 Salida 2 ✓ › 11:32 Ingreso SL ✓ › 11:35 Balanza ingreso SL ✓ › 12:22 Volcables SL ✓ › 12:40 Balanza egreso SL ✓ › 12:43 Egreso SL ✓

### OGA047 · balanza (SGC) · 2 viajes · faltan 6

- 06:37–10:13: Ingreso SL ✗ entrada › 06:37 Calada SL ✓ › 08:01 Balanza ingreso SL ✓ › 09:25 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 10:11 Balanza egreso SL ✓ › 10:13 Egreso SL ✓
- 18:35–21:04: 18:35 Ingreso SL ✓ › 18:49 Calada SL ✓ › Balanza ingreso SL ✗ › 20:35 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 21:01 Balanza egreso SL ✓ › 21:04 Egreso SL ✓

### UUL425 · carta (Girasol) · 5 viajes · faltan 6

- 00:05–09:11: 00:05 Ingreso ✓ › 00:07 Preingreso ✓ › 00:10 Salida 2 ✓ › 04:08 Playa 3 ✓ (captura sin asignar) «VUELTA» › Balanza ✗ › 06:09 Ingreso SL ✓ › 08:18 Balanza ingreso SL ✓ › 08:50 Volcables SL ✓ › 09:08 Balanza egreso SL ✓ › 09:11 Egreso SL ✓
- 09:21–12:29: 09:21 Ingreso ✓ › 09:23 Preingreso ✓ › 09:25 Salida 2 ✓ › 09:40 Playa 3 ✓ › 09:40 Balanza ✓ (captura sin asignar) «MYW» › 10:19 Ingreso SL ✓ › 11:52 Balanza ingreso SL ✓ › 12:15 Volcables SL ✓ › 12:26 Balanza egreso SL ✓ › 12:29 Egreso SL ✓
- 12:41–16:11: 12:41 Ingreso ✓ › 12:44 Preingreso ✓ › 12:48 Salida 2 ✓ › Playa 3 ✗ › 13:17 Balanza ✓ (captura sin asignar) «AG0» › 14:48 Ingreso SL ✓ › 14:52 Balanza ingreso SL ✓ › 15:50 Volcables SL ✓ › 16:03 Balanza egreso SL ✓ › 16:11 Egreso SL ✓
- 16:24–22:25: 16:24 Ingreso ✓ › 16:26 Preingreso ✓ › 16:28 Salida 2 ✓ › Playa 3 ✗ › Balanza ✗ › 20:36 Ingreso SL ✓ › 21:46 Balanza ingreso SL ✓ (captura sin asignar) «LU425» › 22:08 Volcables SL ✓ › Balanza egreso SL ✗ › 22:25 Egreso SL ✓
- 22:34–23:57: 22:34 Ingreso ✓ › 22:36 Preingreso ✓ › 22:38 Salida 2 ✓ › 22:46 Playa 3 ✓ (captura sin asignar) «L9LP5» › Balanza ✗ › 22:45 Ingreso SL ✓ (captura sin asignar) «AA6» › 23:53 Balanza ingreso SL ✓ › 23:57 Volcables SL ✓ › Balanza egreso SL · sigue › Egreso SL · sigue

### VMD443 · carta (Soja) · 1 viaje · faltan 6

- 06:09–11:17: 06:09 Ingreso ✓ › Preingreso ✗ › 07:41 Calada ✓ › 11:17 Salida 2 ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AD863BH · carta (Soja) · 1 viaje · faltan 5

- 04:31–10:24: 04:31 Ingreso ✓ › 04:34 Preingreso ✓ › 05:52 Calada ✓ › 10:24 Salida 2 ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AI315CN · carta (Soja) · 1 viaje · faltan 5

- 16:43–20:25: 16:43 Ingreso ✓ › 16:45 Preingreso ✓ › 17:23 Calada ✓ › 20:25 Salida 2 ✓ › Ingreso SL ✗ salida › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### EIQ984 · carta (Soja) · 1 viaje · faltan 5

- 00:15–04:01: 00:15 Ingreso ✓ › 00:24 Preingreso ✓ (captura sin asignar) «1E296H» › 01:08 Calada ✓ › Salida 2 ✗ › Ingreso SL ✗ › 04:01 Balanza ingreso SL ✓ › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### LYQ656 · Permitido (varios) · 1 viaje · faltan 5

- 07:08–11:02: Ingreso ✗ entrada › 07:08 Preingreso ✓ › 07:10 Salida 2 ✓ › Balanza ✗ › Playa 3 ✗ › Balanza ✗ › 07:19 Ingreso SL ✓ › 07:54 Balanza ingreso SL ✓ › Volcables SL ✗ › 10:32 Balanza egreso SL ✓ › 11:02 Egreso SL ✓ · de más: 07:48 Calada SL, 09:36 Carga OSL, 10:08 Calada SL, 10:27 Balanza ingreso SL

### RHM819 · carta (Girasol) · 3 viajes · faltan 5

- 01:48–04:30: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 01:48 Ingreso SL ✓ › Balanza ingreso SL ✗ › 04:10 Volcables SL ✓ › 04:28 Balanza egreso SL ✓ (captura sin asignar) «VD6LT4» › 04:30 Egreso SL ✓
- 10:11–13:38: 10:11 Ingreso ✓ › Preingreso ✗ › 10:19 Salida 2 ✓ › 10:41 Playa 3 ✓ › 11:07 Balanza ✓ › 11:24 Ingreso SL ✓ › 12:46 Balanza ingreso SL ✓ › 13:21 Volcables SL ✓ › 13:35 Balanza egreso SL ✓ › 13:38 Egreso SL ✓
- 13:46–18:08: 13:46 Ingreso ✓ › 13:48 Preingreso ✓ › Salida 2 ✗ › Playa 3 ✗ › 13:53 Balanza ✓ › 16:06 Ingreso SL ✓ › Balanza ingreso SL ✗ › 17:45 Volcables SL ✓ › 18:06 Balanza egreso SL ✓ › 18:08 Egreso SL ✓ · de más: 13:57 Playa 3

### RNM392 · carta (Girasol) · 3 viajes · faltan 5

- 06:01–10:36: 06:01 Ingreso ✓ › 06:03 Preingreso ✓ › 06:05 Salida 2 ✓ › 06:11 Playa 3 ✓ › Balanza ✗ › 08:20 Ingreso SL ✓ › 10:20 Balanza ingreso SL ✓ › 10:24 Volcables SL ✓ › 10:34 Balanza egreso SL ✓ › 10:36 Egreso SL ✓
- 10:54–14:07: Ingreso ✗ entrada › 10:54 Preingreso ✓ › 10:56 Salida 2 ✓ › Playa 3 ✗ › 10:59 Balanza ✓ › 11:50 Ingreso SL ✓ › 13:45 Balanza ingreso SL ✓ › 13:49 Volcables SL ✓ › 14:05 Balanza egreso SL ✓ › 14:07 Egreso SL ✓
- 14:23–19:57: Ingreso ✗ entrada › 14:23 Preingreso ✓ › 14:24 Salida 2 ✓ › 14:33 Playa 3 ✓ › 16:39 Balanza ✓ › 16:57 Ingreso SL ✓ › Balanza ingreso SL ✗ › 19:20 Volcables SL ✓ › 19:55 Balanza egreso SL ✓ › 19:57 Egreso SL ✓ · de más: 14:28 Balanza

### SBA733 · carta (Soja) · 1 viaje · faltan 5

- 06:16–09:22: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › Ingreso SL ✗ entrada › 06:16 Balanza ingreso SL ✓ › 09:06 Volcables SL ✓ › 09:19 Balanza egreso SL ✓ › 09:22 Egreso SL ✓

### UAJ766 · Permitido (varios) · 1 viaje · faltan 5

- 10:12–16:18: Ingreso ✗ entrada › Preingreso ✗ entrada › Salida 2 ✗ entrada › 10:12 Balanza ✓ › Playa 3 ✗ › 10:14 Balanza ✓ (captura sin asignar) «E42» › 10:33 Ingreso SL ✓ › 10:42 Balanza ingreso SL ✓ › Volcables SL ✗ › 11:13 Balanza egreso SL ✓ › 16:18 Egreso SL ✓ · de más: 10:43 Renova, 11:17 Ingreso SL, 15:38 Balanza, 15:55 Balanza ingreso SL, 15:56 Renova, 16:16 Balanza egreso SL

### VRA989 · carta (Girasol) · 3 viajes · faltan 5

- 01:52–08:45: 01:52 Ingreso ✓ › 01:55 Preingreso ✓ › Salida 2 ✗ › Playa 3 ✗ › Balanza ✗ › Ingreso SL ✗ › 08:11 Balanza ingreso SL ✓ › 08:29 Volcables SL ✓ › 08:42 Balanza egreso SL ✓ › 08:45 Egreso SL ✓
- 08:57–12:08: 08:57 Ingreso ✓ › 08:59 Preingreso ✓ › 09:02 Salida 2 ✓ › 09:10 Playa 3 ✓ › 09:46 Balanza ✓ › 10:04 Ingreso SL ✓ › 11:07 Balanza ingreso SL ✓ › 11:58 Volcables SL ✓ › 12:06 Balanza egreso SL ✓ › 12:08 Egreso SL ✓
- 12:27–16:58: 12:27 Ingreso ✓ › 12:37 Preingreso ✓ › 12:39 Salida 2 ✓ › Playa 3 ✗ › 14:10 Balanza ✓ › 14:25 Ingreso SL ✓ › 15:34 Balanza ingreso SL ✓ › 16:41 Volcables SL ✓ › 16:55 Balanza egreso SL ✓ › 16:58 Egreso SL ✓

### AA875OG · balanza (SGC) · 2 viajes · faltan 4

- 08:19–15:10: 08:19 Ingreso SL ✓ › 08:27 Calada SL ✓ › 08:34 Balanza ingreso SL ✓ › 14:27 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 15:08 Balanza egreso SL ✓ › 15:10 Egreso SL ✓
- 20:55–22:34: 20:55 Ingreso SL ✓ › 20:58 Calada SL ✓ › 21:11 Balanza ingreso SL ✓ › 21:55 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 22:31 Balanza egreso SL ✓ › 22:34 Egreso SL ✓

### AC020FS · carta (Soja) · 1 viaje · faltan 4

- 14:13–15:32: 14:13 Ingreso ✓ › 14:18 Preingreso ✓ › 15:02 Calada ✓ (captura sin asignar) «SEY9565» › 15:21 Salida 2 ✓ › 15:32 Ingreso SL ✓ › Balanza ingreso SL ✗ salida › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AC941HV · carta (Soja) · 1 viaje · faltan 4

- 05:51–11:34: Ingreso ✗ entrada › 05:51 Preingreso ✓ › 06:02 Calada ✓ (captura sin asignar) «ASY1HV» › 11:22 Salida 2 ✓ › 11:31 Ingreso SL ✓ (captura sin asignar) «ADYHV» › 11:34 Balanza ingreso SL ✓ › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### AD851RW · carta (Soja) · 1 viaje · faltan 4

- 23:45–23:45: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › 23:45 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### CAK123 · carta (Soja) · 1 viaje · faltan 4

- 01:33–07:58: Ingreso · antes de las 00 › 01:33 Preingreso ✓ › Calada ✗ › Salida 2 ✗ › Ingreso SL ✗ › Balanza ingreso SL ✗ › 07:43 Volcables SL ✓ › 07:55 Balanza egreso SL ✓ › 07:58 Egreso SL ✓

### EFM348 · carta (Soja) · 1 viaje · faltan 4

- 01:10–06:10: 01:10 Ingreso ✓ › 01:14 Preingreso ✓ › Calada ✗ › Salida 2 ✗ › 01:57 Ingreso SL ✓ › Balanza ingreso SL ✗ › Volcables SL ✗ › 06:09 Balanza egreso SL ✓ › 06:10 Egreso SL ✓

### EKC425 · carta (Soja) · 1 viaje · faltan 4

- 23:44–23:44: Ingreso ✗ entrada › Preingreso ✗ entrada › Calada ✗ entrada › Salida 2 ✗ entrada › 23:44 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### EYH843 · carta (Girasol) · 5 viajes · faltan 4

- 00:21–08:11: Ingreso · antes de las 00 › Preingreso · antes de las 00 › 00:21 Salida 2 ✓ › 00:30 Playa 3 ✓ › Balanza ✗ › 04:09 Ingreso SL ✓ › 06:10 Balanza ingreso SL ✓ › 07:56 Volcables SL ✓ › 08:10 Balanza egreso SL ✓ › 08:11 Egreso SL ✓
- 08:23–11:33: 08:23 Ingreso ✓ › 08:24 Preingreso ✓ › 08:26 Salida 2 ✓ › 08:37 Playa 3 ✓ › 08:55 Balanza ✓ › 09:16 Ingreso SL ✓ › 10:49 Balanza ingreso SL ✓ › 11:20 Volcables SL ✓ › 11:32 Balanza egreso SL ✓ › 11:33 Egreso SL ✓
- 11:44–15:19: 11:44 Ingreso ✓ › 11:46 Preingreso ✓ › Salida 2 ✗ › Playa 3 ✗ › 12:38 Balanza ✓ › 12:53 Ingreso SL ✓ › 14:33 Balanza ingreso SL ✓ › 14:52 Volcables SL ✓ › 15:18 Balanza egreso SL ✓ › 15:19 Egreso SL ✓
- 15:27–21:41: 15:27 Ingreso ✓ › 15:30 Preingreso ✓ › 15:31 Salida 2 ✓ › 15:40 Playa 3 ✓ › 18:15 Balanza ✓ › 18:32 Ingreso SL ✓ › 21:13 Balanza ingreso SL ✓ › 21:28 Volcables SL ✓ › 21:40 Balanza egreso SL ✓ › 21:41 Egreso SL ✓
- 21:50–23:37: 21:50 Ingreso ✓ › 21:52 Preingreso ✓ › 21:54 Salida 2 ✓ › 22:03 Playa 3 ✓ › Balanza ✗ › 23:14 Ingreso SL ✓ › 23:17 Balanza ingreso SL ✓ › 23:22 Volcables SL ✓ › 23:35 Balanza egreso SL ✓ › 23:37 Egreso SL ✓

### TAC436 · carta (Girasol) · 5 viajes · faltan 4

- 00:21–00:23: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › 00:21 Balanza egreso SL ✓ › 00:23 Egreso SL ✓
- 00:34–08:21: Ingreso · antes de las 00 › 00:34 Preingreso ✓ › 00:37 Salida 2 ✓ › Playa 3 ✗ › Balanza ✗ › 04:50 Ingreso SL ✓ › 06:11 Balanza ingreso SL ✓ › 08:06 Volcables SL ✓ › 08:19 Balanza egreso SL ✓ › 08:21 Egreso SL ✓
- 08:30–11:50: 08:30 Ingreso ✓ › 08:45 Preingreso ✓ › 08:48 Salida 2 ✓ › 08:59 Playa 3 ✓ › 09:21 Balanza ✓ › 09:40 Ingreso SL ✓ › 10:56 Balanza ingreso SL ✓ › 11:37 Volcables SL ✓ › 11:49 Balanza egreso SL ✓ › 11:50 Egreso SL ✓
- 11:59–15:37: 11:59 Ingreso ✓ › 12:01 Preingreso ✓ › 12:03 Salida 2 ✓ › Playa 3 ✗ › 13:15 Balanza ✓ › 13:35 Ingreso SL ✓ › 14:44 Balanza ingreso SL ✓ › 15:14 Volcables SL ✓ › 15:35 Balanza egreso SL ✓ › 15:37 Egreso SL ✓
- 15:45–21:59: 15:45 Ingreso ✓ › Preingreso ✗ › 15:50 Salida 2 ✓ › 15:59 Playa 3 ✓ › 18:28 Balanza ✓ › 18:49 Ingreso SL ✓ › 21:16 Balanza ingreso SL ✓ › 21:37 Volcables SL ✓ › 21:57 Balanza egreso SL ✓ › 21:59 Egreso SL ✓

### UBX301 · carta (Soja) · 1 viaje · faltan 4

- 09:13–22:58: Ingreso ✗ entrada › Preingreso ✗ entrada › 09:13 Calada ✓ › 09:30 Salida 2 ✓ (captura sin asignar) «AA0» › 10:37 Ingreso SL ✓ (captura sin asignar) «HERMANN» › Balanza ingreso SL ✗ › Volcables SL ✗ › 22:53 Balanza egreso SL ✓ › 22:58 Egreso SL ✓

### UER485 · carta (Girasol) · 2 viajes · faltan 4

- 11:12–14:40: 11:12 Ingreso ✓ › 11:14 Preingreso ✓ › Salida 2 ✗ › Playa 3 ✗ › 11:15 Balanza ✓ (captura sin asignar) «AN040I» › 12:27 Ingreso SL ✓ › 14:02 Balanza ingreso SL ✓ › 14:25 Volcables SL ✓ › 14:35 Balanza egreso SL ✓ › 14:37 Egreso SL ✓
- 14:50–21:35: 14:50 Ingreso ✓ › Preingreso ✗ › 15:06 Salida 2 ✓ › 15:16 Playa 3 ✓ › Balanza ✗ › 18:11 Ingreso SL ✓ › 18:30 Balanza ingreso SL ✓ › 21:09 Volcables SL ✓ › Balanza egreso SL · sigue › Egreso SL · sigue · de más: 21:35 Salida 2

### VAJ028 · carta (Girasol) · 5 viajes · faltan 4

- 00:31–02:48: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 00:31 Ingreso SL ✓ › Balanza ingreso SL ✗ › 02:30 Volcables SL ✓ › 02:37 Balanza egreso SL ✓ (captura sin asignar) «112» › 02:48 Egreso SL ✓
- 02:57–09:13: 02:57 Ingreso ✓ › 02:58 Preingreso ✓ › 03:00 Salida 2 ✓ › Playa 3 ✗ › 06:01 Balanza ✓ › 06:19 Ingreso SL ✓ › 08:18 Balanza ingreso SL ✓ › 08:55 Volcables SL ✓ › 09:11 Balanza egreso SL ✓ › 09:13 Egreso SL ✓ · de más: 03:57 Calada
- 09:21–13:06: 09:21 Ingreso ✓ › 09:23 Preingreso ✓ › 09:26 Salida 2 ✓ › 09:41 Playa 3 ✓ › 10:16 Balanza ✓ › 10:37 Ingreso SL ✓ › 12:02 Balanza ingreso SL ✓ › 12:35 Volcables SL ✓ › 13:04 Balanza egreso SL ✓ › 13:06 Egreso SL ✓
- 13:15–16:14: 13:15 Ingreso ✓ › 13:16 Preingreso ✓ › 13:18 Salida 2 ✓ › 13:27 Playa 3 ✓ › 14:46 Balanza ✓ › 15:05 Ingreso SL ✓ › 15:11 Balanza ingreso SL ✓ › 16:00 Volcables SL ✓ › 16:11 Balanza egreso SL ✓ › 16:14 Egreso SL ✓
- 16:26–22:35: 16:26 Ingreso ✓ › Preingreso ✗ › 16:29 Salida 2 ✓ › Playa 3 ✗ › 18:34 Balanza ✓ (captura sin asignar) «HJ022» › 20:54 Ingreso SL ✓ › 21:47 Balanza ingreso SL ✓ › 22:19 Volcables SL ✓ › 22:33 Balanza egreso SL ✓ › 22:35 Egreso SL ✓

### AZG422 · carta (Girasol) · 3 viajes · faltan 3

- 06:30–10:57: 06:30 Ingreso ✓ › 06:31 Preingreso ✓ › 06:38 Salida 2 ✓ › 07:24 Playa 3 ✓ › 08:09 Balanza ✓ › 08:25 Ingreso SL ✓ › 10:31 Balanza ingreso SL ✓ › 10:40 Volcables SL ✓ › 10:55 Balanza egreso SL ✓ › 10:57 Egreso SL ✓
- 11:04–14:17: 11:04 Ingreso ✓ › 11:05 Preingreso ✓ › 11:07 Salida 2 ✓ › Playa 3 ✗ › 11:52 Balanza ✓ › 12:07 Ingreso SL ✓ › 13:51 Balanza ingreso SL ✓ › 14:05 Volcables SL ✓ › 14:15 Balanza egreso SL ✓ › 14:17 Egreso SL ✓
- 14:26–20:08: 14:26 Ingreso ✓ › 14:28 Preingreso ✓ › 14:30 Salida 2 ✓ › 14:45 Playa 3 ✓ › 16:40 Balanza ✓ › 16:57 Ingreso SL ✓ › Balanza ingreso SL ✗ › 19:20 Volcables SL ✓ › Balanza egreso SL ✗ › 20:08 Egreso SL ✓

### CTW713 · Permitido (glicerina) · 3 viajes · faltan 3

- 02:30–07:22: Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 06:43 Renova ✓ › 07:20 Balanza egreso SL ✓ › 07:22 Egreso SL ✓ · de más: 02:30 Preingreso
- 09:17–10:31: 09:17 Ingreso SL ✓ › 09:22 Balanza ingreso SL ✓ (captura sin asignar) «N713» › 09:29 Renova ✓ › Balanza egreso SL ✗ salida › Egreso SL ✗ salida
- 16:52–22:38: 16:52 Ingreso SL ✓ › Balanza ingreso SL ✗ › 17:01 Renova ✓ › 19:12 Balanza egreso SL ✓ › Egreso SL · sigue · de más: 19:15 Ingreso SL, 21:54 Balanza ingreso SL, 22:38 Renova

### EEW075 · carta (Girasol) · 4 viajes · faltan 3

- 02:03–05:37: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:03 Ingreso SL ✓ › 02:22 Balanza ingreso SL ✓ › 05:25 Volcables SL ✓ › 05:35 Balanza egreso SL ✓ › 05:37 Egreso SL ✓
- 05:47–10:31: Ingreso ✗ entrada › 05:47 Preingreso ✓ › 05:48 Salida 2 ✓ › 05:55 Playa 3 ✓ › 07:52 Balanza ✓ › Ingreso SL ✗ › 10:19 Balanza ingreso SL ✓ › 10:21 Volcables SL ✓ › 10:29 Balanza egreso SL ✓ › 10:31 Egreso SL ✓
- 10:39–13:42: 10:39 Ingreso ✓ › 10:41 Preingreso ✓ › 10:42 Salida 2 ✓ › 10:52 Playa 3 ✓ › 11:20 Balanza ✓ › 11:34 Ingreso SL ✓ › 12:54 Balanza ingreso SL ✓ › 13:33 Volcables SL ✓ › 13:40 Balanza egreso SL ✓ › 13:42 Egreso SL ✓
- 13:50–18:15: 13:50 Ingreso ✓ › 13:51 Preingreso ✓ › 13:52 Salida 2 ✓ › 13:58 Playa 3 ✓ › 16:28 Balanza ✓ › 16:44 Ingreso SL ✓ › Balanza ingreso SL ✗ › 17:56 Volcables SL ✓ › 18:14 Balanza egreso SL ✓ › 18:15 Egreso SL ✓

### EIT521 · carta (Soja) · 1 viaje · faltan 3

- 00:40–04:27: 00:40 Ingreso ✓ › 00:43 Preingreso ✓ › 01:17 Calada ✓ › 01:29 Salida 2 ✓ › 01:50 Ingreso SL ✓ › 04:27 Balanza ingreso SL ✓ › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### EUV766 · carta (Girasol) · 5 viajes · faltan 3

- 00:39–03:02: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 00:39 Ingreso SL ✓ › 00:40 Balanza ingreso SL ✓ › 02:41 Volcables SL ✓ › 03:00 Balanza egreso SL ✓ › 03:02 Egreso SL ✓
- 08:43–11:54: 08:43 Ingreso ✓ › 08:46 Preingreso ✓ › 08:50 Salida 2 ✓ › 09:03 Playa 3 ✓ › 09:31 Balanza ✓ › 09:45 Ingreso SL ✓ › 10:59 Balanza ingreso SL ✓ › 11:39 Volcables SL ✓ › 11:53 Balanza egreso SL ✓ › 11:54 Egreso SL ✓
- 12:04–15:44: Ingreso ✗ entrada › 12:04 Preingreso ✓ › 12:06 Salida 2 ✓ › Playa 3 ✗ › 13:26 Balanza ✓ › 13:39 Ingreso SL ✓ › 14:49 Balanza ingreso SL ✓ › 15:27 Volcables SL ✓ › 15:43 Balanza egreso SL ✓ › 15:44 Egreso SL ✓
- 15:52–22:04: 15:52 Ingreso ✓ › 15:54 Preingreso ✓ › 15:56 Salida 2 ✓ › 16:33 Playa 3 ✓ › 18:36 Balanza ✓ › 18:50 Ingreso SL ✓ › 21:17 Balanza ingreso SL ✓ › 21:46 Volcables SL ✓ › 22:03 Balanza egreso SL ✓ › 22:04 Egreso SL ✓
- 22:13–23:42: 22:13 Ingreso ✓ › 22:15 Preingreso ✓ › 22:17 Salida 2 ✓ › 22:23 Playa 3 ✓ › Balanza ✗ › 23:18 Ingreso SL ✓ › 23:21 Balanza ingreso SL ✓ › 23:25 Volcables SL ✓ › 23:41 Balanza egreso SL ✓ › 23:42 Egreso SL ✓

### HCS514 · carta (Soja) · 1 viaje · faltan 3

- 00:04–00:04: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 00:04 Balanza ingreso SL ✓ › Volcables SL ✗ salida › Balanza egreso SL ✗ salida › Egreso SL ✗ salida

### UJV026 · carta (Soja) · 1 viaje · faltan 3

- 04:00–09:16: Ingreso ✗ entrada › Preingreso ✗ entrada › 04:00 Calada ✓ › Salida 2 ✗ › 04:23 Ingreso SL ✓ › 06:14 Balanza ingreso SL ✓ › 08:58 Volcables SL ✓ › 09:12 Balanza egreso SL ✓ › 09:16 Egreso SL ✓

### WHR567 · carta (Girasol) · 4 viajes · faltan 3

- 00:44–01:00: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:44 Volcables SL ✓ › 00:47 Balanza egreso SL ✓ (captura sin asignar) «LY1J» › 01:00 Egreso SL ✓
- 01:08–08:37: 01:08 Ingreso ✓ › 01:12 Preingreso ✓ › 01:14 Salida 2 ✓ › 01:21 Playa 3 ✓ (captura sin asignar) «H560» › Balanza ✗ › 05:15 Ingreso SL ✓ › 08:07 Balanza ingreso SL ✓ › 08:19 Volcables SL ✓ › 08:35 Balanza egreso SL ✓ › 08:37 Egreso SL ✓
- 08:49–12:09: Ingreso ✗ entrada › 08:49 Preingreso ✓ › 08:51 Salida 2 ✓ › 09:05 Playa 3 ✓ › 09:45 Balanza ✓ › 10:01 Ingreso SL ✓ › 11:05 Balanza ingreso SL ✓ › 11:49 Volcables SL ✓ › 12:07 Balanza egreso SL ✓ › 12:09 Egreso SL ✓
- 12:23–16:47: Ingreso ✗ entrada › 12:23 Preingreso ✓ › 12:35 Salida 2 ✓ › 12:43 Playa 3 ✓ › 14:06 Balanza ✓ › 14:21 Ingreso SL ✓ › 15:33 Balanza ingreso SL ✓ › 16:33 Volcables SL ✓ › 16:46 Balanza egreso SL ✓ › 16:47 Egreso SL ✓ · de más: 12:38 Balanza

### AB525FS · carta (Soja) · 1 viaje · faltan 2

- 13:14–18:14: Ingreso ✗ entrada › 13:14 Preingreso ✓ › 13:43 Calada ✓ › 16:55 Salida 2 ✓ › 17:07 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:05 Volcables SL ✓ › 18:13 Balanza egreso SL ✓ › 18:14 Egreso SL ✓

### AE879OO · carta (Soja) · 1 viaje · faltan 2

- 08:07–10:48: Ingreso ✗ entrada › 08:07 Preingreso ✓ › 08:33 Calada ✓ › 08:41 Salida 2 ✓ › 08:49 Ingreso SL ✓ › 08:52 Balanza ingreso SL ✓ › Volcables SL ✗ › 10:46 Balanza egreso SL ✓ › 10:48 Egreso SL ✓

### AI217DQ · carta (Soja) · 1 viaje · faltan 2

- 15:13–18:46: Ingreso ✗ entrada › 15:13 Preingreso ✓ › 17:11 Calada ✓ › 17:20 Salida 2 ✓ › 17:31 Ingreso SL ✓ › Balanza ingreso SL ✗ › 18:34 Volcables SL ✓ › 18:44 Balanza egreso SL ✓ › 18:46 Egreso SL ✓

### CKQ212 · carta (Girasol) · 4 viajes · faltan 2

- 01:22–04:14: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 01:22 Ingreso SL ✓ › 01:25 Balanza ingreso SL ✓ › 03:55 Volcables SL ✓ › 04:12 Balanza egreso SL ✓ › 04:14 Egreso SL ✓
- 04:23–09:43: 04:23 Ingreso ✓ › 04:25 Preingreso ✓ › 04:28 Salida 2 ✓ › 04:36 Playa 3 ✓ › 07:21 Balanza ✓ › 07:41 Ingreso SL ✓ › 09:01 Balanza ingreso SL ✓ › 09:24 Volcables SL ✓ › 09:41 Balanza egreso SL ✓ › 09:43 Egreso SL ✓
- 10:14–13:24: Ingreso ✗ entrada › 10:14 Preingreso ✓ › 10:16 Salida 2 ✓ › 10:35 Playa 3 ✓ › 11:00 Balanza ✓ › 11:19 Ingreso SL ✓ › 12:43 Balanza ingreso SL ✓ › 13:10 Volcables SL ✓ › 13:22 Balanza egreso SL ✓ › 13:24 Egreso SL ✓
- 13:35–17:58: Ingreso ✗ entrada › 13:35 Preingreso ✓ › 13:38 Salida 2 ✓ › 13:47 Playa 3 ✓ › 15:33 Balanza ✓ › 15:50 Ingreso SL ✓ › 15:53 Balanza ingreso SL ✓ › 17:00 Volcables SL ✓ › 17:54 Balanza egreso SL ✓ › 17:56 Egreso SL ✓

### CXA592 · balanza (SGC) · 1 viaje · faltan 2

- 06:30–13:05: 06:30 Ingreso SL ✓ › 07:43 Calada SL ✓ › 07:49 Balanza ingreso SL ✓ › 12:36 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 13:03 Balanza egreso SL ✓ › 13:05 Egreso SL ✓

### DGR440 · carta (Girasol) · 3 viajes · faltan 2

- 07:10–11:03: 07:10 Ingreso ✓ › 07:12 Preingreso ✓ › 07:14 Salida 2 ✓ › 07:27 Playa 3 ✓ › 08:21 Balanza ✓ › 08:35 Ingreso SL ✓ › 10:32 Balanza ingreso SL ✓ › 10:48 Volcables SL ✓ › 11:01 Balanza egreso SL ✓ › 11:03 Egreso SL ✓
- 11:12–14:33: 11:12 Ingreso ✓ › 11:13 Preingreso ✓ › 11:15 Salida 2 ✓ › Playa 3 ✗ › 12:07 Balanza ✓ › 12:23 Ingreso SL ✓ › 13:57 Balanza ingreso SL ✓ › 14:16 Volcables SL ✓ › 14:32 Balanza egreso SL ✓ › 14:33 Egreso SL ✓
- 14:44–20:54: 14:44 Ingreso ✓ › 14:46 Preingreso ✓ › 15:04 Salida 2 ✓ › 15:11 Playa 3 ✓ › 17:22 Balanza ✓ › 17:40 Ingreso SL ✓ › Balanza ingreso SL ✗ › 20:29 Volcables SL ✓ › 20:52 Balanza egreso SL ✓ › 20:54 Egreso SL ✓

### EDQ876 · carta (Girasol) · 3 viajes · faltan 2

- 14:09–18:49: 14:09 Ingreso ✓ › 14:12 Preingreso ✓ › 14:13 Salida 2 ✓ › 14:22 Playa 3 ✓ › Balanza ✗ › 16:55 Ingreso SL ✓ › 17:00 Balanza ingreso SL ✓ › 18:11 Volcables SL ✓ › 18:46 Balanza egreso SL ✓ › 18:49 Egreso SL ✓
- 19:00–22:41: 19:00 Ingreso ✓ › 19:03 Preingreso ✓ › 19:05 Salida 2 ✓ › 19:17 Playa 3 ✓ › Balanza ✗ › 21:13 Ingreso SL ✓ › 21:50 Balanza ingreso SL ✓ › 22:26 Volcables SL ✓ › 22:39 Balanza egreso SL ✓ › 22:41 Egreso SL ✓
- 22:58–23:00: 22:58 Ingreso ✓ › 23:00 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### EGV380 · balanza (SGC) · 1 viaje · faltan 2

- 14:01–18:04: 14:01 Ingreso SL ✓ › 14:09 Calada SL ✓ › 14:19 Balanza ingreso SL ✓ › 17:42 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 18:02 Balanza egreso SL ✓ › 18:04 Egreso SL ✓

### GES056 · carta (Girasol) · 4 viajes · faltan 2

- 00:32–03:36: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › 00:32 Playa 3 ✓ › Balanza ✗ › 00:53 Ingreso SL ✓ › 00:56 Balanza ingreso SL ✓ › 03:10 Volcables SL ✓ (captura sin asignar) «OES0058» › 03:34 Balanza egreso SL ✓ › 03:36 Egreso SL ✓
- 03:46–09:23: Ingreso ✗ entrada › 03:46 Preingreso ✓ › 03:51 Salida 2 ✓ › 03:57 Playa 3 ✓ › 06:15 Balanza ✓ › 06:31 Ingreso SL ✓ › 08:21 Balanza ingreso SL ✓ › 09:05 Volcables SL ✓ › 09:21 Balanza egreso SL ✓ › 09:23 Egreso SL ✓ · de más: 03:54 Balanza
- 09:33–12:55: 09:33 Ingreso ✓ › 09:35 Preingreso ✓ › 09:37 Salida 2 ✓ › 09:44 Playa 3 ✓ › 10:19 Balanza ✓ › 10:40 Ingreso SL ✓ › 12:04 Balanza ingreso SL ✓ › 12:40 Volcables SL ✓ › 12:53 Balanza egreso SL ✓ › 12:55 Egreso SL ✓ · de más: 09:40 Balanza
- 13:16–17:50: 13:16 Ingreso ✓ › 13:18 Preingreso ✓ › 13:20 Salida 2 ✓ › 13:48 Playa 3 ✓ › 15:40 Balanza ✓ › 15:57 Ingreso SL ✓ › 15:59 Balanza ingreso SL ✓ › 17:16 Volcables SL ✓ › 17:48 Balanza egreso SL ✓ › 17:50 Egreso SL ✓ · de más: 13:45 Balanza

### GGX385 · balanza (SGC) · 1 viaje · faltan 2

- 07:31–14:36: 07:31 Ingreso SL ✓ › 07:59 Calada SL ✓ › 08:06 Balanza ingreso SL ✓ › 13:58 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 14:34 Balanza egreso SL ✓ › 14:36 Egreso SL ✓

### GWZ435 · carta (Soja) · 1 viaje · faltan 2

- 01:42–02:26: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:42 Balanza ingreso SL ✓ › Volcables SL ✗ › 02:26 Balanza egreso SL ✓ › Egreso SL ✗ salida

### LLS316 · carta (Soja) · 1 viaje · faltan 2

- 18:03–21:50: Ingreso ✗ entrada › 18:03 Preingreso ✓ › 19:58 Calada ✓ › 20:11 Salida 2 ✓ › 20:21 Ingreso SL ✓ › 20:25 Balanza ingreso SL ✓ › Volcables SL ✗ › 21:48 Balanza egreso SL ✓ › 21:50 Egreso SL ✓

### MWK218 · carta (Girasol) · 4 viajes · faltan 2

- 00:14–00:31: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:14 Volcables SL ✓ › 00:30 Balanza egreso SL ✓ › 00:31 Egreso SL ✓
- 00:39–08:28: 00:39 Ingreso ✓ › 00:40 Preingreso ✓ › 00:43 Salida 2 ✓ › 00:51 Playa 3 ✓ › Balanza ✗ › 04:53 Ingreso SL ✓ › 06:13 Balanza ingreso SL ✓ › 08:09 Volcables SL ✓ › 08:25 Balanza egreso SL ✓ › 08:28 Egreso SL ✓
- 08:43–12:05: 08:43 Ingreso ✓ › 08:46 Preingreso ✓ › 08:50 Salida 2 ✓ › 09:02 Playa 3 ✓ › 09:37 Balanza ✓ › 09:53 Ingreso SL ✓ › 11:04 Balanza ingreso SL ✓ › 11:45 Volcables SL ✓ › 12:03 Balanza egreso SL ✓ › 12:05 Egreso SL ✓
- 12:34–17:14: Ingreso ✗ entrada › 12:34 Preingreso ✓ › 12:36 Salida 2 ✓ › 12:44 Playa 3 ✓ › 13:57 Balanza ✓ › 14:13 Ingreso SL ✓ › 15:31 Balanza ingreso SL ✓ › 16:38 Volcables SL ✓ › 17:13 Balanza egreso SL ✓ › 17:14 Egreso SL ✓

### RYJ562 · carta (Girasol) · 4 viajes · faltan 2

- 01:09–01:32: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 01:09 Volcables SL ✓ › 01:30 Balanza egreso SL ✓ › 01:32 Egreso SL ✓
- 01:41–08:40: 01:41 Ingreso ✓ › 01:44 Preingreso ✓ › 01:46 Salida 2 ✓ › 01:54 Playa 3 ✓ › Balanza ✗ › 05:20 Ingreso SL ✓ › 08:08 Balanza ingreso SL ✓ › 08:25 Volcables SL ✓ › 08:38 Balanza egreso SL ✓ › 08:40 Egreso SL ✓
- 08:49–12:19: 08:49 Ingreso ✓ › 08:51 Preingreso ✓ › 08:54 Salida 2 ✓ › 09:06 Playa 3 ✓ › 09:53 Balanza ✓ › 10:09 Ingreso SL ✓ › 11:10 Balanza ingreso SL ✓ › 12:05 Volcables SL ✓ › 12:17 Balanza egreso SL ✓ › 12:19 Egreso SL ✓
- 12:29–17:12: 12:29 Ingreso ✓ › 12:37 Preingreso ✓ › 12:40 Salida 2 ✓ › Playa 3 ✗ › 14:17 Balanza ✓ › 14:30 Ingreso SL ✓ › 15:35 Balanza ingreso SL ✓ › 16:50 Volcables SL ✓ › 17:10 Balanza egreso SL ✓ › 17:12 Egreso SL ✓

### SNP211 · balanza (SGC) · 1 viaje · faltan 2

- 11:53–17:44: 11:53 Ingreso SL ✓ › 11:55 Calada SL ✓ › 14:27 Balanza ingreso SL ✓ › 17:12 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 17:41 Balanza egreso SL ✓ › 17:44 Egreso SL ✓ · de más: 14:30 Renova

### TOE184 · carta (Girasol) · 5 viajes · faltan 2

- 00:52–03:18: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 00:52 Ingreso SL ✓ › 00:55 Balanza ingreso SL ✓ › 02:56 Volcables SL ✓ › 03:17 Balanza egreso SL ✓ › 03:18 Egreso SL ✓
- 03:28–09:17: 03:28 Ingreso ✓ › 03:30 Preingreso ✓ › 03:33 Salida 2 ✓ › 03:40 Playa 3 ✓ › 06:06 Balanza ✓ › 06:20 Ingreso SL ✓ › 08:19 Balanza ingreso SL ✓ › 09:00 Volcables SL ✓ › 09:14 Balanza egreso SL ✓ › 09:17 Egreso SL ✓
- 09:25–12:35: 09:25 Ingreso ✓ › 09:26 Preingreso ✓ › 09:28 Salida 2 ✓ › 09:43 Playa 3 ✓ › 10:10 Balanza ✓ › 10:29 Ingreso SL ✓ › 11:56 Balanza ingreso SL ✓ › 12:23 Volcables SL ✓ › 12:33 Balanza egreso SL ✓ › 12:35 Egreso SL ✓
- 12:42–16:10: 12:42 Ingreso ✓ › 12:45 Preingreso ✓ › 12:48 Salida 2 ✓ › Playa 3 ✗ › 14:38 Balanza ✓ › 14:51 Ingreso SL ✓ › 14:53 Balanza ingreso SL ✓ › 15:49 Volcables SL ✓ › 16:03 Balanza egreso SL ✓ › 16:10 Egreso SL ✓
- 16:23–22:16: 16:23 Ingreso ✓ › 16:25 Preingreso ✓ › 16:26 Salida 2 ✓ › Playa 3 ✗ › 18:40 Balanza ✓ (captura sin asignar) «NO10» › 20:01 Ingreso SL ✓ › 21:43 Balanza ingreso SL ✓ › 21:59 Volcables SL ✓ › 22:15 Balanza egreso SL ✓ › 22:16 Egreso SL ✓

### TZQ583 · carta (Girasol) · 1 viaje · faltan 2

- 09:35–21:06: 09:35 Ingreso ✓ › Preingreso ✗ › 11:33 Salida 2 ✓ › Playa 3 ✗ › 11:41 Balanza ✓ › 12:33 Ingreso SL ✓ › 14:03 Balanza ingreso SL ✓ › 14:22 Volcables SL ✓ › 14:33 Balanza egreso SL ✓ › 14:34 Egreso SL ✓ · de más: 15:05 Salida 2, 15:14 Playa 3, 17:39 Balanza, 21:06 Egreso SL

### WGG348 · balanza (SGC) · 2 viajes · faltan 2

- 09:29–16:20: 09:29 Ingreso SL ✓ › 10:39 Calada SL ✓ › 14:11 Balanza ingreso SL ✓ › 15:44 Carga OSL ✓ › Calada SL ✗ › Balanza ingreso SL ✗ › 16:17 Balanza egreso SL ✓ › 16:20 Egreso SL ✓
- 22:06–22:06: 22:06 Ingreso SL ✓ › Calada SL · sigue › Balanza ingreso SL · sigue › Carga OSL · sigue › Calada SL · sigue › Balanza ingreso SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AB323XZ · balanza (SGC) · 1 viaje · faltan 1

- 08:02–14:44: 08:14 Ingreso SL ✓ › 08:19 Calada SL ✓ › 11:37 Balanza ingreso SL ✓ › Carga OSL ✗ › 13:02 Calada SL ✓ › 13:38 Balanza ingreso SL ✓ › 13:43 Balanza egreso SL ✓ › 14:40 Egreso SL ✓ · de más: 08:02 Salida 2, 12:18 Balanza egreso SL

### AC182JK · carta (Soja) · 1 viaje · faltan 1

- 02:51–09:04: 02:51 Ingreso ✓ › 02:54 Preingreso ✓ › Calada ✗ › 04:10 Salida 2 ✓ › 04:21 Ingreso SL ✓ (captura sin asignar) «AGQ80K» › 06:08 Balanza ingreso SL ✓ › 08:40 Volcables SL ✓ › 08:52 Balanza egreso SL ✓ › 09:04 Egreso SL ✓

### AC746AD · carta (Soja) · 1 viaje · faltan 1

- 07:48–10:41: Ingreso ✗ entrada › 07:48 Preingreso ✓ › 08:27 Calada ✓ › 08:38 Salida 2 ✓ › 08:47 Ingreso SL ✓ › 08:49 Balanza ingreso SL ✓ › 10:28 Volcables SL ✓ › 10:39 Balanza egreso SL ✓ › 10:41 Egreso SL ✓

### AE305MN · carta (Soja) · 1 viaje · faltan 1

- 01:55–06:25: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:55 Balanza ingreso SL ✓ › 04:05 Volcables SL ✓ › 04:18 Balanza egreso SL ✓ › Egreso SL ✗ salida · de más: 04:19 Ingreso SL, 06:25 Balanza ingreso SL

### AE595JH · carta (Soja) · 1 viaje · faltan 1

- 09:19–12:19: Ingreso ✗ entrada › 09:19 Preingreso ✓ › 09:29 Calada ✓ › 09:43 Salida 2 ✓ › 09:55 Ingreso SL ✓ › 10:57 Balanza ingreso SL ✓ › 12:06 Volcables SL ✓ › 12:16 Balanza egreso SL ✓ › 12:19 Egreso SL ✓

### AE970IJ · carta (Soja) · 1 viaje · faltan 1

- 00:15–05:09: 00:15 Ingreso ✓ › 00:19 Preingreso ✓ › 01:10 Calada ✓ › 01:16 Salida 2 ✓ › 01:26 Ingreso SL ✓ › 04:00 Balanza ingreso SL ✓ › Volcables SL ✗ › 05:07 Balanza egreso SL ✓ › 05:09 Egreso SL ✓

### AG534QA · carta (Soja) · 1 viaje · faltan 1

- 17:35–20:15: Ingreso ✗ entrada › 17:35 Preingreso ✓ › 19:44 Calada ✓ › 19:49 Salida 2 ✓ › 19:57 Ingreso SL ✓ › 20:00 Balanza ingreso SL ✓ › 20:06 Volcables SL ✓ (captura sin asignar) «AE5940» › 20:13 Balanza egreso SL ✓ › 20:15 Egreso SL ✓

### AH210IQ · carta (Soja) · 1 viaje · faltan 1

- 17:53–20:40: 17:53 Ingreso ✓ › 17:57 Preingreso ✓ › 19:51 Calada ✓ › 20:02 Salida 2 ✓ › 20:11 Ingreso SL ✓ › Balanza ingreso SL ✗ › 20:28 Volcables SL ✓ › 20:38 Balanza egreso SL ✓ › 20:40 Egreso SL ✓

### AI078MZ · carta (Soja) · 2 viajes · faltan 1

- 00:42–02:34: 00:42 Ingreso ✓ › 00:46 Preingreso ✓ › 01:19 Calada ✓ › 01:38 Salida 2 ✓ › 01:56 Ingreso SL ✓ › 02:08 Balanza ingreso SL ✓ › Volcables SL ✗ › 02:29 Balanza egreso SL ✓ › 02:34 Egreso SL ✓
- 02:46–11:49: 02:46 Ingreso ✓ › 09:14 Preingreso ✓ › 09:25 Calada ✓ › 09:42 Salida 2 ✓ › 09:51 Ingreso SL ✓ › 10:38 Balanza ingreso SL ✓ › 11:29 Volcables SL ✓ › 11:47 Balanza egreso SL ✓ › 11:49 Egreso SL ✓

### AI217CK · carta (Soja) · 1 viaje · faltan 1

- 13:19–18:00: 13:19 Ingreso ✓ › 13:22 Preingreso ✓ › 13:49 Calada ✓ › 16:54 Salida 2 ✓ › 17:05 Ingreso SL ✓ › Balanza ingreso SL ✗ › 17:48 Volcables SL ✓ › 17:57 Balanza egreso SL ✓ › 18:00 Egreso SL ✓

### BTA118 · carta (Soja) · 1 viaje · faltan 1

- 02:28–08:15: 02:28 Ingreso ✓ › 02:30 Preingreso ✓ (captura sin asignar) «AB049I6» › Calada ✗ › 03:54 Salida 2 ✓ › 04:07 Ingreso SL ✓ (captura sin asignar) «TT11» › 06:00 Balanza ingreso SL ✓ › 08:00 Volcables SL ✓ › 08:12 Balanza egreso SL ✓ › 08:15 Egreso SL ✓

### CBO018 · carta (Soja) · 1 viaje · faltan 1

- 23:58–23:58: Ingreso ✗ entrada › 23:58 Preingreso ✓ › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### CGK036 · carta (Soja) · 1 viaje · faltan 1

- 01:13–06:19: 01:13 Ingreso ✓ › 01:15 Preingreso ✓ › 01:31 Calada ✓ › 01:39 Salida 2 ✓ › 01:58 Ingreso SL ✓ › 04:32 Balanza ingreso SL ✓ › Volcables SL ✗ › 06:17 Balanza egreso SL ✓ › 06:19 Egreso SL ✓

### CXC808 · carta (Soja) · 1 viaje · faltan 1

- 00:03–01:50: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 00:03 Balanza ingreso SL ✓ › Volcables SL ✗ › 01:47 Balanza egreso SL ✓ › 01:50 Egreso SL ✓

### ECX249 · carta (Girasol) · 3 viajes · faltan 1

- 05:00–09:47: 05:00 Ingreso ✓ › 05:02 Preingreso ✓ › 05:04 Salida 2 ✓ › Playa 3 ✗ › 07:23 Balanza ✓ › 07:42 Ingreso SL ✓ › 09:06 Balanza ingreso SL ✓ › 09:33 Volcables SL ✓ › 09:45 Balanza egreso SL ✓ › 09:47 Egreso SL ✓
- 09:55–13:26: 09:55 Ingreso ✓ › 10:15 Preingreso ✓ › 10:17 Salida 2 ✓ › 10:35 Playa 3 ✓ › 11:01 Balanza ✓ › 11:20 Ingreso SL ✓ › 12:44 Balanza ingreso SL ✓ › 13:10 Volcables SL ✓ › 13:24 Balanza egreso SL ✓ › 13:26 Egreso SL ✓
- 13:39–17:31: 13:39 Ingreso ✓ › 13:42 Preingreso ✓ › 13:44 Salida 2 ✓ › 13:50 Playa 3 ✓ › 15:34 Balanza ✓ › 15:53 Ingreso SL ✓ › 15:55 Balanza ingreso SL ✓ › 17:06 Volcables SL ✓ › 17:29 Balanza egreso SL ✓ › 17:31 Egreso SL ✓

### EGR861 · carta (Soja) · 1 viaje · faltan 1

- 01:29–06:41: 01:29 Ingreso ✓ › 01:32 Preingreso ✓ › 03:25 Calada ✓ › 03:37 Salida 2 ✓ › 03:48 Ingreso SL ✓ › Balanza ingreso SL ✗ › 06:27 Volcables SL ✓ › 06:39 Balanza egreso SL ✓ › 06:41 Egreso SL ✓

### FFU248 · carta (Soja) · 1 viaje · faltan 1

- 18:26–22:29: 18:26 Ingreso ✓ › 18:27 Preingreso ✓ › 20:00 Calada ✓ › 20:12 Salida 2 ✓ › 20:21 Ingreso SL ✓ › 20:26 Balanza ingreso SL ✓ › Volcables SL ✗ › 22:27 Balanza egreso SL ✓ › 22:29 Egreso SL ✓

### FLU335 · carta (Soja) · 1 viaje · faltan 1

- 14:28–16:16: 14:28 Ingreso ✓ › Preingreso ✗ › 15:08 Calada ✓ › 15:23 Salida 2 ✓ › 15:33 Ingreso SL ✓ › 15:39 Balanza ingreso SL ✓ › 16:03 Volcables SL ✓ › 16:14 Balanza egreso SL ✓ › 16:16 Egreso SL ✓

### FPT058 · carta (Soja) · 1 viaje · faltan 1

- 02:37–08:43: 02:37 Ingreso ✓ › 02:40 Preingreso ✓ › 03:47 Calada ✓ › Salida 2 ✗ › 04:12 Ingreso SL ✓ (captura sin asignar) «L058» › 06:03 Balanza ingreso SL ✓ › 08:18 Volcables SL ✓ › 08:40 Balanza egreso SL ✓ › 08:43 Egreso SL ✓

### FVK909 · carta (Soja) · 1 viaje · faltan 1

- 21:48–23:04: Ingreso ✗ entrada › 21:48 Preingreso ✓ › 22:16 Calada ✓ (captura sin asignar) «606» › 21:49 Salida 2 ✓ (captura sin asignar) «AS1674» › 23:04 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### GAB788 · carta (Soja) · 1 viaje · faltan 1

- 22:00–23:13: Ingreso ✗ entrada › 22:00 Preingreso ✓ › 22:49 Calada ✓ › 22:57 Salida 2 ✓ › 23:11 Ingreso SL ✓ › 23:13 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### GKV260 · carta (Soja) · 1 viaje · faltan 1

- 02:50–22:21: 02:50 Ingreso ✓ › 02:52 Preingreso ✓ › 03:51 Calada ✓ › 19:37 Salida 2 ✓ › 19:48 Ingreso SL ✓ › 20:55 Balanza ingreso SL ✓ › Volcables SL ✗ › 22:20 Balanza egreso SL ✓ › 22:21 Egreso SL ✓

### HHX097 · carta (Soja) · 1 viaje · faltan 1

- 08:58–13:17: Ingreso ✗ entrada › 08:58 Preingreso ✓ › 09:22 Calada ✓ › 11:24 Salida 2 ✓ › 11:33 Ingreso SL ✓ › 11:42 Balanza ingreso SL ✓ › 12:53 Volcables SL ✓ › 13:12 Balanza egreso SL ✓ › 13:17 Egreso SL ✓

### HRK728 · carta (Soja) · 1 viaje · faltan 1

- 12:43–15:05: Ingreso ✗ entrada › 12:43 Preingreso ✓ › 13:37 Calada ✓ › 13:51 Salida 2 ✓ › 14:01 Ingreso SL ✓ › 14:08 Balanza ingreso SL ✓ › 14:48 Volcables SL ✓ › 15:01 Balanza egreso SL ✓ › 15:05 Egreso SL ✓

### IJW012 · carta (Soja) · 1 viaje · faltan 1

- 19:12–21:37: 19:12 Ingreso ✓ › 19:15 Preingreso ✓ › 20:02 Calada ✓ › 20:10 Salida 2 ✓ › 20:19 Ingreso SL ✓ › 20:23 Balanza ingreso SL ✓ › Volcables SL ✗ › 21:35 Balanza egreso SL ✓ › 21:37 Egreso SL ✓

### KFI947 · carta (Soja) · 1 viaje · faltan 1

- 01:43–02:42: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:43 Balanza ingreso SL ✓ › Volcables SL ✗ › 02:40 Balanza egreso SL ✓ › 02:42 Egreso SL ✓

### KKW159 · carta (Soja) · 1 viaje · faltan 1

- 01:46–03:38: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:46 Balanza ingreso SL ✓ › Volcables SL ✗ › 03:36 Balanza egreso SL ✓ › 03:38 Egreso SL ✓

### MKA520 · carta (Soja) · 1 viaje · faltan 1

- 00:24–05:23: Ingreso · antes de las 00 › 00:24 Preingreso ✓ › 01:14 Calada ✓ › 01:20 Salida 2 ✓ › 01:34 Ingreso SL ✓ › 04:03 Balanza ingreso SL ✓ › Volcables SL ✗ › 05:22 Balanza egreso SL ✓ › 05:23 Egreso SL ✓

### MLU516 · carta (Soja) · 1 viaje · faltan 1

- 03:47–19:04: 03:47 Ingreso ✓ › 03:51 Preingreso ✓ › Calada ✗ › 04:18 Salida 2 ✓ › 04:30 Ingreso SL ✓ › 06:19 Balanza ingreso SL ✓ › 09:14 Volcables SL ✓ › 09:31 Balanza egreso SL ✓ › 09:36 Egreso SL ✓

### MWF903 · carta (Soja) · 1 viaje · faltan 1

- 01:48–03:47: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:48 Balanza ingreso SL ✓ › Volcables SL ✗ › 03:45 Balanza egreso SL ✓ › 03:47 Egreso SL ✓

### NIK722 · carta (Soja) · 1 viaje · faltan 1

- 00:03–04:53: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › 00:03 Ingreso SL ✓ › 00:04 Balanza ingreso SL ✓ (captura sin asignar) «HC514» › Volcables SL ✗ › 00:07 Balanza egreso SL ✓ (captura sin asignar) «CD769» › 04:53 Egreso SL ✓

### OFM290 · carta (Soja) · 1 viaje · faltan 1

- 20:27–23:58: Ingreso ✗ entrada › 20:27 Preingreso ✓ › 20:50 Calada ✓ › 21:14 Salida 2 ✓ (captura sin asignar) «C49» › 21:47 Ingreso SL ✓ (captura sin asignar) «CIW» › 22:59 Balanza ingreso SL ✓ (captura sin asignar) «ERMAN» › 23:44 Volcables SL ✓ › 23:56 Balanza egreso SL ✓ (captura sin asignar) «AE6790» › 23:58 Egreso SL ✓

### OKH237 · carta (Soja) · 1 viaje · faltan 1

- 00:16–02:47: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:16 Volcables SL ✓ › 00:25 Balanza egreso SL ✓ › Egreso SL ✗ salida · de más: 00:26 Ingreso SL, 02:47 Balanza egreso SL

### OXQ330 · carta (Soja) · 1 viaje · faltan 1

- 09:25–13:51: Ingreso ✗ entrada › 09:25 Preingreso ✓ › 11:17 Calada ✓ › 11:35 Salida 2 ✓ › 11:46 Ingreso SL ✓ › 12:06 Balanza ingreso SL ✓ › 13:38 Volcables SL ✓ › 13:49 Balanza egreso SL ✓ › 13:51 Egreso SL ✓

### OYS529 · carta (Soja) · 1 viaje · faltan 1

- 01:53–02:36: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:53 Balanza ingreso SL ✓ › Volcables SL ✗ › 02:30 Balanza egreso SL ✓ › 02:36 Egreso SL ✓

### PGI754 · carta (Soja) · 1 viaje · faltan 1

- 17:59–21:45: 17:59 Ingreso ✓ › 18:01 Preingreso ✓ › 19:55 Calada ✓ › 20:10 Salida 2 ✓ › 20:20 Ingreso SL ✓ › 20:24 Balanza ingreso SL ✓ › Volcables SL ✗ › 21:42 Balanza egreso SL ✓ › 21:45 Egreso SL ✓

### SPH903 · carta (Soja) · 1 viaje · faltan 1

- 23:04–23:39: Ingreso ✗ entrada › 23:04 Preingreso ✓ › 23:12 Calada ✓ (captura sin asignar) «CICSBC1» › 23:28 Salida 2 ✓ › 23:39 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### VBZ900 · carta (Soja) · 1 viaje · faltan 1

- 00:41–03:26: 00:41 Ingreso ✓ › 00:44 Preingreso ✓ › 01:20 Calada ✓ › 01:38 Salida 2 ✓ › 01:55 Ingreso SL ✓ › 02:06 Balanza ingreso SL ✓ › Volcables SL ✗ › 03:24 Balanza egreso SL ✓ › 03:26 Egreso SL ✓

### VHT928 · carta (Soja) · 1 viaje · faltan 1

- 19:44–23:40: 19:44 Ingreso ✓ › 19:48 Preingreso ✓ (captura sin asignar) «GF5» › 19:47 Calada ✓ (captura sin asignar) «VIS6» › 20:23 Salida 2 ✓ › 20:32 Ingreso SL ✓ › 20:36 Balanza ingreso SL ✓ › Volcables SL ✗ › 23:40 Balanza egreso SL ✓ › Egreso SL · sigue

### AA001QA · carta (Soja) · 2 viajes · completo

- 21:54–23:06: 21:54 Ingreso ✓ › 22:04 Preingreso ✓ › 22:58 Calada ✓ › 23:06 Salida 2 ✓ › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue
- 23:19–23:44: 23:19 Ingreso ✓ › 23:21 Preingreso ✓ › 23:26 Calada ✓ › 23:36 Salida 2 ✓ › 23:44 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AA122NM · carta (Soja) · 1 viaje · completo

- 21:53–23:19: 21:53 Ingreso ✓ › 22:01 Preingreso ✓ › 22:53 Calada ✓ › 23:02 Salida 2 ✓ › 23:16 Ingreso SL ✓ › 23:19 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AA338BT · carta (Soja) · 1 viaje · completo

- 21:59–23:20: 21:59 Ingreso ✓ › 22:06 Preingreso ✓ › 23:04 Calada ✓ › 23:20 Salida 2 ✓ › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AA539HA · carta (Soja) · 1 viaje · completo

- 01:50–03:55: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:50 Balanza ingreso SL ✓ › 03:43 Volcables SL ✓ › 03:54 Balanza egreso SL ✓ › 03:55 Egreso SL ✓

### AA581UQ · carta (Soja) · 1 viaje · completo

- 00:00–04:45: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › 00:00 Ingreso SL ✓ › 01:56 Balanza ingreso SL ✓ › 04:15 Volcables SL ✓ › 04:43 Balanza egreso SL ✓ › 04:45 Egreso SL ✓

### AA656AL · carta (Soja) · 1 viaje · completo

- 02:01–08:48: 02:01 Ingreso ✓ › 02:05 Preingreso ✓ › 03:38 Calada ✓ › 04:09 Salida 2 ✓ › 04:19 Ingreso SL ✓ › 06:05 Balanza ingreso SL ✓ › 08:33 Volcables SL ✓ › 08:45 Balanza egreso SL ✓ › 08:48 Egreso SL ✓

### AA672TM · carta (Soja) · 1 viaje · completo

- 13:46–15:44: 13:46 Ingreso ✓ › 13:48 Preingreso ✓ › 13:57 Calada ✓ › 14:06 Salida 2 ✓ › 14:15 Ingreso SL ✓ › 14:30 Balanza ingreso SL ✓ › 15:32 Volcables SL ✓ › 15:41 Balanza egreso SL ✓ › 15:44 Egreso SL ✓

### AA703FC · Permitido (residuos) · 5 viajes · completo

- 07:08–07:08 · sin recorrido de referencia: 07:08 Egreso SL
- 08:07–10:59 · sin recorrido de referencia: 08:07 Ingreso SL › 08:10 Balanza ingreso SL › 08:12 Renova › 10:58 Balanza egreso SL › 10:59 Egreso SL
- 11:42–13:03 · sin recorrido de referencia: 11:42 Ingreso SL › 11:45 Balanza ingreso SL › 11:47 Renova › 13:01 Balanza egreso SL › 13:03 Egreso SL
- 13:58–15:14 · sin recorrido de referencia: 13:58 Ingreso SL › 14:05 Balanza ingreso SL › 14:06 Renova › 15:11 Balanza egreso SL › 15:14 Egreso SL
- 18:58–19:13 · sin recorrido de referencia: 18:58 Ingreso SL › 19:09 Balanza ingreso SL › 19:13 Renova

### AA734TQ · carta (Soja) · 1 viaje · completo

- 08:08–11:09: 08:08 Ingreso ✓ › 08:10 Preingreso ✓ › 08:36 Calada ✓ › 08:42 Salida 2 ✓ › 08:50 Ingreso SL ✓ › 09:37 Balanza ingreso SL ✓ › 10:53 Volcables SL ✓ › 11:03 Balanza egreso SL ✓ › 11:09 Egreso SL ✓

### AA737CA · carta (Soja) · 1 viaje · completo

- 00:01–02:47: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › 00:01 Ingreso SL ✓ › 01:57 Balanza ingreso SL ✓ › 02:36 Volcables SL ✓ (captura sin asignar) «A37PA» › 02:42 Balanza egreso SL ✓ › 02:47 Egreso SL ✓

### AA764XO · carta (Soja) · 1 viaje · completo

- 11:51–14:24: 11:51 Ingreso ✓ › 11:55 Preingreso ✓ › 13:31 Calada ✓ › 13:41 Salida 2 ✓ › 13:51 Ingreso SL ✓ › 13:56 Balanza ingreso SL ✓ › 14:14 Volcables SL ✓ › 14:23 Balanza egreso SL ✓ › 14:24 Egreso SL ✓

### AA798TZ · carta (Soja) · 1 viaje · completo

- 10:50–14:13: 10:50 Ingreso ✓ › 10:54 Preingreso ✓ › 11:33 Calada ✓ › 11:50 Salida 2 ✓ › 12:02 Ingreso SL ✓ › 12:12 Balanza ingreso SL ✓ › 13:57 Volcables SL ✓ › 14:10 Balanza egreso SL ✓ › 14:12 Egreso SL ✓

### AB290FT · carta (Soja) · 1 viaje · completo

- 23:04–23:22: 23:04 Ingreso ✓ › 23:07 Preingreso ✓ › 23:22 Calada ✓ › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AB430IE · carta (Soja) · 1 viaje · completo

- 20:45–23:04: 20:45 Ingreso ✓ › 20:47 Preingreso ✓ › 22:25 Calada ✓ › 22:53 Salida 2 ✓ › 23:04 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AB471SE · balanza (SGC) · 1 viaje · completo

- 10:20–12:50: 10:20 Ingreso SL ✓ › 10:22 Calada SL ✓ › 10:34 Balanza ingreso SL ✓ › 11:16 Carga OSL ✓ › 11:42 Calada SL ✓ › 11:46 Balanza ingreso SL ✓ › 11:56 Balanza egreso SL ✓ › 12:50 Egreso SL ✓

### AB539ZZ · carta (Soja) · 1 viaje · completo

- 13:12–15:21: 13:12 Ingreso ✓ › 13:15 Preingreso ✓ › 13:44 Calada ✓ › 13:55 Salida 2 ✓ › 14:03 Ingreso SL ✓ › 14:17 Balanza ingreso SL ✓ › 15:10 Volcables SL ✓ › 15:19 Balanza egreso SL ✓ › 15:21 Egreso SL ✓

### AB700WH · carta (Soja) · 1 viaje · completo

- 09:35–13:26: 09:35 Ingreso ✓ › 10:07 Preingreso ✓ › 11:17 Calada ✓ › 11:36 Salida 2 ✓ › 11:48 Ingreso SL ✓ › 11:58 Balanza ingreso SL ✓ › 13:09 Volcables SL ✓ › 13:23 Balanza egreso SL ✓ › 13:26 Egreso SL ✓

### AB721IE · carta (Soja) · 1 viaje · completo

- 22:02–23:32: 22:02 Ingreso ✓ › 22:09 Preingreso ✓ › 23:09 Calada ✓ › 23:22 Salida 2 ✓ › 23:32 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AB734VW · carta (Soja) · 1 viaje · completo

- 08:51–11:32: 08:51 Ingreso ✓ › 08:53 Preingreso ✓ › 09:14 Calada ✓ › 09:24 Salida 2 ✓ › 09:39 Ingreso SL ✓ › 10:26 Balanza ingreso SL ✓ › 11:09 Volcables SL ✓ › 11:29 Balanza egreso SL ✓ › 11:32 Egreso SL ✓

### AB810JK · carta (Soja) · 1 viaje · completo

- 00:01–00:13: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:01 Volcables SL ✓ › 00:11 Balanza egreso SL ✓ › 00:13 Egreso SL ✓

### AC026RV · camión (clasificado) · 1 viaje · completo

- 12:54–14:19 · sin recorrido de referencia: 12:54 Egreso SL

### AC555AB · Permitido (varios) · 1 viaje · completo

- 01:44–02:55: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Balanza · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › Ingreso SL · antes de las 00 › 01:44 Balanza ingreso SL ✓ › 02:41 Volcables SL ✓ › 02:53 Balanza egreso SL ✓ › 02:55 Egreso SL ✓

### AC648LW · carta (Soja) · 1 viaje · completo

- 09:55–13:41: 09:55 Ingreso ✓ › 10:15 Preingreso ✓ › 11:25 Calada ✓ › 11:38 Salida 2 ✓ › 11:49 Ingreso SL ✓ › 12:03 Balanza ingreso SL ✓ › 13:31 Volcables SL ✓ › 13:39 Balanza egreso SL ✓ › 13:41 Egreso SL ✓

### AC662EP · carta (Soja) · 1 viaje · completo

- 22:09–23:29: 22:09 Ingreso ✓ › 22:11 Preingreso ✓ › 23:12 Calada ✓ › 23:19 Salida 2 ✓ › 23:29 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AC771HD · carta (Cártamo) · 1 viaje · completo

- 19:17–20:47 · sin recorrido de referencia: 19:17 Ingreso › 19:20 Preingreso › 20:47 Calada

### AC978CI · carta (Soja) · 1 viaje · completo

- 14:58–19:50: 14:58 Ingreso ✓ › 15:05 Preingreso ✓ › 17:14 Calada ✓ › 17:31 Salida 2 ✓ › 17:40 Ingreso SL ✓ › 17:43 Balanza ingreso SL ✓ › 19:20 Volcables SL ✓ › 19:47 Balanza egreso SL ✓ › 19:50 Egreso SL ✓

### AD066NJ · carta (Soja) · 1 viaje · completo

- 21:58–23:26: 21:58 Ingreso ✓ › 22:06 Preingreso ✓ › 23:02 Calada ✓ › 23:10 Salida 2 ✓ › 23:21 Ingreso SL ✓ › 23:26 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AD589YL · carta (Soja) · 1 viaje · completo

- 23:52–23:54: 23:52 Ingreso ✓ › 23:54 Preingreso ✓ › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AD656ZT · carta (Soja) · 1 viaje · completo

- 15:27–18:54: 15:27 Ingreso ✓ › 15:29 Preingreso ✓ › 17:18 Calada ✓ › 17:29 Salida 2 ✓ › 17:39 Ingreso SL ✓ › 17:42 Balanza ingreso SL ✓ › 18:41 Volcables SL ✓ › 18:51 Balanza egreso SL ✓ › 18:54 Egreso SL ✓

### AD829RW · camión (clasificado) · 1 viaje · completo

- 22:47–23:37 · sin recorrido de referencia: 22:47 Preingreso › 23:19 Calada › 23:37 Salida 2

### AD829RY · Permitido (residuos) · 1 viaje · completo

- 08:58–16:56 · sin recorrido de referencia: 08:58 Ingreso SL › 09:03 Balanza ingreso SL › 16:42 Calada SL › 16:47 Balanza ingreso SL › 16:54 Balanza egreso SL › 16:56 Egreso SL

### AD863BG · carta (Soja) · 1 viaje · completo

- 11:43–18:42: 11:43 Ingreso ✓ › 11:45 Preingreso ✓ › 13:27 Calada ✓ › 16:59 Salida 2 ✓ › 17:09 Ingreso SL ✓ › 17:29 Balanza ingreso SL ✓ › 18:10 Volcables SL ✓ › 18:38 Balanza egreso SL ✓ › 18:42 Egreso SL ✓

### AD864KS · carta (Cártamo) · 1 viaje · completo

- 08:28–14:00 · sin recorrido de referencia: 08:28 Ingreso › 08:31 Preingreso › 09:32 Calada › 11:44 Salida 2 › 13:41 Silo Keppler › 14:00 Balanza

### AD872CS · carta (Soja) · 1 viaje · completo

- 02:37–08:43: 02:37 Ingreso ✓ › 02:41 Preingreso ✓ › 03:51 Calada ✓ › 04:03 Salida 2 ✓ › 04:13 Ingreso SL ✓ › 06:04 Balanza ingreso SL ✓ › 08:27 Volcables SL ✓ › 08:39 Balanza egreso SL ✓ › 08:43 Egreso SL ✓

### ADE342 · camión (clasificado) · 1 viaje · completo

- 22:13–22:13 · sin recorrido de referencia: 22:13 Ingreso

### AE262TO · carta (Soja) · 1 viaje · completo

- 17:52–20:54: 17:52 Ingreso ✓ › 17:55 Preingreso ✓ › 19:47 Calada ✓ › 20:06 Salida 2 ✓ › 20:17 Ingreso SL ✓ › 20:21 Balanza ingreso SL ✓ › 20:35 Volcables SL ✓ › 20:50 Balanza egreso SL ✓ › 20:54 Egreso SL ✓

### AE412GZ · carta (Soja) · 1 viaje · completo

- 08:52–11:33: 08:52 Ingreso ✓ › 08:54 Preingreso ✓ › 09:20 Calada ✓ › 09:26 Salida 2 ✓ › 09:40 Ingreso SL ✓ › 10:30 Balanza ingreso SL ✓ › 11:18 Volcables SL ✓ › 11:31 Balanza egreso SL ✓ › 11:33 Egreso SL ✓

### AE551WI · carta (Cártamo) · 1 viaje · completo

- 00:31–02:30 · sin recorrido de referencia: 00:31 Salida 2 › 00:37 Balanza › 00:44 Playa 3 › 01:44 Silo Keppler › 02:30 Balanza

### AE556ZN · balanza (SGC) · 1 viaje · completo

- 21:10–21:15: Ingreso SL · sigue › Calada SL · sigue › Balanza ingreso SL · sigue › Carga OSL · sigue › Calada SL · sigue › Balanza ingreso SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue · de más: 21:10 Ingreso, 21:15 Preingreso

### AE613UK · carta (Soja) · 1 viaje · completo

- 05:49–12:53: 05:49 Ingreso ✓ › 05:52 Preingreso ✓ › 06:04 Calada ✓ › 06:11 Salida 2 ✓ › 11:32 Ingreso SL ✓ › 11:36 Balanza ingreso SL ✓ › 12:34 Volcables SL ✓ › 12:48 Balanza egreso SL ✓ › 12:53 Egreso SL ✓

### AE624GL · balanza (SGC) · 1 viaje · completo

- 21:10–21:16: Ingreso SL · sigue › Calada SL · sigue › Balanza ingreso SL · sigue › Carga OSL · sigue › Calada SL · sigue › Balanza ingreso SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue · de más: 21:10 Ingreso, 21:16 Preingreso

### AE757VF · carta (Soja) · 1 viaje · completo

- 22:35–23:31: 22:35 Ingreso ✓ › 22:37 Preingreso ✓ › 23:15 Calada ✓ › 23:21 Salida 2 ✓ › 23:31 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AE788EB · carta (Soja) · 1 viaje · completo

- 17:59–20:57: 17:59 Ingreso ✓ › 18:02 Preingreso ✓ › 19:57 Calada ✓ › 20:10 Salida 2 ✓ › 20:19 Ingreso SL ✓ › 20:22 Balanza ingreso SL ✓ › 20:42 Volcables SL ✓ › 20:55 Balanza egreso SL ✓ › 20:57 Egreso SL ✓

### AE792UC · carta (Cártamo) · 2 viajes · completo

- 16:10–20:44 · sin recorrido de referencia: 16:10 Ingreso › 16:14 Preingreso › 16:50 Calada › 19:46 Salida 2 › 19:51 Balanza › 20:04 Playa 3 › 20:10 Silo Keppler › 20:44 Balanza
- 21:06–21:10 · sin recorrido de referencia: 21:06 Ingreso › 21:10 Salida 2

### AE969TC · carta (Grano 82) · 2 viajes · completo

- 09:57–09:57 · sin recorrido de referencia: 09:57 Balanza
- 11:33–18:16 · sin recorrido de referencia: 11:33 Ingreso › 11:35 Preingreso › 11:50 Calada › 13:13 Preingreso › 13:18 Calada › 17:42 Salida 2 › 17:56 Playa 3 › 18:03 Silo Keppler › 18:16 Balanza

### AF364FG · carta (Soja) · 1 viaje · completo

- 19:36–22:47: 19:36 Ingreso ✓ › 19:40 Preingreso ✓ › 20:04 Calada ✓ › 20:16 Salida 2 ✓ › 20:25 Ingreso SL ✓ › 20:27 Balanza ingreso SL ✓ › 22:30 Volcables SL ✓ › 22:42 Balanza egreso SL ✓ › 22:47 Egreso SL ✓

### AF427ML · carta (Soja) · 1 viaje · completo

- 00:20–06:32: 00:20 Ingreso ✓ › 00:24 Preingreso ✓ › 01:12 Calada ✓ › 01:41 Salida 2 ✓ › 01:59 Ingreso SL ✓ › 04:34 Balanza ingreso SL ✓ › 06:16 Volcables SL ✓ › 06:30 Balanza egreso SL ✓ › 06:32 Egreso SL ✓

### AF586XE · Permitido (residuos) · 2 viajes · completo

- 10:53–11:33 · sin recorrido de referencia: 10:53 Ingreso › 10:59 Preingreso › 11:13 Salida 2 › 11:33 Balanza
- 11:38–11:58 · sin recorrido de referencia: 11:38 Ingreso › 11:51 Salida 2 › 11:58 Balanza

### AF652GK · carta (Soja) · 1 viaje · completo

- 11:34–23:09: 11:34 Ingreso ✓ › 11:36 Preingreso ✓ › 13:19 Calada ✓ › 19:38 Salida 2 ✓ › 19:50 Ingreso SL ✓ › 21:10 Balanza ingreso SL ✓ › 22:57 Volcables SL ✓ › 23:07 Balanza egreso SL ✓ › 23:09 Egreso SL ✓

### AF804QL · Permitido (residuos) · 2 viajes · completo

- 06:51–15:45 · sin recorrido de referencia: 06:51 Ingreso › 07:07 Preingreso › 07:30 Calada › 07:55 Preingreso › 07:57 Calada › 08:00 Salida 2 › 13:18 Playa 3 › 15:45 Balanza
- 15:48–21:10 · sin recorrido de referencia: 15:48 Ingreso › 15:50 Calada › 16:52 Salida 2 › 21:10 Balanza ingreso SL

### AG118NG · carta (Soja) · 1 viaje · completo

- 00:23–07:28: 00:23 Ingreso ✓ › 00:26 Preingreso ✓ › 01:16 Calada ✓ › 01:21 Salida 2 ✓ › 01:35 Ingreso SL ✓ › 04:39 Balanza ingreso SL ✓ › 07:16 Volcables SL ✓ › 07:25 Balanza egreso SL ✓ › 07:28 Egreso SL ✓

### AG344FQ · Permitido (residuos) · 1 viaje · completo

- 09:34–11:08 · sin recorrido de referencia: 09:34 Ingreso SL › 10:08 Balanza ingreso SL › 10:57 Calada SL › 11:05 Balanza egreso SL › 11:08 Egreso SL

### AG457GP · carta (Cártamo) · 1 viaje · completo

- 12:55–17:20 · sin recorrido de referencia: 12:55 Ingreso › 13:01 Preingreso › 14:00 Calada › 16:22 Salida 2 › 16:42 Playa 3 › 16:57 Silo Keppler › 17:20 Balanza

### AG547OS · carta (Soja) · 1 viaje · completo

- 11:12–22:36: 11:12 Ingreso ✓ › 11:15 Preingreso ✓ › 11:28 Calada ✓ › 19:29 Salida 2 ✓ › 19:43 Ingreso SL ✓ › 21:01 Balanza ingreso SL ✓ › 22:25 Volcables SL ✓ › 22:34 Balanza egreso SL ✓ › 22:36 Egreso SL ✓

### AG626RF · carta (Soja) · 1 viaje · completo

- 17:52–20:28: 17:52 Ingreso ✓ › 17:56 Preingreso ✓ › 19:49 Calada ✓ › 19:59 Salida 2 ✓ › 20:06 Ingreso SL ✓ › 20:09 Balanza ingreso SL ✓ › 20:20 Volcables SL ✓ › 20:26 Balanza egreso SL ✓ › 20:28 Egreso SL ✓

### AG658PF · carta (Cártamo) · 1 viaje · completo

- 00:29–00:49 · sin recorrido de referencia: 00:29 Salida 2 › 00:41 Playa 3 › 00:49 Silo Keppler

### AG665UO · carta (Soja) · 1 viaje · completo

- 22:38–23:35: 22:38 Ingreso ✓ › 22:41 Preingreso ✓ › 23:17 Calada ✓ › 23:25 Salida 2 ✓ › 23:35 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AG767ID · carta (Soja) · 1 viaje · completo

- 04:38–10:08: 04:38 Ingreso ✓ › 04:40 Preingreso ✓ › 05:55 Calada ✓ › 06:07 Salida 2 ✓ › 06:16 Ingreso SL ✓ › 08:05 Balanza ingreso SL ✓ › 09:53 Volcables SL ✓ › 10:06 Balanza egreso SL ✓ › 10:08 Egreso SL ✓

### AG854QE · carta (Soja) · 1 viaje · completo

- 11:55–14:31: 11:55 Ingreso ✓ › 11:57 Preingreso ✓ › 13:34 Calada ✓ › 13:38 Salida 2 ✓ › 13:49 Ingreso SL ✓ › 13:59 Balanza ingreso SL ✓ › 14:19 Volcables SL ✓ › 14:28 Balanza egreso SL ✓ › 14:31 Egreso SL ✓

### AG861VQ · carta (Soja) · 1 viaje · completo

- 05:39–09:49: 05:39 Ingreso ✓ › 05:43 Preingreso ✓ › 05:58 Calada ✓ › 06:05 Salida 2 ✓ › 06:15 Ingreso SL ✓ › 07:59 Balanza ingreso SL ✓ › 09:38 Volcables SL ✓ › 09:47 Balanza egreso SL ✓ › 09:49 Egreso SL ✓

### AH109KN · carta (Soja) · 1 viaje · completo

- 21:54–23:24: 21:54 Ingreso ✓ › 22:04 Preingreso ✓ › 22:59 Calada ✓ › 23:07 Salida 2 ✓ (captura sin asignar) «PKN» › 23:20 Ingreso SL ✓ › 23:24 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AH314OM · carta (Soja) · 1 viaje · completo

- 00:52–03:00: 00:52 Ingreso ✓ › 00:55 Preingreso ✓ › 01:26 Calada ✓ › 01:33 Salida 2 ✓ › 01:51 Ingreso SL ✓ › 02:03 Balanza ingreso SL ✓ › 02:48 Volcables SL ✓ › 02:57 Balanza egreso SL ✓ › 03:00 Egreso SL ✓

### AH321TK · carta (Soja) · 1 viaje · completo

- 17:50–20:25: 17:50 Ingreso ✓ › 17:53 Preingreso ✓ › 19:44 Calada ✓ › 19:51 Salida 2 ✓ › 20:01 Ingreso SL ✓ › 20:03 Balanza ingreso SL ✓ › 20:12 Volcables SL ✓ › 20:23 Balanza egreso SL ✓ › 20:25 Egreso SL ✓

### AH391GM · Permitido (alcohol burlanda) · 1 viaje · completo

- 01:39–04:34 · sin recorrido de referencia: 01:39 Balanza ingreso SL › 02:05 Balanza egreso SL › 02:08 Ingreso SL › 04:34 Balanza ingreso SL

### AH424ZJ · carta (Soja) · 1 viaje · completo

- 23:38–23:40: 23:38 Ingreso ✓ › 23:40 Preingreso ✓ › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AH579IA · carta (Soja) · 1 viaje · completo

- 21:53–23:20: 21:53 Ingreso ✓ › 22:02 Preingreso ✓ › 22:55 Calada ✓ › 23:03 Salida 2 ✓ › 23:17 Ingreso SL ✓ › 23:20 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AI211ER · carta (Soja) · 1 viaje · completo

- 06:37–10:33: 06:37 Ingreso ✓ › 06:39 Preingreso ✓ › 07:46 Calada ✓ › 08:09 Salida 2 ✓ › 08:22 Ingreso SL ✓ › 08:24 Balanza ingreso SL ✓ › 10:19 Volcables SL ✓ › 10:31 Balanza egreso SL ✓ › 10:33 Egreso SL ✓

### AI354IY · carta (Soja) · 1 viaje · completo

- 23:59–23:59: 23:59 Ingreso ✓ › Preingreso · sigue › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### AXC536 · carta (Soja) · 1 viaje · completo

- 15:29–19:59: 15:29 Ingreso ✓ › 15:32 Preingreso ✓ › 17:21 Calada ✓ › 17:35 Salida 2 ✓ › 17:45 Ingreso SL ✓ › 18:00 Balanza ingreso SL ✓ › 19:45 Volcables SL ✓ › 19:57 Balanza egreso SL ✓ › 19:59 Egreso SL ✓

### AZI817 · carta (Cártamo) · 2 viajes · completo

- 15:21–17:55 · sin recorrido de referencia: 15:21 Ingreso › 15:24 Preingreso › 16:50 Calada › 17:55 Salida 2
- 23:05–23:30 · sin recorrido de referencia: 23:05 Ingreso › 23:08 Preingreso › 23:30 Calada

### BIJ430 · carta (Soja) · 1 viaje · completo

- 11:16–18:11: 11:16 Ingreso ✓ › 11:19 Preingreso ✓ › 11:35 Calada ✓ › 16:55 Salida 2 ✓ › 17:06 Ingreso SL ✓ › 17:26 Balanza ingreso SL ✓ › 17:57 Volcables SL ✓ › 18:09 Balanza egreso SL ✓ › 18:11 Egreso SL ✓

### BJI730 · camión (clasificado) · 1 viaje · completo

- 04:02–04:02 · sin recorrido de referencia: 04:02 Calada

### BTS626 · Permitido (agua) · 5 viajes · completo

- 06:35–06:38 · sin recorrido de referencia: 06:35 Egreso SL
- 06:42–08:22 · sin recorrido de referencia: 06:42 Ingreso SL › 07:28 Balanza ingreso SL › 08:22 Renova
- 08:41–09:12 · sin recorrido de referencia: 08:41 Ingreso SL › 09:10 Balanza egreso SL › 09:12 Egreso SL
- 09:49–11:09 · sin recorrido de referencia: 09:49 Ingreso › 10:16 Salida 2 › 11:09 Balanza
- 11:17–15:29 · sin recorrido de referencia: 11:17 Ingreso › 11:39 Preingreso › 12:15 Salida 2 › 13:05 Playa 3 › 14:05 Balanza › 15:20 Salida 2 › 15:29 Balanza

### BYH822 · carta (Cártamo) · 1 viaje · completo

- 03:35–13:46 · sin recorrido de referencia: 03:35 Ingreso › 04:05 Calada › 08:34 Balanza egreso SL › 11:41 Salida 2 › 13:11 Silo Keppler › 13:46 Balanza

### CGV959 · carta (Soja) · 1 viaje · completo

- 19:37–23:08: 19:37 Ingreso ✓ › 19:42 Preingreso ✓ › 20:10 Calada ✓ › 20:18 Salida 2 ✓ › 20:27 Ingreso SL ✓ › 20:33 Balanza ingreso SL ✓ › 22:50 Volcables SL ✓ › 23:02 Balanza egreso SL ✓ › 23:08 Egreso SL ✓

### CMF111 · Permitido (agua) · 3 viajes · completo

- 00:47–02:04 · sin recorrido de referencia: 00:47 Ingreso SL › 00:54 Balanza ingreso SL › 02:03 Balanza egreso SL › 02:04 Egreso SL
- 19:37–20:53 · sin recorrido de referencia: 19:37 Ingreso SL › 19:40 Balanza ingreso SL › 19:45 Renova › 20:51 Balanza egreso SL › 20:53 Egreso SL
- 22:43–22:49 · sin recorrido de referencia: 22:43 Ingreso SL › 22:46 Balanza ingreso SL › 22:49 Renova

### CRJ139 · carta (Girasol) · 3 viajes · completo

- 00:55–04:06: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › 00:55 Balanza ✓ › 01:11 Ingreso SL ✓ › 01:14 Balanza ingreso SL ✓ › 03:40 Volcables SL ✓ › 04:05 Balanza egreso SL ✓ › 04:06 Egreso SL ✓
- 12:26–15:46: 12:26 Ingreso ✓ › 12:35 Preingreso ✓ › 12:37 Salida 2 ✓ › 12:46 Playa 3 ✓ › 14:02 Balanza ✓ › 14:19 Ingreso SL ✓ › 14:48 Balanza ingreso SL ✓ › 15:32 Volcables SL ✓ › 15:44 Balanza egreso SL ✓ › 15:46 Egreso SL ✓ · de más: 12:41 Balanza
- 15:55–22:28: 15:55 Ingreso ✓ › 15:57 Preingreso ✓ › 15:59 Salida 2 ✓ › 16:36 Playa 3 ✓ › 20:15 Balanza ✓ › 20:31 Ingreso SL ✓ › 21:45 Balanza ingreso SL ✓ › 22:08 Volcables SL ✓ › 22:26 Balanza egreso SL ✓ › 22:28 Egreso SL ✓ · de más: 16:32 Balanza

### DBZ307 · camión (clasificado) · 1 viaje · completo

- 22:42–22:42 · sin recorrido de referencia: 22:42 Volcables SL

### DTA865 · carta (Soja) · 1 viaje · completo

- 01:31–07:47: 01:31 Ingreso ✓ › 01:35 Preingreso ✓ › 03:35 Calada ✓ › 03:48 Salida 2 ✓ › 03:58 Ingreso SL ✓ › 05:54 Balanza ingreso SL ✓ › 07:31 Volcables SL ✓ › 07:45 Balanza egreso SL ✓ › 07:47 Egreso SL ✓

### EFD527 · camión (clasificado) · 1 viaje · completo

- 05:23–05:23 · sin recorrido de referencia: 05:23 Balanza egreso SL

### EFW843 · carta (Soja) · 1 viaje · completo

- 02:27–08:06: 02:27 Ingreso ✓ › 02:29 Preingreso ✓ › 03:41 Calada ✓ › 03:54 Salida 2 ✓ › 04:05 Ingreso SL ✓ › 05:57 Balanza ingreso SL ✓ › 07:51 Volcables SL ✓ › 08:04 Balanza egreso SL ✓ › 08:06 Egreso SL ✓

### EGF806 · carta (Soja) · 1 viaje · completo

- 01:31–07:40: 01:31 Ingreso ✓ › 01:34 Preingreso ✓ › 03:33 Calada ✓ › 03:47 Salida 2 ✓ › 03:57 Ingreso SL ✓ › 05:53 Balanza ingreso SL ✓ › 07:23 Volcables SL ✓ › 07:34 Balanza egreso SL ✓ › 07:38 Egreso SL ✓

### EIV784 · carta (Soja) · 1 viaje · completo

- 22:01–23:23: 22:01 Ingreso ✓ › 22:08 Preingreso ✓ › 23:07 Calada ✓ › 23:14 Salida 2 ✓ › 23:23 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### EPH797 · Permitido (residuos) · 4 viajes · completo

- 06:48–10:56 · sin recorrido de referencia: 06:48 Ingreso SL › 06:56 Balanza ingreso SL › 06:58 Renova › 10:53 Balanza egreso SL › 10:56 Egreso SL
- 12:02–13:03 · sin recorrido de referencia: 12:02 Ingreso SL › 12:11 Balanza ingreso SL › 12:13 Renova › 13:02 Balanza egreso SL › 13:03 Egreso SL
- 13:56–14:25 · sin recorrido de referencia: 13:56 Ingreso SL › 14:01 Balanza ingreso SL › 14:02 Renova › 14:24 Balanza egreso SL › 14:25 Egreso SL
- 15:10–15:47 · sin recorrido de referencia: 15:10 Ingreso SL › 15:18 Balanza ingreso SL › 15:22 Renova › 15:45 Balanza egreso SL › 15:47 Egreso SL

### EQE865 · carta (Soja) · 1 viaje · completo

- 04:18–10:02: 04:18 Ingreso ✓ › 04:40 Preingreso ✓ (captura sin asignar) «26719» › 05:51 Calada ✓ › 06:06 Salida 2 ✓ › 06:16 Ingreso SL ✓ › 08:02 Balanza ingreso SL ✓ › 09:44 Volcables SL ✓ › 09:57 Balanza egreso SL ✓ › 10:02 Egreso SL ✓

### EUD420 · carta (Soja) · 1 viaje · completo

- 22:00–23:23: 22:00 Ingreso ✓ › 22:07 Preingreso ✓ › 23:06 Calada ✓ › 23:14 Salida 2 ✓ › 23:23 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### EUD434 · carta (Soja) · 1 viaje · completo

- 12:27–14:46: 12:27 Ingreso ✓ › 12:36 Preingreso ✓ › 13:35 Calada ✓ › 13:45 Salida 2 ✓ › 13:55 Ingreso SL ✓ › 14:00 Balanza ingreso SL ✓ › 14:25 Volcables SL ✓ › 14:40 Balanza egreso SL ✓ › 14:46 Egreso SL ✓

### EVL273 · carta (Girasol) · 1 viaje · completo

- 02:33–06:48: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:33 Ingreso SL ✓ › 05:00 Balanza ingreso SL ✓ › 06:33 Volcables SL ✓ › 06:43 Balanza egreso SL ✓ (captura sin asignar) «TEL2» › 06:48 Egreso SL ✓

### EWL984 · camión (clasificado) · 1 viaje · completo

- 00:17–00:17 · sin recorrido de referencia: 00:17 Preingreso

### EWR135 · carta (Soja) · 1 viaje · completo

- 01:23–01:26: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › 01:23 Balanza egreso SL ✓ › 01:26 Egreso SL ✓

### EZE425 · camión (clasificado) · 1 viaje · completo

- 23:17–23:35 · sin recorrido de referencia: 23:17 Preingreso › 23:25 Calada › 23:35 Salida 2

### FEA810 · Permitido (residuos) · 4 viajes · completo

- 07:28–07:45 · sin recorrido de referencia: 07:28 Ingreso › 07:29 Preingreso › 07:33 Salida 2 › 07:45 Balanza
- 07:48–10:00 · sin recorrido de referencia: 07:48 Ingreso › 09:25 Salida 2 › 10:00 Balanza
- 10:03–14:27 · sin recorrido de referencia: 10:03 Ingreso › 10:55 Salida 2 › 12:06 Balanza › 14:23 Playa 3 › 14:27 Balanza
- 14:30–15:13 · sin recorrido de referencia: 14:30 Ingreso › 14:32 Calada › 15:13 Salida 2

### FFL957 · carta (Soja) · 1 viaje · completo

- 00:19–00:21: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › 00:19 Balanza egreso SL ✓ › 00:21 Egreso SL ✓

### FFU234 · balanza (SGC) · 1 viaje · completo

- 10:41–13:22: 10:55 Ingreso SL ✓ › 10:58 Calada SL ✓ › 11:06 Balanza ingreso SL ✓ › 11:46 Carga OSL ✓ › 12:16 Calada SL ✓ › 13:05 Balanza ingreso SL ✓ › 13:11 Balanza egreso SL ✓ › 13:22 Egreso SL ✓ · de más: 10:41 Ingreso, 10:43 Preingreso, 10:45 Salida 2

### FJU634 · carta (Soja) · 1 viaje · completo

- 06:03–10:27: 06:03 Ingreso ✓ › 06:08 Preingreso ✓ › 07:38 Calada ✓ › 07:54 Salida 2 ✓ › 08:08 Ingreso SL ✓ › 08:15 Balanza ingreso SL ✓ › 10:09 Volcables SL ✓ › 10:25 Balanza egreso SL ✓ › 10:27 Egreso SL ✓

### FLP167 · carta (Soja) · 1 viaje · completo

- 01:15–01:15: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › Balanza egreso SL · antes de las 00 › 01:15 Egreso SL ✓

### FTH609 · carta (Soja) · 1 viaje · completo

- 21:55–23:25: 21:55 Ingreso ✓ › 22:05 Preingreso ✓ › 23:01 Calada ✓ › 23:08 Salida 2 ✓ › 23:20 Ingreso SL ✓ › 23:25 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### GDW647 · carta (Soja) · 1 viaje · completo

- 05:15–09:42: 05:15 Ingreso ✓ › 05:18 Preingreso ✓ › 05:57 Calada ✓ › 06:03 Salida 2 ✓ › 06:11 Ingreso SL ✓ › 07:57 Balanza ingreso SL ✓ › 09:30 Volcables SL ✓ › 09:40 Balanza egreso SL ✓ › 09:42 Egreso SL ✓

### GFC004 · carta (Soja) · 1 viaje · completo

- 14:28–22:17: 14:28 Ingreso ✓ › 14:31 Preingreso ✓ › 15:12 Calada ✓ › 15:29 Salida 2 ✓ › 15:39 Ingreso SL ✓ › 15:47 Balanza ingreso SL ✓ › 16:12 Volcables SL ✓ › 16:25 Balanza egreso SL ✓ › 16:27 Egreso SL ✓ · de más: 22:17 Salida 2

### GIH043 · camión (clasificado) · 1 viaje · completo

- 10:44–10:44 · sin recorrido de referencia: 10:44 Calada SL

### GJV252 · carta (Soja) · 1 viaje · completo

- 19:37–23:17: 19:37 Ingreso ✓ › 19:41 Preingreso ✓ › 20:06 Calada ✓ › 20:20 Salida 2 ✓ › 20:30 Ingreso SL ✓ › 20:35 Balanza ingreso SL ✓ › 23:04 Volcables SL ✓ › 23:14 Balanza egreso SL ✓ › 23:17 Egreso SL ✓

### GKQ602 · camión (clasificado) · 1 viaje · completo

- 04:21–04:21 · sin recorrido de referencia: 04:21 Preingreso

### GMR927 · carta (Soja) · 1 viaje · completo

- 01:47–03:42: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:47 Balanza ingreso SL ✓ › 03:30 Volcables SL ✓ (captura sin asignar) «SHR92» › 03:41 Balanza egreso SL ✓ › 03:42 Egreso SL ✓

### GZT868 · camión (clasificado) · 1 viaje · completo

- 11:13–17:14 · sin recorrido de referencia: 11:13 Calada SL › 16:49 Carga OSL › 17:11 Balanza egreso SL › 17:14 Egreso SL

### HCR555 · carta (Girasol) · 1 viaje · completo

- 21:32–21:49: 21:32 Ingreso ✓ › 21:46 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue · de más: 21:49 Calada

### HER747 · carta (Soja) · 1 viaje · completo

- 01:51–04:18: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:51 Balanza ingreso SL ✓ › 03:52 Volcables SL ✓ › 04:13 Balanza egreso SL ✓ › 04:18 Egreso SL ✓

### HGR522 · carta (Soja) · 1 viaje · completo

- 13:17–15:38: 13:17 Ingreso ✓ › 13:19 Preingreso ✓ › 13:47 Calada ✓ › 13:58 Salida 2 ✓ › 14:09 Ingreso SL ✓ › 14:25 Balanza ingreso SL ✓ › 15:17 Volcables SL ✓ › 15:32 Balanza egreso SL ✓ › 15:38 Egreso SL ✓

### HHH881 · camión (clasificado) · 1 viaje · completo

- 08:28–08:28 · sin recorrido de referencia: 08:28 Balanza

### HLQ184 · carta (Soja) · 1 viaje · completo

- 00:00–00:00: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › Balanza egreso SL · antes de las 00 › 00:00 Egreso SL ✓

### HTK722 · Permitido (vehiculo particular) · 1 viaje · completo

- 15:33–16:22 · sin recorrido de referencia: 15:33 Balanza

### HTR922 · camión (clasificado) · 1 viaje · completo

- 20:28–20:28 · sin recorrido de referencia: 20:28 Renova

### HWU967 · Permitido (residuos) · 2 viajes · completo

- 08:55–11:41 · sin recorrido de referencia: 08:55 Ingreso › 08:57 Preingreso › 08:57 Ingreso › 09:06 Salida 2 › 09:22 Playa 3 › 09:38 Balanza › 11:16 Ingreso SL › 11:24 Balanza ingreso SL › 11:38 Balanza egreso SL › 11:41 Egreso SL
- 11:44–12:15 · sin recorrido de referencia: 11:44 Ingreso SL › 11:48 Balanza ingreso SL › 11:50 Renova › 12:13 Balanza egreso SL › 12:15 Egreso SL

### IFI1A17 · camión (clasificado) · 1 viaje · completo

- 03:12–17:13 · sin recorrido de referencia: 03:12 Ingreso › 04:12 Salida 2 › 17:13 Balanza

### IHL989 · camión (clasificado) · 1 viaje · completo

- 01:24–01:24 · sin recorrido de referencia: 01:24 Volcables SL

### IIX941 · camión (clasificado) · 1 viaje · completo

- 18:08–22:49 · sin recorrido de referencia: 18:08 Renova › 22:49 Balanza egreso SL

### IMH787 · Permitido (vehiculo particular) · 1 viaje · completo

- 07:17–15:35 · sin recorrido de referencia: 07:17 Egreso SL › 07:29 Balanza › 07:45 Egreso SL › 11:44 Balanza › 11:58 Egreso SL › 15:17 Balanza › 15:32 Egreso SL

### INK312 · camión (clasificado) · 1 viaje · completo

- 21:59–21:59 · sin recorrido de referencia: 21:59 Volcables SL

### IUO199 · carta (Soja) · 1 viaje · completo

- 20:52–23:10: 20:52 Ingreso ✓ › 20:56 Preingreso ✓ › 22:25 Calada ✓ › 22:57 Salida 2 ✓ › 23:10 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### JAW553 · carta (Soja) · 1 viaje · completo

- 22:02–23:33: 22:02 Ingreso ✓ › 22:09 Preingreso ✓ › 23:10 Calada ✓ › 23:22 Salida 2 ✓ › 23:33 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### JBX310 · carta (Soja) · 1 viaje · completo

- 23:26–23:30: 23:26 Ingreso ✓ › 23:30 Preingreso ✓ › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### JFB963 · carta (Soja) · 1 viaje · completo

- 08:01–14:21: 08:01 Ingreso ✓ › 08:03 Preingreso ✓ › 08:31 Calada ✓ › 08:47 Salida 2 ✓ › 08:55 Ingreso SL ✓ › 09:40 Balanza ingreso SL ✓ › 14:06 Volcables SL ✓ › 14:17 Balanza egreso SL ✓ › 14:21 Egreso SL ✓

### JGB519 · carta (Soja) · 1 viaje · completo

- 13:37–15:39: 13:37 Ingreso ✓ › 13:39 Preingreso ✓ › 13:50 Calada ✓ › 14:01 Salida 2 ✓ › 14:11 Ingreso SL ✓ › 14:29 Balanza ingreso SL ✓ › 15:25 Volcables SL ✓ › 15:37 Balanza egreso SL ✓ › 15:39 Egreso SL ✓

### JPJ643 · carta (Soja) · 1 viaje · completo

- 02:39–08:27: Ingreso · antes de las 00 › 02:39 Preingreso ✓ › 03:48 Calada ✓ › 04:00 Salida 2 ✓ › 04:11 Ingreso SL ✓ › 06:02 Balanza ingreso SL ✓ › 08:10 Volcables SL ✓ › 08:24 Balanza egreso SL ✓ › 08:27 Egreso SL ✓

### JPO723 · camión (clasificado) · 1 viaje · completo

- 17:21–17:21 · sin recorrido de referencia: 17:21 Balanza ingreso SL

### JQO397 · carta (Soja) · 1 viaje · completo

- 21:54–23:22: 21:54 Ingreso ✓ › 22:03 Preingreso ✓ › 22:56 Calada ✓ › 23:07 Salida 2 ✓ › 23:19 Ingreso SL ✓ › 23:22 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### JRD973 · carta (Soja) · 1 viaje · completo

- 00:50–05:45: 00:50 Ingreso ✓ › 00:53 Preingreso ✓ › 01:24 Calada ✓ › 01:34 Salida 2 ✓ › 01:52 Ingreso SL ✓ › 04:28 Balanza ingreso SL ✓ › 05:36 Volcables SL ✓ › 05:43 Balanza egreso SL ✓ › 05:44 Egreso SL ✓

### JTH801 · camión (clasificado) · 1 viaje · completo

- 05:39–05:39 · sin recorrido de referencia: 05:39 Ingreso SL

### JUQ710 · carta (Soja) · 1 viaje · completo

- 00:53–01:07: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:53 Volcables SL ✓ › 01:06 Balanza egreso SL ✓ › 01:07 Egreso SL ✓

### JXC803 · carta (Soja) · 1 viaje · completo

- 22:38–23:36: 22:38 Ingreso ✓ › 22:41 Preingreso ✓ › 23:18 Calada ✓ › 23:25 Salida 2 ✓ › 23:36 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### KDE342 · camión (clasificado) · 1 viaje · completo

- 22:15–22:15 · sin recorrido de referencia: 22:15 Preingreso

### KDQ814 · carta (Soja) · 1 viaje · completo

- 08:10–11:14: 08:10 Ingreso ✓ › 08:12 Preingreso ✓ › 08:40 Calada ✓ › 09:07 Salida 2 ✓ › 09:19 Ingreso SL ✓ › 10:22 Balanza ingreso SL ✓ › 11:00 Volcables SL ✓ › 11:12 Balanza egreso SL ✓ › 11:14 Egreso SL ✓

### KFX528 · carta (Soja) · 1 viaje · completo

- 21:51–23:14: 21:51 Ingreso ✓ › 22:00 Preingreso ✓ › 22:51 Calada ✓ › 22:58 Salida 2 ✓ › 23:11 Ingreso SL ✓ › 23:14 Balanza ingreso SL ✓ › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### KIM991 · carta (Soja) · 1 viaje · completo

- 06:32–12:59: 06:32 Ingreso ✓ › 06:34 Preingreso ✓ › 07:44 Calada ✓ › 11:24 Salida 2 ✓ › 11:33 Ingreso SL ✓ › 11:39 Balanza ingreso SL ✓ › 12:45 Volcables SL ✓ › 12:57 Balanza egreso SL ✓ › 12:59 Egreso SL ✓

### KQJ829 · carta (Cártamo) · 1 viaje · completo

- 11:28–15:07 · sin recorrido de referencia: 11:28 Ingreso › 11:30 Preingreso › 11:49 Calada › 14:34 Salida 2 › 14:46 Playa 3 › 14:53 Silo Keppler › 15:07 Balanza

### KTH930 · Permitido (residuos) · 1 viaje · completo

- 10:30–11:21 · sin recorrido de referencia: 10:30 Ingreso SL › 10:39 Balanza ingreso SL › 11:07 Calada SL › 11:13 Balanza ingreso SL › 11:18 Balanza egreso SL › 11:21 Egreso SL

### KUH403 · Permitido (residuos) · 1 viaje · completo

- 12:55–22:32 · sin recorrido de referencia: 12:55 Ingreso SL › 13:47 Calada SL › 13:54 Balanza ingreso SL › 19:09 Renova › 20:12 Balanza ingreso SL › 20:15 Calada SL › 20:45 Balanza ingreso SL › 20:53 Balanza egreso SL › 21:23 Calada SL › 21:51 Balanza ingreso SL › 22:30 Balanza egreso SL › 22:32 Egreso SL

### KWN857 · Permitido (residuos) · 2 viajes · completo

- 09:14–13:44 · sin recorrido de referencia: 09:14 Ingreso SL › 09:18 Balanza ingreso SL › 09:33 Renova › 12:19 Calada SL › 13:37 Balanza ingreso SL › 13:42 Balanza egreso SL › 13:44 Egreso SL
- 16:24–20:36 · sin recorrido de referencia: 16:24 Ingreso SL › 17:24 Balanza ingreso SL › 19:44 Calada SL › 20:36 Egreso SL

### KZA683 · Permitido (residuos) · 1 viaje · completo

- 10:21–11:45 · sin recorrido de referencia: 10:21 Salida 2 › 10:33 Ingreso SL › 10:53 Balanza ingreso SL › 11:22 Balanza egreso SL › 11:29 Calada SL › 11:31 Balanza ingreso SL › 11:43 Balanza egreso SL › 11:45 Egreso SL

### KZS251 · camión (clasificado) · 1 viaje · completo

- 16:29–16:29 · sin recorrido de referencia: 16:29 Balanza

### LAJ040 · carta (Soja) · 1 viaje · completo

- 22:12–23:31: 22:12 Ingreso ✓ › 22:15 Preingreso ✓ › 23:14 Calada ✓ › 23:21 Salida 2 ✓ › 23:31 Ingreso SL ✓ › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### LAU466 · balanza (SGC) · 1 viaje · completo

- 09:57–11:55: 09:57 Ingreso SL ✓ › 09:59 Calada SL ✓ › 10:25 Balanza ingreso SL ✓ › 10:43 Carga OSL ✓ › 11:18 Calada SL ✓ › 11:22 Balanza ingreso SL ✓ › 11:30 Balanza egreso SL ✓ › 11:55 Egreso SL ✓

### LCP506 · balanza (SGC) · 1 viaje · completo

- 14:54–17:43: 14:54 Ingreso SL ✓ › 14:57 Calada SL ✓ › 15:05 Balanza ingreso SL ✓ › 16:11 Carga OSL ✓ › 16:40 Calada SL ✓ › 16:43 Balanza ingreso SL ✓ › 16:50 Balanza egreso SL ✓ › 17:41 Egreso SL ✓

### LCX739 · camión (clasificado) · 1 viaje · completo

- 13:03–13:03 · sin recorrido de referencia: 13:03 Renova

### LDT506 · carta (Soja) · 1 viaje · completo

- 01:28–07:34: 01:28 Ingreso ✓ › 01:31 Preingreso ✓ › 03:18 Calada ✓ › 03:38 Salida 2 ✓ › 03:48 Ingreso SL ✓ › 04:38 Balanza ingreso SL ✓ › 07:06 Volcables SL ✓ › 07:22 Balanza egreso SL ✓ › 07:34 Egreso SL ✓

### LER204 · balanza (SGC) · 1 viaje · completo

- 13:10–16:40: 13:22 Ingreso SL ✓ › 13:25 Calada SL ✓ › 13:48 Balanza ingreso SL ✓ › 15:34 Carga OSL ✓ › 15:59 Calada SL ✓ › 16:03 Balanza ingreso SL ✓ › 16:10 Balanza egreso SL ✓ › 16:40 Egreso SL ✓ · de más: 13:10 Ingreso, 13:11 Preingreso, 13:14 Salida 2

### LGE877 · camión (clasificado) · 1 viaje · completo

- 05:54–05:54 · sin recorrido de referencia: 05:54 Playa 3

### LGL184 · carta (Soja) · 1 viaje · completo

- 01:12–05:49: 01:12 Ingreso ✓ › 01:14 Preingreso ✓ › 01:29 Calada ✓ › 01:36 Salida 2 ✓ › 01:54 Ingreso SL ✓ › 04:30 Balanza ingreso SL ✓ › 05:41 Volcables SL ✓ › 05:48 Balanza egreso SL ✓ › 05:49 Egreso SL ✓

### LJB988 · Permitido (vehiculo particular) · 1 viaje · completo

- 08:39–15:24 · sin recorrido de referencia: 08:39 Ingreso SL › 08:40 Renova › 09:09 Ingreso SL › 10:18 Renova › 10:32 Ingreso SL › 12:12 Renova › 12:57 Ingreso SL › 14:26 Renova › 14:57 Balanza egreso SL › 15:24 Egreso SL

### LOQ416 · Permitido (residuos) · 2 viajes · completo

- 07:38–13:17 · sin recorrido de referencia: 07:38 Ingreso › 07:41 Preingreso › 07:44 Salida 2 › 13:17 Balanza
- 13:21–13:45 · sin recorrido de referencia: 13:21 Ingreso › 13:23 Calada › 13:45 Salida 2

### LRS321 · carta (Soja) · 1 viaje · completo

- 00:36–01:30: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:36 Volcables SL ✓ › 01:16 Balanza egreso SL ✓ › 01:30 Egreso SL ✓

### LUE425 · camión (clasificado) · 1 viaje · completo

- 23:53–23:53 · sin recorrido de referencia: 23:53 Balanza ingreso SL

### LVX814 · carta (Soja) · 1 viaje · completo

- 00:28–00:44: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › 00:28 Volcables SL ✓ › 00:41 Balanza egreso SL ✓ › 00:44 Egreso SL ✓

### LWA722 · carta (Soja) · 1 viaje · completo

- 07:51–11:01: 07:51 Ingreso ✓ › 07:56 Preingreso ✓ › 08:27 Calada ✓ › 08:39 Salida 2 ✓ › 08:48 Ingreso SL ✓ › 09:11 Balanza ingreso SL ✓ › 10:42 Volcables SL ✓ › 10:59 Balanza egreso SL ✓ › 11:01 Egreso SL ✓

### LXB464 · camión (clasificado) · 1 viaje · completo

- 09:14–12:51 · sin recorrido de referencia: 09:14 Ingreso SL › 12:51 Renova

### LYW022 · camión (clasificado) · 1 viaje · completo

- 03:39–03:39 · sin recorrido de referencia: 03:39 Preingreso

### MHS655 · carta (Soja) · 1 viaje · completo

- 09:10–12:02: 09:10 Ingreso ✓ › 09:13 Preingreso ✓ › 09:24 Calada ✓ › 09:38 Salida 2 ✓ › 09:45 Ingreso SL ✓ › 10:50 Balanza ingreso SL ✓ › 11:48 Volcables SL ✓ › 12:00 Balanza egreso SL ✓ › 12:02 Egreso SL ✓

### MIH742 · carta (Soja) · 1 viaje · completo

- 08:40–12:11: 08:40 Ingreso ✓ › 08:43 Preingreso ✓ › 09:17 Calada ✓ › 09:43 Salida 2 ✓ › 09:54 Ingreso SL ✓ › 10:54 Balanza ingreso SL ✓ › 11:57 Volcables SL ✓ › 12:09 Balanza egreso SL ✓ › 12:11 Egreso SL ✓

### MKF419 · camión (clasificado) · 1 viaje · completo

- 05:08–05:08 · sin recorrido de referencia: 05:08 Balanza egreso SL

### MNS277 · camión (clasificado) · 1 viaje · completo

- 02:20–02:20 · sin recorrido de referencia: 02:20 Balanza ingreso SL

### NKJ395 · carta (Cártamo) · 1 viaje · completo

- 01:04–18:05 · sin recorrido de referencia: 01:04 Calada › 01:11 Preingreso › 14:03 Calada › 18:05 Salida 2

### NKU970 · carta (Grano 82) · 1 viaje · completo

- 22:28–22:31 · sin recorrido de referencia: 22:28 Ingreso › 22:31 Preingreso

### NPB801 · carta (Soja) · 1 viaje · completo

- 09:30–13:38: 09:30 Ingreso ✓ › 09:35 Preingreso ✓ › 11:24 Calada ✓ › 11:38 Salida 2 ✓ › 11:49 Ingreso SL ✓ › 11:59 Balanza ingreso SL ✓ › 13:19 Volcables SL ✓ › 13:33 Balanza egreso SL ✓ › 13:38 Egreso SL ✓

### NQL987 · carta (Soja) · 1 viaje · completo

- 05:57–10:26: 05:57 Ingreso ✓ › 05:59 Preingreso ✓ › 07:36 Calada ✓ › 07:49 Salida 2 ✓ › 08:03 Ingreso SL ✓ › 08:09 Balanza ingreso SL ✓ › 10:01 Volcables SL ✓ › 10:24 Balanza egreso SL ✓ › 10:26 Egreso SL ✓

### NUO129 · carta (Soja) · 1 viaje · completo

- 10:49–14:05: 10:49 Ingreso ✓ › 10:53 Preingreso ✓ › 11:27 Calada ✓ › 11:49 Salida 2 ✓ › 11:59 Ingreso SL ✓ › 12:10 Balanza ingreso SL ✓ › 13:46 Volcables SL ✓ › 14:02 Balanza egreso SL ✓ › 14:05 Egreso SL ✓

### NYT101 · carta (Soja) · 1 viaje · completo

- 23:26–23:29: 23:26 Ingreso ✓ › 23:29 Preingreso ✓ › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### OIG256 · Permitido (insumos) · 2 viajes · completo

- 08:32–10:07 · sin recorrido de referencia: 08:32 Ingreso SL › 08:38 Balanza ingreso SL › 08:43 Renova › 10:04 Balanza egreso SL › 10:07 Egreso SL
- 21:54–23:50 · sin recorrido de referencia: 21:54 Ingreso SL › 21:56 Balanza ingreso SL › 22:02 Renova

### OKV855 · balanza (SGC) · 1 viaje · completo

- 06:06–14:46: 08:17 Ingreso SL ✓ › 08:24 Calada SL ✓ › 11:40 Balanza ingreso SL ✓ › 13:02 Carga OSL ✓ (captura sin asignar) «412» › 13:08 Calada SL ✓ › 13:44 Balanza ingreso SL ✓ › 13:50 Balanza egreso SL ✓ › 14:44 Egreso SL ✓ · de más: 06:06 Ingreso, 06:12 Preingreso, 08:03 Salida 2, 12:31 Balanza egreso SL, 12:47 Ingreso SL, 12:53 Renova

### ONH321 · carta (Girasol) · 1 viaje · completo

- 21:59–22:09: 21:59 Ingreso ✓ › 22:07 Preingreso ✓ › Salida 2 · sigue › Playa 3 · sigue › Balanza · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue · de más: 22:09 Calada

### OYN370 · balanza (SGC) · 1 viaje · completo

- 12:39–16:30: 12:39 Ingreso SL ✓ › 13:06 Calada SL ✓ › 13:41 Balanza ingreso SL ✓ › 15:11 Carga OSL ✓ › 15:38 Calada SL ✓ › 15:43 Balanza ingreso SL ✓ › 15:51 Balanza egreso SL ✓ › 16:30 Egreso SL ✓

### OYP071 · carta (Soja) · 1 viaje · completo

- 17:55–23:49: 17:55 Ingreso ✓ › 17:58 Preingreso ✓ › 19:53 Calada ✓ › 20:06 Salida 2 ✓ › 20:18 Ingreso SL ✓ › 20:37 Balanza ingreso SL ✓ › 23:36 Volcables SL ✓ › 23:46 Balanza egreso SL ✓ › 23:49 Egreso SL ✓

### PBI796 · camión (clasificado) · 1 viaje · completo

- 21:31–21:31 · sin recorrido de referencia: 21:31 Volcables SL

### PCG129 · carta (Soja) · 1 viaje · completo

- 00:01–01:40: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 00:01 Balanza ingreso SL ✓ › 01:27 Volcables SL ✓ › 01:39 Balanza egreso SL ✓ › 01:40 Egreso SL ✓

### PCG165 · carta (Soja) · 1 viaje · completo

- 03:06–09:08: 03:06 Ingreso ✓ › 03:11 Preingreso ✓ › 03:59 Calada ✓ › 04:11 Salida 2 ✓ › 04:22 Ingreso SL ✓ › 06:12 Balanza ingreso SL ✓ › 08:49 Volcables SL ✓ › 09:06 Balanza egreso SL ✓ › 09:07 Egreso SL ✓

### PIQ686 · carta (Soja) · 1 viaje · completo

- 14:12–16:09: 14:12 Ingreso ✓ › 14:15 Preingreso ✓ › 15:01 Calada ✓ › 15:18 Salida 2 ✓ › 15:27 Ingreso SL ✓ › 15:32 Balanza ingreso SL ✓ › 15:42 Volcables SL ✓ › 16:00 Balanza egreso SL ✓ › 16:09 Egreso SL ✓

### PJF101 · carta (Soja) · 1 viaje · completo

- 00:44–23:30: 00:44 Ingreso ✓ › 00:48 Preingreso ✓ › 01:22 Calada ✓ › 01:29 Salida 2 ✓ › 01:51 Ingreso SL ✓ › 15:14 Balanza ingreso SL ✓ › 23:12 Volcables SL ✓ (captura sin asignar) «PT101» › 23:28 Balanza egreso SL ✓ › 23:30 Egreso SL ✓

### PJS755 · carta (Soja) · 1 viaje · completo

- 01:04–09:35: Ingreso · antes de las 00 › Preingreso · antes de las 00 › 01:04 Calada ✓ › 01:15 Salida 2 ✓ › 01:24 Ingreso SL ✓ › 07:21 Balanza ingreso SL ✓ › 09:22 Volcables SL ✓ › 09:33 Balanza egreso SL ✓ › 09:35 Egreso SL ✓

### PLM569 · carta (Soja) · 1 viaje · completo

- 00:00–01:35: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 00:00 Balanza ingreso SL ✓ › 01:18 Volcables SL ✓ (captura sin asignar) «PL55» › 01:33 Balanza egreso SL ✓ › 01:35 Egreso SL ✓

### PTL445 · camión (clasificado) · 1 viaje · completo

- 05:02–05:02 · sin recorrido de referencia: 05:02 Balanza

### PZR532 · camión (clasificado) · 1 viaje · completo

- 11:37–11:37 · sin recorrido de referencia: 11:37 Preingreso

### QLJ322 · camión (clasificado) · 1 viaje · completo

- 00:59–00:59 · sin recorrido de referencia: 00:59 Silo Keppler

### RAM481 · camión (clasificado) · 1 viaje · completo

- 09:35–16:09 · sin recorrido de referencia: 09:35 Ingreso SL › 15:12 Balanza ingreso SL › 16:09 Volcables SL

### REH067 · Permitido (residuos) · 1 viaje · completo

- 09:36–11:36 · sin recorrido de referencia: 09:36 Ingreso › 10:08 Preingreso › 10:21 Salida 2 › 10:39 Playa 3 › 11:36 Balanza

### RRE349 · carta (Girasol) · 1 viaje · completo

- 02:23–06:04: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Salida 2 · antes de las 00 › Playa 3 · antes de las 00 › Balanza · antes de las 00 › 02:23 Ingreso SL ✓ › 02:27 Balanza ingreso SL ✓ › 05:45 Volcables SL ✓ › 06:02 Balanza egreso SL ✓ › 06:04 Egreso SL ✓

### RUK692 · Permitido (glicerina) · 3 viajes · completo

- 01:36–02:46: 01:36 Ingreso SL ✓ › 01:52 Balanza ingreso SL ✓ › 01:56 Renova ✓ (captura sin asignar) «IOGS7C4» › 02:44 Balanza egreso SL ✓ › 02:46 Egreso SL ✓ · de más: 01:48 Calada SL
- 13:06–15:27: 13:06 Ingreso SL ✓ › 13:40 Balanza ingreso SL ✓ › 13:43 Renova ✓ › 15:26 Balanza egreso SL ✓ › 15:27 Egreso SL ✓
- 21:16–22:48: 21:16 Ingreso SL ✓ › 21:21 Balanza ingreso SL ✓ › 21:21 Renova ✓ (captura sin asignar) «J271» › 22:46 Balanza egreso SL ✓ › 22:48 Egreso SL ✓

### RVL638 · carta (Soja) · 1 viaje · completo

- 23:57–23:58: 23:57 Ingreso ✓ › Preingreso · sigue › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### SCQ769 · carta (Soja) · 1 viaje · completo

- 00:08–00:08: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › Balanza ingreso SL · antes de las 00 › Volcables SL · antes de las 00 › Balanza egreso SL · antes de las 00 › 00:08 Egreso SL ✓

### SHN093 · carta (Soja) · 1 viaje · completo

- 01:41–02:21: Ingreso · antes de las 00 › Preingreso · antes de las 00 › Calada · antes de las 00 › Salida 2 · antes de las 00 › Ingreso SL · antes de las 00 › 01:41 Balanza ingreso SL ✓ › 02:02 Volcables SL ✓ › 02:14 Balanza egreso SL ✓ › 02:21 Egreso SL ✓

### SZG666 · Permitido (agua) · 4 viajes · completo

- 05:39–07:07 · sin recorrido de referencia: 05:39 Ingreso SL › 05:43 Balanza ingreso SL › 05:45 Renova › 07:06 Egreso SL
- 13:09–14:51 · sin recorrido de referencia: 13:09 Ingreso SL › 13:42 Balanza ingreso SL › 14:42 Renova › 14:49 Balanza egreso SL › 14:51 Egreso SL
- 17:01–18:37 · sin recorrido de referencia: 17:01 Ingreso SL › 17:24 Renova › 18:35 Balanza egreso SL › 18:37 Egreso SL
- 20:41–22:48 · sin recorrido de referencia: 20:41 Ingreso SL › 20:47 Balanza ingreso SL › 22:43 Balanza egreso SL › 22:48 Egreso SL

### TBP883 · camión (clasificado) · 1 viaje · completo

- 12:42–12:42 · sin recorrido de referencia: 12:42 Preingreso

### TBP889 · camión (clasificado) · 1 viaje · completo

- 10:34–10:34 · sin recorrido de referencia: 10:34 Balanza ingreso SL

### TEG630 · carta (Soja) · 1 viaje · completo

- 13:06–15:15: 13:06 Ingreso ✓ › 13:08 Preingreso ✓ › 13:41 Calada ✓ › 13:54 Salida 2 ✓ › 14:03 Ingreso SL ✓ › 14:12 Balanza ingreso SL ✓ › 15:02 Volcables SL ✓ › 15:13 Balanza egreso SL ✓ › 15:15 Egreso SL ✓

### TGW703 · carta (Soja) · 1 viaje · completo

- 23:58–23:58: 23:58 Ingreso ✓ › Preingreso · sigue › Calada · sigue › Salida 2 · sigue › Ingreso SL · sigue › Balanza ingreso SL · sigue › Volcables SL · sigue › Balanza egreso SL · sigue › Egreso SL · sigue

### TZT593 · camión (clasificado) · 1 viaje · completo

- 14:45–21:04 · sin recorrido de referencia: 14:45 Ingreso › 21:04 Balanza egreso SL

### UIG427 · carta (Cártamo) · 1 viaje · completo

- 11:42–15:27 · sin recorrido de referencia: 11:42 Calada › 14:44 Salida 2 › 14:49 Balanza › 14:54 Playa 3 › 15:03 Silo Keppler › 15:27 Balanza

### UUO981 · Permitido (varios) · 3 viajes · completo

- 05:01–09:48: 05:01 Ingreso ✓ › 05:03 Preingreso ✓ › 05:05 Salida 2 ✓ › 05:08 Balanza ✓ › 05:12 Playa 3 ✓ › 07:31 Balanza ✓ › 07:49 Ingreso SL ✓ › 09:07 Balanza ingreso SL ✓ › 09:35 Volcables SL ✓ › 09:46 Balanza egreso SL ✓ › 09:48 Egreso SL ✓
- 10:00–13:30: 10:00 Ingreso ✓ › 10:16 Preingreso ✓ › 10:18 Salida 2 ✓ › 10:33 Balanza ✓ › 10:37 Playa 3 ✓ › 11:06 Balanza ✓ › 11:23 Ingreso SL ✓ › 12:45 Balanza ingreso SL ✓ › 13:19 Volcables SL ✓ › 13:28 Balanza egreso SL ✓ › 13:30 Egreso SL ✓
- 13:37–17:13: 13:37 Ingreso ✓ › 13:39 Preingreso ✓ › 13:41 Salida 2 ✓ › 13:44 Balanza ✓ › 13:48 Playa 3 ✓ › 15:18 Balanza ✓ › 15:36 Ingreso SL ✓ › 15:40 Balanza ingreso SL ✓ › 16:57 Volcables SL ✓ › 17:10 Balanza egreso SL ✓ › 17:13 Egreso SL ✓

### VCK738 · Permitido (glicerina) · 2 viajes · completo

- 12:49–14:52: 12:49 Ingreso SL ✓ › 13:01 Balanza ingreso SL ✓ › 14:43 Renova ✓ › 14:50 Balanza egreso SL ✓ › 14:52 Egreso SL ✓
- 18:09–19:37: 18:09 Ingreso SL ✓ › 18:28 Balanza ingreso SL ✓ › 18:30 Renova ✓ › 19:34 Balanza egreso SL ✓ › 19:37 Egreso SL ✓

### VNA879 · Permitido (residuos) · 3 viajes · completo

- 07:42–09:25 · sin recorrido de referencia: 07:42 Balanza › 07:58 Ingreso SL › 08:31 Balanza ingreso SL › 08:33 Renova › 08:57 Balanza egreso SL › 09:10 Calada SL › 09:18 Renova › 09:20 Balanza egreso SL › 09:25 Egreso SL
- 09:36–11:46 · sin recorrido de referencia: 09:36 Preingreso › 10:09 Salida 2 › 10:25 Balanza › 10:38 Ingreso SL › 10:46 Balanza ingreso SL › 11:33 Calada SL › 11:36 Renova › 11:40 Balanza egreso SL › 11:46 Egreso SL
- 11:56–15:14 · sin recorrido de referencia: 11:56 Ingreso › 11:57 Preingreso › 12:01 Salida 2 › 12:18 Balanza › 12:29 Ingreso SL › 12:33 Balanza ingreso SL › 12:36 Renova › 14:14 Calada SL › 14:27 Balanza egreso SL › 14:29 Egreso SL › 14:45 Salida 2 › 15:11 Playa 3 › 15:14 Balanza

### WCO603 · camión (clasificado) · 1 viaje · completo

- 03:16–03:16 · sin recorrido de referencia: 03:16 Preingreso

### WFB415 · camión (clasificado) · 1 viaje · completo

- 21:14–21:14 · sin recorrido de referencia: 21:14 Ingreso SL

### WJB112 · camión (clasificado) · 1 viaje · completo

- 22:57–22:57 · sin recorrido de referencia: 22:57 Balanza

### WTG418 · camión (clasificado) · 1 viaje · completo

- 17:30–17:30 · sin recorrido de referencia: 17:30 Balanza ingreso SL

### WWT539 · camión (clasificado) · 1 viaje · completo

- 17:39–17:39 · sin recorrido de referencia: 17:39 Balanza ingreso SL

### WWW007 · camión (clasificado) · 1 viaje · completo

- 02:05–02:05 · sin recorrido de referencia: 02:05 Balanza ingreso SL

