# GROUP BY: de filas a grupos

## Ruta

1. Cada fila lleva el nombre de su desarrolladora.
2. GROUP BY junta las filas que repiten ese nombre.
3. COUNT cuenta cuántas filas cayeron en cada grupo.

Un grupo es una fila nueva por cada valor distinto. Mira cómo se juntan los videojuegos.

<lk-tables>
<script type="application/json">
{"title":"GROUP BY developer","caption":"Las filas con la misma desarrolladora caen en el mismo grupo; el número es el COUNT.","group":{"by":"developer","columns":["title","developer"],"highlight":["Rockstar"],"rows":[["Zelda","Nintendo"],["Mario","Nintendo"],["GTA V","Rockstar"],["RDR 2","Rockstar"],["FF VII","Square"],["Minecraft","Mojang"]]}}
</script>
</lk-tables>

## Mini-quiz

1. ¿Cuántas filas tiene el resultado de GROUP BY developer?
