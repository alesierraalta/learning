# Modo extenso / universidad — paquete Obsidian

Spec completa para cuando el usuario elige **explicación extensa / de profundidad** en la Fase 0a. El objetivo cambia: no "entender qué estoy haciendo", sino **dominar a profundidad**, como material de estudio universitario.

## Ubicación

Para validar este modo profundo dentro de `Learnings`, consultar [learning-validation.md](learning-validation.md): contiene las rutas del repositorio Go, las reglas y el adaptador local. El motor no se aplica al modo corto ni fuera de esa carpeta; su código no se copia a Pi.

La raíz del vault se resuelve en runtime (configuración del entorno, no de la skill). Ubicaciones conocidas en esta máquina, como referencia:

| Contexto | Raíz del vault |
|---|---|
| WSL / Linux | `/mnt/c/Users/ismar/Documents/obsidian/ale/` |
| Git Bash | `/c/Users/ismar/Documents/obsidian/ale/` |
| Windows | `C:\Users\ismar\Documents\obsidian\ale\` |

Crear si no existe (los paths son vault-relativos):

```
notes/04-RECURSOS/Learnings/<topic-slug>/
├── plan.json                    ← preparation; se actualiza en planning
├── quiz.md                      ← diagnóstico adaptativo, una ronda de 3 bajo otra
├── quiz.json                    ← preguntas estructuradas del diagnóstico
├── quiz.answers.json            ← respuestas recibidas por chat
├── planificador.md              ← tabla, ruta, mapa y planificación
├── mapa.mmd                     ← grafo completo
├── explicacion.md               ← índice y progreso
├── explicaciones/               ← una nota por parte, con su mini-quiz
│   ├── Parte 1 - <slug>.md
│   └── Parte 2 - <slug>.md   (…)
├── mis-palabras.md              ← Pi transcribe aquí vuelcos y correcciones
├── mini-quiz/                   ← sidecars de preguntas y respuestas por parte
│   ├── {part}.json
│   └── {part}.answers.json
├── feedback/                    ← evaluación por parte
│   └── {part}.json
├── ejercicios.md                ← solo al final, tras todos los nodos
├── preferencias.md              ← perfil local, si corresponde
├── cuestionario-final.md        ← recall espaciado y re-puntaje del mapa
├── cuestionario-final.json
└── cuestionario-final.answers.json
```

`<topic-slug>` en minúsculas, sin tildes, guiones medios (ej. `jdbc-connection-pooling`).

Si la raíz del vault no se puede resolver en esta máquina, pedirla al usuario ANTES de escribir; nunca inventar una ruta.

## Orden de entrega

1. **Fase 0a**: preguntar corto/extenso y esperar.
2. **Fase 0a2 — investigación previa**: investigar con fuentes primarias, construir el mapa de dependencias por concepto y completar la bibliografía verificada. No redactar preguntas todavía.
3. **`preparation`, antes del diagnóstico**: el tutor escribe `plan.json` con el tema y una parte por cada nodo-concepto que se evaluará; cada parte debe declarar `examplesPlanned` y `visualsPlanned` explícitamente. Validar y avanzar esta etapa con `learning_stage`.
4. **Fase 0b — diagnóstico adaptativo**: el builder escribe la **ronda 1** en `quiz.md` (3 preguntas básicas del tema, una por área); tras cada ronda respondida, el tutor muestra el resultado de la ronda y el builder añade la siguiente debajo según la regla de subir/bajar de `metodo-explicame.md` FASE 0b, hasta que el motor no deba ninguna ronda o se llegue a 3. Los nodos no muestreados quedan `⚪ no evaluado`. La pieza visual o el ejemplo plantea un caso, nunca lo resuelve. Avisar en chat con la ruta y las áreas muestreadas; la persona responde en el chat. El tutor registra respuestas, sidecars y puntaje según el contrato de autoría, y actualiza `quiz.md`.
5. **`planning`, después de las respuestas**: añadir `diagnosisSummary` y `focusAreas` a `plan.json`; el builder redacta `planificador.md`, `mapa.mmd` y `explicacion.md` con tabla, mapa coloreado, ruta, plan visual, estructura por nodo, áreas de vuelco, bibliografía, ejercicios previstos, pre/post-preguntas y bitácora. Los nodos sin pregunta conservan `⚪ no evaluado`.
6. **Preferencias**: reutilizar el perfil existente. Si `Learnings/preferencias.md` tiene `alcance: global`, preguntar una sola vez si algo cambió; usar un perfil local existente sin repetir las 20 preguntas. Preguntar las 20 solo si no existe ningún perfil. Aplicar `references/preferencias.md`.
7. **Índice y loop**: preparar `explicacion.md` y las áreas de `mis-palabras.md`; entregar una parte y su mini-quiz. La persona envía el vuelco y las respuestas en chat; Pi registra el vuelco literalmente y su corrección en Obsidian. Al cerrar la parte conforme al motor, Pi escribe y anuncia inmediatamente la siguiente, sin preguntas ni espera adicionales.
8. **Después de todos los nodos**: crear `ejercicios.md`; después crear `cuestionario-final.md`, registrar respuestas y actualizar el mapa con el re-puntaje.
9. Guardar memoria de sesión (tema, puntajes y rutas).

## Autoría de notas y datos

Un único contrato rige toda la sesión; `learning-validation.md` lo referencia. Los builders redactan las notas `quiz.md`, `planificador.md`, `mapa.mmd`, `explicacion.md`, cada parte de `explicaciones/`, `ejercicios.md` y `cuestionario-final.md`. No deciden el alcance, cambian tags ni reordenan la ruta; el tutor revisa sus entregas.

El tutor del chat principal escribe los JSON sidecar y todo lo transcrito desde el chat: `plan.json` (preparation y actualización en planning); `quiz.json` a partir de `quiz.md` si el builder no lo entregó; `quiz.answers.json` y los demás archivos de respuestas; `mini-quiz/{part}.json`; `feedback/{part}.json`; `cuestionario-final.json`; y `mis-palabras.md`, donde copia literalmente cada vuelco y añade la corrección. También actualiza `quiz.md` tras recibir respuestas: `estado: completado` y `puntaje` derivado. La persona nunca edita Obsidian: la pantalla es Obsidian (o su vista HTML, generada de las mismas notas) y la entrada es el chat, escrita a mano o enviada desde la vista HTML (ver «Vista HTML conectada al chat»).

Para cada nota, delegar a un builder acotado con handoff exacto: plan y visual asignado, tags `subtema`/`nivel`, perfil aplicado, bitácora y corrección anterior, superficies permitidas, español neutro y M1–M10. El tutor verifica el resultado y conserva la decisión pedagógica. Las respuestas y los vuelcos se recogen siempre en el chat.

## 1. `quiz.md` — diagnóstico adaptativo por rondas de 3

> Temas con diagnóstico por concepto (reglas nuevas): manda «Diagnóstico por concepto» de `SKILL.md`; lo de este punto aplica a los temas iniciados antes.

- Frontmatter: `tipo: quiz-diagnostico`, `tema`, `fecha`, `estado: pendiente|completado`, `puntaje`. El builder deja `estado: pendiente`; cuando el motor ya no debe ninguna ronda, el tutor fija `estado: completado` y `puntaje` (aciertos/preguntas hechas).
- **Una sección por ronda** (`## Ronda 1`, `## Ronda 2`…), cada una con 3 preguntas como máximo. La ronda 1 tiene una pregunta básica del tema por área; las siguientes siguen la regla de subir/bajar de `metodo-explicame.md` FASE 0b. Una ronda nueva se añade **debajo** cuando la anterior está respondida; nunca se reescribe una ronda ya respondida.
- **Bajo cada ronda respondida**, un callout corto de resultado (la recompensa): `> [!success] Ronda 1: 2/3` con una línea de qué significa y hacia dónde va la siguiente ronda. Las correcciones de cada pregunta van en un callout plegado.
- **Cada pregunta renderizada** incluye su número dentro de la ronda (`1.1`, `1.2`, `2.1`…), opciones A–D **+ E «No sé»** y etiquetas `nivel: básico|medio|avanzado` y `subtema: X` — el mismo código que usará el planificador. En `quiz.json` cada pregunta lleva `round` y, desde la ronda 2, `follows` (el id de la pregunta a la que da seguimiento).
- **Un elemento visual o ejemplo concreto dentro de cada pregunta** es obligatorio: debe plantear el caso que se analizará, sin revelar su resultado, conclusión, definición ni pistas.
- No mostrar respuestas, definiciones, pistas ni callouts de ayuda antes de que la persona responda. Después, el tutor registra las respuestas y añade las correcciones en un callout plegado.
- Nada de texto plano ni ASCII: callouts, tablas, code blocks, Mermaid, SVG, `$...$`.
- Al final de cada ronda: instrucciones para responder en el chat, una por número (`1.1-B 1.2-E 1.3-C`).

