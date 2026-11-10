# Página HTML interactiva de estudio — especificación y verificación

Modelo de referencia: `nosql-desde-cero.html` en el directorio de salida resuelto en runtime (leerla si existe antes de construir una nueva).

## Entregable

UN solo archivo `.html` autocontenido (CSS y JS inline, cero dependencias externas), creado en el directorio de salida resuelto en runtime (nunca una ruta de host fija). Lo escribe un subagente constructor acotado con este spec en el handoff; el tutor verifica con el protocolo de abajo y entrega, sin redactar en su propio contexto. El contenido sigue el método de `metodo-explicame.md` con textos más desarrollados (es material de estudio, no chat), sin perder la esencia cero-asunciones. Sin sección visible de referencias/bibliografía, pero toda cifra y respuesta clave se verifica igual antes de entregar (misma doble prueba).

## Componentes v2 (aprobados por el usuario — usar SIEMPRE; obligatorios cuando el tema es código)

Modelo de referencia v2: `plsql-desde-cero-v2.html` en el directorio de salida (leerlo si existe antes de construir uno nuevo; motor de stepper, quiz v2 y juegos listos para copiar).

1. **Ejecutor paso a paso (stepper)** — LA estrella para temas con código: código con línea activa resaltada (borde ámbar), controles ⏮ ◀ ▶ ⏭ + modo Auto y contador "paso N / M"; panel derecho con (a) tabla de VARIABLES que flashean en verde al cambiar, (b) consola de salida que se va escribiendo, (c) panel de estado de datos cuando aplica (result set / colección / grafo) con puntero ▶ en la fila actual. Para errores/excepciones: las líneas que NUNCA se ejecutan quedan TACHADAS EN ROJO (el salto tiene que verse). Cada paso lleva una nota pedagógica (QUÉ + POR QUÉ + qué pasaría si no).
2. **Código anotado clic-por-línea**: clic en una línea → explicación de ESA línea en un panel fijo debajo. Para specs/estructuras largas (packages, schemas).
3. **Juegos v2** (además de los simuladores de decisión v1): *predecir-la-salida* (apostar ANTES, luego ejecución animada línea por línea; incluir al menos una ronda-trampa de lógica), *parsons/ordenar-el-código* (clic en orden, temblor al error, contador de intentos), *simulador de casos* (elegir operación → tarjeta vuela → explota → el handler correcto se ilumina).
4. **Quiz v2**: explicación por CADA distractor (array `w[]` paralelo a las opciones: al fallar se muestra por qué TU opción está mal + por qué la correcta es correcta), dificultad visible por pregunta (básica/media/difícil), botón "↻ Rehacer las que fallé" al completar el quiz con fallos, y **barra de progreso global** fija arriba (respondidas/total de toda la página).
5. **Puentes con lo ya sabido**: caja "Puente con lo que ya sabes" conectando con temas previos del usuario (JDBC, NoSQL, PL/SQL...), reutilizando el mismo universo narrativo (tabla empleados: Juan Pérez id=5 $850000, Ana García id=6 $920000).

## Componentes v3 — saltos de calidad (GENÉRICOS: aplican a CUALQUIER tema, no solo bases de datos)

Estos patrones son independientes del tema. Antes de construir una página, mapear cada uno al tema concreto y aplicar TODOS los que tengan mapeo natural:

1. **Práctica activa (producir, no mirar)** — SIEMPRE incluir al menos un componente donde el usuario PRODUCE la respuesta y la página la valida DE VERDAD:
   - Tema con lenguaje/sintaxis (SQL, Mongo, Cypher, regex, JS...): mini-editor con intérprete/validador en JS del subset enseñado + desafíos "escribe la consulta/expresión que produzca X", validando contra el resultado esperado (no contra el string exacto: aceptar variantes válidas).
   - Tema conceptual (redes, CAP, arquitectura, historia...): construcción interactiva — clasificar casos arrastrando/eligiendo, armar el diagrama correcto pieza por pieza, completar la tabla.
   - Siempre con pistas progresivas (1ª: orientación; 2ª: estructura; 3ª: casi la respuesta) y contador de intentos.
2. **Predicción en cada proceso paso a paso (active recall)** — el stepper sirve para CUALQUIER proceso secuencial (ejecución de código, handshake TCP, algoritmo, pipeline, proceso químico/histórico). Antes de cada paso CLAVE, modo pregunta: "¿qué pasa/qué valor queda después de este paso?" con 3-4 opciones; recién después ejecutar y mostrar. Convierte cada stepper en micro-evaluaciones. Incluir toggle "solo mirar / predecir" (default: predecir).
3. **Memoria entre sesiones (localStorage)** — clave por página (`ei-<tema>`): progreso, respuestas, falladas por concepto. Al volver: banner "la última vez fallaste N preguntas de <concepto> — ¿repaso dirigido?" que salta directo a esas preguntas reseteadas. Botón "borrar progreso".
4. **Modo examen** — N preguntas al azar del pool completo de la página, cronometradas, sin feedback inmediato (se corrige al final), mezclando secciones (interleaving). Resultado con desglose por concepto.
5. **Preguntas generativas** — para todo lo numérico o basado en reglas: plantillas parametrizadas que generan datos nuevos en cada intento (valores, nombres, límites), calculando la respuesta correcta en JS. El usuario aprende el MÉTODO, no la letra. Marcar estas preguntas con "♻ infinita".
6. **Diagnóstico por concepto** — etiquetar cada pregunta con un `tag` de concepto; si el usuario falla 2+ del mismo tag, mostrar aviso con enlace a la sección correspondiente y ofrecer re-jugar el componente interactivo asociado.
7. **Hub de guías** (cuando existan 3+): página índice `guias-hub.html` con progreso global (leyendo los localStorage de cada guía) y quiz inter-temas que conecta conceptos entre guías (transferencia = aprendizaje profundo).

