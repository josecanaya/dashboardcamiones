# Reeingeniería logística del Nodo Sur.pptx

Slides: 15

## Slide 1

TRUCKFLOW · NODO SUR
Evolucion de Truckflow
La base para automatizar la operación de camiones de Ricardone y San Lorenzo: nodos, eventos en tiempo real, un modelo único de la planta y agentes que miden, anticipan y corrigen.
Propuesta interna · BIMtrazer · Septiembre 2026

## Slide 2

EN UNA LÁMINA
Base, agentes y una planta que se corrige sola
AHORA · LA BASE
Nodos, eventos y un modelo de la planta
Cada paso de cada camión, en segundos
Sistema de camiones integrado, sin tocarlo
Doble confirmación de cada paso
SE SUMA · AGENTES
Capas de agentes con un orquestador
Deterministas: qué pasa
Predictivos: qué va a pasar
Comunicadores: lo cuentan
HORIZONTE
La planta se corrige sola
Correctivos que actúan sobre el flujo
Llamado y destino automáticos
Flota de transiles planificada
Truckflow Vicentin · propuesta interna
02

## Slide 3

LO QUE YA HAY
Instalado, funcionando y en vivo
60 cámaras
con IA en las dos plantas, Edge en planta y TruckFlow en la nube; probado de punta a punta el 15/09
13 comités
semanales entregados desde el 10/06
40 → 95 %
del volumen con trazabilidad por cámara
Semana → ahora
el paso del análisis semanal en comité al análisis en vivo, playa por playa
03

## Slide 4

Fuente: modelo de nodos del Nodo Sur · cada línea es un circuito; más oscura, más circuitos comparten la conexión
04
EL MODELO DE NODOS · 33 NODOS · 50 CIRCUITOS · 5 PLAYAS
Una sola versión de las 2 plantas
con cámara
sin cámara
playa: área de espera, con su capacidad
desvío: solo el camión demorado

## Slide 5

EL DATO · CIRCUITO R7, SOJA
El 73 % del ciclo es espera en las playas
4,1 h
de las 5,6 h del ciclo del camión de soja son espera en dos playas
2,1 h
Playa 1, Ricardone
2,0 h
Playa OSL, puerto
Y no baja: en 13 comités el ciclo osciló entre 4,6 y 7,2 h.
No es capacidad: es coordinación. Nadie puede tener la planta entera en la cabeza; sincronizar 33 nodos y 50 circuitos en tiempo real es un problema de ingeniería logística.
Semana 10–16/09, 2.557 camiones · Comité de Logística del 18/09 e histórico de comités · en ámbar, las playas
05

## Slide 6

SEGURIDAD · EN TIEMPO REAL
Vemos el movimiento sospechoso mientras pasa
LO QUE PASÓ
13 comités de reglas
cada comité dejó criterio: hoy son reglas que juzgan cada movimiento
LO QUE ESTÁ PASANDO
Alerta en el momento
a la torre, con la patente, la foto y la regla que la disparó
LO QUE VA A PASAR
Aviso antes de que pase
el camión que se aparta de su circuito se ve venir, no se descubre en el comité
EJEMPLOS DE LO QUE YA DETECTAMOS
De Ricardone al puerto sin pasar por calada
Visita relámpago en el puerto
Circuito que no corresponde al producto
Reglas del panel de Seguridad y del histórico de comités · Truckflow Vicentin · propuesta interna
06

## Slide 7

EL NODO · LA UNIDAD DEL PROYECTO
Entran señales, sale un evento confirmado
ENTRAN
Cámaras frontal y trasera
patente del tractor y del acoplado
Balanza PLC con fotocélula
peso y posición del camión
Otros sensores
lo que se sume al nodo
Sistema de camiones
producto, CTG, carta de porte, contrato
viene del nodo anterior
EDGE DEL NODO · EN PLANTA
Confirma con dos fuentes
Valida de dónde viene y adónde sigue
Asigna el circuito al ingresar: un código propio del recorrido
Une cada evento nuevo a ese código por la patente
No pierde: guarda y reenvía
Pone la hora real del lugar
habilita el nodo siguiente
SALE
1 evento por paso
patente · acoplado
nodo · hora del lugar
código de circuito
peso · posición
producto · CTG · carta de porte
confirmado 2/2
→ TruckFlow
HORIZONTE · ACTÚA
barrera, semáforo y llamado de camiones
Escala solo
sumar un sensor es sumar una entrada; sumar un punto, un nodo al modelo
Truckflow Vicentin · propuesta interna
07

## Slide 8

EL PUENTE
De la base a los agentes de IA
Un agente es tan bueno como los datos y el modelo que lo alimentan. Eso ya lo construimos.
YA ESTÁ
1 · Datos confiables
un evento confirmado por paso, en cada nodo
YA ESTÁ
2 · La planta en un modelo
33 nodos, 50 circuitos y las reglas de 13 comités, versionadas
EN MARCHA
3 · Una puerta para la IA
un MCP: las herramientas con las que un agente consulta la planta y propone
SE SUMA
4 · Agentes, capa por capa
primero miden, después anticipan, cuentan y corrigen
Hoy una persona mira el tablero y decide. Con agentes, la planta entera se mira todo el tiempo y la propuesta llega antes de que se arme la cola.
Truckflow Vicentin · propuesta interna
08

## Slide 9