### Capa visual del quiz (obligatoria en modo extenso)

Cada pregunta lleva UN recurso elegido por lo que la pregunta mide:

| Recurso | Cuándo va en la pregunta |
|---|---|
| Código real resaltado (```java, ```python, ```sql…) | pregunta sobre lectura o salida de código |
| Salida / traza de ejecución en code block | "¿qué imprime esto?", "¿qué falla?" |
| Tabla de datos o de estados | valores a comparar, distribuciones, matrices de decisión |
| Diagrama Mermaid (`flowchart`, `sequence`, `state`) | pregunta sobre un flujo o una transición |
| SVG inline | estructuras que Mermaid no cubre: memoria, punteros, capas, arquitectura |
| `$...$` / `$$...$$` (KaTeX nativo) | pregunta numérica o de fórmula |
| Caso concreto con nombres y números | cualquier pregunta que se beneficie de "imagina que…" |
| Imagen / screenshot | interfaces, outputs reales |

Regla: si la pregunta se responde igual sin la pieza, la pieza está mal elegida.

## 2. `planificador.md` — tabla + mapa de dependencias

`planificador.md` se escribe DESPUÉS de que la persona completa el quiz; `plan.json` ya se creó en `preparation` y se actualiza aquí. Contenido obligatorio, en este orden:

0. **Pre-preguntas**: lo previo necesario antes del testeo — respuesta de Fase 0a (corto/extenso), tema pedido textual, fecha, contexto previo que el lector haya declarado y modo. Es la línea base contra la que se interpreta todo lo que sigue.

1. **Resultado**: puntaje global `n/N`, tabla por subtema (P0.x incluidos) y por nivel.
2. **Tabla de plan**: subtema → qué sabes → profundidad (saltar / repaso rápido / desde cero) → por qué. Mismas reglas que `metodo-explicame.md`. Los P0.x caídos entran como puente antes de la ruta del tema. El plan registra el Perfil aplicado (de `preferencias.md`) y adapta a él ruta, profundidad, visuales, ejemplos y ritmo.
3. **MAPA DE DEPENDENCIAS (obligatorio, Mermaid)** — el corazón del planificador. Aquí es donde los tags del quiz se convierten en la ruta:

   - **El grafo ya existe desde la Fase 0a2** (investigación previa). Aquí solo se colorea: **no se inventa, no se recorta, no se aplana**. Su granularidad es la misma que la que se investigó.
   - **Granularidad exigida — un nodo = un concepto, no un capítulo.** Los `subtema` del quiz (los padres) **se descomponen** en la cadena de conceptos que los sostiene, con código propio bajo el padre. Ej.: `1.2.2` no es un nodo, son `suma simple → retorno descontado → convención de índice → forma recursiva → significado de γ → extremos`. Un mapa de `4–6` nodos por capítulo solo es legítimo si el tema realmente tiene `4–6` conceptos. Un nodo grueso esconde exactamente dónde está el error. Y el nodo se mide en lo que se lee: si la prosa de la parte pasa de **450 palabras** (`estandar-explicacion.md` §0), el nodo se declara como **dos partes** en `plan.json`; no se comprime ni se resume para que quepa.
   - **Los padres conservan su código y sus `P#` sin cambios** — nada se renombra ni se fusiona. Los hijos se añaden debajo.
   - **Nodos** = cada concepto, **etiquetado con el MISMO código `subtema`** y citando **qué números de pregunta lo evalúan** (ej. `P1 · P5`).
   - **Cinco estados, no tres**: verde = sólido, ámbar = frágil, rojo = hueco, **gris `⚪` = no evaluado** por el quiz — **no hereda el resultado del padre**, solo el tratamiento de ruta (padre ámbar → entra en su repaso; padre verde → mención rápida), y **azul** = extensión del tema que el quiz no cubre pero el mapa muestra para que la explicación tenga el terreno completo. Cada nodo muestra además su nivel máximo alcanzable (`básico` / `medio` / `avanzado`).
   - Aristas = prerequisito real ("A antes de B"), no decoración.
   - El grafo **ES la ruta de la explicación**: orden topológico, huecos primero, verdes podados. **Dentro de cada nodo se sube `básico → medio → avanzado`, nunca al revés.**
   - Sintaxis base: `flowchart LR` + `classDef ok/frag/gap/neu/ext` con `class` aplicado a cada nodo. Dimensionar el nodo (texto largo > `["..."]`) y marcar la ruta activa con `linkStyle` o un nodo `:::ruta`. **Nunca un único bloque con todo el mapa**: Mermaid se renderiza estático dentro del ancho de lectura y pasado ~15 nodos no cabe en ninguno de los dos ejes. Se entrega en **capas** — vista general (≤10 nodos) → detalle por bloque (≤12 nodos) → grafo completo en el fichero `mapa.mmd`, que con el plugin `mermaid-view` se abre a pantalla completa con zoom y paneo. Ver "Diagramas grandes — cómo se ven enteros".
   - Legenda debajo del grafo: qué significa cada color, cómo se lee la flecha, cómo se leen las etiquetas `P#` y **qué significa `⚪`**.

   ```mermaid
   flowchart LR
     A["1.1.1 Tipos y conexión<br/>P1 · P5<br/>3/3 verde — dominas"]:::ok --> A1["1.1.1.1 PreparedStatement<br/>no evaluado"]:::neu
     A --> A2["1.1.1.2 SQL injection<br/>no evaluado"]:::neu
     A --> B["1.1.2 PreparedStatement<br/>P2 · P6<br/>1/3 rojo — desde cero"]:::gap
     B --> C["1.1.3 ResultSets<br/>P3 · P7<br/>2/3 ámbar — repaso"]:::frag
     C --> D["1.1.4 Transacciones<br/>P4 · P8<br/>0/3 rojo — desde cero"]:::gap
     classDef ok fill:#d4edda,stroke:#28a745,color:#14532d
     classDef frag fill:#fff3cd,stroke:#ffc107,color:#7a5b00
     classDef gap fill:#f8d7da,stroke:#dc3545,color:#58151c
     classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451
     classDef ext fill:#e7f0fe,stroke:#4a7fd4,color:#14315e
   ```

   (Ejemplo ilustrativo **truncado**: el mapa real tiene todos los conceptos del tema, no estos.)
4. **Ruta numerada**: lista 1..N con el orden exacto de estudio derivado del grafo, indicando profundidad por nodo y **el nivel al que llega cada uno** (`básico → medio → avanzado`). Cada entrada cita el `subtema` y sus `P#`, para que se vea que el plan salió del quiz y no de la nada.
5. **Plan visual obligatorio por parte** (sin esto el plan está incompleto): una fila por cada parte prevista, con el visual **ya elegido antes de escribir**. Especificar tipo concreto, no "usar visuales" — el tipo tiene que encajar con lo que la parte explica:

   | Parte | Nodo | Escalón | Tipo de visual | Qué tiene que mostrar |
   |---|---|---|---|---|
   | 1 | `1.2.2` | básico | SVG línea de tiempo dual | por qué misma suma ≠ mismo retorno |

   - **Tipos disponibles y cuándo corresponde cada uno**: `sequenceDiagram` cuando el concepto es un intercambio en el tiempo entre actores; diagrama de **arquitectura** (SVG) cuando es una estructura con piezas y flujos; `flowchart` cuando es una relación o un recorrido; `stateDiagram-v2` cuando hay estados y transiciones; `classDiagram`/`erDiagram` cuando hay entidades y relaciones; SVG inline cuando ninguno de los anteriores representa bien la idea (líneas de tiempo, capas, comparaciones ANTES/DESPUÉS, decaimientos); tabla cuando hay datos que contrastar; KaTeX cuando hay matemática.
   - **Regla de asignación**: si un escalón de un concepto tiene una forma visual natural y en su fila no se asigna un visual, **la parte está mal planificada**. Si el concepto realmente no admite visual, se escribe `— (sin forma visual: concepto puramente declarativo)` con la razón, para que la ausencia sea una decisión y no un olvido.
   - La parte se escribe respetando su fila: sin visual asignado no se entrega.
6. **Estructura de explicación prevista, por nodo** (obligatorio): para **cada** nodo que entra en la ruta — no solo los que se saltan — un bloque que declare el plan didáctico **antes** de escribir cada parte en `explicaciones/`. Es una declaración de intenciones, no un borrador de texto: sirve para que quede comprometido el "cómo lo voy a explicar" y para que se vea si el plan es coherente con lo que el quiz detectó. Mínimo por nodo:
   - **Punto de partida**: desde dónde se arranca (`desde cero` / `repaso desde su base` / `puente de 1 min` / `saltar`), justificado por sus `P#`.
   - **Arco**: número de partes y qué escalón cubre cada una (`básico → medio → avanzado`), en orden.
   - **Estructura de cada parte**: el esqueleto que se va a usar (PROBLEMA → QUÉ → POR QUÉ → QUÉ PASARÍA SI NO, o el que corresponda), dicho una sola vez por nodo si todos los nodos comparten esqueleto.
   - **Visuales**: ya asignados en §5 (plan visual por parte del planificador), referenciados por número de parte.
   - **Ejemplos**: si el nodo va con ejemplos concretos, cuáles (dominio, datos); o `sin ejemplos — concepto declarativo` con la razón.
   - **Matemática**: si el nodo tiene fórmulas, cuáles y en qué escalón aparece por primera vez; si no las tiene, `sin matemática`.
   - **Desde cero o no**: si la parte reconstruye el concepto desde sus prerequisitos o da por hecho lo verde.
   - **Riesgo de confusión**: 1–2 confusiones previsibles (las que suelen salir del quiz) y en qué parte se neutralizan.
   - Un nodo de la ruta **sin** este bloque = plan incompleto, igual que una parte sin visual.
7. **Área de vuelco "con mis propias palabras"** (obligatorio en el plan): la página `mis-palabras.md` — **separada** de `explicaciones/` y de los apuntes — con **un hueco en blanco por parte**. **Nunca se le formula una pregunta al lector**: él vuelca ahí con sus propias palabras **lo que entendió y lo que no entendió**; la respuesta del tutor es **corrección**, no pregunta. Comprueba comprensión real en vez de reconocimiento: un MCQ se acierta eliminando opciones; volcar el concepto sin mirar no se elimina.
   - **Cuándo**: después de leer una parte de `explicaciones/`, **antes** de que se desbloquee la siguiente. La parte solo se cierra cuando el mini-quiz **y** el área propia están entregados.
   - **Encabezado fijo, igual en todas las partes** (no varía ni se convierte en consigna): *"Vuelca aquí, con tus palabras, todo lo que entendiste de esta parte y todo lo que no entendiste. No hay pregunta que responder: solo suelta. Después te digo qué te faltó."*
   - **Ámbito declarado por parte**, no pregunta: la fila de `planificador.md` nombra qué cubre esa área y si puede o no mirar la parte. El ámbito acota; **no interroga**.
   - **La corrección entrega cuatro campos**: `Te faltó explicar` (lista de lo central ausente) · `Estaba mal` (con el por qué) · `En la línea` (qué conservar) · estado `✔ En la línea` / `✖ Te falta` + una frase. Eso es todo — es un marcador de rumbo, no una nota.
   - **Qué NO se evalúa**: ortografía, extensión, registro, formato, si copió términos técnicos.
   - **Separación obligatoria**: esta página vive aparte de `explicaciones/` y de cualquier "apuntes" o "resumen para guardar". Mezclar la voz del lector con el material de estudio mata la utilidad de ambas.
8. **Bibliografía y verificación** (obligatorio): el conocimiento del tema **no sale de la memoria del modelo**, sale de fuentes. **Se hace en la Fase 0a2, ANTES del quiz** — no después —, para que toda respuesta clave nazca ya verificada. Antes de escribir `quiz.md` o cualquier parte, investigar y registrar aquí de dónde sale cada afirmación. Dos motivos: una fuente primaria corrige convenciones ambiguas (el desfase de índice en el retorno, que es exactamente donde se puede equivocar una pregunta), y la cita obliga a sostener cada hecho.
   - **Regla de investigación**: investigar **por defecto**. Excepción única: cuando la respuesta es de dominio público inequívoco y el coste de verificar supera claramente el beneficio (p. ej. `acción = decisión del agente`). La excepción se aplica a **afirmaciones**, no a **ejercicios**: toda pregunta con respuesta clave, todo cálculo y toda fórmula con índice o potencia **se verifica siempre**, sin excepción — porque ahí es donde cuesta un ejercicio mal.
   - **Prioridad de fuentes**: 1) fuente primaria (libro de texto, paper, documentación oficial del estándar); 2) material de autoridad reconocida del campo (apuntes del propio autor, guías oficiales); 3) solo como apoyo, tutoriales o posts. Las fuentes 1–2 bastan para cualquier claim; la 3 nunca sostiene sola una respuesta clave.
   - **Tabla de verificación** (mínimo obligatorio), una fila por claim clave:

     | Claim | Fuente (sección/URL) | Qué verificó | Estado |
     |---|---|---|---|
     | $G_t = r_{t+1} + \gamma r_{t+2} + \gamma^2 r_{t+3} + \dots$ | Sutton & Barto, cap. 3 §3.3 | convención de índice (γ² sobre `t+3`) | ✅ verificado |

   - **Estados permitidos**: `✅ verificado` (leído en la fuente), `⚠️ por sección` (fuente localizada, sección confirmada, texto no leído literalmente — se declara y no se cita número de ecuación), `❌ sin fuente` — prohibido si sostiene una respuesta clave: en ese caso la afirmación se reescribe, se matiza o se quita.
   - **Doble revisión obligatoria de toda respuesta clave**: (a) coherencia interna — planchar la fórmula de la fuente sobre el enunciado y comprobar que da **una sola** respuesta posible; (b) coherencia con el distractor — comprobar que ninguna otra opción es defendible con la misma fórmula. Si dos opciones sobreviven a ese test, la pregunta está mal y no se entrega (fue exactamente el fallo de la P9 original: tabla en `t+2` + fórmula con γ² en `t+3` → dos respuestas).
   - **Trazabilidad en la entrega**: cada archivo de `explicaciones/` lleva su línea `**Fuente**: <fuente, sección>` **justo bajo el título, dentro del bloque plegado de metadatos** (ver §3, regla de metadatos plegados); el plan lleva la bibliografía completa al final. El lector siempre puede ir de la afirmación a su origen, pero esa línea no interrumpe la explicación.