Prioridad si hay que recortar: 1 y 2 son innegociables; luego 3; 4-7 según el tema y el tiempo.

## Features obligatorias

1. **Sidebar ocultable**: índice fijo a la izquierda, botón ☰ que lo colapsa (clase en body + transform), link activo resaltado con IntersectionObserver.
2. **Exportar PDF**: botón que llama `window.print()`. En `@media print`: ocultar sidebar/botones/juegos/animaciones, los quizzes se imprimen como preguntas limpias (opciones sin botones), y una sección `.print-only` al FINAL con la clave de respuestas explicadas (generada por JS desde los mismos datos).
3. **Quizzes abundantes**: uno por sección (3-5 preguntas MCQ) + autoevaluación final integradora. En HTML son interactivos: clic → verde/rojo + explicación del porqué + puntaje por sección. Datos en un objeto JS único que alimenta quiz interactivo Y clave de respuestas.
4. **Diagramas a todo el ancho**: SVG con `viewBox` y `width:100%`, grandes, nunca apretados.
5. **Interactividad = densidad**: cada diagrama tiene zonas clicables (`.hot` con `data-info`) que cargan explicación extra en un panel fijo debajo — más contenido SIN más altura. Tabs y acordeones `<details>` para profundizar (abrirlos en `beforeprint`, restaurar en `afterprint`).
6. **Animaciones representativas** (ver sección Animaciones).
7. **Mini-juegos explicativos**: simuladores donde el usuario toma decisiones y ve consecuencias (ej: simulador CAP, "elige la base correcta" con escenarios y puntaje).
8. Cierre: flujo de decisión completo, tabla resumen, mini-glosario.

## Animaciones — reglas aprendidas (NO repetir el error)

- NUNCA animaciones sutiles (puntito SVG con setInterval, cambios instantáneos de texto). Deben ser GRANDES y narrativas.
- Técnica: HTML divs absolutos + CSS `transition` (left/top/transform, 1-1.5s, cubic-bezier) manejados por JS con clases y setTimeout escalonados (stagger 130-260ms por elemento).
- Elementos que viajan = píldoras/fichas con texto legible y sombra, que MORFAN (cambian texto, color, forma) al llegar.
- Feedback de estado: flash keyframe (`box-shadow` expandiéndose), pop (`popin` scale con overshoot; en SVG requiere `transform-box:fill-box`), colores de estado (verde=ok, naranja=desactualizado, rojo=error), contadores count-up.
- En SVG, `cx`/`cy` SÍ transicionan vía CSS en Chromium (`el.style.cx='650px'` + `transition:cx 1.2s`). Para reiniciar una animación de clase: remove class → `el.getBoundingClientRect()` → add class.
- Autoplay: la animación principal arranca sola la primera vez que entra en viewport (IntersectionObserver, threshold .5, disconnect tras disparar).
- Cada animación con botones de control + Reiniciar (limpiar TODOS los timers en un array).
- Para el PDF: cada animación tiene fallback estático `<pre class="print-only">` con el diagrama ASCII equivalente; el escenario animado lleva clase `no-print`.

## Verificación obligatoria antes de entregar (real-run, no "debería andar")

1. Sintaxis JS: `node -e "new Function(script)"` sobre el contenido del `<script>`.
2. Render: navegador headless Chromium-compatible (`msedge.exe` en Windows, su equivalente resuelto en runtime en otras máquinas) `--headless=new --screenshot` con `--window-size=1400,ALTO_GRANDE`; recortar slices con la herramienta de imagen disponible y MIRARLAS (los fragmentos `#ancla` NO scrollean en headless — no usarlos).
3. Interacciones: puppeteer-core (instalar en `$CLAUDE_JOB_DIR/tmp`) apuntando al binario del navegador resuelto en runtime (nunca una ruta fija): clics reales en cada juego/animación, capturar `pageerror`/`console.error`, screenshot A MITAD de animación para confirmar movimiento visible.
4. PDF: `--print-to-pdf` y verificar cantidad de páginas > 0.
5. Entregar con SendUserFile (display render) y reportar QUÉ se verificó.

## Estética

- Paleta clara: fondo #f6f7fb, paneles blancos, primario índigo #4f46e5, verde #0f9d58, ámbar #d97706, rojo #d93025; un color por concepto/serie, consistente en toda la página.
- Tipografía system-ui; monospace para datos/código. Bordes redondeados 10-16px, sombras suaves.
- Badges de sección, cajas "EN UNA FRASE" (borde izquierdo primario), cajas de advertencia "¿Qué pasaría si...?" (ámbar).
