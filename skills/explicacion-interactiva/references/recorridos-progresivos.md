# Recorridos progresivos (figuras de material nuevo)

Toda parte nueva enseña su ejemplo **paso a paso**, con una idea por paso y una marca que lleva
la mirada. El contrato completo está en `visuales.md` §0–2c (traducción del contrato aprobado
`scratch/showcase/CONTRACT.md`, S15–S25). La forma la decide la idea, no el tema: funciona igual
para RL, PL/SQL, EXL3, administración de proyectos o inglés, con cualquier modelo.

## Cuándo y con qué elemento

- **Siempre** en la sección donde aparece el ejemplo, antes de pedirle a la persona que lo
  imagine. **Una vez por parte**: si otra sección cambia de estado, ese cambio es un paso del
  mismo recorrido, no un segundo recorrido.
- Si un **diagrama estándar** lo dice, se escribe `mermaid`: `flowchart`, `sequenceDiagram`,
  `stateDiagram-v2`, `gantt`, `classDiagram`, `erDiagram`, `mindmap`, `pie`, `quadrantChart`,
  `xychart-beta`, `sankey-beta`, `block-beta`. Ni `gitGraph` ni `journey` sin petición explícita.
- Si hace falta llevar de la mano:
  - un espacio con actores, celdas, carriles y cámara → `<lk-stage>`;
  - código con su ventana activa y el estado de sus variables → `<lk-codestep>`;
  - filas que se filtran, unen, derivan, agrupan u ordenan → `<lk-tablestep>`;
  - fórmula explicada símbolo a símbolo, ejercicio resuelto o números → `<lk-guided>`;
  - carriles que comparten un recurso en el tiempo, con esperas y mensajes → `<lk-lanes>`.
- Nada de `<lk-story>`, `<lk-walkthrough>`, `<lk-scene>`, SVG dibujado a mano ni claves nuevas en
  material nuevo. Esas figuras siguen renderizando en **partes ya publicadas** (S10): no se
  reescriben, pero no se estrenan.

## Receta

1. **Di primero si basta Mermaid.** Un CPM es un `flowchart`/`gantt` con la ruta crítica marcada;
   la fórmula del CPM, si se explica, es otro `<lk-guided>`.
2. **Un cambio por paso.** Presenta la escena y añade o mueve una sola cosa. Si el paso explica
   dos ideas, añade un paso. No hay tope de pasos para una fórmula.
3. **Elige la clave de foco del elemento y ponla en la spec**: `focusOn` con
   `actor:`/`tag:`/`lane:`/`fact:N` en `lk-stage`; `focus` en `lk-codestep`/`lk-tablestep`;
   `focus`/`focusList`/`wrong` en los bloques de `lk-guided`; `highlight[]` y `links[]` en
   `lk-lanes`. Azul = mira aquí, verde = correcto o conservado, rojo = error o eliminado; una
   marca por tramo contiguo, ≤ 2 por paso, sin anidar.
4. **Explica en la pie, no en una leyenda.** `narrator[]`/`caption`/`figcaption` dicen qué pasa
   con palabras llanas; nunca «Narrador:» ni «Azul: mira aquí».
5. **Sin mandos**: solo `←`, `→` y `▶` del reproductor, puntos de progreso y `N/M`. No hay
   deslizadores, campos, control de redondeo, recálculo en vivo ni hover como única vía de leer
   un dato. Una animación, una curva `cubic-bezier(.2,.8,.2,1)` y `prefers-reduced-motion`.
6. **Cero coordenadas**: celdas con nombre, ids, índices y tiempo abstracto. El renderer calcula
   prisms, etiquetas, flechas y cámara; una etiqueta nunca tapa un nombre ni se sale del marco.
7. **Ancho y papeles**: en pantallas anchas la figura ocupa el ancho disponible; revisa claro,
   oscuro y negro antes de entregar.
8. **Línea `Cómo leerlo:`** como primera línea no vacía tras la figura, mientras el motor siga
   contando los visuales con `countVisualsAndGuides` (`internal/engine/checks.go`) y exigiendo
   `howToReadLine` en `rules/deep.json`.
9. Escribe el recorrido al nivel normal del texto: nunca dentro de una cita (`> `) ni detrás de
   un bloque de código en una lista anidada; el motor no lo leería bien.

## Tablas y datos

- Una tabla con iconos y leyendas debajo no es un recorrido: la explicación ocurre fuera del
  dibujo. Si los datos son el ejemplo, usa `<lk-tablestep>`: cada paso es una operación (`filter`,
  `join`, `derive`, `select`, `group`, `sort`) con su foco derivado y su tira de filas vivas.
- Un mapa o rejilla no se dibuja a mano: `<lk-stage>` coloca los actores en celdas `A1`–`F5` y
  mueve la cámara con `activeActor`.

## Antes de entregar

1. Recorre la figura en el lector y pregunta: ¿alguien que solo vea los pasos sigue la idea?
   ¿Señala cada paso qué cambió? ¿Caben los números en su caja? ¿Llegan las flechas a su destino?
2. Repasa el checklist de `visuales.md` §2c: Mermaid primero, claves exactas del contrato, un
   `<script type="application/json">` por elemento, foco ≤ 2, sin mandos ni franjas de color,
   fórmula símbolo por símbolo, línea `Cómo leerlo:`.
3. **Engine legacy (T9)**: `progressiveProblems` (`internal/engine/decks.go`) y `demoElements`
   (`rules/deep.json`) todavía solo reconocen `<lk-walkthrough>`/`<lk-story>`, y
   `countVisualsAndGuides` no cuenta los elementos nuevos como visuales. Si el motor devuelve
   `needs a progressive walkthrough` o un error de conteo con una nota que sigue el contrato
   nuevo, reporta el gate a T9; no sustituyas la figura nueva por una antigua.
