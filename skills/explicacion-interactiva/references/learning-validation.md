# Validación local del aprendizaje profundo

Esta integración se usa solamente si el modo elegido es profundo/extenso y el trabajo está dentro de la carpeta `Learnings` confirmada. El modo corto/conceptual conserva su flujo existente y no ejecuta el validator completo. No cargar estas reglas globalmente ni copiar el motor dentro de la configuración de Pi.

## Rutas confirmadas en esta máquina

| Recurso | Ruta |
|---|---|
| Repositorio Go | `/home/alesierraalta/documents/learning` |
| Ejecutable | `/home/alesierraalta/documents/learning/bin/learning` |
| Fuente de verdad de reglas | `/home/alesierraalta/documents/learning/rules/deep.json` |
| Adaptador local de Pi | `/home/alesierraalta/documents/learning/integrations/pi` |
| Contrato e inputs | `/home/alesierraalta/documents/learning/docs/engine.md` |
| Integración y configuración | `/home/alesierraalta/documents/learning/docs/integration.md` |
| Configuración instalada en el vault | `/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings/.pi/settings.json` |
| Vault WSL | `/mnt/c/Users/ismar/Documents/obsidian/ale` |
| Vault Windows | `C:\Users\ismar\Documents\obsidian\ale` |
| Carpeta de aprendizaje WSL | `/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings` |
| Carpeta vault-relativa | `notes/04-RECURSOS/Learnings` |

`Learning` es el nombre usado en la solicitud; en disco la carpeta existente es `Learnings`, en plural. No renombrarla ni mover notas. Las rutas anteriores son de este entorno: en otra máquina resolver/configurar las rutas, no suponer que existen.

## Enrutado

1. Elegir explícitamente corto/conceptual o profundo/extenso. Solo el segundo, dentro de `Learnings`, activa el sistema completo.
2. La persona inicia la sesión con el único atajo que debe escribir fuera del chat: `aprender`, que abre Pi en la carpeta `Learnings`. Ya en la sesión no se le pide ningún comando. Fuera de `Learnings` no hay motor.
3. La preparación precede al diagnóstico: el tutor invoca `learning_stage` con `action: "init"`, `topic: "<nombre-de-carpeta>"` y, si la persona eligió Pareto en la FASE 0a, `scope: "pareto"` (el scope se fija aquí y no se cambia después; ver `pareto.md`), para iniciar, o con `action: "start"` y el nombre de carpeta existente para retomar. En modo examen, `init` lleva siempre `scope: "pareto"` y `exam: "oral" | "written" | "practical"`; `practice: "<tipo>"` se añade solo para `exam: "practical"` (los campos ya decididos por el estudio se pasan tal como aparecen; ver `examen.md`). Antes de crear el quiz, escribe en `plan.json` el tema y una parte por nodo-concepto que se evaluará, con `examplesPlanned` y `visualsPlanned` explícitos (y, en scope pareto, el bloque `pareto` con `criterio` y `descartado` más el `pareto` de cada parte; en modo examen, además, el bloque `examen` y el campo `examen` de cada parte, según `examen.md`); valida y avanza `preparation`. Después del diagnóstico, actualiza `plan.json` con `diagnosisSummary` y `focusAreas` durante `planning`.
4. Consultar inputs y etapas en `docs/engine.md`, y validar/avanzar cada etapa con `learning_stage`. Cuando `validate` devuelva `pendingReviews`, evaluar cada rúbrica contra el artefacto y contexto indicados (con builders/subagentes cuando convenga) y registrar el veredicto con `review` antes de `advance`. No duplicar ni reinterpretar reglas del motor.
5. `waiting` significa que se esperan datos de la persona, no que el tema esté completo. Un `FAIL`, una revisión faltante o desactualizada, evidencia desactualizada o error del ejecutable bloquea el avance. Corregir y validar otra vez.
6. El único cierre autorizado es el estado `completed` vigente del motor. Un mensaje final, pruebas unitarias o una lista de comprobación no lo sustituyen. Si el motor bloquea, mostrar el bloqueo en lugar de declarar éxito.

## Archivos que crea cada etapa

El motor valida las notas y sus JSON sidecar; una nota o sidecar requerido que falte bloquea la etapa. Todas las rutas son relativas a la carpeta del tema. Las formas exactas están en `docs/engine.md` → «JSON sidecar shapes»; los conteos y vocabularios, en `rules/deep.json` (`thresholds`). La división de autoría se define en `obsidian-university.md` → «Autoría de notas y datos»; esta tabla la resume.

