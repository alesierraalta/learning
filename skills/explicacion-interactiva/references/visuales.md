# Visuales

Una explicación muestra lo que dice. Cuando una idea tiene forma —dos actores que se
intercambian algo, tres pasos, una comparación, un peso que cae—, esa forma se dibuja. No se
escribe con caracteres.

## 1. La regla

**La escena dibuja la cosa de la que se está hablando, no la frase que la acompaña.**

Una caja que contiene la misma frase del párrafo anterior no es un visual: es texto con
borde. Antes de dibujar, pregúntate qué se puede *ver* aquí que no se pueda leer: una
dirección, una proporción, una posición, un antes y un después, una cantidad que se reparte.

**Una escena, una idea, seis elementos como máximo.** Si hacen falta diez, son dos escenas.

**La escena dibuja la cosa misma.** Una distribución o una función se dibuja como su curva,
con sus ejes y la región que importa marcada; un objeto que actúa o cambia se dibuja con
`scene.icons` suelto, fuera de las cajas: el que va sobre una caja es su adorno y no cuenta.
Una caja con una palabra dentro no es ninguna de las dos cosas: dice el nombre
de lo que debería estar dibujado. «Evolución de la curva gaussiana de latencia» con una caja y
una flecha por paso no muestra ninguna curva — no hay campana, no hay eje, no hay banda ±σ, y
quien lee no puede ver lo único que la parte venía a explicar.

## 2. Qué componente

| Lo que quieres mostrar | Componente |
|---|---|
| Una figura que se mira (actores, flujo, contraste, tabla de decisión) | `<lk-scene>` |
| Lo mismo, pero el lector tiene que recorrerlo paso a paso | `<lk-story>` (§8b y §8c) |
| Material viejo: un recorrido de cajas y flechas libres | `<lk-walkthrough>` — **legado**, no se usa en material nuevo |
| Una fórmula que se explica, símbolo por símbolo | escena de **fórmula anotada** (§8) |
| Una distribución o una función | su **curva**, con ejes y la región marcada (§9) |
| Una cuenta | `<lk-math>` (KaTeX), nunca un bloque de código |
| Datos que se comparan celda a celda | tabla Markdown |
| Un matiz, una advertencia, un límite | `<lk-callout>` |
| Un objeto que se mueve o cambia de estado (robot, casa, documento, persona) | `scene.icons` |
| Código que compila / no compila, correcto / error, en 2 a 4 casos | `<lk-cards>` (§8e) |
| El estado de la memoria (stack, heap, punteros), paso a paso | `<lk-memory>` (§8e) |
| Dos tablas unidas por una clave, o filas que se agrupan | `<lk-tables>` (§8e) |
| Qué región de dos o tres conjuntos responde (INNER / LEFT / FULL JOIN) | `<lk-venn>` (§8e) |
| Un proceso entre varios sistemas a lo largo del tiempo (abrir una página, un handshake, una petición que cruza tres servicios) | `<lk-explorer>` (§8f) |
| Código que el lector podría ejecutar | bloque de código con su lenguaje |

`lk-diagram` existe todavía para diagramas de arquitectura viejos. No se usa en material
nuevo.

**El lenguaje de historia es obligatorio en material nuevo.** Toda parte nueva trae al menos una
`<lk-story>` —actores con estado, movimientos y marcas, o una fórmula por símbolos— o una pieza
(`<lk-cards>`, `<lk-memory>`, `<lk-tables>`, `<lk-venn>`). Una escena, un SVG o el
`<lk-walkthrough>` clásico no cuentan: el walkthrough es **legado** (sus cajas y flechas libres
se dibujan mal) y la parte que solo tiene eso —o solo una escena— se rechaza (`the part carries no story and no piece`).
Cuando una etiqueta de una flecha no cabe entre las cajas a un tamaño legible, sube por
encima de la figura; nunca se comprime con `textLength` ni se aplasta hasta lo ilegible.

## 3. Geometría

La escena se dibuja al ancho de la columna de lectura: **`viewBox` de 760 de ancho, y dentro
de ella 1 unidad equivale a 1 píxel**. Es lo que hace que la tipografía de la figura caiga
donde debe caer.

| Elemento | Tamaño |
|---|---|
| Etiqueta dentro de una caja | `size: 22` |
| Subtítulo dentro de una caja | `subSize: 14`, `subDy: 22` |
| Etiqueta sobre una flecha | `labelSize: 15` |
| Anotación suelta | `size: 14` |
| Trazo de caja | 2 (lo pone el dibujante) |
| Trazo de flecha | `width: 3` |

Puntos de partida que funcionan: dos cajas de `196 × 110` en `y: 64`, con una separación de
unos 290 unidades entre sus bordes interiores, y las flechas a `100` y `138`. Un margen
inferior de 56 unidades para el pie.

Con `viewBox` de 1200 o de 1728 —el formato del video— una etiqueta de 26 unidades se
renderiza a 14 píxeles en la columna y la figura pasa a leerse como un pie de foto. Ahí
empieza el «se ve mal».

## 4. Cómo se declara

```html
<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Un paso del bucle",
  "caption": "La acción viaja hacia el entorno; la recompensa y el estado nuevo vuelven.",
  "scene": {
    "boxes": [
      { "x": 8,   "y": 64, "w": 196, "h": 110, "label": "AGENTE",  "sub": "robot · batería 70 %", "tone": "blue",  "rx": 0, "size": 22, "subSize": 14, "subDy": 22 },
      { "x": 556, "y": 64, "w": 196, "h": 110, "label": "ENTORNO", "sub": "casa · sala sucia",      "tone": "green", "rx": 0, "size": 22, "subSize": 14, "subDy": 22 }
    ],
    "arrows": [
      { "x1": 208, "y1": 100, "x2": 552, "y2": 100, "label": "acción: aspirar",  "tone": "blue",  "labelSize": 15, "width": 3, "labelAt": 0.36 },
      { "x1": 552, "y1": 138, "x2": 208, "y2": 138, "label": "recompensa +10",   "tone": "green", "labelSize": 15, "width": 3, "labelAt": 0.64 }
    ]
  }
}
</script>
</lk-scene>
```

Piezas disponibles en `scene.boxes`, `scene.arrows`, `scene.labels`, `scene.badges`,
`scene.dashed`, `scene.grids`, `scene.nodes`, `scene.sheets`, `scene.gears`, `scene.icons`,
`scene.formulas`, `scene.callouts`, `scene.bars`, `scene.stats`.

- `tone`: `ink`, `slate`, `blue`, `green`, `amber`, `red`.
- `labelAt`: dónde caen las palabras sobre la flecha (0 a 1). Dos flechas paralelas se
  escalonan (`0.36` y `0.64`) para que sus etiquetas no queden en la misma columna, que es
  lo que las hace parecer guiones sueltos.