9. **Ejercicios finales — bloque en el plan** (obligatorio, pero solo se ejecuta al final): el plan declara **ya ahora** qué ejercicios habrá, aunque `ejercicios.md` se crea **después de terminar todos los nodos**. Una fila por ejercicio:

   | Ejercicio | Nodo que prueba | Formato | Qué mide |
   |---|---|---|---|
   | Implementar `calcular_retorno(recompensas, gamma)` y reproducir la tabla de `P9` | `1.2.2.3` | código (Python) | si la convención de índice está realmente interiorizada |

   - **Propósito declarado**: que el aprendizaje **no dependa solo del multiple choice**. El quiz mide si *reconoce*; los ejercicios miden si *sabe construir*.
   - **Código cuando el tema lo permita**: pedirle al lector qué haría, mostrarle el código, y dejar que lo ejecute y lo modifique. Tema sin código → casos prácticos, documentos o problemas de razonamiento: **el formato se adapta, lo "práctico" no se negocia**.
   - **Formatos no-MCQ siempre presentes**: problema de cálculo · depurar código con errores planteados · rellenar huecos · flashcards · "explica esto a un colega".
   - **Nunca dentro del loop.** Bloque presente en el plan sin `ejercicios.md` es correcto (está planificado); `ejercicios.md` sin bloque en el plan es un plan incompleto.

10. **Post-preguntas — primera zona de testeo, construye el plan inicial**: autopsia del diagnóstico — qué áreas cayeron y con qué causa probable, decisiones de puente P0.x, qué asume la ruta sobre el lector y qué preguntas abiertas debe responder el loop. El puntaje (§1) dice *cuánto*; aquí se dice *por qué* y *qué se hace al respecto*.
11. **Bitácora (crece durante todo el proceso)**: una entrada fechada por cada evento de aprendizaje — puntajes de mini-quizzes, veredictos de vuelcos con sus huecos, rondas de reenseñanza (qué falló → qué cambió → resultado del re-quiz), métodos que no funcionaron, descubrimientos sobre cómo procesa la información (qué formatos le entran, qué errores repite), cambios de preferencias. Formato por entrada: fecha + evento + qué cambia en lo que sigue. Cada parte posterior y cada constructor la consultan; el plan que no se actualiza con lo ocurrido es un plan muerto.

## 3. `explicacion.md` + `explicaciones/` — índice + una parte por archivo

