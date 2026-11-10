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

## 2. Qué componente

| Lo que quieres mostrar | Componente |
|---|---|
| Una figura que se mira (actores, flujo, contraste, tabla de decisión) | `<lk-scene>` |
| Lo mismo, pero el lector tiene que recorrerlo paso a paso | `<lk-walkthrough>` |
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
`scene.dashed`, `scene.grids`, `scene.nodes`, `scene.sheets`, `scene.gears`, `scene.icons`.

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