- `rx: 0` para el estilo de papel. Las esquinas redondeadas son del video.

El componente ya resuelve lo mecánico: ajusta el tamaño del texto al ancho real de su caja,
corta la flecha donde van sus palabras y mide antes de pintar. No hace falta calcular a mano
cuánto ocupa una etiqueta.

## 5. Banco de escenas

| Escena | Cuándo | Forma |
|---|---|---|
| **Dos actores** | algo va y vuelve entre dos partes | dos cajas enfrentadas, flecha de ida arriba, de vuelta abajo |
| **Cadena** | una secuencia de estados | cajas en fila, una flecha por salto, etiqueta sobre cada flecha |
| **Caja negra** | antes de definir | una caja «¿?» y una flecha que entra y otra que sale |
| **Contraste** | A y B se distinguen por un dato | dos columnas, el dato distinto en la misma posición, y el desenlace debajo |
| **Reparto** | un total se divide en partes | barras horizontales alineadas a la izquierda, el total anotado |
| **Balanza de decisión** | dos acciones con consecuencias opuestas | dos cajas, la recompensa a un lado y el valor al otro, separadas por una línea |
| **Mapa de decisión** | un árbol de preguntas | una pregunta, dos salidas rotuladas, sin más |

### Iconos

`scene.icons` dibuja **objetos**, no rótulos: `robot` (aspirador visto desde arriba), `house`,
`doc`, `person`. Cada uno se declara con `kind`, `x`, `y`, `size` y `tone`:

```json
{ "kind": "robot", "x": 153, "y": 52, "size": 56, "tone": "blue" }
```

Es la pieza que hace posible un recorrido como el del tutorial: el robot se mueve de una casa a
otra, la casa cambia de color, el documento aparece. Una caja con la palabra «robot» dentro no
es lo mismo y no cuenta como objeto.

`lk-walkthrough` sirve para la misma escena cuando lo importante es el orden: cada paso
declara `title`, `text` y `scene`, y la escena de cada paso muestra **el estado que ese paso
describe**, no una acumulación de todo lo anterior.

## 6. Mapa desde el texto plano

El ejemplo aprobado abusaba de `plain text` con geometría. Cada familia tiene su reemplazo:

| Lo que había | Qué era | Ahora |
|---|---|---|
| `┌──┐ │ AGENTE │ └──┘ ⇄ ENTORNO` | dos actores | escena **dos actores** |
| `estado ↓ acción ↓ entorno ↓ …` | un ciclo | escena **dos actores** con las dos flechas rotuladas |
| `T0 estado / acción / recompensa / T1` | pasos | `lk-walkthrough`, un paso por escena |
| `ANTES … DESPUÉS` | contraste | escena **contraste** |
| `Estado A │ batería 4 % ▼ valor bajo` | dos desenlaces | escena **contraste** con las dos ramas |
| `10 × 0.9 × 0.81` en tabla | datos | tabla Markdown |
| `K2 ████ K3 ████████ K5 ████████████` | proporción | escena **reparto** |
| `γ = 0.5 → 1.000 / 0.500 / 0.250` | serie | tabla Markdown o `lk-math` |
| `1 + 0.9 + 0.81 + …` | cuenta | `lk-math` con los renglones alineados |
| `sala sucia / cocina limpia / batería 70 %` | un estado | `lk-callout` o prosa; no merece figura |
| tres cajas en fila con flechas rotuladas y una de retorno | un ciclo de estados | escena **cadena** con la flecha de retorno debajo (§6b) |
| `VERDE tiempo AMARILLO` en columnas sin alinear | una tabla de transición | tabla Markdown de tres columnas |
| `S = {VERDE, AMARILLO, ROJO}` | un conjunto finito | se queda como texto: la notación ya es la idea, no hay nada que dibujar |

Si dudas, no dibujes: una tabla Markdown honesta es mejor que una figura que repite el
párrafo.

## 7. Barra de calidad

Una figura está mal si:

- contiene la frase que ya dice el párrafo;
- tiene más de seis elementos;
- tiene texto por debajo de 12 unidades de alto;
- apila las etiquetas de dos flechas en la misma columna;
- tiene una flecha sin etiqueta cuando la flecha importa;
- necesita que el lector adivine qué lado es cuál;
- no cabe y hay que desplazarla para entenderla.

Una figura está bien si, tapando el párrafo, todavía se entiende qué pasa.

## 6b. El semáforo, migrado

Caso frecuente: un sistema con tres estados que se repiten en ciclo. En texto plano se
resuelve con tres cajas en fila, dos flechas hacia la derecha y una flecha de retorno debajo,
y se rompe en móvil y en el panel lateral. Así se declara de verdad:

```html
<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 250",
  "title": "Un ciclo de tres estados",
  "caption": "El evento es siempre el mismo; el estado en que estás decide cuál es el siguiente.",
  "scene": {
    "boxes": [
      { "x": 12,  "y": 64, "w": 164, "h": 92, "label": "VERDE",    "sub": "puede pasar", "tone": "green", "rx": 0, "size": 20, "subSize": 14, "subDy": 22 },
      { "x": 298, "y": 64, "w": 164, "h": 92, "label": "AMARILLO", "sub": "precaución",  "tone": "amber", "rx": 0, "size": 20, "subSize": 14, "subDy": 22 },
      { "x": 584, "y": 64, "w": 164, "h": 92, "label": "ROJO",     "sub": "detenido",    "tone": "red",   "rx": 0, "size": 20, "subSize": 14, "subDy": 22 }
    ],
    "arrows": [
      { "x1": 180, "y1": 100, "x2": 294, "y2": 100, "label": "pasa tiempo", "tone": "slate", "labelSize": 15, "width": 3, "labelAt": 0.5 },
      { "x1": 466, "y1": 100, "x2": 580, "y2": 100, "label": "pasa tiempo", "tone": "slate", "labelSize": 15, "width": 3, "labelAt": 0.5 },
      { "x1": 666, "y1": 190, "x2": 94,  "y2": 190, "label": "pasa tiempo: vuelve a VERDE", "tone": "slate", "labelSize": 15, "width": 3, "labelAt": 0.5 }
    ]
  }
}
</script>
</lk-scene>
```

Y los tres pasos del ciclo van en `lk-walkthrough`, un paso por escena, cada uno mostrando el
estado que ese paso describe. La tabla de transiciones, si el tema la pide, es una tabla
Markdown de tres columnas: estado actual, evento, estado nuevo.

## 8. Fórmula anotada

