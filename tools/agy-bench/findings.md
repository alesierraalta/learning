# Lo que midió el banco (issue #246)

Corrida del 2026-11-12, 21:35–22:33 UTC, sobre el VPS con el repo desplegado
(`~/learning`, commit `1d9046f`), runtime `agy` · `gemini-3.8-flash-high` (el de
producción), `rules/deep.json` y la skill `explicacion-interactiva`. Raíz de prueba
`/tmp/bench246/scratch` (propia), estudio propio en el puerto 4799, token propio. El
vault real (`~/Learnings`) quedó idéntico: `git status --porcelain` antes y después,
mismo resultado.

Cada tema se pidió en modo Universitario, se respondió su diagnóstico por la ruta
`submit` del puente (la misma que usa la página), se eligió el método cuando el motor
lo pidió y se pidió la Parte 1. Un turno por acción, en serie.

## La tabla

| Tema | Carpeta | Gates (p1) | Correcciones | Turnos | Tiempo | Piezas | Captura |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rust borrowing | `rust-borrowing` | 4/4 pasan | 0 | 3 | 26 min | `lk-scene`, `lk-story`, `lk-quiz` | `/tmp/bench-shots/rust-borrowing-p1-black-wide.png` |
| TCP handshake | `tcp-handshake` | 4/4 pasan | 0 | 2 | 12 min | `lk-scene`, `lk-story`, `lk-quiz` | `/tmp/bench-shots/tcp-handshake-p1-black-wide.png` |
| Bayes' theorem | `teorema-de-bayes` | 4/4 pasan | 0 | 2 | 8 min | `lk-scene`, `lk-story`, `lk-quiz` | `/tmp/bench-shots/teorema-de-bayes-p1-black-wide.png` |
| Git branching | `git-branching` | 4/4 pasan | 0 | 3 | 7 min | `lk-scene`, `lk-story`, `lk-quiz` | `/tmp/bench-shots/git-branching-p1-black-wide.png` |
| CSS flexbox | `css-flexbox` | 4/4 pasan | 0 | 3 | 6 min | `lk-scene`, `lk-story`, `lk-quiz` | `/tmp/bench-shots/css-flexbox-p1-black-wide.png` |

Las cuatro puertas (`scene-gate`, `scene-lint`, `deck-gate`, `explain-check`) pasaron en
las cinco partes **a la primera**: cero rondas de corrección, cero líneas `estudio:` en
el log. Lo medido se cumple: `## Ruta` de 3 líneas, 2 secciones de contenido, 1 escena,
1 recorrido, 3 preguntas de mini-quiz, 367–450 palabras de prosa, ningún párrafo de más
de dos frases, ninguna caja ASCII, geometría limpia.

## Los defectos que se repiten (y que ninguna puerta mide)

### 1. La misma figura para los cinco temas

Las cinco escenas principales son el mismo dibujo, con las mismas coordenadas:

```text
viewBox 0 0 760 160 · cajas (60,15,280,130) y (420,15,280,130) · flecha (340,95)→(420,95)
```

Rust (`libro` → heap), TCP (`Cliente` → `Servidor`), Bayes (`Universo` → `Condición`),
Git (`HEAD` → `rama`) y CSS (`Contenedor` → `Ítems`) se dibujan igual: dos cajas y una
flecha. La skill pide que la escena dibuje **la cosa misma** —la curva, la secuencia de
segmentos, el puntero—; una caja con una palabra dentro no la representa. `scene-gate`
mide tipografía y ajuste, no si el dibujo es el concepto.

### 2. El mismo recorrido para los cinco temas, sin un solo movimiento

Los cinco `<lk-story>` son `kind: "derivation"`, `viewBox 0 0 360 220` (Rust:
`0 60 360 190`), 3 pasos, **dos actores `icon: "robot"` en (70,140) y (270,140)** y una
`props` de tipo `value`. En los 15 pasos, `moves` es **0**: no hay un solo movimiento,
que es justo lo que la skill pide («actores con estado, movimientos y marcas»). Además,
cada paso declara un `scene.arrows` que el esquema no lee (15 de 15): datos muertos que
nadie dibuja. `explain-check` solo rechaza el paso que dibuja *solo* cajas con texto, y
robots con una ficha pasan.

### 3. Flechas de texto como cabecera de la historia

En 3 de 5 partes la «ecuación» de cabecera es un esquema en texto plano:

```text
TCP:  Cliente ---[ SYN, Seq=1000 ]---> Servidor
Git:  HEAD ---> main ---> Commit c2
CSS:  [Inicio] ---> [Cursos] ---> [Perfil]
```

La skill lo prohíbe sin excepción («Prohibición absoluta de flujos y esquemas en texto
plano (`──►`, `-->`)»). La regla `ascii` de `explain-check` solo busca caracteres de
caja y `─+[►▶▸]`, así que `--->` pasa.

### 4. Todas las respuestas correctas son la opción A

30 de 30 preguntas (5 diagnósticos × 3 + 5 mini-quizzes × 3) tienen `answer: "A"`. Un
alumno que marque siempre A aprueba todo. El motor valida que las opciones aparezcan en
la nota, no la posición de la clave, y el lector no baraja.

### 5. Ninguna parte tiene su página rica

`explicaciones/Parte N - <slug>.html` no existe en ninguna de las cinco (solo una demo,
`explicaciones/demos/p1-memoria.html`, en Rust). La skill dice que la explicación
principal de una parte es esa página; el lector cae a la nota `.md` y nadie lo nota
porque las puertas miden la nota.

### 6. El tutor elige el método en 2 de 5 temas

En TCP y Bayes el tutor registró `pareto` por su cuenta y siguió hasta la Parte 1 en el
mismo turno, sin dejar la elección en la página:

```text
turno 2 (TCP): «He planificado la ruta con el método Pareto y ya está publicada la primera parte»
```

En Rust, Git y CSS sí se detuvo en la etapa `method` y el banco eligió (como haría la
persona). El contrato del runtime agy (`STUDIO_CONTRACT`) no dice que el método es la
pregunta de la página, y agy no tiene herramienta de preguntas en modo `-p`.

### 7. Enlaces `file://` en vez de la vista del estudio

Los 13 turnos de los 5 temas entregan la nota con enlaces locales
(`file:///…/explicaciones/Parte%201%20-%20….md`). En el estudio, servido por https, ese
enlace no abre nada: la persona no tiene `learning_view` en agy y el contrato no le dice
que dé la dirección del estudio.

## Observaciones (no defectos)

- Bayes: la Parte 1 es «Probabilidad condicional y regla del producto» y no nombra el
  teorema; el plan lo deja para la Parte 2. Es prerrequisito, no un error, pero el tema
  pedido no aparece en la primera parte.
- El tiempo del turno que escribe la parte varía mucho: 1210 s en Rust, 181 s en Git.
- El diagnóstico se cerró en una sola ronda en los cinco temas (5 veredictos `claro` por
  tema). El banco responde con la clave del propio quiz y `confianza: "seguro"`, así que
  es el camino de un alumno que ya sabe, no el de uno que duda.
