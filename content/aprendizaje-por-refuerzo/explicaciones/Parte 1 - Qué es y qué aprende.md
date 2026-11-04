# Aprendizaje por refuerzo · Parte 1 — Qué es y qué aprende el agente

## Ruta

Vamos a construirlo en este orden:

1. **El problema que solo existe en el tiempo:** por qué hay decisiones que no se pueden juzgar en el instante.
2. **Las cinco piezas:** agente, entorno, estado, acción y recompensa.
3. **Un paso completo:** qué entra y qué sale en cada ciclo.
4. **Por qué RL no es supervisado ni no supervisado.**
5. **Los cuatro conceptos que se confunden:** política, recompensa, valor y modelo.
6. **Explorar o explotar:** el dilema que no se puede esquivar.
7. **El retorno y el descuento:** cómo se juzga una secuencia entera, y por qué aparece \(c/(1-\gamma)\).

---

## 1. El problema que solo existe en el tiempo

Hay problemas donde contestar bien ahora no sirve de nada.

Un robot aspirador está en una habitación sucia y le queda un 4 % de batería. Puede aspirar — ya mismo, recompensa inmediata alta — o irse al cargador, donde no limpia nada.

Si solo miras el instante, aspirar gana.

Si miras la hora siguiente, cargar gana: con la batería llena vuelve y limpia seis habitaciones más.

Ese es todo el problema del aprendizaje por refuerzo, y no aparece en ningún otro tipo de aprendizaje:

> **¿Qué acciones debo elegir a lo largo del tiempo para maximizar la recompensa que voy a obtener, no la que obtengo ahora?**

---

## 2. Las cinco piezas

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

Abramos la caja.

**Agente** es quien toma decisiones. Aquí, el robot. Podría ser un personaje de videojuego, un recomendador, un controlador de tráfico.

**Entorno** es todo lo demás: la casa, la suciedad, la batería, los obstáculos. El agente elige sus acciones, pero no elige las consecuencias.

**Estado** \(s_t\) es la información relevante en el instante \(t\):

```text
posición = sala
sala     = sucia
batería  = 70 %
```

**Acción** \(a_t\) es lo que el agente puede hacer: aspirar, moverse a la cocina, ir al cargador, esperar.

**Recompensa** \(r\) es un número que dice qué tan deseable fue una consecuencia. Podemos diseñarla: limpiar una habitación \(+10\), un movimiento inútil \(-1\), quedarse sin batería \(-5\).

Y aquí va la advertencia que sostiene todo el resto:

> La recompensa valora lo que acaba de pasar, no si la decisión fue buena.

---

<lk-quick-quiz point="2. Las cinco piezas" tag="conceptual">
<script type="application/json">
{"id": "qq-p1-1", "pregunta": "El robot aspira con el 4 % de batería y recibe +10. ¿Qué acaba de decirnos esa recompensa?", "opciones": {"A": "Que aspirar fue la decisión correcta a largo plazo", "B": "Que la acción produjo una consecuencia deseable en ese instante, sin decir nada sobre el futuro", "E": "No sé"}, "correcta": "B", "explicacion": "La recompensa es una señal inmediata sobre una consecuencia. Si era la mejor decisión depende de lo que venga después, y eso es precisamente lo que mide la función de valor."}
</script>
</lk-quick-quiz>

---

## 3. Un paso completo

Supongamos un instante \(T_0\):

```text
posición = sala
sala     = sucia
batería  = 70 %
```

El agente elige `aspirar`. El entorno responde con una recompensa y un estado nuevo:

```text
recompensa = +10
posición   = sala
sala       = limpia
batería    = 68 %
```

