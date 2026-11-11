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
- **La anatomía de la parte no se negocia aquí**: la fija el tope medido de la skill («Tamaño de parte»: 450 palabras de prosa, 2 secciones, `## Ruta` de 4 líneas, 1 escena, 1 recorrido, 3 preguntas) y `estandar-explicacion.md`. El perfil elige qué se cuenta y con qué ejemplos dentro de ese tope; nunca lo amplía. Si una preferencia pide más secciones, más escenas o más prosa, manda el tamaño y la parte se divide.
- **Contenido evaluable**: cero relleno histórico o anécdotas triviales; cada parte se enfoca en lo que se puede evaluar.

## Interconexión (de dónde sale cada cosa)

Ninguna pieza vive aislada: `quiz.md` + vuelcos + correcciones + `preferencias.md` → `planificador.md` (ruta, profundidad, visuales, ejemplos, ritmo, Perfil aplicado registrado) → `explicaciones/` (cada parte: estructura del plan + Perfil + corrección anterior) → `ejercicios.md` → `cuestionario-final.md` → mapa actualizado. Si una parte ignora el Perfil o el plan ignora un hallazgo, es defecto de procedimiento y se rehace.
## Lo que no cambia con las preferencias

- **La anatomía de la parte** es la del tope medido de la skill («Tamaño de parte») y `estandar-explicacion.md`. Este archivo guarda las respuestas de la persona; no reescribe el formato, y ninguna respuesta lo amplía.
- **Los formatos de verificación** (diagnóstico, mini-quiz, vuelco, claves y correcciones) y el rigor de las fuentes tampoco se negocian.
- **Los visuales** siguen las reglas de la skill: cero flujos o cajas ASCII en prosa, la escena como unidad y el recorrido progresivo en cada parte. Las preferencias eligen el ejemplo y el ritmo, no el formato.
- **Las respuestas y la corrección** se inyectan en la nota de la parte tras responder (callout plegado `> [!success]- Respuestas, corrección y resultados de la evaluación`) y el frontmatter pasa a `estado: cerrada`.
