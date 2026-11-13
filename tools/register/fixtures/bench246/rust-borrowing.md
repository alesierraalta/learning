---
tipo: explicacion
nodo: prestamos-inmutables
nivel: básico
---

# Parte 1: Referencias inmutables y préstamos de solo lectura

**Fuente**: The Rust Programming Language, capítulo 4.2 «References and Borrowing».

## Ruta

1. Presentamos la variable dueña `libro` almacenada en memoria.
2. Creamos referencias inmutables `&libro` para lectura compartida.
3. Comprobamos cómo el compilador garantiza acceso concurrente sin mover ownership.

## El 20% que rinde el 80%

Un préstamo inmutable permite acceder a un dato sin transferir su propiedad.
El operador `&` crea una vista de solo lectura hacia el valor original.

En nuestro ejemplo, la variable `libro` contiene el texto `"Rust"`.
La memoria asigna los metadatos en el stack y los caracteres en el heap.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","caption":"La variable libro en el stack apunta al búfer con los bytes en el heap.","scene":{
  "boxes":[
    {"x":60,"y":15,"w":280,"h":130,"label":"libro: String (stack)","tone":"blue","size":18},
    {"x":420,"y":15,"w":280,"h":130,"label":"\"Rust\" (heap: 4 bytes)","tone":"green","size":18}
  ],
  "arrows":[
    {"x1":340,"y1":80,"x2":420,"y2":80,"label":"puntero","labelBeside":true}
  ]
}}
</script>
</lk-scene>

### **Pieza**
Una referencia inmutable es un puntero seguro que solo permite operaciones de lectura.
En nuestro ejemplo: pieza = `&libro`.
Podría ser también:
- `&cuenta` para consultar el saldo bancario sin alterarlo.
- `&sensor` para leer la temperatura actual en un ciclo de control.
- `&documento` para calcular la cantidad de palabras de un informe.
- `&configuracion` para inspeccionar el puerto del servidor durante el arranque.

## Cómo conviven las referencias en memoria

Múltiples referencias inmutables pueden coexistir en el mismo alcance.
Como ninguna referencia puede escribir, no existe riesgo de corrupción ni de carreras de datos.

Observa cómo `ref1` y `ref2` leen simultáneamente los caracteres de `libro`.
Ambas referencias apuntan a la misma dirección del heap sin duplicar el texto.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Préstamos inmutables en memoria","viewBox":"0 60 360 190","steps":[
 {"title":"Variable dueña","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"libro","id":"libro"},{"t":" = ","id":"eq"},{"t":"String::from(\"Rust\");","id":"val"}]},"focus":["libro","val"],
  "narrator":"La variable «libro» es la dueña del texto en el heap.",
  "scene":{"arrows":[{"x1":80,"y1":140,"x2":220,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"libro","icon":"robot","x":80,"y":140,"size":56,"tone":"blue","tag":"libro"},
    {"id":"texto","x":220,"y":140,"w":90,"h":44,"label":"\"Rust\"","tone":"green","tag":"heap"}
   ],
   "props":[{"id":"val","kind":"value","on":"libro","side":"right","label":"\"Rust\"","tone":"green"}]
  }}},
 {"title":"Primer préstamo","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"ref1","id":"ref1"},{"t":" = ","id":"eq"},{"t":"&libro;","id":"borrow"}]},"focus":["ref1","borrow"],
  "narrator":"«ref1» toma prestado a «libro»: solo lee, no mueve ownership.",
  "scene":{"arrows":[{"x1":80,"y1":140,"x2":220,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"libro","icon":"robot","x":80,"y":140,"size":56,"tone":"blue","tag":"libro"},
    {"id":"ref1","icon":"robot","x":220,"y":140,"size":56,"tone":"green","tag":"ref1: &libro"}
   ],
   "props":[{"id":"ojo1","kind":"read","on":"ref1","side":"left","tone":"green"}],
   "marks":[{"kind":"ok","actors":["ref1"]}]
  }}},
 {"title":"Segundo préstamo","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"ref2","id":"ref2"},{"t":" = ","id":"eq"},{"t":"&libro;","id":"borrow"}]},"focus":["ref2","borrow"],
  "narrator":"«ref2» se une a la lectura: ambas referencias coexisten sin conflicto.",
  "scene":{"arrows":[{"x1":60,"y1":140,"x2":170,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"libro","icon":"robot","x":60,"y":140,"size":56,"tone":"blue","tag":"libro"},
    {"id":"ref1","icon":"robot","x":170,"y":140,"size":56,"tone":"green","tag":"ref1: &libro"},
    {"id":"ref2","icon":"robot","x":280,"y":140,"size":56,"tone":"green","tag":"ref2: &libro"}
   ],
   "props":[{"id":"ojo1","kind":"read","on":"ref1","side":"left","tone":"green"},{"id":"ojo2","kind":"read","on":"ref2","side":"left","tone":"green"}],
   "marks":[{"kind":"ok","actors":["ref2"]}]
  }}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué ocurre con la propiedad de libro al crear let ref1 = &libro;?
- **A**: Permanece en libro mientras ref1 obtiene acceso de solo lectura.
- **B**: Se transfiere inmediatamente a ref1.
- **C**: Se destruye la variable original.
- **D**: Se clona toda la memoria del heap.
- **E**: No sé

2. ¿Cuántas referencias inmutables activas pueden apuntar al mismo valor simultáneamente?
- **A**: Tantas como sean necesarias sin límite superior.
- **B**: Solo una por alcance de bloque.
- **C**: Como máximo dos referencias concurrentes.
- **D**: Ninguna si la variable no se marca como mutable.
- **E**: No sé

3. ¿Qué operación rechaza el compilador sobre una referencia &libro?
- **A**: Cualquier intento de mutar o reasignar los datos subyacentes.
- **B**: Pasar la referencia como argumento a otra función.
- **C**: Leer los caracteres de la cadena mediante un iterador.
- **D**: Imprimir el contenido mediante la macro println!.
- **E**: No sé

<lk-quiz>{"id":"p1"}</lk-quiz>