Estructura de **unidades cortas iteradas**: leer parte → mini-quiz → leer siguiente parte → mini-quiz → … hasta el final. Nunca entregar todas las partes de una.

- **Una parte = un archivo**: las partes NO van todas en `explicacion.md`. Cada parte se escribe en `explicaciones/Parte N - <slug>.md`, donde `N` es su posición en `plan.json` y `<slug>` es **exactamente** el `slug` de esa parte en `plan.json` (corto, sin tildes; ej. `Parte 1 - El retorno.md`). Nunca inventar otro nombre en el índice ni en el archivo. `explicacion.md` queda como **índice**: frontmatter con `progreso`, una línea de instrucción, el bloque plegado de metadatos de nivel fichero, y la lista de **todas** las partes del plan con su estado (✅ cerrada / 🔓 abierta / ⬜ pendiente). **Solo se enlaza una parte cuando su nota ya está escrita**, y entonces con la **ruta completa dentro del vault**: `[[notes/04-RECURSOS/Learnings/<tema>/explicaciones/Parte 1 - El retorno|Parte 1 — El retorno]]`. Una parte pendiente se lista como texto, sin enlace: `- Parte 2 — <título de plan.json> — ⬜ pendiente`. Un enlace a una nota que no existe hace que Obsidian la cree vacía al hacer clic. Al escribir una parte, se cambia su línea por el enlace en el mismo turno. El motor rechaza un índice que enlaza partes sin escribir, que no enlaza (con ese formato y ese slug) una parte escrita, o que enlaza partes que el plan no define. Nada de contenido didáctico en el índice: un índice que explica es una parte fuera de lugar.
- **Frontmatter por parte**: `tipo: explicacion`, `tema`, `parte: N de M`, `nodo`, `nivel`, `estado: abierta|cerrada`, `fecha`, `spec`. El `progreso` global vive solo en el índice. Cada archivo lleva además su **bloque plegado de metadatos** (ruta · visual · fuente) bajo su título, y cierra con su mini-quiz + su callout de entregas.

- **Cada parte**: una sola idea, medida como manda el tope de la skill (450 palabras de prosa, 2 secciones, `## Ruta` de 4 líneas, 1 escena, 1 recorrido; ver `estandar-explicacion.md` §0), con el tono de `metodo-explicame.md` (PROBLEMA → SOLUCIÓN, QUÉ + POR QUÉ + QUÉ PASARÍA SI NO, datos concretos, analogía del mundo real antes que el formalismo) y **registro sin condescendencia**: explicar lo más difícil de lo más simple, con ejemplos, pero tratando al lector como adulto ocupado — simplificar el concepto, nunca a la persona. Español neutro: sin voseo, sin jerga regional, sin referencias a un país concreto.
- **Escalera de profundidad (dentro del tope)**: los dos escalones que caben en una parte suben de lo básico a lo complejo **en el mismo arco**, sin saltos:
  1. Qué es y para qué sirve, con la analogía y un ejemplo concreto con nombres y números.
  2. Cómo funciona por dentro, con su diagrama, y la forma rigurosa del concepto — **y si el tema tiene matemáticas, se usan**: la fórmula se escribe en `$...$`/`$$...$$`, se lee término a término y se interpreta en palabras. Nunca se esconde la matemática; se pospone hasta que la base que la sostiene quedó clara: intuición primero, símbolo después.
  Casos borde, fallos y «¿y si…?» son materia de la parte siguiente: el tope de 450 palabras y 2 secciones manda, y una parte que no cabe se divide.
- La parte abre con **un único bloque plegado de metadatos** y después ya entra en el contenido. Lo que es navegación — `ruta paso X de Y`, `subtema` + escalón, `parte N de M del nodo`, `Visual asignado`, `Fuente` — **no va en el flujo de lectura**: genera ruido justo donde el lector tiene que concentrarse. Va todo junto en `<details>`/`<summary>` justo bajo el título, plegado por defecto:

  ```markdown
  ## Parte 1 — El retorno …

  <details>
  <summary><b>Ruta · visual · fuente</b> — metadatos de la parte, no lectura</summary>

  - **Ruta**: paso 1 de 2 · nodo `1.2.2` … · escalón **básico** (parte 1 de 3 del nodo)
  - **Visual asignado**: SVG arquitectura del bucle agente–entorno + SVG línea de tiempo dual
  - **Fuente**: Sutton & Barto (2018), cap. 3 §3.3 *Returns* … · verificación en `planificador.md` §8 (bibliografía y verificación)

  </details>

  ### El problema
  ```

  **Obligatorio, no opcional**: los tres datos siguen teniendo que existir y bajo el título — la trazabilidad de la fuente, el nodo del mapa y el visual asignado son requisitos del plan — pero **colapsados**. Un `<details>` con esas tres líneas ocupa una sola línea visible. `DOMPurify` de Obsidian permite `<details>`/`<summary>`. La misma regla aplica a los metadatos de nivel de fichero (ruta general, origen de los visuales): se pliegan, no se borran, y solo la instrucción útil —cómo se cierra una parte— queda a la vista. La parte cierra con su `nivel`.
- **Apertura con repaso (desde la parte 2; la parte 1 abre en limpio)**: cada parte abre —después del bloque plegado de metadatos— con un bloque corto basado **solo** en la corrección anterior (`mis-palabras.md`: `En la línea` / `Te faltó explicar` / `Estaba mal`). Dos mitades: (a) **refuerzo**: 1–2 líneas que reafirman lo que quedó sólido, como base de lo que sigue; (b) **mini clase de repaso**: lo que falló o no se entendió se **explica de nuevo en breve** —no se lista ("repasar X"), se enseña (la idea dicha de otra forma en 2–3 líneas)— con palabras nuevas, nunca copiando la corrección, nunca con tono de corrección nueva, nunca como pregunta. Encabezado fijo: `> En base a la explicación anterior, convendría repasar nuevamente estos puntos.` Tope: el bloque no pasa de 10 líneas y no introduce conceptos nuevos; si el hueco exige re-enseñanza completa, se abre mini-loop en vez de inflar el repaso. **Excepción**: lo que pertenece a una parte futura no se explica aquí — se avisa en claro, ej. `> Esto todavía no lo entiendes porque aún no lo hemos visto: es la Parte 3, que es su sitio.` Sin huecos en la parte anterior, solo aparece la mitad de refuerzo como puente de 1–2 líneas (sin el encabezado de repaso).
- **Cada parte cierra con un mini-quiz** (A–D + «No sé»; 5 preguntas en temas antiguos, integradoras y las que decida el modelo en los nuevos, con un solo razonamiento `razonamiento` **opcional**, escrito o dictado con el micrófono de la página) para recuperar y relacionar conceptos. No incluir respuestas ni correcciones antes de que la persona responda en el chat; después, el tutor registra `mini-quiz/{part}.answers.json` y añade la corrección en un callout plegado. El builder incluye las preguntas en la nota de la parte; el tutor escribe `mini-quiz/{part}.json` y actualiza `fallos_por_concepto` con el resultado.
- **Inyección obligatoria de respuestas y corrección en la nota de la parte**:
  Obsidian es la pantalla de estudio del alumno. Las partes nunca quedan desnudas tras responder.
  Inmediatamente después de que la persona responda el mini-quiz y los ejercicios en el chat, el tutor DEBE actualizar la propia nota de la parte en Obsidian insertando al final un callout plegado:
  `> [!success]- Respuestas, corrección y resultados de la evaluación (Puntaje: X/N — Y%)`
  con:
  - Cada pregunta desglosada: la respuesta dada por el alumno, la opción correcta, check verde/rojo y explicación técnica detallada.
  - Evaluación y solución explicada de los ejercicios prácticos de código SQL.
  - Frontmatter de la parte actualizado a `estado: cerrada`.
  - Transcripción y veredicto formal en `mis-palabras.md`.
- **Nunca terminar un turno con una etapa a medias**: si `validate` devuelve un `FAIL` que no sea «waiting for learner input», corregir los archivos y validar otra vez **en el mismo turno**; no anunciar notas, partes ni planificación que el motor no aceptó. El motor marca `blocked` cualquier etapa empezada que falle, y Pi no da el turno por cerrado mientras siga así.
- **Loop**: la parte no se cierra hasta recibir el vuelco en chat, aprobar el mini-quiz y completar las validaciones/revisiones del motor. Al confirmarse el cierre —y también justo después de avanzar `planning`—, Pi escribe la siguiente parte, la enlaza en el índice, la valida y la anuncia **en el mismo turno**, sin preguntas adicionales ni espera. Si la siguiente etapa del motor es `explanation`, el turno no termina hasta que la parte existe. La persona nunca edita Obsidian.
- **Estado**: `progreso: parte 3 de 7` en el frontmatter del índice; `fallos_por_concepto` se anotan en la parte que los produjo.