**Toda fórmula que la parte explica se dibuja como fórmula anotada**: dentro de `<lk-scene>` o
de un paso del `lk-walkthrough`, la fórmula se escribe símbolo por símbolo y **cada símbolo
lleva un callout numerado con su flecha y su nombre corto**. La fórmula se lee en la figura, no
en un párrafo aparte.

`<lk-math>` es solo para una **cuenta**: cuando la parte opera con la fórmula y el lector tiene
que seguir los números. Una ecuación limpia sin flechas no explica qué es cada símbolo; es
exactamente lo que el alumno rechazó.

La forma, pieza por pieza:

| Pieza | Qué lleva |
|---|---|
| `scene.formulas` | **un átomo por símbolo** (`{"t":"σ"}`), no la fórmula entera en un átomo: así cada símbolo tiene su posición |
| `scene.callouts` | un badge numerado por símbolo, que **nombra su símbolo**: `"symbol":"μ"` o `"at":22` |
| `scene.labels` | una línea por número: `① μ: el centro, dónde está el pico` |

Reglas de la escena:

- **El callout nombra el símbolo, nunca una coordenada.** `"symbol":"x"` toma el primer átomo
  cuyo texto es `x`; `"at":2` es el índice del átomo en la escena (las fórmulas se numeran
  seguidas, en orden de dibujo). El número se queda donde el autor lo puso (`x`, `y`); la guía
  la mide el kit contra el `tspan[data-atom]` que el lector dibujó, y la vuelve a medir cuando
  cargan las fuentes, cambia el ancho o cambia el papel. Así acierta con cualquier tipografía,
  tamaño, tema y ancho. Una x medida contra una tipografía acierta solo en esa tipografía: es
  lo que puso el ① sobre el «=», el ② sobre el «1» y el ⑥ sobre nada en el lector del alumno,
  que dibuja la fórmula con su propia fuente. Una nota vieja con `to` sigue dibujándose igual.
- **Dos callouts no se tocan**: el círculo de un número (radio 24) no puede cruzar el círculo de
  otro número ni la guía de otro. Si dos símbolos quedan a menos de 60 unidades, uno va **arriba**
  y el otro **abajo** de la fórmula (`y` 30 y `y` 170), nunca los dos en la misma fila a 20
  unidades de distancia. `scene-lint` lo mide y lo llama `callout-encimado`.
- Los callouts de símbolos van **arriba** de la fórmula, en dos filas (`y` 30 y 76) cuando dos
  símbolos quedan a menos de 60 unidades; los de los dos factores del producto van **abajo**
  (`y` 170), para que las flechas de arriba y las de abajo no se crucen.
- `size` 28–34 para la fórmula en una columna de 760; `labels` a 24 unidades, 32 de separación.
- Una fórmula con más de seis símbolos no se anota entera: se anotan los que la parte explica y
  el resto se nombra en la prosa.

La leyenda es lo que el motor mide: los átomos de `scene.formulas` son la fórmula y las líneas
de `labels` son la leyenda. Un símbolo que ningún callout nombra se rechaza
(`formula symbol(s) … never named — draw the formula as an annotated formula scene: one
numbered callout per symbol, each named in its labels line`).

Ejemplo completo y aprobado: `integrations/pi/kit/examples/formula-anotada.md` (pasa
`scene-gate` y `scene-lint`). La densidad gaussiana, con los cinco símbolos y los dos factores
del producto anotados:

```html
<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 410","title":"La densidad gaussiana, símbolo por símbolo","caption":"Cada número señala un símbolo de la fórmula y dice qué es.","scene":{
  "formulas":[{"x":380,"y":130,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"},{"t":" = "},{"t":"1"},{"t":"/"},{"t":"("},{"t":"σ"},{"t":"√"},{"t":"("},{"t":"2"},{"t":"π"},{"t":")"},{"t":")"},{"t":" · "},{"t":"exp"},{"t":"("},{"t":"−"},{"t":"("},{"t":"x"},{"t":"−"},{"t":"μ"},{"t":")"},{"t":"²"},{"t":"/"},{"t":"("},{"t":"2"},{"t":"σ"},{"t":"²"},{"t":")"},{"t":")"}]}],
  "callouts":[{"n":1,"x":173,"y":30,"symbol":"f","tone":"blue"},{"n":2,"x":192,"y":170,"symbol":"x","tone":"amber"},{"n":3,"x":493,"y":30,"symbol":"μ","tone":"green"},{"n":4,"x":278,"y":76,"symbol":"σ","tone":"slate"},{"n":5,"x":299,"y":170,"at":5,"tone":"red"},{"n":6,"x":400,"y":170,"symbol":"exp","tone":"blue"}],
  "labels":[
    {"x":380,"y":220,"text":"① f: la densidad, la altura de la curva"},
    {"x":380,"y":252,"text":"② x: el valor que miras, la latencia"},
    {"x":380,"y":284,"text":"③ μ: el centro, dónde está el pico"},
    {"x":380,"y":316,"text":"④ σ: el ancho, cuánto se abre la campana"},
    {"x":380,"y":348,"text":"⑤ 1/(σ√(2π)): el factor que normaliza; π: 3,1416"},
    {"x":380,"y":380,"text":"⑥ exp(…): el exponente, la distancia al centro"}
  ]}}
</script>
</lk-scene>
```

Los números de este ejemplo no salen de medir nada: cada uno nombra su símbolo y el kit dibuja la
guía hasta el glifo que el lector tenga. Si cambia el texto de la fórmula, el callout que nombra
un símbolo que ya no está deja de llegar a un glifo y `scene-lint` lo llama `callout-desviado`:
se corrige el nombre, no la coordenada.

La misma fórmula, cuando la parte la opera, va con `<lk-math>` y su cuenta renglón a renglón. No
se escribe dos veces la misma fórmula: se anota una vez y, si hay cuenta, se escribe la cuenta.

## 8b. Recorrido de fórmula (`<lk-story kind="formula">`)

**La primera vez que la parte explica una fórmula, la enseña con su recorrido de fórmula.** El
mueble es el mismo para la fórmula y para el ejercicio: una **cabecera** con la fórmula (el token
del paso, resaltado; el resto normal), un **escenario** donde pasa la acción (la curva, el icono
del actor, la etiqueta con punta), un **narrador** con frases cortas y fichas en línea, y un
**reproductor** (anterior / reproducir / siguiente, barra segmentada y contador N/M).

| Pieza | Qué lleva |
|---|---|
| `kind` | `"formula"` |
| `formula` | la fórmula entera, **un átomo por símbolo con `id` estable** (`{"t":"μ","id":"mu"}`) |
| `steps[].focus` | los ids de los átomos que el paso resalta; el resto queda normal |
| `steps[].say` | `what` · `use` · `value`: qué es, para qué se usa y cuánto vale en el ejemplo |
| `steps[].narrator` | una o dos frases cortas; `«…»` se dibuja como ficha y `*…*` como palabra clave |
| `steps[].stage.scene` | el escenario del paso con el vocabulario de la escena (`paths`, `icons`, `labels`, `actors`, `tags`, `marks`) |

