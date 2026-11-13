---
tipo: explicacion
nodo: contenedor-y-ejes
nivel: básico
---

# Parte 1: Contenedor flex y los dos ejes (principal y cruzado)

**Fuente**: CSS Flexible Box Layout Module Level 1 (W3C Recommendation), sección 2 «Flex Layout Box Model and Terminology».

## Ruta

1. Declaramos display: flex en el contenedor para activar el contexto flexible.
2. Identificamos el eje principal y el eje cruzado perpendicular.
3. Modificamos la orientación del flujo mediante la propiedad flex-direction.

## El 20% que rinde el 80%

Flexbox establece un modelo unidimensional donde los elementos se ordenan sobre un eje.
Al declarar display: flex, los hijos directos se transforman inmediatamente en flex items.

En nuestro ejemplo, una barra de navegación contiene tres botones de menú.
El contenedor mide 600px de ancho y aloja los ítems Inicio, Cursos y Perfil.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","caption":"El contenedor flexible orienta el eje principal en horizontal y el cruzado en vertical.","scene":{
  "boxes":[
    {"x":60,"y":15,"w":280,"h":130,"label":"Contenedor .nav-bar (600px)","tone":"blue","size":18},
    {"x":420,"y":15,"w":280,"h":130,"label":"Ítems en fila (row)","tone":"green","size":18}
  ],
  "arrows":[
    {"x1":340,"y1":95,"x2":420,"y2":95,"label":"flujo","labelBeside":true}
  ]
}}
</script>
</lk-scene>

### **Pieza**
El eje principal es la dirección directriz sobre la cual se colocan los ítems flexibles.
En nuestro ejemplo: pieza = eje horizontal con `flex-direction: row`.
Podría ser también:
- Una barra lateral vertical configurada con `flex-direction: column`.
- Una fila de tarjetas de producto en un catálogo de comercio electrónico.
- Una botonera de reproducción multimedia con controles alineados.
- Un carrusel horizontal de imágenes con desplazamiento continuo.

## Cómo organiza el flujo el eje principal

La orientación del eje principal define el sentido en el que crecen los elementos.
El eje cruzado se sitúa siempre de manera estrictamente perpendicular al eje principal.

Observa cómo cambia la disposición de los tres botones al modificar la dirección.
Pasar de row a column rota el eje principal noventa grados hacia la vertical.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Orientación de los ejes en Flexbox","viewBox":"0 0 360 220","steps":[
 {"title":"Paso 1: Dirección por defecto (row)","equation":{"size":22,"atoms":[{"t":"display: flex;","id":"df"},{"t":" /* ","id":"c1"},{"t":"flex-direction: row","id":"fdr"},{"t":" */","id":"c2"}]},"focus":["df","fdr"],
  "narrator":"El contenedor activa el eje principal horizontal de izquierda a derecha.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"c1","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Contenedor"},
    {"id":"b1","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Eje X (row)"}
   ],
   "props":[{"id":"p1","kind":"value","on":"b1","side":"left","label":"Fila X","tone":"green"}]
  }}},
 {"title":"Paso 2: Disposición de los ítems en fila","equation":{"size":22,"atoms":[{"t":"[Inicio]","id":"i1"},{"t":" ---> ","id":"a1"},{"t":"[Cursos]","id":"i2"},{"t":" ---> ","id":"a2"},{"t":"[Perfil]","id":"i3"}]},"focus":["i1","i2","i3"],
  "narrator":"Los tres botones se alinean en horizontal siguiendo la dirección del eje principal.",
  "scene":{"arrows":[{"x1":270,"y1":140,"x2":70,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"c1","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Contenedor"},
    {"id":"b1","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"3 botones"}
   ],
   "props":[{"id":"p2","kind":"value","on":"b1","side":"left","label":"3 ítems","tone":"green"}],
   "marks":[{"kind":"ok","actors":["b1"]}]
  }}},
 {"title":"Paso 3: Rotación a columna (column)","equation":{"size":22,"atoms":[{"t":"flex-direction: column;","id":"fdc"},{"t":" ===> ","id":"arr"},{"t":"Eje Y activo","id":"ey"}]},"focus":["fdc","ey"],
  "narrator":"Al declarar column, el eje principal pasa a ser vertical y los ítems se apilan.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"c1","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Contenedor"},
    {"id":"b1","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Eje Y (column)"}
   ],
   "props":[{"id":"p3","kind":"value","on":"c1","side":"right","label":"Columna Y","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["c1"]}]
  }}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué ocurre con los elementos hijos directos al declarar 'display: flex' en el padre?
- **A**: Se convierten automáticamente en flex items alineados a lo largo del eje principal.
- **B**: Pasan a comportarse como elementos de bloque apilados verticalmente por defecto.
- **C**: Adquieren posicionamiento absoluto perdiendo su flujo normal en el documento.
- **D**: Se ocultan hasta que se defina explícitamente una anchura fija para cada uno.
- **E**: No sé

2. Si aplicamos 'flex-direction: column', ¿cuál es la orientación del eje principal?
- **A**: Vertical de arriba hacia abajo, convirtiendo la horizontal en el eje cruzado.
- **B**: Horizontal de izquierda a derecha sin alterar las propiedades de alineación.
- **C**: Diagonal descendente desde la esquina superior izquierda del contenedor.
- **D**: Inversa horizontal preservando la altura natural de los elementos hijos.
- **E**: No sé

3. ¿Cómo se define la relación geométrica entre el eje principal y el eje cruzado?
- **A**: Son siempre estrictamente perpendiculares entre sí dentro del contenedor flexible.
- **B**: Son paralelos y avanzan en el mismo sentido a través de la interfaz.
- **C**: Son independientes del valor asignado a la propiedad flex-direction.
- **D**: Coinciden únicamente cuando el contenedor tiene dimensiones cuadradas exactas.
- **E**: No sé

<lk-quiz>{"id":"p1"}</lk-quiz>
