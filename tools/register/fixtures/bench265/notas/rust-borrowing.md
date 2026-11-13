---
tipo: explicacion
nodo: prestamos-referencias-inmutables
nivel: básico
---

# Parte 1 — Referencias y préstamos inmutables

## Ruta

1. Muchas lecturas a la vez: el compilador las acepta.
2. Una sola escritura: el compilador la acepta.
3. Leer y escribir a la vez: el compilador lo rechaza.

## El 20% que rinde el 80%

Imagina una variable s con un texto.

**Compilador**
Es el programa que revisa el código. En nuestro ejemplo, el compilador verifica s.

**Valor**
Es el dato que guarda una variable. En nuestro ejemplo, el valor es el texto.

**Borrow checker**
Es la parte del compilador que cuenta referencias. En nuestro ejemplo, el borrow checker vigila s.

**Referencia**
Es una dirección que apunta al dato. En nuestro ejemplo, r1 apunta a s.

**Préstamo**
Es el permiso temporal para leer. En nuestro ejemplo, r1 toma prestado el valor.

Antes, mover destruía el acceso original. Después, una referencia presta el dato.

Permite leerlo mientras la dueña sigue activa.

**Fuente**: Libro The Rust Programming Language por Klabnik y Nichols (2023), capítulo cuatro sobre referencias y préstamos.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Prestar un valor: quién lee y quién escribe","viewBox":"0 60 360 190","steps":[
 {"title":"Muchas lecturas","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s;","id":"a"},{"t":" let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Las referencias «&» son de *solo lectura*: puede haber todas las que quieras a la vez.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"green","tag":"r2: &s"}],
   "props":[{"id":"ojo1","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"ojo2","kind":"read","on":"r2","side":"left","tone":"green"}],
   "marks":[{"kind":"ok","actors":["r1","r2"],"label":"compila"}]}}},
 {"title":"Una escritura","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r","id":"r"},{"t":" = &mut s;","id":"a"}]},"focus":["r"],
  "narrator":"Una referencia «&mut» puede *escribir*, pero solo puede haber una.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"s","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r","icon":"robot","x":250,"y":150,"size":56,"tone":"amber","tag":"r: &mut s"}],
   "props":[{"id":"lapiz","kind":"write","on":"r","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["r"],"label":"compila"}]}}},
 {"title":"Las dos a la vez","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s; ","id":"a"},{"t":"let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &mut s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Mezclar «&» y «&mut» no compila: uno escribiría mientras el otro lee.",
  "stage":{"scene":{
   "paths":[],
   "labels":[{"x":180,"y":226,"text":"no compila","size":16,"tone":"red"}],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","state":"invalid","tag":"r2: &mut s"}],
   "props":[{"id":"ojo","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"lapiz","kind":"write","on":"r2","side":"left","tone":"amber"}],
   "marks":[{"kind":"no","actors":["r2"],"label":"falla"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Cuántas referencias a la vez","cards":[
 {"id":"muchas","verdict":"ok","pill":"COMPILA","title":"Muchas «&»","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"}],"target":{"text":"s"}},"reason":"Todos leen a la vez"},
 {"id":"una","verdict":"ok","pill":"COMPILA","title":"Una sola «&mut»","draw":{"refs":[{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Solo uno lee y escribe"},
 {"id":"mezcla","verdict":"no","pill":"NO COMPILA","title":"«&» y «&mut» a la vez","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Uno escribiría mientras otro lee"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los tres casos de acceso simultáneo al dato.

## Mini-quiz

1. ¿Por qué el compilador de Rust permite tener múltiples referencias inmutables `&s` al mismo tiempo?
2. ¿Qué ocurre con la propiedad (`ownership`) de `s` al pasarlo como `&s` a una función?
3. ¿Por qué no compila una referencia mutable `&mut s` si ya existe una referencia inmutable `&s` activa?
