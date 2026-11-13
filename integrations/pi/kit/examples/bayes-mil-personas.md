# Parte 1 — Probabilidad condicional con mil personas

## Ruta

1. Contar a las mil personas en grupos.
2. Aislar a las personas que dan positivo.
3. Dividir: el resultado sale de los conteos.

## 1. Mil personas en grupos

Imagina mil personas. Diez tienen una infección.

La prueba da positivo a nueve de ellos. Después, también da positivo a 99 personas sanas.

<lk-tree>
<script type="application/json">
{"title":"De mil personas","caption":"Cada rama lleva cuántas personas pasan y qué parte del grupo de arriba son. Las dos hojas destacadas son los positivos.","nodes":[
 {"id":"todas","lines":["1000 personas"],"kind":"user","tone":"slate"},
 {"id":"enf","lines":["enfermos"],"kind":"user","tone":"blue"},
 {"id":"san","lines":["sanos"],"kind":"user","tone":"slate"},
 {"id":"enf-pos","lines":["positivos"],"kind":"user","tone":"amber","highlight":true},
 {"id":"enf-neg","lines":["negativos"],"kind":"user","tone":"slate"},
 {"id":"san-pos","lines":["positivos","(falsos)"],"kind":"user","tone":"amber","highlight":true},
 {"id":"san-neg","lines":["negativos"],"kind":"user","tone":"slate"}
],"links":[
 {"from":"todas","to":"enf","count":10,"rate":"1 %"},
 {"from":"todas","to":"san","count":990,"rate":"99 %"},
 {"from":"enf","to":"enf-pos","count":9,"rate":"90 %"},
 {"from":"enf","to":"enf-neg","count":1,"rate":"10 %"},
 {"from":"san","to":"san-pos","count":99,"rate":"10 %"},
 {"from":"san","to":"san-neg","count":891,"rate":"90 %"}
]}
</script>
</lk-tree>

**Positivo**: es el resultado que señala la infección.

**Falso positivo**: es un positivo en una persona sana.

## 2. La fórmula con los conteos

La cuenta sale de los conteos, un paso por vez.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"De los positivos al resultado","viewBox":"0 60 360 190","steps":[
 {"title":"Paso 1: los positivos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["den"],"narrator":"De las mil personas, solo miramos a las que dan positivo.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":90,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"s","kind":"user","x":270,"y":168,"size":72,"tone":"slate","tag":"99 sanos"}]}}},
 {"title":"Paso 2: sumar los positivos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["den"],"narrator":"Son 108 personas: 9 enfermos y 99 sanos.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos"}],"moves":[{"from":"e","to":"g","verb":"+ 9","tone":"amber"},{"from":"s","to":"g","verb":"+ 99","tone":"slate"}]}}},
 {"title":"Paso 3: los enfermos entre ellos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["num"],"narrator":"De esos 108, solo nueve están enfermos.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos","state":"faded"}],"moves":[{"from":"e","to":"g","verb":"están aquí","tone":"amber"}],"marks":[{"kind":"ok","actor":"g","label":"9 de 108"}]}}},
 {"title":"Paso 4: el resultado","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"9 / 108 ≈ 0,083","id":"res"}]},"focus":["res"],"narrator":"Entre los positivos, un 8,3 % está enfermo.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos","state":"faded"}],"moves":[{"from":"e","to":"g","verb":"9 de 108","tone":"green"}],"marks":[{"kind":"ok","actor":"g","label":"8,3 %"}]}}}
]}
</script>
</lk-story>

## Mini-quiz

Las preguntas de esta parte viven en su `mini-quiz/<parte>.json`: el lector las dibuja como el lk-quiz interactivo.
