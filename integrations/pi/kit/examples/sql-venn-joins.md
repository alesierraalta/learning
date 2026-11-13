# INNER, LEFT y FULL JOIN: qué filas se quedan

## Ruta

1. INNER JOIN deja solo las filas que coinciden.
2. LEFT JOIN deja todas las de la izquierda.
3. FULL JOIN deja todas las de las dos tablas.

Imagina dos conjuntos: los videojuegos y las desarrolladoras.

**INNER JOIN**
Es la unión que deja solo las filas que coinciden.

**LEFT JOIN**
Es la unión que deja todas las filas de la izquierda.

**FULL JOIN**
Es la unión que deja todas las filas de las dos tablas.

Antes, cada tabla se veía aparte. Después, el centro muestra lo que coincide.

Cada conjunto es una tabla. La parte rellena es lo que el resultado conserva.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Tres JOIN, tres regiones","venn":{"sets":[{"id":"a","label":"A","note":"videogames"},{"id":"b","label":"B","note":"developers"}]},"steps":[
 {"title":"INNER JOIN","equation":{"size":22,"atoms":[{"t":"FROM videogames ","id":"from"},{"t":"INNER JOIN","id":"join"},{"t":" developers","id":"devs"}]},"focus":["join"],
  "narrator":"«INNER JOIN» deja *solo las coincidencias*: las filas que están en las dos tablas.",
  "stage":{"venn":{"fill":["a+b"],"op":"INNER JOIN","says":"Solo coincidencias"}}},
 {"title":"LEFT JOIN","equation":{"size":22,"atoms":[{"t":"FROM videogames ","id":"from"},{"t":"LEFT JOIN","id":"join"},{"t":" developers","id":"devs"}]},"focus":["join"],
  "narrator":"«LEFT JOIN» deja *todas las filas de A* y rellena con «NULL» las que no tienen pareja.",
  "stage":{"venn":{"fill":["a","a+b"],"op":"LEFT JOIN","says":"Todo A, con B donde haya"}}},
 {"title":"FULL JOIN","equation":{"size":22,"atoms":[{"t":"FROM videogames ","id":"from"},{"t":"FULL JOIN","id":"join"},{"t":" developers","id":"devs"}]},"focus":["join"],
  "narrator":"«FULL JOIN» deja *todas las filas* de las dos tablas, con o sin pareja.",
  "stage":{"venn":{"fill":["a","a+b","b"],"op":"FULL JOIN","says":"Todo A y todo B"}}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué filas deja LEFT JOIN que INNER JOIN no deja?
