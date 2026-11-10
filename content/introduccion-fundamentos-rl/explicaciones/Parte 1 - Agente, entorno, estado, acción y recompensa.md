# Parte 1 — Agente, entorno, estado, acción y recompensa

## Ruta

Vamos a construirlo en este orden:

1. Quién decide y quién responde.
2. Las cuatro palabras del bucle, con un robot de ejemplo.
3. Qué se guarda de cada paso.

## 1. Dos lados y una conversación

Toda decisión que se aprende tiene dos lados.

El **agente** es quien decide.

El **entorno** es todo lo demás: lo que responde a esa decisión.

La conversación va en los dos sentidos, siempre igual.

El agente mira el **estado**, elige una **acción** y la envía.

El entorno devuelve una **recompensa** y un estado nuevo.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 270","title":"El bucle de un paso","caption":"La acción viaja hacia el entorno; la recompensa y el estado nuevo vuelven.","scene":{"icons":[{"kind":"robot","x":94,"y":8,"size":44,"tone":"blue"},{"kind":"house","x":620,"y":6,"size":48,"tone":"green"}],"boxes":[{"x":8,"y":76,"w":216,"h":110,"label":"AGENTE","sub":"el que decide","tone":"blue","size":22,"subSize":14,"subDy":22},{"x":536,"y":76,"w":216,"h":110,"label":"ENTORNO","sub":"el que responde","tone":"green","size":22,"subSize":14,"subDy":22}],"arrows":[{"x1":228,"y1":110,"x2":532,"y2":110,"label":"acción","tone":"blue","labelSize":15,"width":3,"labelAt":0.5},{"x1":532,"y1":152,"x2":228,"y2":152,"label":"recompensa + estado nuevo","tone":"green","labelSize":15,"width":3,"labelAt":0.5}]}}
</script>
</lk-scene>

Nada más hay en el bucle. Todo lo demás son nombres para esas piezas.

## 2. El mismo bucle con un robot

Un robot aspirador está en una cocina sucia, con batería al 70 %.

Su **estado** es esa frase: dónde está y cuánta batería queda.

Es lo que necesita saber para decidir; nada más.

Sus **acciones** son aspirar, esperar y volver a la base.

Aspira y recibe **+10**.

El entorno cambia el estado: la cocina queda limpia y la batería baja al 62 %.

Con eso ya hay un paso completo, y el siguiente empieza igual.

| Estado | Acción | Recompensa | Estado nuevo |
|---|---|---|---|
| cocina sucia · 70 % | aspirar | +10 | cocina limpia · 62 % |
| cocina limpia · 62 % | esperar | 0 | cocina limpia · 61 % |

La recompensa es un número, no una explicación.

Dice cuánto vale lo que acaba de pasar, no si fue la mejor decisión.

<lk-quick-quiz point="Parte 1 - Agente, entorno, estado, acción y recompensa" tag="conceptual">
<script type="application/json">
{"id": "q-curso-rl-p1-a", "pregunta": "El robot aspira en la cocina sucia y recibe +10. ¿Qué acaba de decir esa recompensa?", "opciones": {"A": "Que aspirar era la mejor decisión posible a largo plazo", "B": "Que la acción produjo una consecuencia deseable en ese paso, sin juzgar el futuro", "E": "No sé"}, "correcta": "B", "explicacion": "La recompensa valora el paso que acaba de ocurrir. Si convenía aspirar depende de lo que venga después, y eso todavía no está en el número."}
</script>
</lk-quick-quiz>
