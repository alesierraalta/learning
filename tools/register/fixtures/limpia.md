# Parte 1 — Estado y acción

## Ruta

1. Qué es el estado.
2. Qué es la acción.
3. Cómo se combinan.

## 1. El estado

Imagina un robot aspirador en la sala. Su batería está al 70 %.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 130","caption":"El estado entra y la acción sale.","scene":{"boxes":[{"x":88,"y":16,"w":212,"h":100,"label":"el estado","tone":"blue","size":22}],"icons":[{"kind":"gear","x":352,"y":66,"size":72,"tone":"slate"}]}}
</script>
</lk-scene>

**Estado**: es todo lo que hace falta saber para decidir. En nuestro ejemplo, el estado es «sala sucia, batería 70 %».

Antes, el robot sabía poco. Ahora sabe que la sala está sucia.

## 2. La acción

**Acción**: es lo que el robot puede hacer. En nuestro ejemplo, aspirar o ir al cargador.

Antes de aspirar, la batería está al 70 %. Después de aspirar, baja al 68 %.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"},{"id":"h","kind":"file","x":260,"y":80,"size":56,"tone":"amber","tag":"archivo"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"},{"id":"h","kind":"file","x":260,"y":80,"size":56,"tone":"amber","tag":"archivo"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"},{"id":"h","kind":"file","x":260,"y":80,"size":56,"tone":"amber","tag":"archivo"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>
Cómo leerlo: avanza y mira la casilla que cambia.

<lk-quiz>{"id":"q1"}</lk-quiz>
