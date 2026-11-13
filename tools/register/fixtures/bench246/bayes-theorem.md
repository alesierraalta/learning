---
tipo: explicacion
nodo: probabilidad-condicional
nivel: básico
---

# Parte 1: Probabilidad condicional y regla del producto

**Fuente**: Probability and Statistics (DeGroot & Schervish), sección 2.1 «Conditional Probability».

## Ruta

1. Restringimos el espacio muestral al subconjunto determinado por la condición dada.
2. Definimos la probabilidad condicional como proporción de la intersección sobre la condición.
3. Obtenemos la regla del producto para calcular la probabilidad de eventos simultáneos.

## El 20% que rinde el 80%

La probabilidad condicional mide la certeza de un suceso sabiendo que ya ocurrió otro.
Conocer información previa descarta casos imposibles y reduce el espacio de posibilidades.

En nuestro ejemplo, un laboratorio analiza 1000 muestras clínicas.
Exactamente 20 muestras presentan una condición médica y 18 de ellas dan positivo.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","caption":"La condición reduce el universo de 1000 muestras a solo 20 casos evaluados.","scene":{
  "boxes":[
    {"x":60,"y":15,"w":280,"h":130,"label":"Universo Omega (1000 muestras)","tone":"blue","size":18},
    {"x":420,"y":15,"w":280,"h":130,"label":"Condición B (20 positivas)","tone":"green","size":18}
  ],
  "arrows":[
    {"x1":340,"y1":95,"x2":420,"y2":95,"label":"filtro","labelBeside":true}
  ]
}}
</script>
</lk-scene>

### **Pieza**
Un filtro condicional restringe el cálculo al subconjunto donde la evidencia es cierta.
En nuestro ejemplo: pieza = subconjunto de 20 muestras con la condición.
Podría ser también:
- Transacciones bancarias marcadas desde una dirección IP desconocida.
- Paquetes de red capturados únicamente en el puerto 443.
- Correos electrónicos que contienen archivos adjuntos ejecutables.
- Sensores industriales que superan el umbral crítico de vibración.

## Cómo opera la regla del producto

La probabilidad conjunta calcula la ocurrencia simultánea de dos eventos dependientes.
Multiplicamos la probabilidad de la condición por la probabilidad condicional del resultado.

Observa cómo se calcula la probabilidad conjunta a partir de los datos.
El producto de 0.02 y 0.90 confirma una probabilidad conjunta de 0.018.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Derivación de la regla del producto","viewBox":"0 0 360 220","steps":[
 {"title":"Paso 1: Probabilidad de la condición","equation":{"size":22,"atoms":[{"t":"P(B)","id":"pb"},{"t":" = ","id":"eq1"},{"t":"20 / 1000","id":"frac1"},{"t":" = ","id":"eq2"},{"t":"0.02","id":"v1"}]},"focus":["pb","v1"],
  "narrator":"Calculamos primero la probabilidad marginal del evento que actúa como condición.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"omega","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Omega"},
    {"id":"cond","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Condición B"}
   ],
   "props":[{"id":"p1","kind":"value","on":"cond","side":"left","label":"P(B)=0.02","tone":"green"}]
  }}},
 {"title":"Paso 2: Probabilidad condicional","equation":{"size":22,"atoms":[{"t":"P(A|B)","id":"pab"},{"t":" = ","id":"eq3"},{"t":"18 / 20","id":"frac2"},{"t":" = ","id":"eq4"},{"t":"0.90","id":"v2"}]},"focus":["pab","v2"],
  "narrator":"Dentro de las muestras con condición, determinamos la fracción que da positivo.",
  "scene":{"arrows":[{"x1":270,"y1":140,"x2":70,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"omega","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Omega"},
    {"id":"cond","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Condición B"}
   ],
   "props":[{"id":"p2","kind":"value","on":"cond","side":"left","label":"P(A|B)=0.90","tone":"green"}],
   "marks":[{"kind":"ok","actors":["cond"]}]
  }}},
 {"title":"Paso 3: Regla del producto","equation":{"size":22,"atoms":[{"t":"P(A ∩ B)","id":"pab_conj"},{"t":" = ","id":"eq5"},{"t":"0.02 * 0.90","id":"prod"},{"t":" = ","id":"eq6"},{"t":"0.018","id":"v3"}]},"focus":["pab_conj","v3"],
  "narrator":"Multiplicamos ambos factores para obtener la probabilidad de la intersección.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"omega","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Omega"},
    {"id":"cond","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Intersección"}
   ],
   "props":[{"id":"p3","kind":"value","on":"omega","side":"right","label":"P(A∩B)=0.018","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["omega"]}]
  }}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Cómo se define formalmente la probabilidad condicional de A dado B, denotada P(A|B)?
- **A**: Como el cociente entre la probabilidad conjunta P(A ∩ B) y la probabilidad P(B).
- **B**: Como el producto directo de las probabilidades marginales P(A) y P(B).
- **C**: Como la suma de las probabilidades individuales menos su intersección.
- **D**: Como la probabilidad del evento A ignorando por completo la ocurrencia de B.
- **E**: No sé

2. ¿Qué representa intuitivamente la condición B en el cálculo de P(A|B)?
- **A**: Reduce el espacio muestral total únicamente a los resultados donde ocurre B.
- **B**: Duplica la cantidad de eventos posibles en el espacio muestral original.
- **C**: Garantiza que los eventos A y B sean siempre mutuamente excluyentes.
- **D**: Elimina la posibilidad de calcular la probabilidad conjunta de ambos sucesos.
- **E**: No sé

3. Según la regla de la multiplicación, ¿cómo se calcula la probabilidad conjunta P(A ∩ B)?
- **A**: Multiplicando la probabilidad condicional P(A|B) por la probabilidad de la condición P(B).
- **B**: Dividiendo la probabilidad de B entre la probabilidad condicional P(A|B).
- **C**: Restando la probabilidad de B de la probabilidad condicional P(A|B).
- **D**: Sumando las probabilidades marginales de A y de B sin considerar su dependencia.
- **E**: No sé

<lk-quiz>{"id":"p1"}</lk-quiz>
