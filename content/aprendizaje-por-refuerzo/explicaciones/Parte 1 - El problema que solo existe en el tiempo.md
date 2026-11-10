# Parte 1 — El problema que solo existe en el tiempo

## Ruta

Vamos a construirlo en este orden:

1. Una decisión que no se puede juzgar ahora.
2. El mismo robot con el 4 % de batería.
3. En qué se diferencia esto del supervisado.

## 1. Contestar bien y contestar tarde

Hay decisiones donde acertar ahora no sirve.

El robot está en una habitación sucia. Le queda 4 % de batería.

Puede aspirar. Recompensa inmediata: alta.

Puede irse al cargador. Recompensa inmediata: ninguna.

Si miras solo el instante, aspirar gana.

Si miras la hora siguiente, cargar gana. Con la batería llena, vuelve y limpia seis habitaciones.

> **¿Qué acciones elijo a lo largo del tiempo para maximizar la recompensa total?**

Esa pregunta es todo el tema.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"El mismo robot, dos horizontes","caption":"La misma decisión se juzga distinto según dónde pongas el final de la cuenta.","scene":{"icons":[{"kind":"robot","x":8,"y":40,"size":56,"tone":"blue"}],"boxes":[{"x":88,"y":24,"w":212,"h":100,"label":"aspiro ahora","sub":"+10 · a la hora 1 habitación","tone":"amber","size":22,"subSize":14,"subDy":22},{"x":460,"y":24,"w":212,"h":100,"label":"cargo ahora","sub":"0 · a la hora 6 habitaciones","tone":"green","size":22,"subSize":14,"subDy":22}],"arrows":[{"x1":304,"y1":74,"x2":456,"y2":74,"label":"la hora decide","tone":"slate","labelSize":15,"width":3,"labelAt":0.5}]}}
</script>
</lk-scene>

## 2. Nadie te dice la respuesta

En **supervisado**, alguien te da la respuesta para cada entrada.

Esta foto es una sucia.

Esta es una limpia.

En **no supervisado** no hay respuesta. Das miles de imágenes y aparecen grupos parecidos, sin nombre.

En **refuerzo** nadie te dice qué acción era correcta. Recibes consecuencias.

> hice esto → +10 · hice aquello → −5

Tienes que descubrir qué comportamiento produce mejores resultados.

La diferencia, en una línea.

El supervisado te dice la respuesta.

El refuerzo te deja actuar y mirar qué pasó.

<lk-quick-quiz point="Parte 1 - El problema que solo existe en el tiempo" tag="conceptual">
<script type="application/json">
{"id": "q-p1-a", "pregunta": "El robot aspira con 4 % de batería y recibe +10. ¿Qué acaba de decir esa recompensa?", "opciones": {"A": "Que aspirar fue la decisión correcta a largo plazo", "B": "Que la acción produjo una consecuencia deseable en ese instante, sin decir nada del futuro", "E": "No sé"}, "correcta": "B", "explicacion": "La recompensa valora lo que acaba de pasar. Si era la mejor decisión depende de lo que venga después."}
</script>
</lk-quick-quiz>