Reglas:

- **Paso 1 la fórmula entera; cada paso siguiente un símbolo o grupo por su `id`; el último, la
  fórmula con los números del ejemplo sustituidos y su resultado.** Los ids son estables: el
  mismo `mu` se resalta en su paso sin escribir una coordenada.
- **El escenario dibuja el significado del símbolo en el ejemplo**, no repite la fórmula: la
  campana, la línea de μ, la banda ±σ, la petición y el servidor como `icons` con su rótulo.
- **El narrador dice qué es, para qué se usa y cuánto vale en el ejemplo** (`say`), en frases de
  una idea. Las fichas `«2»` y las palabras clave `*pasa restando*` son el vocabulario del
  narrador, no HTML.
- Un icono se dibuja con el relleno suave de su tono, nunca blanco sobre papel blanco, y su
  centro se mantiene dentro del lienzo: un icono declarado a 8 unidades con 56 de ancho queda
  medio fuera del `viewBox` y el SVG lo recorta (`pieza-invisible`).

```html
<lk-story>
<script type="application/json">
{"kind":"formula","title":"La densidad, paso a paso","viewBox":"0 0 360 250",
 "formula":{"size":18,"atoms":[{"t":"f","id":"f"},{"t":"(","id":"open"},{"t":"x","id":"x"},{"t":")","id":"close"}]},
 "steps":[
  {"title":"La fórmula entera","focus":[],"narrator":"Es la densidad «f» en el punto «x».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la campana"}]}}},
  {"title":"f: la densidad","focus":["f"],"say":{"what":"la función de densidad","use":"da la altura de la curva","value":"en el ejemplo, f(184 ms)"},"narrator":"«f» es la densidad.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la altura"}]}}},
  {"title":"x: el punto","focus":["x"],"say":{"what":"el valor que miras","use":"la latencia de una petición","value":"x = 184 ms"},"narrator":"«x» es el punto.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la latencia"}]}}},
  {"title":"Con el ejemplo","focus":[],"narrator":"Con «x = 184», «f(184) = 0,000 65».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"el resultado"}]}}}
 ]}
</script>
</lk-story>
```

Ejemplo aprobado y completo, con la campana, μ, σ y los iconos de petición y servidor:
`integrations/pi/kit/examples/formula-gaussiana.md`.

## 8c. Recorrido de derivación (`<lk-story kind="derivation">`)

**Todo ejercicio resuelto se enseña con su recorrido de derivación.** Cada paso es una
**ecuación** en la cabecera; el escenario muestra la acción: los actores (los términos) con su
rótulo, el término que estaba en un lado en gris y el que queda en color, la **flecha curva
desde la posición medida del término hasta su posición nueva** con el verbo encima («pasa
restando»), los términos que se combinan marcados y reemplazados por su resultado, y el último
paso con la respuesta enmarcada y su ✓.

| Pieza | Qué lleva |
|---|---|
| `kind` | `"derivation"` |
| `steps[].equation` | la ecuación del paso, un átomo por término con `id` estable entre pasos |
| `steps[].stage.scene.actors` | los términos dibujados: `id`, `x`, `y`, `w`, `h`, `label`, `tone`, `state` (`faded` = ya no vale; `invalid` = tachado con ✗), `tag` (el rótulo con punta). Con `icon` es un dibujo (el robot) en vez de una caja: ver 8d |
| `steps[].stage.scene.moves` | `from` / `to` (ids de actor) y `verb`: la flecha se mide entre las dos cajas, nunca entre coordenadas |
| `steps[].stage.scene.marks` | `combine` (marca los términos y, con `to`, los reemplaza por su resultado) y `ok` / `no` (✓ / ✗ y el marco de la respuesta) |

Reglas:

- **Los ids de los términos son estables entre pasos**: `two` es el mismo 2 antes y después de
  cruzar; la flecha empieza en la caja medida de `two-old` y termina en la de `two`.
- **El signo cambia en la ecuación, no en la flecha**: el paso 2 ya escribe `3 − 2`; la flecha
  dice «pasa restando». Un término que se combina se marca con `combine` y su resultado aparece
  en el paso siguiente.
- **El último paso enmarca la respuesta** (`marks: [{"kind":"ok","actor":"one"}]`).
- El escenario no repite la ecuación: la cabecera la escribe y el escenario muestra el
  movimiento.

```html
<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Resolver x + 2 = 3","viewBox":"0 0 360 250","steps":[
 {"title":"La ecuación","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" + ","id":"plus"},{"t":"2","id":"two"},{"t":" = ","id":"eq"},{"t":"3","id":"three"}]},"focus":["two"],"narrator":"Tengo «x + 2 = 3». Quiero dejar la «x» sola.","stage":{"scene":{"actors":[{"id":"x","x":20,"y":150,"w":44,"h":40,"label":"x","tone":"blue","tag":"incógnita"},{"id":"two","x":140,"y":150,"w":44,"h":40,"label":"2","tone":"amber","tag":"el 2"}]}}},
 {"title":"El 2 pasa al otro lado","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"3","id":"three"},{"t":" − ","id":"minus"},{"t":"2","id":"two"}]},"focus":["minus","two"],"narrator":"El «2» estaba sumando. Al cruzar, *pasa restando*.","stage":{"scene":{"actors":[{"id":"two-old","x":140,"y":40,"w":44,"h":40,"label":"2","tone":"slate","state":"faded","tag":"estaba sumando"},{"id":"x","x":20,"y":160,"w":44,"h":40,"label":"x","tone":"blue"},{"id":"two","x":230,"y":160,"w":44,"h":40,"label":"2","tone":"amber"}],"moves":[{"from":"two-old","to":"two","verb":"pasa restando","tone":"amber"}]}}},
 {"title":"La cuenta","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"1","id":"one"}]},"focus":["one"],"narrator":"«3 − 2 = 1». Entonces «x = 1».","stage":{"scene":{"actors":[{"id":"x","x":40,"y":170,"w":44,"h":40,"label":"x","tone":"blue"},{"id":"one","x":160,"y":170,"w":44,"h":40,"label":"1","tone":"green"}],"marks":[{"kind":"ok","actor":"one"}]}}}
 ]}
</script>
</lk-story>
```

Ejemplo aprobado y completo, con los tres pasos y los textos: `integrations/pi/kit/examples/derivacion-x.md`.

## 8d. Actores con estado y piezas (`actors` + `props`)

