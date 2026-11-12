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
`scene.icons`. Una caja con una palabra dentro no es ninguna de las dos cosas: dice el nombre
de lo que debería estar dibujado. «Evolución de la curva gaussiana de latencia» con una caja y
una flecha por paso no muestra ninguna curva — no hay campana, no hay eje, no hay banda ±σ, y
quien lee no puede ver lo único que la parte venía a explicar.

## 2. Qué componente

| Lo que quieres mostrar | Componente |
|---|---|
| Una figura que se mira (actores, flujo, contraste, tabla de decisión) | `<lk-scene>` |
| Lo mismo, pero el lector tiene que recorrerlo paso a paso | `<lk-walkthrough>` |
| Una fórmula que se explica, símbolo por símbolo | escena de **fórmula anotada** (§8) |
| Una distribución o una función | su **curva**, con ejes y la región marcada (§9) |
| Una cuenta | `<lk-math>` (KaTeX), nunca un bloque de código |
| Datos que se comparan celda a celda | tabla Markdown |
| Un matiz, una advertencia, un límite | `<lk-callout>` |
| Un objeto que se mueve o cambia de estado (robot, casa, documento, persona) | `scene.icons` |
| Código que el lector podría ejecutar | bloque de código con su lenguaje |

`lk-diagram` existe todavía para diagramas de arquitectura viejos. No se usa en material
nuevo.

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
| `steps[].stage.scene.actors` | los términos dibujados: `id`, `x`, `y`, `w`, `h`, `label`, `tone`, `state` (`faded` = ya no vale), `tag` (el rótulo con punta) |
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