| Etapa | Notas (Markdown) | JSON | Quién lo escribe |
|---|---|---|---|
| preparation | — | `plan.json` | tutor, antes del diagnóstico |
| diagnosis | `quiz.md` por rondas (la ronda N+1 se añade debajo cuando la N está respondida; `estado` y `puntaje` al terminar). Cada pregunta en `quiz.json` lleva `round` (y `follows` en temas antiguos); con diagnóstico por concepto, además `conceptos` (2–3 códigos), `razonamientos` `{id: {razonamiento, confianza}}` en `quiz.answers.json` (`razonamiento` opcional; las respuestas antiguas `{entendi, porque, confianza}` se siguen leyendo) y los veredictos de cada ronda en `diagnostico-conceptos.json` `{"conceptos": [{"codigo", "estado", "pregunta", "evidencia"}]}` (evidencia literal del razonamiento), más la revisión `diagnosis-sufficiency`; omitido = `{"skipped": true, "questions": []}` (ver `docs/engine.md` «Adaptive diagnosis» y «Concept diagnosis») | `quiz.json`, `quiz.answers.json`, `diagnostico-conceptos.json` | builder: `quiz.md`; tutor: sidecars, respuestas del chat y frontmatter completado/puntaje derivado |
| planning | `planificador.md` (incluida la sección del vuelco), `mapa.mmd`, `explicacion.md` (lista todas las partes; las pendientes como texto sin enlace y las ya escritas enlazadas con su ruta completa en el vault: `notes/04-RECURSOS/Learnings/<tema>/explicaciones/Parte N - <slug de plan.json>`) y esqueleto de `mis-palabras.md` con un área por parte | `plan.json` (`diagnosisSummary`, `focusAreas`) | builder: notas; tutor: `plan.json` y área de vuelco |
| explanation | `explicaciones/Parte {n} - {slug}.md` (con mini-quiz) | — | builder |
| own_words | área de la parte en `mis-palabras.md` | — | tutor: copia literalmente el vuelco del chat y añade la corrección; la persona no edita Obsidian |
| quiz | las preguntas en la nota de la parte (3 en una parte nueva, las que mide «Tamaño de parte»; 5 en temas antiguos; el motor acepta 1–12 integradoras con `conceptos`, aprobado 2/3 sin fallar una central; `razonamientos` `{razonamiento, confianza}` en el archivo de respuestas, con confianza obligatoria y razonamiento opcional) | `mini-quiz/{part}.json`, `mini-quiz/{part}.answers.json` | builder: preguntas en la nota; tutor: sidecars y respuestas del chat |
| feedback | — | `feedback/{part}.json` (con diagnóstico por concepto, `conceptos` con un veredicto por concepto de cada pregunta: `claro`/`dudoso`/`laguna` y `evidencia` literal del razonamiento; una `laguna` en una pregunta central reabre la parte) | tutor, a partir del mini-quiz, de los razonamientos y de la revisión `central-gap` |
| adaptation | — | — | tutor, según la condición del motor |
| exercises | `ejercicios.md` | — | builder |
| final_quiz | `cuestionario-final.md` | `cuestionario-final.json`, `cuestionario-final.answers.json` | builder: nota; tutor: sidecars y respuestas del chat |
| final | actualización de `planificador.md` y `mapa.mmd` | `plan.json` sin cambios de planificación | builder: re-puntaje de notas; tutor: revisión y avance del motor |

`explanation` a `adaptation` se repiten por cada parte del plan. La persona responde y entrega el vuelco en el chat; Pi registra ese contenido en Obsidian. Un tema creado antes del motor (sin `.learning/state.json` ni los JSON requeridos) no se valida a medias: se archiva y se inicia otra vez con `learning_stage` `action: "init"`.

## Reenseñanza acotada

Un mini-quiz por debajo de 2/3 (la razón de `rules/deep.json`) o con cualquier pregunta central incorrecta, y una revisión `central-gap` con veredicto `PASS` en `feedback`, consumen el mismo presupuesto de hasta 2 rondas. En ambos casos, el motor reabre `explanation`/`own_words`/`quiz` de esa parte; una laguna central se juzga como tal, no como un fallo de revisión. La explicación reescrita debe cambiar respecto del intento fallido. Si el presupuesto se agota, el motor bloquea el avance. Al cerrar una parte —mini-quiz aprobado, vuelco recibido y validaciones/revisiones del motor completas—, Pi prepara y anuncia inmediatamente la siguiente, sin preguntas ni pausas adicionales.

