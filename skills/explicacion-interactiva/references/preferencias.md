# Preferencias del lector — perfil, archivo y aplicación

Antes de preguntar, comprobar si ya existe un perfil. Si `Learnings/preferencias.md` tiene `alcance: global`, reutilizarlo y hacer solo una pregunta en el chat: «¿Ha cambiado algo de tus preferencias desde que se guardó este perfil?». Si existe un perfil local del tema, reutilizarlo y no repetir las 20 preguntas. Preguntar las 20 solo cuando no exista ningún perfil. Toda explicación se adapta al perfil vigente; lo medible no se negocia.

## Las 20 preguntas (solo si no existe ningún perfil)

Preguntarlas en el chat antes de escribir las partes, una sola vez. Aceptar respuestas libres o guiadas; «no sé / me da igual» también es válida y se registra como tal.

1. ¿Prefieres explicaciones cortas y directas o explicaciones más desarrolladas?
2. ¿Te ayuda más una explicación visual o principalmente escrita?
3. ¿Prefieres ver ejemplos antes de recibir una explicación teórica?
4. ¿Prefieres entender primero la teoría y después ver ejemplos?
5. ¿Cuántos ejemplos suelen ayudarte a entender bien un concepto?
6. ¿Prefieres ejemplos simples al principio y después ejemplos más complejos?
7. ¿Te ayudan las analogías para entender conceptos nuevos?
8. ¿Prefieres explicaciones en forma de narración o más divididas y estructuradas?
9. ¿Te resulta útil que una explicación incluya elementos visuales cuando sea posible?
10. ¿Prefieres que las explicaciones matemáticas sean detalladas o más breves?
11. ¿Te ayuda ver el desarrollo matemático paso a paso?
12. ¿Prefieres que se explique primero intuitivamente un concepto matemático y después formalmente?
13. ¿Te ayudan más los ejemplos concretos o las explicaciones abstractas?
14. ¿Prefieres relacionar los conceptos nuevos con cosas que ya conoces?
15. ¿Te gusta que durante una explicación se incluyan pequeñas preguntas para comprobar si estás entendiendo?
16. ¿Prefieres recibir toda la explicación seguida o avanzar por partes?
17. ¿Quieres explicaciones más profundas aunque sean más largas, o prefieres priorizar la brevedad?
18. ¿Te resulta útil combinar texto, ejemplos y elementos visuales dentro de una misma explicación?
19. ¿Prefieres que se utilicen más ejemplos prácticos o más ejemplos teóricos?
20. ¿Quieres que estas preferencias se apliquen únicamente a este contenido o que puedan utilizarse de forma global?

## Archivo `preferencias.md`

- **Ubicación**: junto al tema — `Learnings/<topic>/preferencias.md`. Si elige global (pregunta 20): el perfil va a `Learnings/preferencias.md` (un solo archivo global) y el tema solo registra sus overrides.
- **Frontmatter**: `tipo: preferencias`, `tema` (vacío si es global), `alcance: tema|global` y `fecha`. `spec` es opcional.
- **Cuerpo**: primero el **Perfil aplicado** (bullets accionables derivados de las respuestas); debajo, las preguntas y respuestas disponibles. No exigir una tabla de 20 respuestas si se reutiliza el perfil global.
- **Quién lo escribe**: el tutor del chat principal transcribe las respuestas que recibió y actualiza el archivo cuando cambian; no delegar la transcripción al builder.
- **Precedencia**: lo global manda salvo override explícito del tema; el override se registra con motivo y fecha.
- **Actualización**: a petición de la persona o ante evidencia contraria (tropieza con el formato elegido); registrar el cambio con fecha y nunca volver a preguntar las 20 desde cero.

## Aplicación (dónde se consulta, obligatorio)

