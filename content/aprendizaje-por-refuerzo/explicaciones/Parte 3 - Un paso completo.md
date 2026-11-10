# Parte 3 — Un paso completo

## Ruta

Vamos a construirlo en este orden:

1. Un instante concreto del robot, con sus datos.
2. Qué devuelve el entorno cuando actúa.
3. Por qué recompensa y estado nuevo no son lo mismo.

## 1. El instante T0

Supongamos que ahora mismo el robot sabe esto:

> posición = sala · sala = sucia · batería = 70 %

Elige **aspirar**. El entorno responde con dos cosas: una recompensa y un estado nuevo.

> recompensa = +10 · sala = limpia · batería = 68 %

## 2. Dos cosas distintas en la misma respuesta

Un paso entrega una **recompensa**, que se cobra una vez, y un **estado nuevo**, que abre las decisiones que vienen.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"Qué vuelve en cada paso","caption":"La recompensa se cobra en el acto; el estado nuevo es la puerta a los pasos siguientes.","scene":{"boxes":[
{"x":300,"y":76,"w":160,"h":96,"label":"un paso","sub":"s → a → s nuevo","tone":"ink","size":20,"subSize":13,"subDy":20}],
"arrows":[
{"x1":294,"y1":124,"x2":90,"y2":124,"label":"recompensa r","tone":"amber","labelSize":15,"width":3},
{"x1":466,"y1":124,"x2":670,"y2":124,"label":"estado nuevo","tone":"blue","labelSize":15,"width":3}]}}
</script>
</lk-scene>

Confundirlas arruina el resto del tema: el +10 ya está cobrado y no vuelve; la batería al 68 % es lo que condiciona el paso siguiente.

Ese ciclo —estado, acción, recompensa, estado nuevo— se repite. Es el corazón de todo lo que sigue.

<lk-quiz>{"id":"q-p3-a","pregunta":"Después de aspirar, el robot recibe +10 y la sala queda limpia con 68 % de batería. ¿Qué de esas tres cosas condiciona el paso siguiente?","opciones":{"A":"El +10, porque ya está cobrado","B":"El estado nuevo: sala limpia y 68 % de batería","C":"Las tres por igual","E":"No sé"},"correcta":"B","explicacion":"La recompensa se cobró y no vuelve. Lo que decide el siguiente paso es el estado en que quedó el robot."}</lk-quiz>