LAS CAPAS DE AGENTES
Cuatro capas, cada una con su técnica
Todas leen el mismo modelo de nodos y publican al orquestador: ninguna actúa sobre la planta sin pasar por él.
Truckflow Vicentin · propuesta interna
09

## Slide 10

EL ORQUESTADOR
Un solo lugar donde se decide
CÓMO FUNCIONA
Estado de planta: suscripto a los eventos de TruckFlow, mantiene dónde está cada camión contra el modelo de nodos
Bidireccional: pide escenarios a los predictivos y órdenes de cumplimiento a los correctivos, y espera la respuesta
Arbitra: si dos agentes proponen cosas opuestas, decide con las prioridades de la planta
Registra: quién propuso, quién aprobó y qué se ejecutó
FLUJO CON CADA CAPA
Deterministas
solo publican
Predictivos
ida y vuelta
Comunicadores
solo reciben
Correctivos
ida y vuelta
Lo vinculamos con lo que BIMtrazer ya hace en mantenimiento con MCPs: esos MCPs se conectan al mismo orquestador y de ahí salen agentes nuevos.
LA AUTONOMÍA SE GANA
propone y una persona aprueba
actúa solo dentro de límites
actúa y avisa
Truckflow Vicentin · propuesta interna
10

## Slide 11

EL VALOR · TRANSILE DE PELLET RICARDONE → PUERTO
Menos espera: la planta paga menos y el camionero gana más
EL OPERATIVO, HOY Y CON MENOS ESPERA EN EL PUERTO
La carga en Ricardone no cambia: baja la espera en el puerto. Mismas 9.210 t, mismas horas.
SI BAJAMOS LA TARIFA POR VIAJE
Cobra menos por viaje pero da más vueltas: gana más. Recién con −36 % quedaría igual que hoy.
La planta: sobre un flete de $ 55,3 M por operativo, ahorra $ 8,3 a 11,1 M y saca 22 camiones de las playas.
Soja R29, mismo caso: 2,2 h de espera en silo; 516 viajes en la semana, $ 13,9 a 18,6 M más por semana.
Comité de Logística Nodo Sur 24–30/09 · flete interplanta $ 6.000/t, 30 t por viaje · la prueba es un escenario, no una medición
11

## Slide 12

AUTOMATIZAR · OPERACIÓN REMOTA
Un operador, dos o tres garitas, desde una sala
10 PUESTOS DE REGISTRO
Ricardone: ingreso, preingreso, balanza de ingreso, balanza de egreso, salida 1 y salida 2
San Lorenzo: ingreso, balanza de ingreso, balanza de egreso y egreso
Cámaras, balanza y sistema de camiones ya se cruzan: el registro se puede hacer a distancia.
PERSONAS POR TURNO PARA OPERAR LAS DOS PLANTAS
Una persona por puesto
10
30 en tres turnos
Sala remota, 2–3 puestos c/u
4–5
12 a 15 en tres turnos
15 a 18 puestos por día para reubicar en otras tareas de la planta.
CÓMO ENTRA AL SISTEMA DE CAMIONES
El nodo lee patente, acoplado, peso y hora
Cruza con CTG, contrato y cupo
Precarga el registro en el sistema de camiones
El operador confirma; solo tipea las excepciones
Puestos según el modelo de nodos · supuesto: hoy una persona por puesto y por turno, tres turnos · la dotación real a relevar con la planta
12

## Slide 13

ARQUITECTURA · QUIÉN HACE QUÉ
Una plataforma, una capa de inteligencia
Consumo: tablero en vivo, torre, informes, comités y la IA de Vicentin
Sistema de camiones: contrato, cupo y producto; lo complementamos
BIMTRAZER
Capa de inteligencia
Modelo de nodos
Reglas y ETL versionados
Estado en vivo
Agentes, capas 1 a 4
Orquestador
MCP con usuario y rol
API de eventos: cada paso confirmado, en tiempo real
API de comandos: barrera, semáforo, llamado; con aprobación
ENESIMAL
Plataforma TruckFlow
Lectura de patentes
Edge por nodo
Microservicios de eventos
Integración PLC
Balanzas y fotocélulas
Operación de la plataforma
Dos equipos, dos interfaces: nadie duplica lo del otro · Truckflow Vicentin · propuesta interna
13

## Slide 14

CÓMO AVANZAMOS
Un proyecto por fases, sobre lo que ya está
1
Base en la nube
BIMTRAZER
2
Sistema de camiones
VICENTIN
3
Capas de agentes y orquestador
BIMTRAZER
4
Integración TruckFlow: eventos y comandos
ENESIMAL
HORIZONTE
Correctivos: el orquestador actúa
POR QUÉ ES BARATO
Infraestructura instalada y paga
Sin obra ni reemplazo de sistemas
Por fases, cada una con valor propio
Parte entra en las 20 h/mes de evolutivo
Nube e IA se pagan por uso
Lo que ya está no se paga dos veces
14

## Slide 15

PRÓXIMO PASO
Decidir llevarle esta propuesta a Vicentin
1
Acceso: que Vicentin nos habilite el sistema de camiones y las balanzas
2
Demo en vivo: la planta y sus playas con datos del día
3
La base y las capas de agentes: qué hacen y qué aportan
4
Gobernanza de agentes: roles, aprobaciones, límites por acción y registro de cada decisión
BIMtrazer · TruckFlow · Septiembre 2026