- **Plan**: registra el Perfil aplicado y adapta a él ruta, profundidad, visuales, ejemplos y ritmo.
- **Cada parte**: el handoff del constructor incluye el Perfil; la parte lo respeta en estructura, ejemplos, visuales y ritmo.
- **Mini-quizzes y quiz final**: respetan el formato preferido donde no rompa la medición — chequeos intermedios, presentación con ejemplos, ritmo por partes; los formatos de verificación, el rigor y las claves no se negocian.
- **Chat**: adapta lo adaptable (longitud, cantidad y orden de ejemplos, narración o estructura, profundidad matemática, chequeos); el resto del contrato no cambia.
- **Conflictos** (ej. corto + profundo): se pregunta una vez, se registra precedencia, se sigue.
- **«Todo seguido»**: significa continuidad sin pausas entre partes, no eliminar las partes ni sus mini-quizzes de 5 preguntas, que el motor exige. Al recibir el vuelco y aprobar el mini-quiz, Pi completa las validaciones del motor y escribe y anuncia la siguiente parte enseguida, sin preguntas adicionales ni espera.
- **El Método Explicativo Puro (ADN Obligatorio y Exclusivo)**: Toda explicación técnica debe estructurarse con la anatomía diferencial fijada por el usuario:
  1. *Línea 0*: Definición directa en una sola frase, sin rodeos ni historia.
  2. *¿Por qué existe? / El problema que resuelve*: Planteamiento del dilema práctico antes de la técnica.
  3. *Ejemplo conductor terrenal*: Un único escenario cotidiano que evoluciona junto con el concepto.
  4. *Las piezas con preguntas mentales*: Estado («¿Cómo estoy ahora?»), Evento («¿Qué acaba de pasar?»), Transición («¿A dónde voy ahora?»), etc.
  5. *Paso a paso con marcas temporales discretas*: Instantes `T0, T1, T2...` indicando `◄── NUEVO`.
  6. *Doble representación*: Flujo conceptual ➔ tabla explícita ➔ formalismo matemático traducido a palabras cotidianas (`nuevo = viejo + corrección`).
  7. *Aritmética desglosada renglón a renglón*: Sin omitir multiplicaciones ni divisiones intermedias.
  8. *Distinción crítica inmediata («X ≠ Y»)*: Desmontar la confusión más habitual donde la gente tropieza.
  9. *Analogías terrenales con límite explícito*: Con sección obligatoria «Dónde se rompe la analogía».
  10. *Árbol de decisión dicotómico («El mapa mental más importante»)*: Diagrama de bifurcaciones clave entre métodos.
  11. *Cierre estandarizado*: Tabla de 1 línea por concepto («Qué debes entender realmente»), flujo «Entrada ➔ Proceso ➔ Salida», glosario y «Resumen para guardar / Apuntes comprimidos».
  12. *Mermaid limpio y nativo*: Vía estándar exclusiva para flujos, secuencias `T0, T1` y árboles dicotómicos. Dibujos/SVG solo por estricta necesidad pedagógica y con diseño profesional de publicación técnica. Cero arte ASCII.
- **Granularidad y contenido evaluable**: división en ~8-10 nodos atómicos en vez de 4-5 agrupados. Cada parte ultra corta, 100% enfocada en valor técnico evaluable para exámenes, descartando todo relleno histórico o anécdotas triviales.

## Interconexión (de dónde sale cada cosa)

Ninguna pieza vive aislada: `quiz.md` + vuelcos + correcciones + `preferencias.md` → `planificador.md` (ruta, profundidad, visuales, ejemplos, ritmo, Perfil aplicado registrado) → `explicaciones/` (cada parte: estructura del plan + Perfil + corrección anterior) → `ejercicios.md` → `cuestionario-final.md` → mapa actualizado. Si una parte ignora el Perfil o el plan ignora un hallazgo, es defecto de procedimiento y se rehace.
## Estándares Obligatorios por Defecto (Inamovibles)

- **Método Explicativo Puro**:
  - Línea 0 con definición directa en 1 frase sin preámbulos, intros vacías ni historia.
  - `## 1. Por qué existe`: el dolor práctico del problema.
  - Hilo conductor único y terrenal continuo.
  - Desglose de piezas en fichas de tres golpes (definición de una frase → equivalencia en el ejemplo conductor → `Podría ser también:` con 4 o 5 casos de dominios distintos). Ver `estandar-explicacion.md` §2b: manda sobre cualquier otra forma de presentar una pieza.
  - Paso a paso discreto (`T0`, `T1`, `T2`...) con marcas `◄── NUEVO`, `◄── BLOQUEO`.
  - Doble representación: intuitiva ➔ tabla ➔ formal.
  - Cuentas aritméticas / validaciones desglosadas paso a paso.
  - Distinciones críticas explícitas (`X ≠ Y`).
  - Dónde se rompe la analogía.
  - Árbol de decisión dicotómico en Mermaid («El mapa mental más importante»).
  - Cierre estandarizado: Entrada ➔ Proceso ➔ Salida, tabla de 1 línea por concepto y resumen para guardar (3 balas).
  - Mini-quiz de 5 preguntas (A-E: «No sé») + 2 ejercicios prácticos de código (Fácil y Medio, 60% para aprobar).
- **Prohibición absoluta de flujos y esquemas en texto plano (`──►`, `-->`) o cajas ASCII en prosa**.
- **Orientación vertical obligatoria (`flowchart TD` / `direction TB`) y ancho < 400px** en todos los diagramas Mermaid para evitar barras de desplazamiento horizontal con el panel lateral abierto en Obsidian.
- **Criterio visual**: Mermaid vertical primero si aclara a la primera; dibujos o SVG solo si aportan valor pedagógico diferencial real, y con estándares estrictos de calidad profesional limpia (cero esquemas burdos).
- **Granularidad atómica**: Nodos ultra cortos (10 partes por módulo en vez de 5) con 100% contenido técnico evaluable y cero relleno histórico.
- **Inyección obligatoria de respuestas y corrección en Obsidian**:
  Inmediatamente tras responder el alumno en el chat, el tutor DEBE actualizar la nota de la parte en Obsidian con un callout plegado `> [!success]- Respuestas, corrección y resultados de la evaluación` con cada pregunta desglosada (su respuesta, la correcta, check y explicación), la corrección de los ejercicios SQL y el frontmatter `estado: cerrada`.
