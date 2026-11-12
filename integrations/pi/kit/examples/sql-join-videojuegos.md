# JOIN: unir dos tablas por una clave

## Ruta

1. Cada videojuego guarda el id de su desarrolladora.
2. JOIN une cada fila con la fila que tiene el mismo id.
3. El resultado trae las columnas de las dos tablas.

Dos tablas se relacionan por una columna que tienen en común. Mira qué fila encuentra cada videojuego.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"videogames JOIN developers","tables":{
 "tables":[
  {"id":"games","name":"videogames","columns":["title","developer_id"],"rows":[["Zelda","1"],["Mario","1"],["GTA V","5"],["Portal 2","7"],["RDR 2","5"]]},
  {"id":"devs","name":"developers","columns":["id","name"],"rows":[["1","Nintendo"],["5","Rockstar"],["7","Valve"]]}],
 "join":{"from":"games.developer_id","to":"devs.id","on":"developer_id = id","highlight":["5"]},
 "result":{"label":"RESULTADO","select":["games.title","devs.name"]}},
 "steps":[
 {"title":"Dos tablas","equation":{"size":22,"atoms":[{"t":"FROM ","id":"from"},{"t":"videogames","id":"games"},{"t":" JOIN ","id":"join"},{"t":"developers","id":"devs"}]},"focus":["games","devs"],
  "narrator":"«videogames» guarda el id de su desarrolladora en «developer_id».",
  "stage":{"tables":{"show":["tables"]}}},
 {"title":"Cada fila encuentra su pareja","equation":{"size":22,"atoms":[{"t":"JOIN developers ","id":"join"},{"t":"ON developer_id = id","id":"on"}]},"focus":["on"],
  "narrator":"El conector une cada «developer_id» con la fila que tiene ese *id*.",
  "stage":{"tables":{"show":["tables","links","on"]}}},
 {"title":"El resultado","equation":{"size":22,"atoms":[{"t":"SELECT ","id":"select"},{"t":"title, name","id":"cols"}]},"focus":["cols"],
  "narrator":"Cada videojuego sale con el nombre de su desarrolladora.",
  "stage":{"tables":{"show":["tables","links","on","result"]}}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué fila de «developers» encuentra «Portal 2»?