### Reenseñanza cuando el motor reabre una parte

En Learnings, el contrato lo fija el motor. Un mini-quiz falla si el puntaje es menor que 4/5 **o** si se respondió mal cualquier pregunta central. Además, una revisión `central-gap` con veredicto `PASS` en `feedback` significa que detectó una laguna central en el vuelco; también reabre la explicación de esa parte. Ambos motivos comparten el mismo límite de 2 rondas por parte.

El motor reabre `explanation` → `own_words` → `quiz`; no se avanza a la siguiente parte. El tutor registra el nuevo vuelco desde el chat. El builder reescribe la explicación de forma distinta y el cambio debe ser real respecto de la versión del intento fallido; repetir el mismo texto no satisface el motor. Después se vuelve a explicar, recoger el vuelco y presentar las 5 preguntas. La parte solo se cierra al aprobar el mini-quiz y completar las revisiones posteriores. Si se agota el límite, el motor queda `blocked`: no declarar la parte cerrada ni iniciar otra.

La evaluación del vuelco juzga solo si falta o está mal expresado un concepto central, nunca su ortografía, extensión o registro. Un `PASS` de `central-gap` significa «se detectó una laguna», no que la revisión haya fallado. Para el detalle de estados y el presupuesto, ver `learning-validation.md` → «Bounded re-teaching».

### Capa visual (obligatoria, a full)

Usar TODO lo que Obsidian soporta, priorizando por qué explica mejor, no por estética. **En modo extenso no hay texto plano**: ningún concepto queda solo en prosa si puede ir acompañado de una pieza.