**Una idea con estado se cuenta con actores, no con una tabla.** Cada concepto es un actor con su
nombre (`tag`); su **estado se ve** por color y marca; las **piezas** que lleva —un valor, una
lectura, una escritura— van pegadas a él; una **marca de resultado** (✓ / ✗) cierra el paso. Úsalo
cuando lo que enseñas es quién tiene qué y cuándo deja de valer (propiedad y movimiento de un
valor, quién lee y quién escribe, qué pasa al salir de un ámbito). Si solo se compara o se lista,
es una escena o una tabla.

| Pieza | Qué lleva |
|---|---|
| `actors[].icon` | `"robot"` (u otro icono): el actor es un dibujo centrado en `x`, `y` (`size`); sin `icon`, una caja con `w`, `h`, `label` |
| `actors[].state` | `active` (por defecto, su tono) · `faded` (gris: ya no vale) · `invalid` (gris, tachado y con ✗) |
| `props[]` | `id`, `kind`, `on` (el id del actor), `side` (`right`, `left`, `above`, `below`), `label`, `tone`, `state: "faded"` |
| `props[].kind` | `value` (un cofre que carga un valor: su `label`) · `read` (un ojo) · `write` (un lápiz) · o cualquier icono |
| `moves[]` | `from` / `to` pueden ser un actor **o una pieza**: la flecha sale del cofre, no del actor. La forma `actor` + `toX`/`toY` (un actor y un punto) se dibuja igual: mismo trazo, misma punta, mismo verbo |
| `marks[]` | `ok` / `no` sobre un actor (`actor`), sobre varios (`actors`) o en el hueco entre dos (`between`) |

Reglas:

- **Pocas palabras y una idea por paso**: el cofre dice el valor; el robot, su nombre; el
  narrador, qué pasó. Cuatro pasos como máximo para una idea.
