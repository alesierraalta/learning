# Mover un valor en Rust: quién es la dueña

## Ruta

1. Un valor tiene una sola dueña.
2. Mover cambia de dueña, no copia.
3. La dueña vieja deja de valer.
4. Al acabar el ámbito, el valor se libera.

Imagina que s1 guarda un texto.

**Valor**
Es el dato que una variable guarda.

**Ámbito**
Es la zona de código donde una variable existe: entre sus llaves.

Antes, s1 era la dueña. Después de mover, s2 es la dueña.

S1 deja de valer.

Una idea con estado se cuenta con actores. Cada variable es un robot con su nombre.

El valor viaja en un cofre.

El robot que ya no vale se apaga. El que usa algo inválido se tacha.

<lk-story>
<script type="application/json">
{"kind":"derivation","frame":"scope","title":"Mover un valor: la dueña cambia","viewBox":"0 60 360 190","steps":[
 {"title":"Una dueña","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"s1","id":"s1"},{"t":" = ","id":"eq"},{"t":"String::from(","id":"from"},{"t":"\"hola\"","id":"value"},{"t":");","id":"end"}]},"focus":["s1","value"],
  "narrator":"«s1» es la *dueña* del texto «\"hola\"». Un valor tiene una sola dueña.",
  "stage":{"scene":{
   "paths":[{"d":"M 44 204 L 316 204","tone":"slate","width":2,"arrow":false}],
   "labels":[{"x":26,"y":176,"text":"{","size":34},{"x":334,"y":176,"text":"}","size":34}],
   "actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s1"}],
   "props":[{"id":"valor","kind":"value","on":"s1","side":"right","label":"\"hola\"","tone":"green"}]}}},
 {"title":"Mover","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"s2","id":"s2"},{"t":" = ","id":"eq"},{"t":"s1","id":"s1"},{"t":";","id":"end"}]},"focus":["s2","s1"],
  "narrator":"«let s2 = s1;» *mueve* el valor: el texto no se copia, cambia de manos. Ahora la dueña es «s2».",
  "stage":{"scene":{
   "paths":[{"d":"M 44 204 L 316 204","tone":"slate","width":2,"arrow":false}],
   "labels":[{"x":26,"y":176,"text":"{","size":34},{"x":334,"y":176,"text":"}","size":34}],
   "actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s1"},{"id":"s2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","tag":"s2"}],
   "props":[{"id":"valor","kind":"value","on":"s1","side":"right","label":"\"hola\"","tone":"green"}],
   "moves":[{"from":"valor","to":"s2","verb":"se mueve","tone":"amber"}]}}},
 {"title":"La vieja deja de valer","equation":{"size":22,"atoms":[{"t":"println!(\"{","id":"open"},{"t":"s1","id":"s1"},{"t":"}\");","id":"close"},{"t":" // error","id":"error"}]},"focus":["s1","error"],
  "narrator":"«s1» ya no es válida: leerla es un *error de compilación*.",
  "stage":{"scene":{
   "paths":[{"d":"M 44 204 L 316 204","tone":"slate","width":2,"arrow":false}],
   "labels":[{"x":26,"y":176,"text":"{","size":34},{"x":334,"y":176,"text":"}","size":34},{"x":180,"y":232,"text":"no compila","size":16,"tone":"red"}],
   "actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"invalid","tag":"s1"},{"id":"s2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","tag":"s2"}],
   "props":[{"id":"leer","kind":"read","on":"s1","side":"right","tone":"blue"},{"id":"valor","kind":"value","on":"s2","side":"left","label":"\"hola\"","tone":"green"}],
   "marks":[{"kind":"no","actors":["s1","leer"],"label":"no compila"}]}}},
 {"title":"Se libera","equation":{"size":22,"atoms":[{"t":"}","id":"brace"},{"t":" // fin del ámbito","id":"scope"}]},"focus":["brace"],
  "narrator":"Cuando la dueña sale de su ámbito, Rust *libera* el valor una sola vez.",
  "stage":{"scene":{
   "paths":[{"d":"M 44 204 L 316 204","tone":"slate","width":2,"arrow":false}],
   "labels":[{"x":26,"y":176,"text":"{","size":34},{"x":334,"y":176,"text":"}","size":34}],
   "actors":[{"id":"s1","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"invalid","tag":"s1"},{"id":"s2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","state":"faded","tag":"s2"}],
   "props":[{"id":"valor","kind":"value","on":"s2","side":"left","label":"liberado","tone":"green","state":"freed"}],
   "marks":[{"kind":"ok","actor":"valor"}]}}}
]}
</script>
</lk-story>
Cómo leerlo: el paso 1 muestra a la dueña con su valor.

El paso 2 mueve el cofre de «s1» a «s2». La flecha dice «se mueve».

El paso 3 apaga y tacha a «s1». El ojo que intenta leerla termina en un ✗.

El paso 4 apaga a «s2» al cerrar la llave. Deja a «s1» tachada.

El cofre se deshace en trazos. Su ✓ aprueba que el valor se libera una sola vez.

## Mini-quiz

Las preguntas de esta parte viven en su `mini-quiz/<parte>.json`: el lector las dibuja como el lk-quiz interactivo.