| Recurso | Cuándo | Estado verificado en este vault |
|---|---|---|
| **KaTeX `$...$` / `$$...$$`** | cualquier fórmula, derivada, sumatorio, probabilidad | ✅ **nativo** (KaTeX viene embebido en Obsidian, sin plugin) |
| **Code blocks con lenguaje** (```java, ```sql, ```python) | todo ejemplo de código: se resalta solo | ✅ **nativo** |
| Mermaid (`flowchart`, `sequence`, `state`, `classDiagram`, `erDiagram`) | flujos, secuencias, estados, estructuras | ✅ `mermaid-view` activo |
| SVG inline (`<svg>` en el md) | diagramas que Mermaid no cubre bien: capas, memoria, punteros, ANTES/DESPUÉS | ✅ nativo |
| Excalidraw (`![[...excalidraw]]`) | diagramas a mano, mapas conceptuales, "dibujar la idea" | ✅ `obsidian-excalidraw-plugin` activo |
| Imágenes / screenshots | interfaces, outputs reales, esquemas | ✅ nativo |
| **HTML crudo en el md** (`<details>`, `<table>`, `<div>`, `<mark>`, `<kbd>`, SVG) | plegar respuestas, maquetar, resaltar términos | ✅ nativo, sanitizado (DOMPurify) — ver "Render de HTML" |
| Tablas | comparaciones, contraste viejo-vs-nuevo, "cuándo usar cada uno" | ✅ nativo |
| Callouts (`[!info]`, `[!warning]`, `[!tip]`, `[!example]`) | advertencias, puentes con lo ya sabido, correcciones, respuestas plegadas | ✅ nativo |
| Syntax highlight con **línea activa** (`// [!code highlight]`) | recorrer un código línea por línea | ⚠️ requiere `obsidian-code-styler` — ver "Estado de plugins" |
| markmap (`# markmap`) | jerarquías y taxonomías | ⚠️ requiere `obsidian-markmap` — ver "Estado de plugins" |
| Dataview | índice automático solo si el bundle crece | ✅ `dataview` activo |
| Meta Bind (`metabind` code blocks) | sliders, botones, toggles, valores que el lector modifica y observa | ✅ instalado — activar en la app tras recargar |
| Canvas (lienzo core) | recorrer conceptos espacialmente, mapas vivos | ✅ nativo (core — confirmar activo al usar) |
| Desmos / Live Plots | funciones y parámetros que el lector modifica | ✅ instalado — activar en la app tras recargar |
| GeoGebra | geometría y elementos matemáticos manipulables | ✅ instalado — activar en la app tras recargar |
| DataCharts | datos inspeccionables visualmente | ✅ instalado — activar en la app tras recargar |
| Quizzable | evaluaciones dentro de la nota | ✅ instalado — activar en la app tras recargar |
| JS Engine | interacción a medida que nada anterior resuelve | ✅ instalado — activar en la app tras recargar |

Una visual **inmediatamente adyacente** después de cada punto mayor de la parte — no una por oración. Mostrar siempre ANTES/DESPUÉS. Sin emojis dentro de diagramas. Cargar `mermaid-diagram`'s `references/upstream-mapping.md` si está activo, y elegir el patrón semántico antes que el tipo de diagrama.

### Selección del recurso — según el concepto, no por defecto

Mermaid y SVG se mantienen, pero no son la opción automática. La **naturaleza del concepto** decide la herramienta; las **preferencias** modulan cuánta pieza y de qué tipo.

| Hay que explicar… | Recurso |
|---|---|
| dependencias, procesos, secuencias | Mermaid |
| representación visual precisa | SVG |
| esquemas o relaciones espaciales | Excalidraw |
| funciones y relaciones matemáticas | Desmos / Live Plots |
| geometría o elementos manipulables | GeoGebra |
| datos | DataCharts |
| variables que el lector modifica | Meta Bind |
| evaluaciones dentro de la nota | Quizzable |
| interacción a medida | JS Engine |
| simulación compleja | Canvas Drawing / HTML / JS (página aparte si hace falta) |

Cada fila del plan visual (§5) justifica su recurso en una frase: qué nodo o dificultad sirve y por qué esta herramienta y no otra. Sin justificación no se construye. No hace falta interactividad en todas las partes: se usa cuando lo manipulable enseña lo que lo estático no alcanza — ej. mover γ y ver cómo cambia la curva enseña más que tres gráficos fijos.

### Interactividad con propósito (no decoración)

Mostrar estático lo que se puede manipular es una oportunidad perdida; poner controles que no enseñan nada es ruido. Reglas:

- Cada pieza interactiva nace atada a un nodo y a un malentendido concreto, con instrucción observable ("mueve γ y mira cómo cambia la curva", "cambia el valor y observa la consecuencia inmediata"). Sin instrucción observable no se entrega.
- Controles etiquetados, estado inicial con significado y forma de reiniciar. El efecto debe verse en la misma pantalla, sin cazarlo por la nota.
- **Fallback estático obligatorio**: si el plugin falta, está roto o se deniega su instalación, la parte sale igual con la versión estática (SVG/Mermaid/tabla). Nunca una parte depende de un plugin no aprobado.
- **Aprobación previa**: un plugin no instalado no se usa sin proponerlo antes (nombre + qué permite + fallback). La apertura del lector a instalar no sustituye la propuesta.
- M10 vale también aquí: si la pieza necesita el párrafo de al lado para entenderse, está mal hecha aunque sea interactiva.

### Métricas mínimas de calidad de un visual — obligatorias, con número

En Learnings, el motor comprueba que los visuales planificados estén presentes en un formato aceptado, al menos `thresholds.minVisuals` de ellos, y que cada uno lleve la guía `thresholds.howToReadLine` en su línea siguiente (M1); la calidad pedagógica (M2–M10) sigue siendo del tutor. El builder aplica M1–M10 y el tutor las comprueba y registra la revisión semántica `visual-value` cuando corresponde. Esta lista es la responsabilidad de calidad, verificable con cifras, no un control del motor. Un dibujo más difícil de entender que la frase que reemplaza es **ruido, no ayuda**: se simplifica o se parte, nunca se entrega.

**Alcance**: M1, M2, M4, M7, M9 y M10 son de **formato agnóstico** — valen para cualquier visual (SVG, Mermaid, HTML, tabla, KaTeX, callout). M3, M5, M6 y M8 miden atributos de los **diagramas SVG/HTML dibujados a mano** (`font-size`, `viewBox`, color de tema, `aria-label`); en Mermaid, KaTeX, tablas o piezas interactivas se sustituyen por su equivalente: texto y controles legibles sin zoom, ancho que no fuerce scroll, colores que sigan el tema, y `alt`/`aria-label` donde el formato lo admita. **M10 se aplica siempre**: si un callout o una tabla no se entienden sin el párrafo de al lado, están mal hechos igual que un SVG.

| # | Métrica | Umbral exacto | Falla si… |
|---|---|---|---|
| **M1** | **Guía de lectura** | Una línea **`Cómo leerlo: …`** justo debajo del visual, indicando **por dónde empezar y en qué orden se lee** | No existe, o es una paráfrasis del gráfico en vez de una instrucción de lectura |
| **M2** | **Punto de entrada único** | **1** punto de partida y **1** orden declarado (izq→der, arriba→abajo o el que declare M1) | Dos entradas posibles, o ningún orden evidente |
| **M3** | **Tamaño de texto** | `font-size` **≥ 14 px** en todos los `<text>` | Cualquier valor ≤ 13 |
| **M4** | **Presupuesto de texto** | **≤ 12** elementos `<text>` | 13 o más — el gráfico ya exige más que la frase |
| **M5** | **Proporción** | ratio del `viewBox` **≤ 3:1** y `width="100%"` | Mayor que 3:1 → fuerza scroll horizontal |
| **M6** | **Colores** | Ningún color fijo dependa del tema de la página; `#fff`/`#000` **solo** sobre otro color fijo (nunca contra el fondo) | Relleno o texto fijo que se haga invisible en claro u oscuro |
| **M7** | **Etiquetado total** | **0** elementos con significado sin etiqueta | Una caja, flecha o círculo sin texto = pregunta sin responder |
| **M8** | **`aria-label`** | **Obligatorio**, describiendo qué muestra **y cuál es su conclusión** | Ausente, o dice solo "gráfico" |
| **M9** | **Contraste del takeaway** | La conclusión en **`font-weight="700"` o color propio** — el ojo cae ahí primero | La conclusión es visualmente igual que el resto |
| **M10** | **Autochequeo de legibilidad** | Se entiende **sin leer el texto de al lado** | Si requiere el párrafo para descifrarse → se rehace, no se aprueba |

**M10 es la meta-regla** y resuelve toda la lista: el costo de comprensión del visual tiene que ser **≤** el de la frase que sustituye. Si no lo es, el problema es de diseño, no de falta de explicación — **no se arregla añadiendo más texto encima**.

Tres matices que evitan falsos positivos:

- **M1 no es negociable "porque el gráfico es evidente"**. Esa decisión se **justifica en el plan** (`planificador.md` §5 — plan visual por parte), no se improvisa al escribir. La norma es M1 sí; la excepción, argumentada.
- **M6 no prohíbe el blanco en absoluto**: prohíbe que un color dependa del fondo. Blanco sobre un círculo de color fijo es **correcto**; blanco sobre el fondo de la nota, no.
- **M4/M7 se violan ampliamente por meter dos ideas en un dibujo.** La solución es **partirlo en dos visuales**, nunca reducir la fuente ni quitar etiquetas.

Un `<figcaption>` en HTML está permitido, pero la línea en markdown (`**Cómo leerlo:** …`) es la forma por defecto: se lee sin JS y funciona en modo lectura y en vista previa.

### Diagramas grandes — cómo se ven enteros

Mermaid se renderiza estático dentro del ancho de lectura: **por encima de ~15 nodos deja de caber en ninguno de los dos ejes**. Y un mapa amplio es obligatorio, así que esto hay que resolverlo de forma sistemática:

1. **Capas, nunca un bloque gigante.** El mapa se entrega en tres niveles:
   - **Vista general** — los bloques mayores y sus cruces, ≤10 nodos. **Cabe sin hacer nada.**
   - **Detalle por bloque** — un diagrama por bloque o par de áreas, ≤12 nodos cada uno. Todos caben.
   - **Grafo completo** — en su propio fichero, ver punto 3.
   Un diagrama de un nodo por concepto con 40 nodos no se pone en la nota como bloque único.
2. **Zoom y paneo ya están disponibles dentro de la nota**: el plugin activo **`mermaid-view`** inyecta una barra en **cada** bloque Mermaid de un `.md` (`Reset zoom` · `Zoom in` · `Zoom out` · `Export diagram`), y añade rueda del ratón = zoom y arrastrar = paneo. Indicarlo al lector en un callout: **no tiene que desplazarse por la ventana, aleja y arrastra.** Funciona tanto en Reading view como en Live Preview.
3. **`mapa.mmd` para verlo a pantalla completa.** `mermaid-view` registra las extensiones `mermaid` y `mmd` (verificado en su `data.json`), y esos ficheros abren en una **vista dedicada a pantalla completa** con zoom por rueda, paneo por arrastre, zoom por dos dedos, controles *Zoom in/out/Reset* y export a PNG/SVG. El grafo completo del tema se copia ahí **tal cual**, sin dividirlo: es la vista "entera de un vistazo".
4. **El grafo completo puede ir también plegado en la nota** dentro de `<details>`/`<summary>` (DOMPurify de Obsidian los permite), para que exista ahí sin tapar la lectura. Es respaldo de `mapa.mmd`, no su sustituto.
5. **No usar `markmap`**: está corrupto en este vault (`manifest.json` y `main.js` contienen literalmente `Not Found`). Ningún diagrama puede depender de él mientras no se reinstale.

### Render de HTML

Obsidian sí renderiza HTML dentro de un `.md`, pero **lo sanitiza con DOMPurify**: pasa una allowlist y se descarta lo demás. Dos canales, cada uno para lo que sirve:

**1. HTML crudo dentro de la nota** — maquetación y plegado, sin interactividad real.

- Sí: `<details><summary>` (plegado alternativo a los callouts), `<table>`, `<div>`, `<mark>`, `<kbd>`, `<br>`, SVG inline.
- No: `<script>`, `<style>`, `<iframe>` — **se eliminan**, y con ellos se pierde cualquier interactividad. No escribirlos esperando que funcionen.
- La interactividad dentro de una nota sale de mecanismos nativos de Obsidian: callouts plegables, enlaces internos, `tasks`, el lienzo (Canvas).
- Aplicar esto también en el quiz: `<details>` para agrupar el enunciado + pieza visual cuando la pregunta sea larga.

**2. Página HTML independiente** — cuando el concepto sí necesita interactividad de verdad (simulación, animación, código paso a paso con entrada del usuario). Ese es el dominio de `pagina-interactiva.md`, no de una nota. Escribirla como `.html` en el mismo `topic-slug` y enlazarla desde el índice `explicacion.md`. No sustituye a las piezas: se añade, y solo cuando la nota no da abasto.

**3. Demo de una parte en la vista HTML** — la demo interactiva de una parte vive en `explicaciones/demos/<part>-<nombre>.html` (por ejemplo `p2-borrado-padre.html`): un archivo autocontenido con los componentes de `pagina-interactiva.md` (stepper, simulador, predecir-la-salida), sin quiz propio porque el mini-quiz de la parte ya está en la vista. La vista HTML la incrusta debajo de la nota en un iframe aislado. Para que lo que la persona descubre llegue al tutor, la demo puede llamar a `parent.postMessage({ type: "learning-demo", observation: "<qué pasó>" }, "*")`; la observación se añade a la caja «Pregunta al tutor» y solo se envía cuando la persona pulsa enviar.

### Vista HTML conectada al chat

La herramienta `learning_view` (adaptador del motor) sirve en `127.0.0.1` una vista interactiva generada en cada petición desde los mismos archivos del tema: índice, tema, parte (nota con su video, demos y mini-quiz en vivo) y diagnóstico por rondas. Obsidian sigue siendo el original; la vista no guarda nada propio.

- Tras escribir una parte, su mini-quiz o una ronda de diagnóstico, el tutor llama a `learning_view` con `topic` y `part` (`p1`… o `quiz`) y da la URL junto a la ruta de la nota.
- Al enviar, la vista valida las respuestas, escribe el archivo que lee el motor (`mini-quiz/{part}.answers.json` o las ids nuevas de `quiz.answers.json`) sin sobrescribir nunca respuestas registradas, y mete en el chat un mensaje que empieza por `[Vista HTML · <tema> · …]` con el resultado, el razonamiento opcional (si lo escribió o dictó), el vuelco y los ejercicios.
- Ese mensaje es la entrega de la persona: vale igual que lo escrito en el chat. El tutor no reescribe el archivo de respuestas que el mensaje nombra; sigue con todo lo demás como siempre (corrección, callout plegado en la nota, vuelco literal en `mis-palabras.md`, `feedback/{part}.json`, motor).
- Las preguntas enviadas desde la vista (`· pregunta`) se responden en el chat y, si aportan, se anotan en `mis-palabras.md`.

Si un recurso nuevo no está claro, hacer un `<probe>` en una nota de prueba y abrirlo: verificar que renderiza antes de dependerlo en una explicación real.

### Estado de plugins (verificado, 2026-10-05)

Antes de depender de un recurso, comprobarlo — **instalado ≠ activo**. Situación real del vault:

- **Activos**: `dataview`, `excalidraw-extras`, `mermaid-view`, `obsidian-excalidraw-plugin`, `obsidian-git`, `obsidian-hover-editor`, `obsidian-kanban`, `omnisearch`, `quickadd`, `templater-obsidian`.
- **Instalado pero desactivado**: `obsidian-tasks` (manifiesto válido) — no aparece en `community-plugins.json`.
- **Corruptos**: `dbfolder`, `mehrmaid`, `metadata-menu`, `obsidian-code-styler`, `obsidian-markmap` — `manifest.json` y `main.js` contienen literalmente `Not Found` (descarga fallida), así que no cargan aunque la carpeta exista.

Política: **no depender de un plugin corrupto para nada**. Si la explicación necesita resaltado de línea o markmap, primero reparar (reinstalar el plugin) y solo entonces usarlo; mientras tanto se cubre con code block + tabla o con Mermaid. Reparar un plugin es una operación en el propio Obsidian (Settings → Community plugins → Browse → instalar de nuevo), no una edición a mano de `.obsidian/*.json`. **Nunca editar la config de `.obsidian` mientras Obsidian.exe esté en ejecución**: la app la reescribe al salir y pisa el cambio.

Instalar un plugin nuevo solo si algún recurso realmente lo exige y no hay alternativa nativa; pedirlo al usuario antes.

- **Refrescar al abrir un tema nuevo**: re-verificar los estados, actualizar la tabla con la fecha nueva y asignar visuales solo sobre estados frescos. Una tabla vieja con fecha nueva es peor que ninguna.

## 4. `mis-palabras.md` — área de vuelco por parte

**No es un cuestionario ni una zona editable por la persona.** `mis-palabras.md` es una página separada de `explicaciones/` y de los apuntes, con un área por parte. La persona escribe el vuelco en el chat; Pi lo copia literalmente en el área correspondiente y añade allí la corrección. La persona nunca edita Obsidian.

Encabezado fijo de cada área (igual en todas las partes):

> Escribe en el chat, con tus palabras, **todo lo que entendiste** de esta parte y **todo lo que no entendiste**. No hay pregunta que responder: solo suelta. Pi copiará aquí tu texto y añadirá la corrección.

La respuesta sobre cada área es **corrección, nunca pregunta**:

| Campo | Qué lleva |
|---|---|
| **Te faltó explicar** | lista de lo central que no aparece en el vuelco |
| **Estaba mal** | lo que no se sostiene, con el por qué |
| **En la línea** | lo que está bien, para que sepa qué conservar |
| **Estado** | `✔ En la línea` si no falta nada central · `✖ Te falta` si falta. Una frase de cierre, sin nota numérica |

**Nunca se valora** ortografía, extensión, registro, formato ni si copió términos técnicos.

Las áreas se listan en `planificador.md` (una fila por parte, con el ámbito que abarca). Una parte sin su área declarada en el plan = plan incompleto. La persona envía el vuelco por chat **después** de leer la parte y **antes** de desbloquear la siguiente; Pi lo transcribe y lo corrige en esta nota.

## 5. `ejercicios.md` — solo al final, después de TODOS los nodos

Se crea **cuando el loop terminó**, nunca dentro de él. Frontmatter: `tipo: ejercicios`, `tema`, `fecha`, `estado: pendiente|completado`, `nodos_cubiertos`.

**Propósito explícito**: que el aprendizaje **no dependa solo del multiple choice**. El quiz mide si reconoce; los ejercicios miden si sabe construir.

- **Código cuando el tema lo permita**: tareas de construir algo real — pedirle al lector qué haría, mostrarle el código, y que él lo ejecute/modifique. En un tema sin código (historia, derecho), sustituir por casos prácticos, documentos o problemas de razonamiento: **el formato se adapta al tema, el "práctico" no se negocia**.
- **Formatos no-MCQ siempre presentes**: problemas de cálculo, depurar código con errores planteados, rellenar huecos, flashcards (pregunta por un lado, respuesta por el otro), y "explica esto con tus propias palabras a un colega".
- **Recorrido guiado**: se le dice qué hacer, se le muestra el código/ejemplo, y después se le deja a él. No es un examen de 20 preguntas.
- El plan (`planificador.md`) declara, **por ejercicio**: `nodo` que prueba · `formato` · `qué mide`. Sin esa tabla, no hay `ejercicios.md`.

Frontmatter y estructura de secciones se pueden copiar del `quiz.md`, pero **el contenido no es MCQ**: aquí hay huecos, código y consignas abiertas.

## 6. `cuestionario-final.md` — recall espaciado de TODO + actualización del mapa

Se crea **después de `ejercicios.md`**, nunca antes. Es el examen de cierre del tema y el mazo de repaso espaciado: mide **retención**, no reconocimiento del momento. Frontmatter: `tipo: cuestionario-final`, `tema`, `fecha`, `estado: pendiente|completado`, `puntaje`.

- **Cobertura total**: una pregunta por cada nodo de la ruta, **verdes incluidos** — lo verde también se olvida. Si un nodo tiene subnodos, la pregunta apunta al concepto que falló o al más load-bearing. Etiquetas `subtema` + `nivel` iguales que en el quiz: la trazabilidad no se renegocia al final.
- **Formato mixto, sin multiple choice como único recurso**: respuesta corta, cálculo con resultado, "explica X sin mirar" y algún MCQ con distractor verificado. Toda respuesta clave pasa la **misma doble verificación de la bibliografía** (una sola opción o cifra defendible) antes de entregarse.
- **Sin pistas antes de responder**: la nota muestra enunciados y espacios de respuesta, sin soluciones ni definiciones. La persona responde en el chat; después, el tutor registra las respuestas y añade la corrección en un callout `> [!success] Corrección` plegado.
- **Re-puntaje y actualización del mapa (obligatorio, no opcional)**: con el resultado se **recolorea el mapa** — ámbar que se sostiene → verde; verde que cayó → ámbar con su hueco localizado; hueco nuevo → parte de refuerzo o seguimiento anotado. Se actualiza `planificador.md §1` (puntaje y tabla por subtema), `mapa.mmd` y las clases del grafo plegado, más una entrada de log con fecha: qué cambió y por qué. Un cuestionario final sin mapa actualizado es trabajo a medias.
- **Recall espaciado**: el archivo queda como mazo — el lector lo reabre en N días (el intervalo lo pone él) y responde sin mirar. Si un nodo vuelve a caer, su estado retrocede y se agenda otro repaso. El mapa es el marcador: siempre dice qué está verde *hoy*.

## Mejora continua — la skill aprende del lector

La calidad de las explicaciones mejora con el uso: cada dump, error, duda y corrección es evidencia sobre qué enseña y qué no. El objetivo no es necesitar más correcciones para aprender, sino que cada parte necesite menos que la anterior. Comprensión real —verificable en sus propias explicaciones— por encima de completar contenido.

- **Evaluar la comprensión**: cada vuelco se lee como evidencia — qué quedó sólido, qué quedó parcial, qué no se comprendió. El puntaje (quiz, mini-quizzes, cuestionario final) dice *cuánto*; el vuelco dice *por qué*.
- **Detectar fallos de enseñanza**: ante errores frecuentes, muchas correcciones o un "no quedó claro", preguntarse si la explicación fue insuficiente, ambigua o poco intuitiva — sin atribuir todo error automáticamente a la enseñanza: identificar la causa probable (hueco previo no detectado, ejemplo que no ancla, orden que pide lo posterior antes que lo previo, distractor defendible que sobrevivió la verificación).
- **Adaptar**: usar lo aprendido en las partes siguientes — reordenar, cambiar ejemplo o analogía, ajustar profundidad, reforzar el escalón que falló. Priorizar los métodos que demuestren ayudar a comprender (los que suben su puntaje), no los que gustan al tutor.
- **Retroalimentación continua**: después de cada interacción relevante, registro interno mínimo — qué funcionó, qué falló, qué ajuste concreto evita repetirlo. Ese registro vive en el log de `planificador.md` (entradas fechadas) y en la memoria de sesión.
- **Actualizar la skill**: ante mejora justificada por evidencia repetida (no por un caso aislado), incorporarla a las instrucciones: reescribir la regla o el ejemplo que falló en `references/`, con su motivo. Una mejora por vez, verificada cuando la parte siguiente necesita menos correcciones. Sin acceso de edición, especificar el cambio sin afirmar que se guardó.
- **Sin complejidad extra**: mejorar no es añadir reglas — si cabe reescribiendo una existente en vez de añadir una nueva, reescribir. El presupuesto de `SKILL.md` no crece por aprender: lo aprendido vive en `references/`.

## Reglas duras del modo extenso

- **Vuelco**: se rige por §4. La persona lo envía en el chat; Pi lo transcribe literalmente y añade allí la corrección. Nunca pedir que edite Obsidian.
- **`ejercicios.md` — solo al final, después de TODOS los nodos**: nunca dentro del loop; es el cierre, el "plus" de máximo aprendizaje, y su propósito explícito es **dejar de depender del multiple choice**. **Código para construir cosas** cuando el tema lo permita — el lector programa, se le pide qué hacer y se le muestra el código paso a paso — complementado con formatos no-MCQ: problemas de cálculo, depurar código con errores planteados, rellenar huecos, flashcards y "explica esto a un colega". Cada ejercicio declara en el plan **qué nodo prueba** y **con qué formato**. Sin ese bloque en el plan, el plan está incompleto.
- **Bibliografía obligatoria, no memoria del modelo**: investigar antes de escribir; registrar en `planificador.md` una tabla claim → fuente (sección/URL) → qué verificó → estado. Fuentes primarias primero (libro/paper/docs oficiales). **Toda respuesta clave, cálculo y fórmula con índice o potencia se verifica siempre**, y pasa una doble prueba: (a) planchar la fórmula de la fuente sobre el enunciado y obtener **una sola** respuesta posible, (b) comprobar que ningún distractor es defendible con esa misma fórmula. Dos opciones vivas = pregunta que no se entrega. Cada archivo de `explicaciones/` lleva su línea `**Fuente**: ...` **justo bajo el título, dentro del bloque plegado de metadatos** — nunca en el flujo de lectura (ver la regla de metadatos plegados). Nunca citar número de ecuación no leído: si solo se localizó la sección, se marca `⚠️ por sección`.
- Las piezas SIEMPRE: `quiz.md`, `planificador.md`, `explicacion.md` (índice) + `explicaciones/` (una parte = un archivo). Nada se salta. En modo extenso se añaden: **4ª `mis-palabras.md`** (área por parte, sin ella la parte no se cierra), **5ª `ejercicios.md`** (solo al final, tras todos los nodos) y **6ª `cuestionario-final.md`** (recall espaciado de todo + re-puntaje y actualización del mapa).
- **`planificador.md` debe incluir el plan visual por parte**: una fila por parte con el tipo de visual elegido antes de escribir (`sequenceDiagram`, arquitectura SVG, `flowchart`, `stateDiagram-v2`, tabla, KaTeX…). Una parte sin visual asignado en el plan no se escribe; una parte escrita sin el visual que el plan asignó hay que rehacerla. Si un concepto no admite forma visual, se anota `— (sin forma visual: <razón>)`: la ausencia tiene que ser una decisión, no un olvido.
- **Cero texto plano en modo extenso**: cada concepto va acompañado de su pieza visual (ver "Capa visual"). ASCII-art y listas desnudas como recurso principal están prohibidos aquí — esa restricción es solo del modo corto, que va en chat.
- El mapa de dependencias es obligatorio en `planificador.md` — un plan sin grafo está incompleto.
- **El mapa tiene que ser AMPLIO — esto es mandato, no consejo**: se construye **antes** del quiz, por investigación sobre fuentes, y se descompone **hasta el nivel de concepto, nunca al de capítulo**. Un nodo por concepto distinguible, con sus prerrequisitos. Los `subtema` del quiz son los **padres**; sus conceptos subyacentes van como hijos con código propio, **sin renombrar, fusionar ni reetiquetar** los padres. El diagnóstico adaptativo por rondas muestrea las áreas más determinantes; los nodos no sondeados quedan `⚪ no evaluado`, sin inferir su resultado. Un mapa plano esconde exactamente dónde está el error.
- **Diagramas grandes: capas + `mapa.mmd`, nunca un bloque gigante**. Mermaid se renderiza estático dentro del ancho de lectura: pasado ~15 nodos no cabe en ninguno de los dos ejes. Regla: **vista general (≤10 nodos) → detalle por bloque (≤12 nodos) → grafo completo en `mapa.mmd`**, que con `mermaid-view` activo se abre **a pantalla completa** con zoom por rueda, paneo por arrastre y export PNG/SVG. Dentro de la nota, `mermaid-view` ya inyecta *Zoom in / Zoom out / Reset* y rueda/arrastre en **cada** bloque: decirle al lector que **no se desplace, que aleje y arrastra**. El grafo completo puede ir además plegado en `<details>`, nunca como bloque visible principal. `markmap` está corrupto en este vault: no depender de él.
- Los tags `subtema` y `nivel` son la unión entre las piezas: mismo código en `quiz.md`, en los nodos del mapa, en la ruta, en cada archivo de `explicaciones/`, en `cuestionario-final.md` y en cada área de `mis-palabras.md`. Renombrar uno rompe la trazabilidad.
- Nunca entregar la explicación completa de una: solo la parte actual + su mini-quiz.
- **Una parte = un archivo en `explicaciones/`** (`Parte N - <slug>.md`, sin tildes); `explicacion.md` es solo el índice (progreso, enlaces wiki que resuelven, estados). Contenido didáctico en el índice o parte fuera de su archivo = rehacer.
- **Autoría**: seguir el contrato único de «Autoría de notas y datos»; los builders redactan las notas indicadas y el tutor escribe los sidecar y las transcripciones. No duplicar ni alterar esa división.
- **`cuestionario-final.md` cierra el tema**: después de `ejercicios.md`, cobertura total (verdes incluidos), formatos mixtos con respuestas verificadas, y **re-puntaje con actualización del mapa** (`planificador.md §1`, `mapa.mmd`, log con fecha). Sin mapa actualizado, el cierre está incompleto.
- **Reenseñanza**: aplicar el contrato de «Reenseñanza cuando el motor reabre una parte» y `learning-validation.md`; mini-quiz bajo el umbral o `central-gap` con `PASS` reabre el ciclo, comparte el límite de 2 rondas y exige una explicación modificada.
- **Todo cambio al bundle cierra con bitácora**: la misma entrega que modifica una pieza anexa su entrada fechada (qué cambió + implicación para lo que sigue); un plan sin la entrada del último cambio es un plan desactualizado.
- **El plan es un archivo vivo**: pre-preguntas (§0) antes del testeo, post-preguntas (§10) como primera zona de testeo que construye el plan, y bitácora fechada (§11) de cada evento — quizzes, vuelcos, reenseñanzas, métodos que fallan, cómo procesa la información. Cada parte posterior consulta la bitácora; una parte que ignora lo ya aprendido del lector se rehace.
- **El recurso se justifica en el plan, no por defecto**: cada fila visual declara herramienta + por qué esa y no otra + qué nodo o dificultad sirve. Mermaid o SVG automáticos sin justificación = rehacer.
- **Interactividad con propósito o nada**: cada pieza interactiva atada a nodo + malentendido + instrucción observable, con fallback estático si el plugin falta o se deniega. Sin fallback no se entrega.
- **Sin aprobación no hay plugin nuevo**: proponer antes de usar (nombre + qué permite + fallback); la apertura del lector a instalar no sustituye la propuesta.
- **Mejora continua**: cada dump, error y corrección es evidencia — registrar qué funcionó, qué falló y el ajuste concreto (log de `planificador.md` + memoria); si la causa probable es la explicación, reescribir la regla o el ejemplo en `references/`; la mejora se verifica cuando la parte siguiente necesita menos correcciones. El objetivo es necesitar menos correcciones con el tiempo, no más.
- **Plan y partes consultan `preferencias.md`**: nada se escribe sin el Perfil aplicado en el handoff — plan (ruta, profundidad, visuales, ejemplos, ritmo), cada parte, mini-quizzes y quiz final en lo adaptable, chat en lo posible. Lo medible no se negocia (formatos de verificación, rigor); lo adaptable sí (presentación, ejemplos, ritmo, longitud). Una parte que ignora el Perfil se rehace.
- **Preferencias**: reutilizar el perfil global si existe, preguntar una sola vez si cambió y aplicar cualquier override local. Reutilizar un perfil local existente sin repetir las 20 preguntas; preguntarlas solo si no existe ningún perfil. El campo `spec` del frontmatter es opcional.
- `Write` solo para archivos nuevos; para editar existente