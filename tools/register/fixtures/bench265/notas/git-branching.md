---
tipo: explicacion
nodo: punteros-y-commits
nivel: básico
---

# Parte 1 — Punteros a commits y la referencia HEAD

## Ruta

1. Un commit guarda una instantánea inmutable.
2. Una rama apunta al commit activo.
3. El puntero HEAD marca la rama elegida.

## El 20% que rinde el 80%

Imagina un repositorio con dos commits.

El primero es C1. El segundo es C2.

**Commit**
Es una instantánea inmutable. En nuestro ejemplo, C2 guarda datos.

**Rama**
Es un puntero móvil. En nuestro ejemplo, main apunta a C2.

**Puntero HEAD**
Es la referencia activa. En nuestro ejemplo, HEAD señala a main.

**Historial**
Es la cadena enlazada. En nuestro ejemplo, C2 apunta a C1.

Antes, otros sistemas copiaban carpetas enteras.

En cambio, Git escribe un archivo ligero.

Guarda un texto muy corto.

Sin embargo, mover la rama no altera el commit.

**Fuente**: Libro Pro Git por Chacon y Straub (2014), capítulo tres sobre ramas en Git.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Ramas y punteros: la cadena de commits y HEAD","viewBox":"0 60 360 190","steps":[
 {"title":"Commit inicial y rama","equation":{"size":22,"atoms":[{"t":"main -> ","id":"m"},{"t":"C1 (a1b2c)","id":"c"}]},"focus":["c"],
  "narrator":"La rama main apunta al commit inicial del proyecto.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"c1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"C1"},{"id":"main","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"main"}],
   "props":[{"id":"p1","kind":"packet","on":"c1","side":"left","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["c1"],"label":"commit"}]}}},
 {"title":"Nuevo commit y avance","equation":{"size":22,"atoms":[{"t":"git commit: ","id":"gc"},{"t":"C2 (d3e4f)","id":"c2"}]},"focus":["c2"],
  "narrator":"El nuevo commit C2 enlaza a su padre C1 y main avanza.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"c1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"active","tag":"C1"},{"id":"main","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"main"}],
   "moves":[{"actor":"c1","toX":80,"toY":150}],
   "props":[{"id":"p1","kind":"packet","on":"c1","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["c1"],"label":"avanzado"}]}}},
 {"title":"El puntero HEAD","equation":{"size":22,"atoms":[{"t":"HEAD -> ","id":"hd"},{"t":"refs/heads/main","id":"rf"}]},"focus":["rf"],
  "narrator":"HEAD apunta a la rama main para marcar el contexto de trabajo.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"c1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"waiting","tag":"C1"},{"id":"main","icon":"robot","x":250,"y":150,"size":56,"tone":"green","state":"active","tag":"main"}],
   "marks":[{"kind":"ok","actors":["main"],"label":"activo"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Elementos de referencia en el repositorio","cards":[
 {"id":"rama","verdict":"ok","pill":"CORRECTO","title":"Puntero de rama","draw":{"refs":[{"text":"41 B","icon":"read","tone":"green"}],"target":{"text":"hash"}},"reason":"Lee el commit de la punta"},
 {"id":"head","verdict":"ok","pill":"CORRECTO","title":"Referencia HEAD","draw":{"refs":[{"text":"main","icon":"read","tone":"blue"}],"target":{"text":"rama"}},"reason":"Lee la rama de trabajo activa"},
 {"id":"error","verdict":"no","pill":"RECHAZADO","title":"Commit huérfano","draw":{"refs":[{"text":"sin rama","icon":"write","tone":"amber"}],"target":{"text":"perdido"}},"reason":"Escribe cambios sin referencia activa"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los tres elementos de referencia en el repositorio.

## Mini-quiz

1. ¿Qué información almacena exactamente el archivo de una rama dentro de .git/refs/heads/?
2. ¿Hacia dónde apunta normalmente la referencia especial HEAD en un repositorio de Git?
3. ¿Qué ocurre con el puntero de la rama activa al registrar un nuevo commit en el historial?