- **Dos cosas distintas no se dibujan con el mismo personaje (#287)**: un commit y una rama, un
  valor y sus dos referencias, un contenedor y su ítem. Si el actor dice qué es —「commit」,
  「rama」, 「valor」, 「referencia」, 「contenedor」, 「ítem」— el dibujo tiene que decirlo también: cada
  uno con su `kind` (`database`, `row`, `session`, `lock`, `user`, `server`, `process`, `file`,
  `packet`, `robot`), y el tono es un estado, no un oficio. `scene-lint` mide el caso extremo
  (`personajes-iguales`: dos actores del mismo paso con el mismo personaje **y** el mismo tono
  cuyas fichas no comparten ninguna palabra) y deja pasar el resto, porque el tono sí distingue a
  dos robots; el caso real del quinto banco —«commit» y 「rama」 como dos robots de distinto
  tono— lo corrige esta regla, no la puerta.
- **El actor que ya no vale se apaga (`faded`); el que se usa sin valer se tacha (`invalid`)**.
  No se inventa otro color para «viejo».
- **Las piezas se anclan por id** (`"on":"s1"`) y se colocan solas: junto al lado que pides y, si
  ahí no cabe, donde sí. No se escriben coordenadas de piezas.
- **Un `on`, un `between` o un `from` que nombra un id que el paso no tiene** se declara y
  `scene-lint` lo llama `pieza-sin-destino`; una pieza encima de una palabra, `pieza-sobre-texto`.
- **Un movimiento se dibuja o se rechaza, nunca se descarta en silencio.** La forma canónica es
  `{"from":"s1","to":"s2","verb":"se mueve"}`; `{"actor":"s1","toX":…,"toY":…}` significa lo
  mismo y se dibuja igual —el trazo sale de la figura del actor y termina en el punto—, pero apunta
  a un punto libre o al borde de la pieza, no a su centro: una punta dentro de una figura se llama
  `punta-enterrada`. Un movimiento cuya forma no se entiende, que nombra una pieza que el paso no
  tiene o que apunta a donde el actor ya está (trazo de 0 unidades) es `movimiento-no-dibujado` en
  `scene-lint` (#286).
- Los robots y los cofres son de la casa; no se copia el pixel art ni la mascota de otro sitio.

```json
{"kind":"derivation","title":"Mover un valor","viewBox":"0 60 360 180","steps":[
 {"title":"Una dueña","equation":{"atoms":[{"t":"let ","id":"let"},{"t":"s1","id":"s1"},{"t":" = String::from(\"hola\");","id":"end"}]},"focus":["s1"],"narrator":"«s1» es la *dueña* del texto.",
  "stage":{"scene":{"actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s1"}],"props":[{"id":"valor","kind":"value","on":"s1","side":"right","label":"\"hola\"","tone":"green"}]}}},
 {"title":"Mover","equation":{"atoms":[{"t":"let s2 = ","id":"let"},{"t":"s1","id":"s1"},{"t":";","id":"end"}]},"focus":["s1"],"narrator":"El valor *se mueve* a «s2».",
  "stage":{"scene":{"actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s1"},{"id":"s2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","tag":"s2"}],"props":[{"id":"valor","kind":"value","on":"s1","side":"right","label":"\"hola\"","tone":"green"}],"moves":[{"from":"valor","to":"s2","verb":"se mueve","tone":"amber"}]}}},
 {"title":"La vieja deja de valer","equation":{"atoms":[{"t":"println!(\"{s1}\");","id":"use"}]},"focus":["use"],"narrator":"«s1» ya no vale: leerla no compila.",
  "stage":{"scene":{"actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"invalid","tag":"s1"},{"id":"s2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","tag":"s2"}],"props":[{"id":"leer","kind":"read","on":"s1","side":"right","tone":"blue"},{"id":"valor","kind":"value","on":"s2","side":"left","label":"\"hola\"","tone":"green"}],"marks":[{"kind":"no","actors":["s1","leer"]}]}}}
]}
```

Ejemplo aprobado y completo, en cuatro pasos (dueña, mover, la vieja se tacha, se libera):
`integrations/pi/kit/examples/propiedad-rust.md`.

## 8e. Piezas visuales: tarjetas, memoria, tablas y conjuntos

Cinco piezas que el lector dibuja desde JSON declarativo, para lo que una escena de cajas y
flechas cuenta mal. **Se eligen por lo que la parte enseña**, no por variar: una por parte, y
ocupa el lugar de la escena (cuenta contra el tope de una figura). Todas se anclan por id: un
puntero, un conector o una región **nombran** a qué llegan y el lector los traza midiendo lo que
el navegador dibujó, así que nunca se escribe una coordenada. Se apilan solas en una columna
estrecha, siguen los tres papeles (claro, oscuro, negro) y viven solas o como paso de un
`<lk-story>` (el recorrido pone el código en su cabecera; la pieza dibuja el estado).

| Cuándo | Pieza | Ejemplo aprobado |
|---|---|---|
| Comparar **código** que compila con el que no, o lo correcto con el error (2 a 4 casos) | `<lk-cards>` | `examples/prestamos-rust.md` |
| El **estado de la memoria** paso a paso: qué vive en el stack, qué en el heap, quién apunta a qué | `<lk-memory>` | `examples/memoria-string-rust.md` |
| Dos tablas que se **unen por una clave**, o un GROUP BY (filas → grupos con su COUNT) | `<lk-tables>` | `examples/sql-join-videojuegos.md`, `examples/sql-group-by.md` |
| Qué **región** de dos o tres conjuntos responde (INNER / LEFT / FULL JOIN, unión, diferencia) | `<lk-venn>` | `examples/sql-venn-joins.md` |

**Las tarjetas de veredicto son para código.** Aparecen solo cuando la parte muestra código
(compila / no compila, correcto / error); un tema sin código nunca las usa. Si lo que comparas
no tiene veredicto, es una tabla o una escena.

**Las píldoras salen del contenido, y no se repiten de una parte a otra (#287).** La píldora es
la etiqueta corta que el lector ve primero, así que dice lo que este caso es, no el formato del
mueble: un **veredicto** («COMPILA» / «NO COMPILA», «CORRECTO» / «RECHAZADO»), un **contraste**
(«ANTES» / «DESPUÉS», «CON `&`» / «CON `&mut`»), una **secuencia** («1 PASO» / «2 PASO» /
«3 PASO») o una **lista de comprobación** («SÍ» / «NO» / «FALTA»). Repetir en cinco partes las
mismas tres píldoras —CORRECTO, CORRECTO, RECHAZADO— es un molde, no una explicación: si las
tres tarjetas no son un veredicto, la pieza es una tabla o una escena. Esto se corrige aquí, en
la skill, y no con una puerta: la repetición se ve en el banco, que registra las píldoras de cada
mazo.

Cada pieza admite `caption` (el pie que la guía; con él la parte no debe una línea «Cómo
leerlo»). **El pie va con su figura (#287)**: o dentro de la pieza, en su `caption` —lo que lo
ata a su marco—, o en la línea `Cómo leerlo:` escrita justo debajo de ella. Al final de la prosa,
el pie de una pieza puede amanecer arriba de la otra columna del modo ancho, con su figura al pie
de la anterior: el alumno leyó las tarjetas del quinto banco con su pie en la columna de al lado.
`scene-lint` lo mide en la página del modo ancho (`leyenda-descolgada`), y la pieza cruza las dos
columnas como una escena, así que su pie no se queda sin sitio. Dentro de un `<lk-story>` el paso nombra la pieza en su `stage` y hereda lo que el
recorrido declara a su nivel (`"venn":{"sets":[…]}`, `"tables":{…}`, `"memory":{"columns":[…]}`),
así un paso escribe solo lo que cambia. Un recorrido puede mezclar pasos de escena y de pieza.

### `<lk-cards>` — veredicto, título, dibujo y razón

```json
{"title":"Cuántas referencias a la vez","cards":[
 {"id":"muchas","verdict":"ok","pill":"COMPILA","title":"Muchas «&»",
  "draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"}],"target":{"text":"s"}},
  "reason":"Todos leen a la vez"},
 {"id":"mezcla","verdict":"no","pill":"NO COMPILA","title":"«&» y «&mut» a la vez",
  "draw":{"refs":[{"text":"&s","icon":"read"},{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},
  "reason":"Uno escribiría mientras otro lee"}]}
```

`verdict` es `ok` o `no`: la que falla se tiñe de rojo y su flecha también. `draw.refs` son fichas
(`text`, `tone`, `icon`: `read`, `write`, `value` o cualquier icono de la escena) que apuntan al
`target`. El título admite «fichas de código». Una línea de razón, no un párrafo.

### `<lk-memory>` — pasos numerados con su línea de código

```json
{"columns":[{"id":"stack","label":"STACK"},{"id":"heap","label":"HEAP"}],"steps":[
 {"code":"let s2 = s1;","rows":[
  {"stack":{"id":"s1x","name":"s1","pill":{"text":"movida","tone":"red"},"cells":["ptr","len 4","cap 4"],"state":"invalid"}},
  {"stack":{"id":"s2","name":"s2","pill":{"text":"dueña","tone":"green"},"cells":["ptr","len 4","cap 4"],"tone":"green","points":"h2"},
   "heap":{"id":"h2","cells":["h","o","l","a"],"tone":"amber"}}]}]}
```

Cada paso repite la línea que explica (insignia con su número y el código). Una fila pone un grupo
por columna; `cells` lo segmenta; `pill` es el estado (dueña, movida). **`points` nombra el id del
destino** y el puntero sale del borde de la celda y llega al borde de las celdas del destino;
`state: "invalid"` dibuja las celdas a trazos y tachadas y su puntero muere en una ✗. Un `points`
a un id que el paso no tiene es un error del lector, no una flecha en el aire. En un `<lk-story>`
el paso lleva `"stage":{"memory":{"rows":[…]}}` y no repite el código: ya está en la cabecera.

### `<lk-tables>` — tablas unidas por conectores, y GROUP BY

```json
{"tables":[
  {"id":"games","name":"videogames","columns":["title","developer_id"],"rows":[["Zelda","1"],["GTA V","5"]]},
  {"id":"devs","name":"developers","columns":["id","name"],"rows":[["1","Nintendo"],["5","Rockstar"]]}],
 "join":{"from":"games.developer_id","to":"devs.id","on":"developer_id = id","highlight":["5"]},
 "result":{"label":"RESULTADO","select":["games.title","devs.name"]}}
```

Las coincidencias y el resultado **se derivan de los datos**: `from` y `to` nombran
`tabla.columna`, un conector curvo sale de cada celda clave y llega a la fila que coincide (un
color por coincidencia), `on` va en una píldora y `result.select` pide las columnas del resultado.
`highlight` tiñe las filas de esos valores en las tres tablas (`"all"` tiñe todas); `kind:"left"`
conserva las filas sin pareja con `NULL`. **La columna clave va última en la tabla izquierda y
primera en la derecha**: así el conector no cruza texto, y `scene-lint` lo llama
`connector-over-text` si no. `show` descubre las partes de a poco —`tables`, `links`, `on`,
`result`— y es lo que hace de un JOIN un recorrido de tres pasos.

```json
{"group":{"by":"developer","columns":["title","developer"],"highlight":["Rockstar"],
 "rows":[["Zelda","Nintendo"],["GTA V","Rockstar"],["RDR 2","Rockstar"]]}}
```

GROUP BY: las filas originales a la izquierda, a la derecha un grupo por valor de `by` con una ficha
por fila y su COUNT en una insignia (se calcula, no se escribe). `show:["rows"]` o `["rows","groups"]`.

### `<lk-venn>` — dos o tres conjuntos y la región que responde

```json
{"sets":[{"id":"a","label":"A","note":"videogames"},{"id":"b","label":"B","note":"developers"}],
 "fill":["a","a+b"],"op":"LEFT JOIN","says":"Todo A, con B donde haya"}
```

**Una región se nombra por los conjuntos a los que pertenece, exacto**: `a+b` es lo que está en A y
en B (la intersección), `a` es lo que solo está en A. Una operación que suma regiones las lista:
INNER = `["a+b"]`, LEFT = `["a","a+b"]`, FULL = `["a","a+b","b"]`, diferencia A−B = `["a"]`. `op` nombra
la operación y `says` la dice en una línea. Para tres conjuntos, `"a+b+c"` es el centro. Para «una
región por paso», el recorrido declara `"venn":{"sets":[…]}` una vez y cada paso solo `fill`, `op` y
`says`.

## 8f. Un escenario entre varios sistemas (`<lk-explorer>`)

**Un proceso entre varios sistemas a lo largo del tiempo no es una escena ni un recorrido de
actores.** Abrir una página web, un handshake, una petición que cruza tres servicios: lo que hay
que ver es *quién habla con quién, en qué orden y qué viaja*. Eso se dibuja con un mapa del
sistema y una lista de pasos que lo mueve.

| Cuándo | Componente |
|---|---|
| Varios sistemas y un orden en el tiempo (DNS, TCP, HTTP, el dibujo) | `<lk-explorer>` |
| Un concepto con estado: quién tiene qué y cuándo deja de valer | `<lk-story>` con actores y piezas (§8d) |
| Un intercambio único, sin pasos | `<lk-scene>` con dos cajas y sus flechas |

El explorador dibuja **cada sistema una vez** —su personaje (`kind`), su nombre y el detalle que lo identifica
(`192.168.1.10`, `8.8.8.8`, `puerta de enlace`)—, une con trazos los que hablan y mueve el foco con
la lista de pasos: el paso activo enfoca a sus actores, atenúa al resto y escribe en el mapa **qué
viaja** (`www.example.com`, `SYN`, `200 OK`). Debajo, el registro se llena al avanzar (número,
origen, destino, tipo e info, teñido por el tipo; `"log": false` lo quita), y el panel del paso cuenta qué pasa con un
párrafo corto y sus filas clave/valor.

```json
{"title":"Abrir una página web","rows":[["client","router"],["dns","web"]],"views":["map","sequence"],
 "actors":[{"id":"client","name":"Cliente","detail":"192.168.1.10","kind":"person","tone":"blue"},
           {"id":"dns","name":"DNS","detail":"8.8.8.8","kind":"database","tone":"amber"}],
 "links":[{"from":"client","to":"router"},{"from":"router","to":"dns"}],
 "steps":[{"title":"La consulta","subtitle":"pregunta por el nombre","focus":["client","dns"],
   "travels":{"from":"client","to":"dns","label":"www.example.com","kind":"query"},
   "details":{"text":"El cliente no sabe dónde vive ese nombre.","rows":[["URL","www.example.com"],["PUERTO","53"]]},
   "log":{"from":"client","to":"dns","kind":"query","info":"¿A qué IP va?"}}]}
```

Reglas:

- **De dos a seis actores y de uno a ocho pasos.** Más es dos escenarios, no uno más largo.
- **Personajes, no cajas**: `kind` toma los personajes que el kit dibuja (`person`, `house`, `doc`, `gear`, `robot`, `coin`, `database`, `server`, `row`, `session`, `lock`, `process`, `packet`). Un actor sin `kind` es una caja con su nombre, y un `kind` que el kit no dibuja se rechaza en vez de dibujarse a medias.
- **El mapa se ordena con la topología**: `rows` coloca a cada actor en su celda y los enlaces se
declaran entre actores **vecinos**. Un enlace que salta por encima de una tarjeta la cruza, y el
lector lo llama `connector-over-text`.
- **Un paso, una idea y un viaje.** `focus` son los que hablan, `travels` es lo que se mueve y `log`
es su fila. El título y el subtítulo van a la lista; el párrafo, al panel.
- **El tipo tiñe**: `query`, `answer`, `syn`, `ack`, `get`, `ok` y `render` tienen tono propio; otro
palabra es gris, y `tone` lo cambia.
- **`views: ["map","sequence"]`** añade la segunda vista: una vida por actor y una flecha por paso,
con lo que viaja escrito encima. Es el mismo recorrido, no otro.
- **El foco atenúa, no recorta.** El mapa no hace paneo ni zoom: el actor enfocado se ve entero en
cualquier ancho. Con `prefers-reduced-motion` se apagan la transición y el movimiento de los
trazos.
- **Todo se coloca midiendo**: los enlaces salen del borde de un actor y llegan al borde del otro,
la etiqueta de lo que viaja va a la franja vacía que el mapa le deja (encima de la fila, o entre
las filas cuando están apilados) y la flecha se corta donde está la etiqueta. En un teléfono los
actores se apilan: los enlaces bajan por la cuneta derecha, uno por carril y sin cruzarse, y lo que
viaja por la izquierda. Todo queda a 20 px o más del borde del panel.

**Qué rechaza el lector**: `focused-out-of-view` (el actor enfocado se sale de su mapa o de la
ventana), `log-overflow` (una fila del registro no cabe en su ancho), `travel-over-text` (la
etiqueta de lo que viaja tapa una palabra), `map-underfilled` (en el ancho amplio, el mapa cubre menos
del 60 % de su panel o no va centrado), `log-header-orphan` y `log-cell-stacked` (una cabecera o una
celda del registro cae fuera de su línea), `log-cell-wraps` y `log-cell-overflow` (una celda se parte
o se desborda de su columna), `subtitle-style` (un subtítulo en versalitas, con espaciado o bajo 13 px)
y `link-on-edge` (un trazo a menos de 8 px del borde del panel, o a menos de 20 px en el teléfono),
además de `connector-miss` cuando un enlace no llega a su actor. `scene-gate` y `scene-lint` lo miden en las tres tintas (clara, oscura y negra) a 1440 y a 390 px, paso a paso y una vez para la
secuencia.

Ejemplo aprobado y completo, gated: `integrations/pi/kit/examples/abrir-una-pagina.md`. Ocho pasos: la consulta al DNS y su respuesta, el saludo TCP en tres mensajes (SYN, SYN-ACK, ACK), la petición HTTP con su 200 OK y el dibujo de la página.

### Qué mide el lector (y qué rechaza)

`scene-gate` abre cada pieza a 1440 y a 390 px, en las tres tintas, paso a paso si es un recorrido, y mide: que no se
salga de su escenario, ninguna palabra bajo 13 px, tinta con 4,5:1 sobre su papel, ninguna
superficie blanca sobre el papel de noche, y que cada conector empiece y termine en su ancla
(`connector-miss`). `scene-lint` mide la convivencia: una palabra sobre otra (`text-over-text`),
un conector o el borde de un conjunto que atraviesa una palabra (`connector-over-text`,
`outline-over-text`). El motor y `explain-check` aceptan la pieza como una figura: **una
pieza o una escena, no las dos** en la misma parte, y su JSON no cuenta como prosa.

## 8g. Probabilidad: los conteos antes de la fórmula (#261)

Los conteos van antes de la fórmula: una parte de probabilidad cuenta los casos antes de escribirla, para que el lector vea cuántas personas hay en cada grupo y de dónde sale el número.

- **Qué dibuja** (la figura de los conteos es el árbol de la sección 8h): un `<lk-venn>` con el conteo en la nota de cada conjunto (`"note":"Enfermos"`) y en `says` (los dos a la vez, los que dan positivo); o un `<lk-tables>` con los casos cuando los grupos son filas. Un conjunto sirve cuando lo que importa es la zona compartida; una tabla, cuando importan las cuentas por grupo.
- **El ejemplo gated**: `integrations/pi/kit/examples/bayes-mil-personas.md`. Mil personas, diez enfermos, nueve de ellos con positivo y noventa y nueve sanos con positivo; el resultado es 9 de 108, un 8,3 %. Cuatro pasos, cada uno con un movimiento, y la cabecera es la fórmula con el token del paso resaltado.
- **Tabla de decisión**: una probabilidad condicional o de Bayes se cuenta con `<lk-venn>` (o `<lk-tables>`) antes de la fórmula, y el recorrido de derivación la escribe después.
- **Quién lo mide**: `explain-check` (la parte cumple el estándar), `scene-gate` (el paso no queda vacío ni trae suelo) y la matriz de `integrations/pi/bridge.test.mjs` (`STORY_EXAMPLES`), en cada tinta y ancho.

## 8h. El árbol de frecuencias y los personajes (#261)

Los conteos de una probabilidad se dibujan como **árbol de frecuencias**: `<lk-tree>`. Cada grupo es una persona con su personaje (`kind: "user"`); cada rama lleva su cuenta y su porcentaje sobre el grupo de arriba; las hojas que responden a la pregunta van destacadas con `"highlight": true`.

```
<lk-tree>
<script type="application/json">
{"title":"De mil personas","caption":"…","nodes":[
 {"id":"todas","lines":["1000 personas"],"kind":"user","tone":"slate"},
 {"id":"enf","lines":["enfermos"],"kind":"user","tone":"blue"},
 {"id":"enf-pos","lines":["positivos"],"kind":"user","tone":"amber","highlight":true}
],"links":[
 {"from":"todas","to":"enf","count":10,"rate":"1 %"},
 {"from":"enf","to":"enf-pos","count":9,"rate":"90 %"}
]}
</script>
</lk-tree>
```

- **Forma**: cada grupo se divide en dos ramas, o no se divide. El kit coloca los grupos por niveles, las hojas en orden y cada padre centrado sobre sus dos ramas, así el rótulo de cada rama cae sobre su trazo.
- **Medidas**: `scene-lint`, `scene-gate` y la matriz de `integrations/pi/kit/test/tree.test.mjs` miden la pieza a 1440 y a 390 px, en las tres tintas: texto de 13 px como mínimo, ningún rótulo sobre otro, ningún trazo sobre un texto, cada rótulo a 10 px como mucho de su rama, y el texto de cada grupo dentro de su persona.
- **El ejemplo gated**: `integrations/pi/kit/examples/bayes-mil-personas.md`. El árbol de mil personas y, después, la historia que aísla los 108 positivos (9 + 99) y calcula 9/108 ≈ 8,3 % con la fórmula en la cabecera.
- **Personajes** (`personaje-sin-sentido`, #261): un personaje contradice su etiqueta cuando un `server`, un `file` o una `database` dibuja a una persona («enfermos», «sanos», «pacientes») o a un resultado de la prueba («positivos», «negativos», «prueba»), o cuando un `user` dibuja un servidor, un archivo o una base. Una persona se dibuja con `user`; un resultado, con una marca o una pieza. La regla vale para las historias, las escenas y los grupos de un `<lk-tree>`. El léxico es corto, y lo comparten `explain-check` y el motor.

## 9. La curva, no la caja

Una distribución, una función, una serie temporal o una relación entre dos variables **se
dibujan como lo que son**: la curva, con su eje, su escala y la región marcada. Una caja que
dice «curva gaussiana» no es una curva.

| Lo que la parte explica | Cómo se dibuja |
|---|---|
| Una distribución (latencia, errores, pesos) | la campana, el eje x, la media marcada, la banda ±σ sombreada y las colas |
| Una función que crece o decrece | la curva con sus dos ejes y el punto que la parte discute |
| Un objeto que actúa o cambia de estado | `scene.icons` (robot, casa, documento, persona, moneda, engranaje) |
| Un valor que se compara con otro | `scene.bars`, con su etiqueta y su cifra |
| Una cuenta | `<lk-math>`, con sus renglones alineados |

Un recorrido de una distribución enseña **la misma curva cambiando**: primero la campana sola
con su eje, después la media marcada donde cae el pico, después la banda ±σ sombreada, después
las colas y lo que queda fuera de dos sigmas. Cada paso mueve una cosa de la curva y una flecha
con etiqueta dice cuál. Si el paso cambia el texto de una caja en vez de la curva, no es un paso
de este recorrido.

Dos reglas que la figura tiene que cumplir, y que `scene-lint` mide:

- **La banda se apoya en el eje.** La región ±σ es un `paths` cerrado: sigue la curva de μ−σ a
  μ+σ y baja por los dos lados hasta el eje (`L μ+σ eje L μ−σ eje Z`), con relleno claro y sin
  borde punteado. Un rectángulo punteado flotando sobre la curva no es la banda: no dice qué
  área mide el 68 %. Los dos bordes se marcan en el eje (`μ−σ`, `μ+σ`).
- **La punta cae sobre la pieza.** Una flecha que dice «aquí» termina sobre el trazo que nombra,
  no en el aire al lado. `scene-lint` mide la distancia de la punta a la tinta de cada trazo y
  llama `flecha-al-aire` a más de 12 unidades: una flecha que apunta «a la curva» sin tocarla
  deja al lector buscando qué señalaba.

Una caja con una palabra dentro nunca sustituye a la curva ni al icono: si lo que cambia es la
forma de la distribución, lo que cambia en la figura es la forma de la curva.