Un paso entrega dos cosas distintas, y confundirlas arruina el resto del tema: una **recompensa**, que se cobra una vez, y un **estado nuevo**, que abre las decisiones que vienen.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"Qué vuelve en cada paso","caption":"La recompensa se cobra en el acto; el estado nuevo es la puerta a los pasos siguientes.","scene":{"boxes":[
{"x":300,"y":76,"w":160,"h":96,"label":"un paso","sub":"s → a → s nuevo","tone":"ink","size":20,"subSize":13,"subDy":20}],
"arrows":[
{"x1":294,"y1":124,"x2":90,"y2":124,"label":"recompensa r","tone":"amber","labelSize":15,"width":3},
{"x1":466,"y1":124,"x2":670,"y2":124,"label":"estado nuevo","tone":"blue","labelSize":15,"width":3}]}}
</script>
</lk-scene>

Ese ciclo — estado, acción, recompensa, estado nuevo — se repite. Es el corazón de todo lo que sigue.

---

## 4. Por qué RL no es supervisado ni no supervisado

En **supervisado** alguien te dice la respuesta correcta para cada entrada:

```text
foto 1 → "habitación sucia"
foto 2 → "habitación limpia"
```

En **no supervisado** no hay respuesta correcta: das miles de imágenes y el algoritmo encuentra estructura — grupos de habitaciones parecidas — sin que nadie los nombre.

En **refuerzo** nadie te dice qué acción era la correcta. Recibes consecuencias:

```text
hice esto  → +10
hice aquello → -5
```

Y tienes que descubrir qué comportamiento produce mejores resultados acumulados.

La diferencia, en una línea: el supervisado te dice cuál era la respuesta; el refuerzo te deja actuar y observar qué pasó.

---

## 5. Los cuatro conceptos que se confunden

### Política

La **política** \(\pi\) es la regla con la que el agente decide. Puede ser una tabla:

```text
sucio        → aspirar
limpio       → moverse
batería < 15 → cargar
```

o una distribución de probabilidad \(\pi(a|s)\): la probabilidad de elegir \(a\) estando en \(s\).

### Recompensa

Responde a **qué acaba de ocurrir**. Es inmediata y no opina sobre el futuro.

### Función de valor

Responde a algo distinto: **cuánto beneficio futuro se puede esperar desde aquí**.

Dos estados pueden parecer idénticos — misma habitación sucia — y valer muy distinto solo por la batería.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 220","title":"Mismo cuarto, distinto futuro","caption":"La diferencia no está en lo que se ve ahora, sino en cuánto se puede hacer después.","scene":{"boxes":[
{"x":60,"y":64,"w":196,"h":110,"label":"estado A","sub":"batería 4 %","tone":"red","size":22,"subSize":14,"subDy":22},
{"x":504,"y":64,"w":196,"h":110,"label":"estado B","sub":"batería 100 %","tone":"green","size":22,"subSize":14,"subDy":22}]}}
</script>
</lk-scene>

Hay dos formas de escribirla. \(V^\pi(s)\) es el retorno esperado empezando en \(s\) y siguiendo \(\pi\). \(Q^\pi(s,a)\) es el retorno esperado si además eliges específicamente \(a\).

### Modelo

Un **modelo** predice qué ocurrirá si haces algo: próximo estado y recompensa probable. Sirve para planificar antes de actuar.

Tenerlo o no parte el campo en dos familias: *model-based* y *model-free*. No es obligatorio tenerlo.

<lk-quick-quiz point="5. Los cuatro conceptos" tag="terminologia">
<script type="application/json">
{"id": "qq-p1-2", "pregunta": "Dos estados idénticos salvo la batería (4 % y 100 %). ¿Cuál de estos números los distingue?", "opciones": {"A": "La recompensa que se cobró al llegar", "B": "El valor V(s), porque mide lo que todavía se puede conseguir desde ahí", "E": "No sé"}, "correcta": "B", "explicacion": "La recompensa ya se cobró y es la misma para los dos. El valor mira hacia adelante: con 4 % quedan pocas acciones posibles, con 100 % quedan muchas."}
</script>
</lk-quick-quiz>

---

## 6. Explorar o explotar

El robot conoce dos estrategias:

```text
A → normalmente consigue +8
B → apenas la ha probado
```

¿Qué hace?

**Explotar** es usar lo que ya parece mejor. Ventaja: cobras una recompensa conocida. Problema: quizá hay algo mucho mejor que nunca vas a descubrir.

