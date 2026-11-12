# Resolver x + 2 = 3, paso a paso

## Ruta

1. La ecuación tal como está.
2. El 2 que pasa al otro lado.
3. La cuenta y la respuesta.

Un ejercicio se resuelve mostrando la ecuación en cada paso.

El término que cambia de lado viaja con una flecha que dice qué hace.

El último paso enmarca la respuesta.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Resolver x + 2 = 3","viewBox":"0 0 360 250","steps":[
 {"title":"La ecuación","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" + ","id":"plus"},{"t":"2","id":"two"},{"t":" = ","id":"eq"},{"t":"3","id":"three"}]},"focus":["two"],
  "narrator":"Tengo «x + 2 = 3». Quiero dejar la «x» sola.",
  "stage":{"scene":{"actors":[
    {"id":"x","x":44,"y":150,"w":44,"h":40,"label":"x","tone":"blue","tag":"incógnita"},
    {"id":"plus","x":114,"y":150,"w":30,"h":40,"label":"+","tone":"slate"},
    {"id":"two","x":164,"y":150,"w":44,"h":40,"label":"2","tone":"amber","tag":"el 2"},
    {"id":"eq","x":234,"y":150,"w":30,"h":40,"label":"=","tone":"slate"},
    {"id":"three","x":284,"y":150,"w":44,"h":40,"label":"3","tone":"green","tag":"resultado"}]}}},
 {"title":"El 2 pasa al otro lado","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"3","id":"three"},{"t":" − ","id":"minus"},{"t":"2","id":"two"}]},"focus":["minus","two"],
  "narrator":"El «2» estaba sumando. Al cruzar, *pasa restando*: ahora es «3 − 2».",
  "stage":{"scene":{"actors":[
    {"id":"two-old","x":164,"y":60,"w":44,"h":40,"label":"2","tone":"slate","state":"faded","tag":"estaba sumando"},
    {"id":"x","x":44,"y":160,"w":44,"h":40,"label":"x","tone":"blue","tag":"incógnita"},
    {"id":"eq","x":114,"y":160,"w":30,"h":40,"label":"=","tone":"slate"},
    {"id":"three","x":164,"y":160,"w":44,"h":40,"label":"3","tone":"green"},
    {"id":"minus","x":214,"y":160,"w":30,"h":40,"label":"−","tone":"amber"},
    {"id":"two","x":254,"y":160,"w":44,"h":40,"label":"2","tone":"amber"}],
   "moves":[{"from":"two-old","to":"two","verb":"pasa restando","tone":"amber"}]}}},
 {"title":"La cuenta","equation":{"size":22,"atoms":[{"t":"x","id":"x"},{"t":" = ","id":"eq"},{"t":"1","id":"one"}]},"focus":["one"],
  "narrator":"«3 − 2 = 1». Entonces «x = 1»: la respuesta queda enmarcada.",
  "stage":{"scene":{"actors":[
    {"id":"three-old","x":100,"y":40,"w":44,"h":40,"label":"3","tone":"slate","state":"faded"},
    {"id":"minus-old","x":150,"y":40,"w":30,"h":40,"label":"−","tone":"slate","state":"faded"},
    {"id":"two-old","x":190,"y":40,"w":44,"h":40,"label":"2","tone":"slate","state":"faded"},
    {"id":"x","x":40,"y":170,"w":44,"h":40,"label":"x","tone":"blue","tag":"incógnita"},
    {"id":"eq","x":110,"y":170,"w":30,"h":40,"label":"=","tone":"slate"},
    {"id":"one","x":160,"y":170,"w":44,"h":40,"label":"1","tone":"green"}],
   "marks":[{"kind":"combine","actors":["three-old","minus-old","two-old"],"to":"one","label":"3 − 2 = 1"},{"kind":"ok","actor":"one"}]}}}
]}
</script>
</lk-story>
Cómo leerlo: el paso 1 muestra la ecuación entera.

El paso 2 dibuja el «2» donde estaba, en gris, y donde queda, en ámbar. La flecha dice que pasa restando.

El paso 3 marca los términos que se combinan y enmarca la respuesta.

La misma cuenta, escrita para el lector que la quiere en una línea:

<lk-math display>x + 2 = 3 \;\Longrightarrow\; x = 3 - 2 \;\Longrightarrow\; x = 1</lk-math>

## Mini-quiz

1. ¿Qué le pasa al 2 cuando cruza la ecuación?