y, si la parte lo promete, `demosPlanned: true`; valida y avanza `preparation`. Después del diagnóstico, actualiza `plan.json` con `diagnosisSummary` y `focusAreas` durante `planning`.

## Mini demos interactivas

Cuando la parte promete una demo (`"demosPlanned": true` en `plan.json` — el plan SIEMPRE la declara: regla del usuario, nunca opt-out—), el motor exige al menos `thresholds.minDemos` (1 hoy) componente interactivo declarado en `thresholds.demoElements` (`<lk-widget>` —playground de parámetros, estilo TensorFlow Playground: mover pesos/valores y ver el efecto— o `<lk-walkthrough>` —deck a pasos con «Ver todo», como el de SQL—), cada uno con su línea «Cómo leerlo», o una página-demo `explicaciones/apps/<parte>.html` / `explicaciones/demos/<parte>-<nombre>.html` (la forma que sirve el panel de demos del Studio). Los componentes se construyen con `docs/kit.md`; la demo vive embebida en la nota (el Studio la sirve en su panel de demos). El motor certifica presencia y guía, no la calidad de la interacción: si la demo no enseña, eso lo juzga el tutor al registrar las revisiones de la parte.

El motor acepta la demo por su estructura (script no-JSON más controles, o `lk-walkthrough` con JSON válido) y guarda el recibo de la página seleccionada; no mide cómo se dibuja. Por eso, antes de dar una parte por entregada, el tutor corre el gate real del lector sobre la nota y el deck: `node /home/alesierraalta/documents/learning/tools/deck-gate.mjs <ruta-de-la-nota.md>` (exit 1 si una palabra desborda su caja, si una etiqueta libre cruza una caja o si dos palabras se pisan). Regla para todas las notas, también las de esta ruta: ninguna palabra sale de su recuadro. En una parte manda «Tamaño de parte»: **un** recorrido, el del ejemplo. En una nota rápida, cada punto explicable lleva su propio recorrido, no uno solo al final.

## Recorrido progresivo obligatorio

Independiente de `demosPlanned`: el motor rechaza toda parte no certificada (también en temas iniciados antes de la regla) cuya nota no tenga al menos un `<lk-walkthrough>` válido de 3 a 6 pasos, con algo dibujado y una flecha en cada paso, y sin una tabla como figura principal a la que ninguna flecha apunte. El mensaje nombra el recorrido, el paso y la corrección. En temas nuevos, además, el tutor registra la revisión `walkthrough-progression` (¿los pasos enseñan el ejemplo como un tutorial?). Cómo diseñarlo a la primera: `recorridos-progresivos.md`.

## Formatos visuales aceptados

Cuando la parte planifica un visual, el motor acepta cualquiera de estos, todos renderizables en el vault:

| Formato | Cómo escribirlo | Origen |
|---|---|---|
| Imagen o dibujo de Excalidraw | `![[archivo.png]]`, `![[dibujo.excalidraw]]`, `![alt](ruta)` | incrustación nativa / plugin Excalidraw |
| Diagrama Mermaid | bloque ` ```mermaid ` | nativo de Obsidian |
| Gráfico de funciones | bloque ` ```desmos-graph ` | plugin Desmos |
| Construcción geométrica | bloque ` ```geogebra ` o ` ```ggb ` | plugin GeoGebra |
| Gráfico de datos | bloque ` ```datachart ` | plugin Datacharts |
| SVG en línea | `<svg ...>` con al menos un elemento hijo y cerrado con `</svg>`, fuera de bloques de código | nativo de Obsidian |

El bloque o el SVG deben tener contenido. Las listas viven en `rules/deep.json` (`thresholds.visualBlocks` y `thresholds.visualElements`); no las dupliques aquí si cambian. Markmap y Mehrmaid están instalados pero rotos (archivos vacíos), así que no se aceptan.

Las interpretaciones (adaptación, valor del visual, distractores y detección de lagunas centrales) no usan un modelo externo ni credenciales: las evalúa el tutor del chat —con builders/subagentes cuando ayude— siguiendo la instrucción de la rúbrica que `validate` entrega en `pendingReviews`, y las registra con `review`. El motor solo comprueba la presencia/formato aceptado del visual planificado; no evalúa M1–M10. El builder aplica M1–M10, el tutor las verifica y registra `visual-value` cuando corresponde. El motor bloquea si falta una revisión, está desactualizada o es `FAIL` en una rúbrica `gate`.
