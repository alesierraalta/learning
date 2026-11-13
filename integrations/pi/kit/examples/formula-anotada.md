# La fórmula anotada

Imagina la fórmula de la densidad, con sus cinco símbolos.

**Callout**
Es la etiqueta numerada que señala un símbolo.

Antes, la fórmula era una sola línea. Después, cada símbolo lleva su número.

Una fórmula se dibuja símbolo por símbolo. Cada símbolo lleva un callout numerado, y cada
número tiene su línea de `labels` que dice qué es.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 410","title":"La densidad gaussiana, símbolo por símbolo","caption":"Cada número señala un símbolo de la fórmula y dice qué es.","scene":{
  "formulas":[{"x":380,"y":130,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"},{"t":" = "},{"t":"1"},{"t":"/"},{"t":"("},{"t":"σ"},{"t":"√"},{"t":"("},{"t":"2"},{"t":"π"},{"t":")"},{"t":")"},{"t":" · "},{"t":"exp"},{"t":"("},{"t":"−"},{"t":"("},{"t":"x"},{"t":"−"},{"t":"μ"},{"t":")"},{"t":"²"},{"t":"/"},{"t":"("},{"t":"2"},{"t":"σ"},{"t":"²"},{"t":")"},{"t":")"}]}],
  "callouts":[{"n":1,"x":173,"y":38,"symbol":"f","tone":"blue"},{"n":2,"x":192,"y":170,"symbol":"x","tone":"amber"},{"n":3,"x":493,"y":38,"symbol":"μ","tone":"green"},{"n":4,"x":278,"y":76,"symbol":"σ","tone":"slate"},{"n":5,"x":299,"y":170,"at":5,"tone":"red"},{"n":6,"x":400,"y":170,"symbol":"exp","tone":"blue"}],
  "labels":[
    {"x":380,"y":220,"text":"① f: la densidad, la altura de la curva"},
    {"x":380,"y":252,"text":"② x: el valor que miras, la latencia"},
    {"x":380,"y":284,"text":"③ μ: el centro, dónde está el pico"},
    {"x":380,"y":316,"text":"④ σ: el ancho, cuánto se abre la campana"},
    {"x":380,"y":348,"text":"⑤ 1/(σ√(2π)): el factor que normaliza; π: 3,1416"},
    {"x":380,"y":380,"text":"⑥ exp(…): el exponente, la distancia al centro"}
  ]}}
</script>
</lk-scene>

Cómo leerlo: sigue el número de cada símbolo hasta su línea. Los dos factores del producto
son el ⑤ y el ⑥.

**Renglón**
Es cada línea de una cuenta.

La misma fórmula, cuando la parte la opera, va con `<lk-math>` y su cuenta renglón a renglón.
Nunca se escribe dos veces la misma fórmula.
