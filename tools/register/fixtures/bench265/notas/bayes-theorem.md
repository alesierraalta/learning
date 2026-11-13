---
tipo: explicacion
nodo: probabilidad-condicional-y-prior
nivel: básico
---

# Parte 1 — Probabilidad condicional y el prior

## Ruta

1. La probabilidad previa mide la frecuencia base inicial.
2. La evidencia restringe el espacio de casos posibles.
3. La probabilidad condicional divide los casos favorables entre los posibles.

## El 20% que rinde el 80%

Imagina un colectivo de 10.000 pacientes evaluados en una clínica.

En ese grupo hay 100 personas que padecen una patología concreta.

**Espacio muestral**
Es el conjunto total de casos posibles. En nuestro ejemplo, son los 10.000 pacientes.

**Probabilidad previa**
Es la proporción inicial de casos favorables. En nuestro ejemplo, el prior es 100 entre 10.000.

**Condición**
Es el subconjunto de casos donde ocurre la evidencia. En nuestro ejemplo, son los pacientes con síntomas.

**Probabilidad condicional**
Es la proporción calculada dentro del espacio reducido. En nuestro ejemplo, mide los enfermos dentro del grupo con síntomas.

Antes, la probabilidad previa contaba todos los individuos por igual.

En cambio, la condición descarta a quienes no presentan la evidencia.

Sin embargo, reducir el espacio no altera la proporción interna de los casos.

**Fuente**: Ensayo filosófico sobre doctrina de probabilidades por Bayes (1763), sección sobre probabilidad condicional.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Probabilidad condicional: reducción del universo","viewBox":"0 60 360 190","steps":[
 {"title":"Espacio total y prior","equation":{"size":22,"atoms":[{"t":"P(A) = ","id":"p"},{"t":"100 / 10.000","id":"f"}]},"focus":["f"],
  "narrator":"El prior calcula la frecuencia inicial en toda la población.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"pop","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"total"},{"id":"enf","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"casos"}],
   "props":[{"id":"p1","kind":"packet","on":"pop","side":"left","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["pop"],"label":"población"}]}}},
 {"title":"La evidencia restringe","equation":{"size":22,"atoms":[{"t":"condición: ","id":"c"},{"t":"síntoma B","id":"ev"}]},"focus":["ev"],
  "narrator":"La condición descarta los casos fuera del subconjunto B.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"pop","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"active","tag":"total"},{"id":"enf","icon":"robot","x":250,"y":150,"size":56,"tone":"slate","tag":"casos"}],
   "moves":[{"actor":"pop","toX":80,"toY":150}],
   "props":[{"id":"p1","kind":"packet","on":"pop","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["pop"],"label":"restringido"}]}}},
 {"title":"Probabilidad condicional","equation":{"size":22,"atoms":[{"t":"P(A|B) = ","id":"cnd"},{"t":"P(A ∩ B) / P(B)","id":"fr"}]},"focus":["fr"],
  "narrator":"La probabilidad condicional divide los favorables entre los posibles.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"pop","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","state":"waiting","tag":"total"},{"id":"enf","icon":"robot","x":250,"y":150,"size":56,"tone":"green","state":"active","tag":"casos"}],
   "marks":[{"kind":"ok","actors":["enf"],"label":"condicionada"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Componentes del cálculo condicional","cards":[
 {"id":"prior","verdict":"ok","pill":"CORRECTO","title":"Probabilidad previa","draw":{"refs":[{"text":"P(A)","icon":"read","tone":"green"}],"target":{"text":"frecuencia"}},"reason":"Lee la frecuencia inicial"},
 {"id":"cond","verdict":"ok","pill":"CORRECTO","title":"Espacio reducido","draw":{"refs":[{"text":"P(B)","icon":"read","tone":"blue"}],"target":{"text":"universo"}},"reason":"Lee el nuevo denominador"},
 {"id":"error","verdict":"no","pill":"RECHAZADO","title":"División por cero","draw":{"refs":[{"text":"0 casos","icon":"write","tone":"amber"}],"target":{"text":"invalido"}},"reason":"Escribe un denominador nulo prohibido"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los tres componentes del cálculo condicional.

## Mini-quiz

1. ¿Qué representa la probabilidad previa P(A) en un modelo bayesiano?
2. ¿Qué ocurre con el espacio muestral al calcular la probabilidad condicional P(A|B)?
3. ¿Por qué no está definida la probabilidad condicional P(A|B) cuando P(B) es igual a cero?
