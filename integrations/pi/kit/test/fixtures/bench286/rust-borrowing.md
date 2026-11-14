---
tipo: explicacion
nodo: 1.1
nivel: básico
---

# Parte 1 — Referencias inmutables y préstamo compartido

## Ruta

1. La variable original posee los datos en memoria.
2. Una referencia inmutable presta el dato para lectura.
3. El compilador admite varios lectores simultáneos.

## El 20% que rinde el 80%

Imagina un dron en vuelo. Mide 120 m de altitud, 45 km/h de velocidad y 88 % de batería.

**Variable dueña**
Es la que reserva memoria y guarda el dato. En nuestro ejemplo, `dron` guarda la telemetría.

Esa variable mantiene el control del valor.

**Referencia**
Es una dirección que apunta al dato. En nuestro ejemplo, `&dron` apunta a la telemetría.

El acceso no transfiere la propiedad.

**Préstamo inmutable**
Es un permiso temporal para leer. En nuestro ejemplo, el sensor lee 120 m de altitud.

Antes, pasar por valor movía el dato. Destruía el acceso original.

Después, una referencia presta el dato. La dueña sigue viva.

En cambio, la lectura compartida admite varios observadores. Todos leen la batería a la vez.

Sin embargo, ningún observador puede escribir.

**Fuente**: Libro *The Rust Programming Language* por Klabnik y Nichols (2023), capítulo cuatro sobre referencias y préstamos.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Prestar un valor: quién lee y quién escribe","viewBox":"0 50 380 210","steps":[
 {"title":"Lectura compartida","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &dron;","id":"a"},{"t":" let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &dron;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Dos referencias inmutables leen la altitud de 120 m sin duplicar el dato.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"dron","icon":"robot","x":50,"y":150,"size":56,"tone":"blue","tag":"dron"},{"id":"r1","icon":"robot","x":155,"y":150,"size":56,"tone":"green","tag":"r1: &dron"},{"id":"r2","icon":"robot","x":260,"y":150,"size":56,"tone":"green","tag":"r2: &dron"}],
   "props":[{"id":"ojo1","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"ojo2","kind":"read","on":"r2","side":"left","tone":"green"}],
   "arrows":[{"x1":155,"y1":130,"x2":85,"y2":145,"tone":"green","label":"lee"}],"marks":[{"kind":"ok","actors":["r1","r2"],"label":"compila"}]}}},
 {"title":"Intento de escritura","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"w","id":"w"},{"t":" = &mut dron;","id":"m"}]},"focus":["w"],
  "narrator":"Intentar modificar la altitud a 150 m con una referencia mutable requiere permiso exclusivo.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"dron","icon":"robot","x":70,"y":150,"size":56,"tone":"blue","tag":"dron"},{"id":"w","icon":"robot","x":230,"y":150,"size":56,"tone":"amber","tag":"w: &mut dron"}],
   "moves":[{"actor":"dron","toX":70,"toY":150}],
   "props":[{"id":"lapiz","kind":"write","on":"w","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["w"],"label":"exclusivo"}]}}},
 {"title":"Conflicto de permisos","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &dron; ","id":"a"},{"t":"let ","id":"let2"},{"t":"w","id":"w"},{"t":" = &mut dron;","id":"b"}]},"focus":["r1","w"],
  "narrator":"Mezclar lectura y escritura al mismo tiempo produce error en el borrow checker.",
  "stage":{"scene":{
   "paths":[],
   "labels":[{"x":170,"y":226,"text":"no compila","size":16,"tone":"red"}],
   "actors":[{"id":"dron","icon":"robot","x":50,"y":150,"size":56,"tone":"blue","tag":"dron"},{"id":"r1","icon":"robot","x":155,"y":150,"size":56,"tone":"green","tag":"r1: &dron"},{"id":"w","icon":"robot","x":255,"y":150,"size":56,"tone":"amber","state":"invalid","tag":"w: &mut dron"}],
   "props":[{"id":"ojo","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"lapiz2","kind":"write","on":"w","side":"left","tone":"amber"}],
   "marks":[{"kind":"no","actors":["w"],"label":"rechazado"}]}}}
]}
</script>
</lk-story>
Cómo leerlo: cada paso resalta el token de código en la cabecera.

<lk-cards>
<script type="application/json">
{"title":"Permisos de acceso al dron","cards":[
 {"id":"lectores","verdict":"ok","pill":"COMPILA","title":"Múltiples «&dron»","draw":{"refs":[{"text":"&dron","icon":"read","tone":"green"},{"text":"&dron","icon":"read","tone":"green"}],"target":{"text":"dron"}},"reason":"Ambos leen 120 m a la vez"},
 {"id":"exclusivo","verdict":"ok","pill":"COMPILA","title":"Un solo «&mut dron»","draw":{"refs":[{"text":"&mut dron","icon":"write","tone":"amber"}],"target":{"text":"dron"}},"reason":"Modifica altitud en exclusiva"},
 {"id":"conflicto","verdict":"no","pill":"NO COMPILA","title":"«&dron» y «&mut dron» a la vez","draw":{"refs":[{"text":"&dron","icon":"read","tone":"green"},{"text":"&mut dron","icon":"write","tone":"amber"}],"target":{"text":"dron"}},"reason":"Uno escribiría mientras otro lee"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los tres casos de acceso simultáneo al dato.

## Mini-quiz

<lk-quiz></lk-quiz>

### Pregunta 1
¿Por qué Rust admite varias referencias &dron a la vez?

### Pregunta 2
¿Qué ocurre con la propiedad de dron al usar &dron?

### Pregunta 3
¿Qué sucede al modificar un campo del dron mediante &dron?
