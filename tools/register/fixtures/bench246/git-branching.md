---
tipo: explicacion
nodo: punteros-head
nivel: básico
---

# Parte 1: Punteros a commits y la referencia HEAD

**Fuente**: Pro Git (Chacon & Straub), capítulo 3.1 «Git Branching - Branches in a Nutshell».

## Ruta

1. Representamos el historial de commits encadenados hacia sus ancestros.
2. Definimos una rama como un puntero móvil hacia un commit concreto.
3. Analizamos cómo HEAD apunta a la rama activa y avanza con cada confirmación.

## El 20% que rinde el 80%

Una rama en Git no es una copia de archivos sino un puntero liviano de 41 bytes.
El archivo de la rama contiene solo el identificador hash del commit más reciente.

En nuestro ejemplo, el proyecto `tienda-app` registra dos confirmaciones consecutivas.
El commit inicial `c1` precede al commit `c2`, y la rama `main` apunta a `c2`.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","caption":"La rama main apunta al commit c2 mientras HEAD referencia a la rama activa.","scene":{
  "boxes":[
    {"x":60,"y":15,"w":280,"h":130,"label":"HEAD (ref: refs/heads/main)","tone":"blue","size":18},
    {"x":420,"y":15,"w":280,"h":130,"label":"Rama main -> Commit c2","tone":"green","size":18}
  ],
  "arrows":[
    {"x1":340,"y1":95,"x2":420,"y2":95,"label":"apunta","labelBeside":true}
  ]
}}
</script>
</lk-scene>

### **Pieza**
Un puntero de rama asocia un nombre legible con un commit específico del repositorio.
En nuestro ejemplo: pieza = puntero `refs/heads/main` con el hash de `c2`.
Podría ser también:
- El puntero `main` en un repositorio de documentación técnica.
- La rama `produccion` en un servicio de despliegue continuo.
- La referencia `master` en un proyecto heredado de código abierto.
- Una rama temporal `pruebas` para validar cambios locales.

## Cómo sigue HEAD a la rama activa

El puntero especial HEAD indica sobre qué línea de desarrollo trabajamos actualmente.
Cuando registramos un commit, la rama activa avanza automáticamente hacia el nuevo nodo.

Observa cómo evoluciona la estructura de punteros al añadir un commit.
La rama `main` avanza al nuevo commit `c3` y HEAD continúa señalando a `main`.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Avance de punteros de rama y HEAD","viewBox":"0 0 360 220","steps":[
 {"title":"Paso 1: Estado inicial en c2","equation":{"size":22,"atoms":[{"t":"HEAD","id":"h"},{"t":" ---> ","id":"arr1"},{"t":"main","id":"m"},{"t":" ---> ","id":"arr2"},{"t":"Commit c2","id":"c2"}]},"focus":["h","m"],
  "narrator":"El puntero HEAD señala a la rama main, que a su vez referencia al commit c2.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"head","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"HEAD"},
    {"id":"main","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"main: c2"}
   ],
   "props":[{"id":"p1","kind":"value","on":"main","side":"left","label":"ref: c2","tone":"green"}]
  }}},
 {"title":"Paso 2: Registro del nuevo commit c3","equation":{"size":22,"atoms":[{"t":"git commit -m \"agrega pagos\"","id":"cmd"},{"t":" ===> ","id":"eq"},{"t":"Nuevo commit c3","id":"c3"}]},"focus":["cmd","c3"],
  "narrator":"Git crea el commit c3 enlazando su ancestro hacia el commit previo c2.",
  "scene":{"arrows":[{"x1":270,"y1":140,"x2":70,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"head","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"HEAD"},
    {"id":"main","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"main: c2"}
   ],
   "props":[{"id":"p2","kind":"value","on":"main","side":"left","label":"c3 <- c2","tone":"green"}],
   "marks":[{"kind":"ok","actors":["main"]}]
  }}},
 {"title":"Paso 3: Avance automático de la rama","equation":{"size":22,"atoms":[{"t":"HEAD","id":"h2"},{"t":" ---> ","id":"arr3"},{"t":"main","id":"m2"},{"t":" ---> ","id":"arr4"},{"t":"Commit c3","id":"c3_final"}]},"focus":["m2","c3_final"],
  "narrator":"El puntero main se actualiza hacia c3 mientras HEAD permanece vinculado a main.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"head","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"HEAD"},
    {"id":"main","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"main: c3"}
   ],
   "props":[{"id":"p3","kind":"value","on":"head","side":"right","label":"main -> c3","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["head"]}]
  }}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué contiene internamente el archivo de una rama en el directorio .git/refs/heads/?
- **A**: El hash SHA-1 o SHA-256 de 40 caracteres del commit al que apunta.
- **B**: El contenido comprimido de todos los archivos del árbol de trabajo.
- **C**: Una lista con el historial completo de mensajes de commit del proyecto.
- **D**: Un puntero simbólico que referencia obligatoriamente al archivo HEAD.
- **E**: No sé

2. ¿A qué apunta normalmente el puntero especial HEAD en condiciones habituales de trabajo?
- **A**: A la referencia de la rama local activa en la que estamos trabajando.
- **B**: Directamente al commit inicial de creación del repositorio.
- **C**: Al índice o área de preparación para registrar los cambios pendientes.
- **D**: Al repositorio remoto configurado como origen principal.
- **E**: No sé

3. ¿Qué sucede con el puntero de la rama activa cuando creamos un nuevo commit?
- **A**: Avanza automáticamente para apuntar al nuevo commit recién creado.
- **B**: Permanece inmóvil en el commit anterior hasta que ejecutamos un merge.
- **C**: Se duplica para mantener una copia del estado previo del árbol.
- **D**: Se desvincula de HEAD dejando al repositorio en estado detached.
- **E**: No sé

<lk-quiz>{"id":"p1"}</lk-quiz>
