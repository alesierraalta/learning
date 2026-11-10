# Parte 2 — Las cinco piezas

## Ruta

Vamos a construirlo en este orden:

1. La caja negra: qué entra y qué sale.
2. Las cinco piezas, con el robot de ejemplo.
3. La advertencia que sostiene todo el resto.

## 1. La caja negra

Usaremos siempre el mismo ejemplo: un robot aspirador en una casa.

Antes de definirlo, míralo como una caja negra: entra un estado, sale una acción, vuelve una recompensa.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 230","title":"La caja negra","caption":"Todavía no sabemos qué hay dentro: solo que algo recibe el estado y devuelve una acción.","scene":{"boxes":[
{"x":8,"y":64,"w":196,"h":110,"label":"AGENTE","sub":"robot · batería 70 %","tone":"blue","size":22,"subSize":14,"subDy":22},
{"x":556,"y":64,"w":196,"h":110,"label":"ENTORNO","sub":"casa · sala sucia","tone":"green","size":22,"subSize":14,"subDy":22}],
"arrows":[
{"x1":208,"y1":100,"x2":552,"y2":100,"label":"acción: aspirar","tone":"blue","labelSize":15,"width":3,"labelAt":0.36},
{"x1":552,"y1":138,"x2":208,"y2":138,"label":"recompensa +10","tone":"green","labelSize":15,"width":3,"labelAt":0.64}]}}
</script>
</lk-scene>

## 2. Las cinco piezas

**Agente** es quien toma decisiones. Aquí, el robot.

En nuestro ejemplo:

> agente = robot aspirador.

Podría ser también un personaje de videojuego, un sistema de recomendaciones, un algoritmo de trading, un controlador de tráfico o un modelo que aprende a resolver problemas.

**Entorno** es todo aquello con lo que interactúa el agente.

> entorno = casa + suciedad + batería + obstáculos.

El agente elige sus acciones, pero **no elige las consecuencias**.

**Estado** es la información que hace falta para decidir ahora.

> estado = sala sucia, cocina limpia, en la sala, batería 70 %.

**Acción** es lo que el agente puede hacer: aspirar, moverse, ir al cargador, esperar.

**Recompensa** es un número que dice qué tan deseable fue una consecuencia: limpiar una habitación +10, un movimiento inútil −1, quedarse sin batería −5.

> La recompensa valora lo que acaba de pasar, no si la decisión fue buena.

<lk-quiz>{"id":"qq-p1-1","pregunta":"El robot aspira con el 4 % de batería y recibe +10. ¿Qué acaba de decirnos esa recompensa?","opciones":{"A":"Que aspirar fue la decisión correcta a largo plazo","B":"Que la acción produjo una consecuencia deseable en ese instante, sin decir nada sobre el futuro","E":"No sé"},"correcta":"B","explicacion":"La recompensa es una señal inmediata sobre una consecuencia. Si era la mejor decisión depende de lo que venga después, y eso lo mide la función de valor."}</lk-quiz>