**Explorar** es probar lo desconocido. Puede salir mal — \(B\) da \(+2\) — y puede salir extraordinariamente bien: \(B\) da \(+15\), y acabas de encontrar algo que no sabías que existía.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 300","title":"El mismo estado, dos caminos","caption":"Explotar cobra lo conocido; explorar compra información. Ninguno es gratis.","scene":{"boxes":[
{"x":282,"y":20,"w":196,"h":96,"label":"decisión","sub":"¿qué acción?","tone":"ink","size":22,"subSize":14,"subDy":22},
{"x":60,"y":210,"w":196,"h":96,"label":"explotar","sub":"lo conocido","tone":"blue","size":20,"subSize":14,"subDy":20},
{"x":504,"y":210,"w":196,"h":96,"label":"explorar","sub":"lo nuevo","tone":"amber","size":20,"subSize":14,"subDy":20}],
"arrows":[
{"x1":330,"y1":120,"x2":168,"y2":204,"label":"seguro","tone":"blue","labelSize":15,"width":3},
{"x1":430,"y1":120,"x2":592,"y2":204,"label":"información","tone":"amber","labelSize":15,"width":3}]}}
</script>
</lk-scene>

Ningún extremo funciona. Explorar siempre es probar cosas malas a propósito; explotar siempre es quedarse con una estrategia mediocre.

El equilibrio más simple es \(\varepsilon\)-greedy: el \(90\%\) del tiempo usas la mejor acción conocida y el \(10\%\) exploras.

---

## 7. El retorno y el descuento

Hasta aquí hablamos de recompensas sueltas. El agente no quiere maximizar la próxima: quiere maximizar la suma de las que vienen.

Supón que recibe \(+10\), luego \(-1\), luego \(+10\). Si sumas:

```text
10 + (-1) + 10 = 19
```

Ese 19 es el **retorno** \(G_t\).

Pero hay un problema. ¿Vale lo mismo cobrar \(+10\) ahora que dentro de cinco mil pasos? Casi nunca. Para eso existe el factor de descuento \(\gamma\), con \(0 \le \gamma \le 1\).

Con \(\gamma = 0{,}9\), la primera recompensa vale entera, la segunda se descuenta una vez y la tercera dos:

\[
G = 10 + 0{,}9(-1) + 0{,}9^2(10) = 10 - 0{,}9 + 8{,}1 = 17{,}2
\]

| Recompensa | Distancia | Peso | Aporta |
|---:|---:|---:|---:|
| +10 | 0 | 1 | +10 |
| −1 | 1 | 0,9 | −0,9 |
| +10 | 2 | 0,81 | +8,1 |

Cada paso que pasa, la recompensa pesa un poco menos.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"El mismo +10, tres pesos distintos","caption":"Lo que cambia de una caja a otra no es la recompensa: es cuánto pesa por llegar tarde.","scene":{"boxes":[
{"x":8,"y":60,"w":182,"h":96,"label":"+10","sub":"peso 1","tone":"green","size":24,"subSize":14,"subDy":22},
{"x":289,"y":60,"w":182,"h":96,"label":"−1","sub":"peso 0,9","tone":"red","size":24,"subSize":14,"subDy":22},
{"x":570,"y":60,"w":182,"h":96,"label":"+10","sub":"peso 0,81","tone":"green","size":24,"subSize":14,"subDy":22}],
"arrows":[
{"x1":194,"y1":108,"x2":285,"y2":108,"label":"+1 paso","tone":"ink","labelSize":14,"width":3},
{"x1":475,"y1":108,"x2":566,"y2":108,"label":"+2 pasos","tone":"ink","labelSize":14,"width":3}]}}
</script>
</lk-scene>

En forma compacta:

\[
G_t = \sum_{k=0}^{\infty} \gamma^k R_{t+k+1}
\]

Que \(\gamma\) sea pequeño significa mirar sobre todo el corto plazo. Que esté cerca de 1 alarga el horizonte. Con \(\gamma = 0\) el agente solo ve la siguiente recompensa.

---

