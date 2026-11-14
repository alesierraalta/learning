---
tipo: explicacion
nodo: contenedor-y-ejes
nivel: básico
---

# Parte 1 — El contenedor y los dos ejes

## Ruta

1. Activamos el contenedor con display: flex.
2. Identificamos el eje principal y el transversal.
3. Cambiamos la orientación con flex-direction.

## El 20% que rinde el 80%

Imagina una barra de navegación web.

La barra contiene un logotipo, tres enlaces y un botón.

**Contenedor flex**
Es el elemento padre que activa la caja flexible. En nuestro ejemplo, la barra es el contenedor flex.

La barra mide ochocientos píxeles de ancho.

**Flex item**
Es cada hijo directo dentro del contenedor. En nuestro ejemplo, el logotipo es un flex item.

Antes de flex, los bloques se apilaban verticalmente hacia abajo.

**Eje principal**
Es la dirección donde se ordenan los elementos. En nuestro ejemplo, el eje principal avanza hacia la derecha.

En cambio, el eje transversal cruza de arriba hacia abajo.

**Eje transversal**
Es la dirección perpendicular al eje principal. En nuestro ejemplo, el eje transversal define la altura.

Después de activar flex, los elementos forman una fila horizontal.

Sin embargo, flex-direction permite rotar esa orientación hacia abajo.

**Fuente**: Especificación W3C CSS Flexible Box Layout Module Level 1, sección sobre contenedores y ejes.

<lk-cards>
<script type="application/json">
{"title":"Orientación de los elementos en el contenedor","cards":[
 {"id":"flex","verdict":"ok","pill":"FILA","title":"display: flex","draw":{"refs":[{"text":"fila","tone":"green"}],"target":{"text":"eje principal"}},"reason":"Alinea los elementos horizontalmente"},
 {"id":"col","verdict":"ok","pill":"COLUMNA","title":"flex-direction: column","draw":{"refs":[{"text":"columna","tone":"blue"}],"target":{"text":"eje vertical"}},"reason":"Gira el eje principal hacia abajo"},
 {"id":"block","verdict":"neutral","pill":"BLOQUE","title":"display: block","draw":{"refs":[{"text":"bloque","tone":"amber"}],"target":{"text":"apilado"}},"reason":"Apila los elementos sin caja flexible"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los efectos de activar flex frente al comportamiento de bloque.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Apertura del contenedor flex","viewBox":"0 60 360 190","steps":[
 {"title":"Bloques en columna","equation":{"size":22,"atoms":[{"t":"display: ","id":"p"},{"t":"block;","id":"v"}]},"focus":["v"],
  "narrator":"Antes de flex, cada elemento ocupa una fila propia hacia abajo.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"slate","tag":"nav"},{"id":"item","icon":"robot","x":250,"y":150,"size":56,"tone":"blue","tag":"item"}],
   "props":[{"id":"caja","kind":"packet","on":"nav","side":"left","label":"bloque","tone":"slate"}],
   "marks":[{"kind":"no","actors":["nav"],"label":"apilado"}]}}},
 {"title":"Activar flex","equation":{"size":22,"atoms":[{"t":"display: ","id":"p"},{"t":"flex;","id":"v"}]},"focus":["v"],
  "narrator":"Al declarar display: flex, los elementos forman una fila horizontal.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"active","tag":"nav"},{"id":"item","icon":"robot","x":250,"y":150,"size":56,"tone":"green","tag":"item"}],
   "moves":[{"actor":"nav","toX":80,"toY":150}],
   "props":[{"id":"caja","kind":"packet","on":"item","side":"right","label":"fila","tone":"green"}],
   "marks":[{"kind":"ok","actors":["item"],"label":"en fila"}]}}},
 {"title":"Giro de eje","equation":{"size":22,"atoms":[{"t":"flex-direction: ","id":"d"},{"t":"column;","id":"c"}]},"focus":["c"],
  "narrator":"Con flex-direction: column, el eje principal rota noventa grados.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"waiting","tag":"nav"},{"id":"item","icon":"robot","x":250,"y":150,"size":56,"tone":"amber","state":"active","tag":"item"}],
   "props":[{"id":"caja","kind":"packet","on":"item","side":"left","label":"columna","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["nav"],"label":"columna"}]}}}
]}
</script>
</lk-story>
Cómo leerlo: el paso 1 muestra los bloques apilados. El paso 2 activa flex en fila horizontal.

El paso 3 gira el eje principal a columna vertical.

## Mini-quiz

¿Qué cambio fundamental produce display: flex sobre los elementos hijos directos del contenedor?

Si aplicas flex-direction: column a un contenedor flex, ¿en qué dirección avanza el eje principal?

¿Cómo se define el eje transversal (cross axis) en cualquier contenedor flex?
