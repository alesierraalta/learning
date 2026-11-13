# GROUP BY: de filas a grupos

## Ruta

1. Cada fila lleva el nombre de su desarrolladora.
2. GROUP BY junta las filas que repiten ese nombre.
3. COUNT cuenta cuántas filas cayeron en cada grupo.

Imagina la tabla de videojuegos, con su desarrolladora en cada fila.

**GROUP BY**
Es la orden que junta las filas con el mismo valor.

En nuestro ejemplo, junta los juegos por desarrolladora.

**COUNT**
Es la función que cuenta las filas de cada grupo.

En nuestro ejemplo, cuenta cuántos juegos tiene cada desarrolladora.

**Valor**
Es lo que guarda una columna en cada fila: un nombre o un número.

Antes, cada videojuego iba solo. Después, los de una misma desarrolladora caen en un grupo.

En nuestro ejemplo, los dos juegos de Rockstar forman un grupo de dos.

<lk-tables>
<script type="application/json">
{"title":"GROUP BY developer","caption":"Las filas con la misma desarrolladora caen en el mismo grupo; el número es el COUNT.","group":{"by":"developer","columns":["title","developer"],"highlight":["Rockstar"],"rows":[["Zelda","Nintendo"],["Mario","Nintendo"],["GTA V","Rockstar"],["RDR 2","Rockstar"],["FF VII","Square"],["Minecraft","Mojang"]]}}
</script>
</lk-tables>

## Mini-quiz

Las preguntas de esta parte viven en su `mini-quiz/<parte>.json`: el lector las dibuja como el lk-quiz interactivo.
