# Parte 1 — El problema que solo existe en el tiempo

## Ruta

Vamos a construirlo en este orden:

1. Por qué hay decisiones que no se pueden juzgar en el instante.
2. El caso del robot que se queda sin batería.
3. En qué se diferencia esto del aprendizaje supervisado.

## 1. Una decisión que se juzga tarde

Hay problemas donde contestar bien **ahora** no sirve de nada.

Un robot aspirador está en una habitación sucia y le queda un 4 % de batería. Puede aspirar —recompensa inmediata alta— o irse al cargador, donde no limpia nada.

Si solo miras el instante, aspirar gana. Si miras la hora siguiente, cargar gana: con la batería llena vuelve y limpia seis habitaciones más.

> **¿Qué acciones debo elegir a lo largo del tiempo para maximizar la recompensa que voy a obtener, no la que obtengo ahora?**

Esa pregunta es todo el tema, y no aparece en ningún otro tipo de aprendizaje.

## 2. Nadie te dice la respuesta

En **supervisado** alguien te da la respuesta correcta para cada entrada: esta foto es una habitación sucia, esta es una limpia.

En **no supervisado** no hay respuesta: das miles de imágenes y el algoritmo encuentra grupos parecidos sin que nadie los nombre.

En **refuerzo** nadie te dice qué acción era la correcta. Recibes consecuencias —hice esto y me dieron +10, hice aquello y me dieron −5— y tienes que descubrir qué comportamiento produce mejores resultados acumulados.

La diferencia, en una línea: el supervisado te dice cuál era la respuesta; el refuerzo te deja actuar y observar qué pasó.

<lk-quiz>{"id":"q-p1-a","pregunta":"El robot aspira con 4 % de batería y recibe +10. ¿Qué acaba de decir esa recompensa?","opciones":{"A":"Que aspirar fue la decisión correcta a largo plazo","B":"Que la acción produjo una consecuencia deseable en ese instante, sin decir nada del futuro","E":"No sé"},"correcta":"B","explicacion":"La recompensa valora lo que acaba de pasar. Si era la mejor decisión depende de lo que venga después."}</lk-quiz>
