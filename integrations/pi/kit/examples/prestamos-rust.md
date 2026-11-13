# Prestar un valor en Rust: cuántas referencias a la vez

## Ruta

1. Muchas lecturas a la vez: el compilador las acepta.
2. Una sola escritura: el compilador la acepta.
3. Leer y escribir a la vez: el compilador lo rechaza.

Imagina un libro con varios lectores a la vez.

**Compilador**
Es el programa que revisa el código antes de ejecutarlo.

**Valor**
Es el dato que guarda una variable.

**Borrow checker**
Es la parte del compilador que cuenta quién lee y quién escribe.

Antes, cualquiera podía tocar el dato. Después, una referencia lo presta: lo mira sin darlo.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Prestar un valor: quién lee y quién escribe","viewBox":"0 60 360 190","steps":[
 {"title":"Muchas lecturas","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s;","id":"a"},{"t":" let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Las referencias «&» son de *solo lectura*: puede haber todas las que quieras a la vez.",
  "stage":{"scene":{
   "paths":[{"d":"M 30 204 L 330 204","tone":"slate","width":2,"arrow":false}],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"green","tag":"r2: &s"}],
   "props":[{"id":"ojo1","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"ojo2","kind":"read","on":"r2","side":"left","tone":"green"}],
   "marks":[{"kind":"ok","actors":["r1","r2"],"label":"compila"}]}}},
 {"title":"Una escritura","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r","id":"r"},{"t":" = &mut s;","id":"a"}]},"focus":["r"],
  "narrator":"Una referencia «&mut» puede *escribir*, pero solo puede haber una.",
  "stage":{"scene":{
   "paths":[{"d":"M 30 204 L 330 204","tone":"slate","width":2,"arrow":false}],
   "actors":[{"id":"s","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r","icon":"robot","x":250,"y":150,"size":56,"tone":"amber","tag":"r: &mut s"}],
   "props":[{"id":"lapiz","kind":"write","on":"r","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["r"]}]}}},
 {"title":"Las dos a la vez","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s; ","id":"a"},{"t":"let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &mut s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Mezclar «&» y «&mut» no compila: uno escribiría mientras el otro lee.",
  "stage":{"scene":{
   "paths":[{"d":"M 30 204 L 330 204","tone":"slate","width":2,"arrow":false}],
   "labels":[{"x":180,"y":226,"text":"no compila","size":16,"tone":"red"}],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","state":"invalid","tag":"r2: &mut s"}],
   "props":[{"id":"ojo","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"lapiz","kind":"write","on":"r2","side":"left","tone":"amber"}],
   "marks":[{"kind":"no","actors":["r2"]}]}}}
]}
</script>
</lk-story>
Las tres reglas, una junto a la otra.

<lk-cards>
<script type="application/json">
{"title":"Cuántas referencias a la vez","cards":[
 {"id":"muchas","verdict":"ok","pill":"COMPILA","title":"Muchas «&»","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"}],"target":{"text":"s"}},"reason":"Todos leen a la vez"},
 {"id":"una","verdict":"ok","pill":"COMPILA","title":"Una sola «&mut»","draw":{"refs":[{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Solo uno lee y escribe"},
 {"id":"mezcla","verdict":"no","pill":"NO COMPILA","title":"«&» y «&mut» a la vez","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Uno escribiría mientras otro lee"}
]}
</script>
</lk-cards>

## Mini-quiz

1. ¿Por qué no compila una «&» junto con una «&mut» sobre el mismo valor?
