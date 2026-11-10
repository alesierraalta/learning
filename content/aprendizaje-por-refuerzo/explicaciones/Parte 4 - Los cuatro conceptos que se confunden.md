# Parte 4 — Los cuatro conceptos que se confunden

## Ruta

Vamos a construirlo en este orden:

1. Política, recompensa, valor y modelo, cada uno con su pregunta.
2. Por qué dos estados que se ven iguales valen distinto.
3. Qué cambia cuando el agente tiene un modelo del entorno.

## 1. Cada uno responde algo distinto

| Concepto | Pregunta que responde |
|---|---|
| Política | ¿Qué acción elijo estando aquí? |
| Recompensa | ¿Qué acaba de pasar? |
| Función de valor | ¿Cuánto puedo conseguir desde aquí? |
| Modelo | ¿Qué pasaría si hago esto? |

La **política** puede ser una tabla.

> sucio → aspirar · batería baja → cargar

O una distribución: la probabilidad de elegir cada acción estando en un estado.

La **recompensa** ya la conoces: es inmediata y no opina del futuro.

El **valor** mira hacia adelante. Se escribe de dos formas.

El valor de un estado.

El valor de un estado **y** una acción concreta.

El **modelo** predice qué ocurrirá si actúas. Tenerlo o no parte el campo en dos familias, y no es obligatorio.

## 2. Mismo cuarto, distinto futuro

Dos estados pueden parecer idénticos —la misma habitación sucia— y valer muy distinto solo por la batería.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 220","title":"Mismo cuarto, distinto futuro","caption":"La diferencia no está en lo que se ve ahora, sino en cuánto se puede hacer después.","scene":{"boxes":[
{"x":60,"y":64,"w":196,"h":110,"label":"estado A","sub":"batería 4 %","tone":"red","size":22,"subSize":14,"subDy":22},
{"x":504,"y":64,"w":196,"h":110,"label":"estado B","sub":"batería 100 %","tone":"green","size":22,"subSize":14,"subDy":22}]}}
</script>
</lk-scene>

<lk-quick-quiz point="Parte 4 - Los cuatro conceptos que se confunden" tag="conceptual">
<script type="application/json">
{"id": "qq-p1-2", "pregunta": "Dos estados idénticos salvo la batería (4 % y 100 %). ¿Qué número los distingue?", "opciones": {"A": "La recompensa que se cobró al llegar", "B": "El valor, porque mide lo que todavía se puede conseguir desde ahí", "E": "No sé"}, "correcta": "B", "explicacion": "La recompensa ya se cobró y es la misma para los dos. El valor mira hacia adelante: con 4 % quedan pocas acciones posibles."}
</script>
</lk-quick-quiz>
