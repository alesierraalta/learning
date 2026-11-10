# Recorridos progresivos (`<lk-walkthrough>`)

Cada parte enseña su ejemplo con un recorrido a pasos, como el tutorial del estudio: **se dibuja la cosa misma** (el robot, el almacén, la red, la consulta) y **una flecha dice dónde mirar** en cada paso. La persona lo pidió así: «Quiero algo que me muestre visualmente, que me muestre la flecha, dónde tengo que ver». El motor lo exige en toda parte nueva (`explanation-content`) y, en los temas nuevos, la revisión `walkthrough-progression` juzga si los pasos enseñan.

## Cuándo

- **Siempre** en la sección donde aparece el ejemplo que acompaña la parte, antes de pedirle a la persona que lo imagine.
- Además, en cada sección donde algo **cambia de estado** (un movimiento, una cuenta que se propaga, una decisión, un antes/después).
- Una app aparte (`explicaciones/apps/`) o un `lk-widget` no sustituyen al recorrido.

## Receta (primera versión correcta)

1. **Elige la escena**: los objetos del ejemplo como figuras. Rejilla o mapa → una caja por casilla; agente → la casilla o un nodo que lo lleva; red → nodos; flujo → cajas en orden.
2. **Un cambio por paso** (3 a 6 pasos): el paso 1 presenta la escena; cada paso siguiente añade o mueve **una** cosa y la resalta con su color (`blue` foco, `green` meta/bueno, `red` peligro/error, `amber` coste).
3. **Una flecha con etiqueta en cada paso**, que señala lo nuevo: el movimiento, la causa, la casilla que importa. La etiqueta dice qué pasa (`sube`, `−0,04`, `choca`, `0,9 · V`).
4. **Coordenadas fijas** entre pasos: la escena no salta; solo cambia su estado.
5. **El texto del paso** (`text`, una frase) explica lo que la flecha muestra; el número exacto puede ir ahí.
6. **Compacto para móvil**: `class="lk-wt-compact"`, `viewBox` de ancho ≤ 360. Etiquetas cortas: dentro de una casilla, el efecto (`+1`, `−1`, `×`, `R`, `0,86`); el nombre largo va en la flecha que la presenta (`puerta`, `charco`).
7. **Deja hueco entre figuras** (≈ 30–45 px): la etiqueta de una flecha se dibuja al lado, en el hueco, nunca encima de una caja.
8. Línea `Cómo leerlo:` justo después del recorrido.
9. Escribe el recorrido al nivel normal del texto: nunca dentro de una cita (`> `) ni después de un bloque de código dentro de una lista anidada. El motor no los lee bien y rechazaría un recorrido válido (límite aceptado).

## Tablas: complemento, no escena

- **Mal** (rechazado por la persona y por el motor): una tabla arriba con iconos que cambian y cajas-leyenda abajo unidas por una flecha que no toca la tabla. La explicación ocurre fuera del dibujo.
- **Bien**: el almacén dibujado casilla a casilla, el robot en su casilla y la flecha del movimiento entre casillas.
- Excepción legítima: cuando **los datos son el ejemplo** (filas de una tabla SQL), la tabla puede ser la escena, pero una flecha **apunta dentro** de ella, a la fila o celda que importa.

## Antes de entregar

1. `node tools/deck-gate.mjs <nota.md>` desde el repositorio learning (navegador real): corrige lo que nombre (palabra que no cabe → etiqueta más corta o caja más ancha; etiqueta sobre una caja → más hueco o flecha en otro lado).
2. Recorre los pasos en el lector (o capturas) y pregúntate: ¿alguien que solo mire las figuras sigue la idea en orden? Si no, falta una figura o una flecha.
3. Si el motor responde `needs a progressive walkthrough`, lee el paso y la corrección que nombra y arréglalo; no lo sustituyas por un SVG estático.

## Referencia

`assets/recorrido_rejilla.py` genera los seis recorridos del almacén de la Parte 3 de aprendizaje por refuerzo (ejemplo, recompensa frente a valor, política, trayecto, valor hacia atrás, modelo) con las funciones `tiles()` y `arrow()`; sirve de plantilla para cualquier ejemplo en rejilla: `python3 assets/recorrido_rejilla.py example`.