<lk-quick-quiz point="7. El retorno y el descuento" tag="matematicas">
<script type="application/json">
{"id": "qq-p1-3", "pregunta": "Con γ = 0,9, ¿cuánto aporta una recompensa de +10 que llega tres pasos después?", "opciones": {"A": "+10, porque la recompensa no cambia", "B": "+7,29, porque pesa 0,9³", "C": "+8,1, porque pesa 0,9²", "E": "No sé"}, "correcta": "B", "explicacion": "El exponente cuenta los pasos de distancia: tres pasos son 0,9³ = 0,729, y 10 × 0,729 = 7,29. La recompensa es la misma; lo que baja es su peso."}
</script>
</lk-quick-quiz>

---

## 8. Recompensa constante y suma infinita

Esta parte parece rara hasta que se pone un número.

En una tarea continua el robot cobra \(+1\) en cada paso, para siempre. Sin descuento la suma no termina: \(\infty\).

Con \(\gamma = 0{,}9\):

```text
1 + 0,9 + 0,81 + 0,729 + 0,6561 + ...
```

Cada término es menor que el anterior. La suma converge, y vale exactamente 10.

### De dónde sale ese 10

Llamamos \(G\) a la suma entera:

\[
G = 1 + 0{,}9 + 0{,}9^2 + 0{,}9^3 + \cdots
\]

Multiplicamos todo por \(0{,}9\):

\[
0{,}9G = 0{,}9 + 0{,}9^2 + 0{,}9^3 + \cdots
\]

Restamos la segunda de la primera. Todo lo que se repite se cancela:

\[
G - 0{,}9G = 1
\]

\[
0{,}1G = 1
\]

\[
G = 10
\]

### El caso general

Si en cada paso cobras \(c\):

\[
G = c(1 + \gamma + \gamma^2 + \cdots) = \frac{c}{1-\gamma}
\]

La fórmula solo vale si \(\gamma < 1\). Con \(\gamma = 1\) el denominador es cero: la suma diverge, y no hay número que asignar al estado.

### Un ejemplo

Con \(c = 2\) y \(\gamma = 0{,}9\):

\[
G = \frac{2}{1-0{,}9} = \frac{2}{0{,}1} = 20
\]

Y comprobándolo a mano:

```text
2
+ 1,8
+ 1,62
+ 1,458
+ 1,3122
...
= 20
```

---

## Errores típicos

**1. «Recompensa y valor son lo mismo».**

No. La recompensa dice qué acaba de ocurrir; el valor dice cuánto se espera conseguir desde aquí. Una acción puede dar 0 ahora y valer muchísimo.

**2. «El objetivo es la recompensa más grande en cada paso».**

No. El objetivo es el retorno esperado. Una pérdida pequeña hoy puede pagar una ganancia mucho mayor mañana.

**3. «γ mide cuánto importa la recompensa actual».**

Al revés. La recompensa inmediata no lleva descuento; el descuento empieza en la siguiente.

**4. «γ = 0,9 significa mirar 10 pasos».**

No exactamente. Sigue mirando más allá; simplemente cada vez pesan menos. \(1/(1-\gamma)\) es una intuición de horizonte, no una frontera.

**5. «Todo RL usa un modelo del entorno».**

No. Existen métodos *model-based* y *model-free*.

---

## Límites y verdades completas

Simplificamos una cosa importante: que el agente conoce el estado completo. En un MDP clásico el estado debe contener lo necesario para predecir el futuro. Si el robot no ve detrás de una puerta cerrada, estamos ante un problema parcialmente observable, y eso lleva a los POMDP.

También usamos el retorno descontado como formulación de las tareas continuas. No es la única: el *average reward* mide la recompensa media por unidad de tiempo, y hay problemas donde encaja mejor.

Y el descuento no es solo una convención matemática. Cambia el comportamiento: un agente con \(\gamma\) cercano a 1 sacrifica el presente por un futuro lejano; uno con \(\gamma\) cercano a 0 hace lo contrario. Elegir \(\gamma\) es elegir qué significa «a largo plazo» en tu problema.
