---
tipo: explicacion
nodo: contenedor-y-ejes-flex
nivel: básico
---

# Parte 1 — Contenedor flex y los dos ejes

## Ruta

1. La propiedad display activa el contexto flexible.
2. El eje principal marca el flujo de lectura.
3. El eje cruzado marca la dirección perpendicular.

## El 20% que rinde el 80%

Imagina una barra de navegación con tres botones.

Los botones son Inicio, Perfil y Ajustes.

**Contenedor**
Es la caja padre que activa flex. En nuestro ejemplo, la barra es el contenedor.

**Flex item**
Es cada hijo directo dentro del contenedor. En nuestro ejemplo, los tres botones son ítems.

**Eje principal**
Es la dirección elegida para ordenar. En nuestro ejemplo, el eje principal es horizontal.

**Eje cruzado**
Es la línea perpendicular al flujo principal. En nuestro ejemplo, el eje cruzado es vertical.

Antes, los bloques caían apilados hacia abajo.

En cambio, Flexbox los coloca en una fila.

Sin embargo, cambiar la dirección rota ambos ejes.

**Fuente**: Especificación W3C CSS Flexible Box Layout por W3C (2018), sección sobre ejes flex.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Contenedor y ejes: la geometría de Flexbox","viewBox":"0 60 360 190","steps":[
 {"title":"Activa el contenedor","equation":{"size":22,"atoms":[{"t":".barra { ","id":"b"},{"t":"display: flex;","id":"df"},{"t":" }","id":"cl"}]},"focus":["df"],
  "narrator":"La propiedad display flex activa el contexto en la barra.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"barra"},{"id":"b1","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"hijos"}],
   "props":[{"id":"p1","kind":"packet","on":"nav","side":"left","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["nav"],"label":"flex"}]}}},
 {"title":"Eje principal horizontal","equation":{"size":22,"atoms":[{"t":"flex-direction: ","id":"fd"},{"t":"row;","id":"rw"}]},"focus":["rw"],
  "narrator":"Los ítems fluyen en fila de izquierda a derecha.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"active","tag":"barra"},{"id":"b1","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"hijos"}],
   "moves":[{"actor":"nav","toX":80,"toY":150}],
   "props":[{"id":"p1","kind":"packet","on":"nav","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["nav"],"label":"fila"}]}}},
 {"title":"Eje cruzado ortogonal","equation":{"size":22,"atoms":[{"t":"eje cruzado: ","id":"ec"},{"t":"columna vertical","id":"cv"}]},"focus":["cv"],
  "narrator":"El eje cruzado queda perpendicular al eje principal.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"nav","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"waiting","tag":"barra"},{"id":"b1","icon":"robot","x":250,"y":150,"size":56,"tone":"green","state":"active","tag":"hijos"}],
   "marks":[{"kind":"ok","actors":["b1"],"label":"ortogonal"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Orientaciones de los ejes flex","cards":[
 {"id":"row","verdict":"ok","pill":"CORRECTO","title":"Dirección fila","draw":{"refs":[{"text":"row","icon":"read","tone":"green"}],"target":{"text":"horizontal"}},"reason":"Lee los elementos de izquierda a derecha"},
 {"id":"col","verdict":"ok","pill":"CORRECTO","title":"Dirección columna","draw":{"refs":[{"text":"column","icon":"read","tone":"blue"}],"target":{"text":"vertical"}},"reason":"Lee los elementos de arriba hacia abajo"},
 {"id":"error","verdict":"no","pill":"RECHAZADO","title":"Eje roto","draw":{"refs":[{"text":"display: block","icon":"write","tone":"amber"}],"target":{"text":"sin ejes"}},"reason":"Escribe un valor que anula flexbox"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan las dos orientaciones posibles de los ejes flex.

## Mini-quiz

1. ¿Qué ocurre con los elementos hijos directos al aplicar display: flex en el contenedor padre?
2. ¿Cuál es la orientación del eje principal cuando se declara flex-direction: row?
3. ¿Cómo se comporta el eje cruzado con respecto al eje principal en cualquier contenedor flexible?
