# Despliegue en AWS (BIMtrazer) — requisitos y capa de agentes

Estado: **borrador para discutir**. Hoy todo corre local; se migra cuando estén los requisitos de la
sección 1. Idea: el microservicio TruckFlow (Enesimal) se muda a la cuenta AWS de BIMtrazer, y el
dashboard, el ETL y la capa de agentes van **en la misma red privada (VPC)**, al lado.

## 1. Lo que necesitamos antes de arrancar

| De quién | Qué |
|---|---|
| BIMtrazer | Cuenta AWS, región (sa-east-1 São Paulo), dominio/subdominio, presupuesto mensual |
| Vicentin (IT) | **VPN de red a red** entre AWS y la planta (cámaras 192.168.3.x/4.x, DSS); reglas de firewall; si hay acceso al sistema de camiones, por dónde (SFTP/API) |
| Enesimal | Cómo se despliega TruckFlow (contenedor, base de datos, puertos), a qué URL apuntan los Edge, API de eventos y de comandos documentadas |
| Nosotros | Qué usuarios entran y con qué rol; quién aprueba acciones de la capa 4 |

La VPN es lo crítico: sin ella en AWS anda todo **menos** video en vivo y lo que esté solo en la red de planta.
Ojo: al mudar TruckFlow, los Edge de planta tienen que apuntar al nuevo destino (hoy `138.36.237.33:8090`).

## 2. Topología propuesta

```
Planta (Edge, cámaras, DSS, PLC) ──VPN red a red──┐
                                                  │
AWS · VPC BIMtrazer ──────────────────────────────┤
  subred privada                                   │
   ├─ TruckFlow (Enesimal)        eventos ↔ comandos
   ├─ API ETL + estado en vivo (server/ actual)
   ├─ go2rtc (video en vivo)
   ├─ MCP Nodo Sur + orquestador + agentes
   └─ tareas programadas (informe diario, comité)
  subred pública
   └─ proxy HTTPS (Caddy/ALB) con login ──► usuarios, torre, IA de Vicentin
  S3: corridas (runs/), Excel de movimientos, backups
  Supabase (ya existe) o RDS Postgres
```

- **Una VM para empezar** (EC2), todo en contenedores con `docker compose`, cada servicio por separado.
  TruckFlow en su propio contenedor/volumen: dueño y despliegue distintos. Si crece, se separa en dos VM.
- **Tamaño de partida (a validar con carga real):** 4 vCPU, 16 GB RAM (ej. m6i.xlarge / t3.xlarge),
  disco gp3 de 150 GB. Hoy `runs/` + `data/` ≈ 4,5 GB y crecen por semana; el ETL de una semana es lo pesado.
- **Sin SSH público:** acceso administrativo por AWS Systems Manager.
- **Secretos** (Supabase, DSS, cámaras, claves de IA) en Secrets Manager / Parameter Store, nunca en el repo.
- **Logs y alertas** en CloudWatch: servicio caído, VPN caída, disco > 80 %.
- **Backups:** snapshot diario del disco + corridas en S3.

## 3. Cambios de código para salir de local

1. **Login y roles** delante del server (hoy no tiene: confía en quien llega). OAuth/Google Workspace o Cognito.
2. **URLs por variable de entorno** (TruckFlow, go2rtc, DSS) — la mayoría ya lo es; revisar el front.
3. **Subida de Excel** de movimientos desde el dashboard (hoy se copian a mano a `data/`).
4. **Corridas a S3** (o volumen persistente) en lugar de carpeta local.
5. **Chat del agente:** `server/etl-agent-chat.mjs` usa el CLI de Claude con la suscripción; en servidor
   tiene que ir por API. En AWS lo natural es **Claude vía Amazon Bedrock** (los datos no salen de la cuenta).
6. **go2rtc y tareas programadas** como servicios (contenedor + cron), con reinicio automático.
7. Token OAuth de Google Slides (informes) movido a secretos.

## 4. Cómo armamos la capa de agentes ahí

Todo dentro de la VPC, hablando con TruckFlow por la red privada.

| Pieza | Cómo | Modelo de IA |
|---|---|---|
| **Estado en vivo** | suscripción a la API de eventos de TruckFlow → reducer actual (`server/plantState/`) | — |
| **Capa 1 · Deterministas** | ETL y reglas versionadas actuales, corriendo continuo sobre eventos | ninguno |
| **Capa 2 · Predictivos** | servicio de simulación de colas sobre el modelo de nodos y capacidades | ninguno al inicio |
| **Capa 3 · Comunicadores** | LLM con tools del MCP; alertas, parte de turno, comité | Claude vía Bedrock |
| **Capa 4 · Correctivos** | propuesta → aprobación en el dashboard → comando a la API de TruckFlow | reglas + LLM para justificar |
| **Orquestador** | proceso único con cola de trabajo (Postgres o Redis); bidireccional con capas 2 y 4 | Claude para arbitrar/explicar |
| **MCP Nodo Sur** | servidor HTTP con OAuth y roles (ver `MCP_NODO_SUR.md`) | — |

**Gobernanza (desde el día 1):** roles por usuario y por agente, límites por tipo de acción, toda acción
de capa 4 pasa por aprobación al principio, registro auditable (quién propuso, quién aprobó, qué respondió
TruckFlow) y un **interruptor** para apagar la capa 4 al instante.

## 5. Orden

1. **Mudanza tal cual:** TruckFlow + dashboard + ETL en la VM, con login y VPN. Mismo comportamiento que hoy.
2. **MCP + capa 1 y 3:** MCP en la nube con roles; comunicadores sobre Bedrock (informe diario y alertas).
3. **Capa 2:** simulador de colas sobre el modelo de nodos.
4. **Capa 4 en modo "propone y una persona aprueba"**, cuando esté la API de comandos.

## Abierto

- ¿TruckFlow y lo nuestro en la misma VM o separados desde el inicio?
- ¿Supabase sigue o pasamos a RDS dentro de la VPC?
- ¿Qué VPN tiene Vicentin y quién la gestiona del lado de ellos?
- Costos de AWS y de Bedrock: a estimar con la carga real.
