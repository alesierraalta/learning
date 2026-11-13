# La densidad gaussiana, símbolo por símbolo

## Ruta

1. La fórmula entera, de un vistazo.
2. Cada símbolo: qué es y para qué se usa.
3. El ejemplo de latencia, con sus números.

Imagina la latencia de una petición en un servidor.

**Densidad gaussiana**
Es la altura de la campana en cada punto.

Antes, la fórmula parecía un símbolo raro. Después, cada símbolo tiene su paso.

Una fórmula se recorre paso a paso. Primero entera.

Después, un símbolo por paso. Al final, con los números del ejemplo.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 250","title":"La campana de latencia, su centro y su ancho","caption":"La petición y el servidor son los actores; la campana es la distribución de la latencia.","scene":{
  "paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 16 210 L 16 56","tone":"slate","width":2,"arrow":false},
    {"d":"M 180 210 L 180 70","dashed":true,"tone":"blue","width":2,"arrow":false}],
  "icons":[{"kind":"doc","id":"peticion","x":70,"y":72,"size":40,"tone":"blue"},{"kind":"gear","id":"servidor","x":290,"y":72,"size":40,"tone":"green"}],
  "tags":[{"text":"la petición","to":"peticion","tone":"blue"},{"text":"el servidor","to":"servidor","tone":"green"}],
  "labels":[{"x":20,"y":120,"text":"densidad","anchor":"start","size":14},{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":14}]}}
</script>
</lk-scene>

<lk-story>
<script type="application/json">
{"kind":"formula","title":"La densidad gaussiana, paso a paso","viewBox":"0 0 360 262",
 "formula":{"size":18,"atoms":[
  {"t":"f","id":"f"},{"t":"(","id":"open"},{"t":"x","id":"x"},{"t":")","id":"close"},{"t":" = ","id":"eq"},
  {"t":"1","id":"one"},{"t":"/","id":"slash"},{"t":"(","id":"nopen"},{"t":"σ","id":"sigma"},{"t":"√","id":"sqrt"},{"t":"(","id":"sopen"},{"t":"2","id":"two"},{"t":"π","id":"pi"},{"t":")","id":"sclose"},{"t":")","id":"nclose"},
  {"t":" · ","id":"dot"},{"t":"exp","id":"exp"},{"t":"(","id":"eopen"},{"t":"−","id":"minus"},{"t":"(","id":"xopen"},{"t":"x","id":"x2"},{"t":"−","id":"minus2"},{"t":"μ","id":"mu"},{"t":")","id":"xclose"},{"t":"²","id":"sq"},{"t":"/","id":"dslash"},{"t":"(","id":"dopen"},{"t":"2","id":"two2"},{"t":"σ","id":"sigma2"},{"t":"²","id":"sq2"},{"t":")","id":"dclose"},{"t":")","id":"eclose"}]},
 "steps":[
 {"title":"La fórmula entera","focus":[],
  "narrator":"Esta es la densidad normal: la altura de la campana en un punto «x».",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 16 210 L 16 56","tone":"slate","width":2,"arrow":false},
    {"d":"M 180 210 L 180 70","dashed":true,"tone":"blue","width":2,"arrow":false}],
   "icons":[{"kind":"doc","id":"peticion","x":70,"y":72,"size":40,"tone":"blue"},{"kind":"gear","id":"servidor","x":290,"y":72,"size":40,"tone":"green"}],
   "tags":[{"text":"la petición","to":"peticion","tone":"blue"},{"text":"el servidor","to":"servidor","tone":"green"}],
   "labels":[{"x":20,"y":120,"text":"densidad","anchor":"start","size":16},{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"f: la densidad","focus":["f"],
  "say":{"what":"la función de densidad","use":"da la altura de la campana en un punto","value":"en el ejemplo, f(184 ms)"},
  "narrator":"«f» es la densidad: la altura de la curva en el punto que miras.",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
   "actors":[{"id":"fx","x":228,"y":50,"w":112,"h":30,"label":"f(184)","tone":"blue","tag":"la densidad"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"x: el valor que miras","focus":["x"],
  "say":{"what":"el valor que miras","use":"la latencia de una petición concreta","value":"en el ejemplo, x = 184 ms"},
  "narrator":"«x» es el punto: la latencia de la petición que estás midiendo.",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 244 210 L 244 186","tone":"amber","width":2,"arrow":false}],
   "icons":[{"kind":"doc","id":"peticion","x":244,"y":228,"size":28,"tone":"amber"}],
   "actors":[{"id":"xv","x":228,"y":50,"w":112,"h":30,"label":"x = 184 ms","tone":"amber","tag":"el valor"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"μ: el centro","focus":["mu"],
  "say":{"what":"el centro de la campana","use":"dónde está la latencia típica","value":"en el ejemplo, μ = 120 ms"},
  "narrator":"«μ» es el centro: el pico de la campana, la latencia típica.",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 180 210 L 180 70","dashed":true,"tone":"blue","width":2,"arrow":false}],
   "actors":[{"id":"muv","x":228,"y":50,"w":112,"h":30,"label":"μ = 120 ms","tone":"blue","tag":"el centro"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"σ: el ancho","focus":["sigma"],
  "say":{"what":"el ancho de la campana","use":"cuánto se abre la distribución","value":"en el ejemplo, σ = 32 ms"},
  "narrator":"«σ» es el ancho: cuánto se abre la campana alrededor del centro.",
  "stage":{"scene":{"paths":[
    {"d":"M 148 119 C 149.3 115.3 153.3 103.7 156 96.8 C 158.7 89.9 161.3 83.0 164 77.6 C 166.7 72.2 169.3 67.5 172 64.6 C 174.7 61.7 177.3 60.0 180 60 C 182.7 60.0 185.3 61.7 188 64.6 C 190.7 67.5 193.3 72.2 196 77.6 C 198.7 83.0 201.3 89.9 204 96.8 C 206.7 103.7 210.7 115.3 212 119 L 212 210 L 148 210 Z","tone":"blue","width":0,"arrow":false,"fill":"rgba(0,66,118,0.14)"},
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
   "actors":[{"id":"sigmav","x":228,"y":50,"w":112,"h":30,"label":"σ = 32 ms","tone":"blue","tag":"el ancho"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16},{"x":148,"y":228,"text":"μ−σ","size":16},{"x":212,"y":228,"text":"μ+σ","size":16}]}}},
 {"title":"El factor que normaliza","focus":["one","slash","nopen","sigma","sqrt","sopen","two","pi","sclose","nclose"],
  "say":{"what":"el factor 1/(σ√(2π))","use":"hace que el área bajo la curva sea 1","value":"en el ejemplo, 1/(32√(2π)) ≈ 0,0125"},
  "narrator":"El factor de adelante normaliza: sin él, la campana no encierra el 100 %.",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
   "actors":[{"id":"norm","x":214,"y":50,"w":132,"h":30,"label":"≈ 0,0125","size":16,"tone":"blue","tag":"el normalizador"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"El exponente","focus":["exp","eopen","minus","xopen","x2","minus2","mu","xclose","sq","dslash","dopen","two2","sigma2","sq2","dclose","eclose"],
  "say":{"what":"el exponente exp(−(x−μ)²/(2σ²))","use":"mide la distancia al centro, en sigmas","value":"en el ejemplo, x − μ = 64 ms = 2σ"},
  "narrator":"El exponente castiga la distancia: cuanto más lejos del centro, más baja la curva.",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 180 210 L 180 70","dashed":true,"tone":"slate","width":2,"arrow":false},
    {"d":"M 244 210 L 244 186","tone":"amber","width":2,"arrow":false}],
   "arrows":[{"x1":186,"y1":200,"x2":238,"y2":200,"tone":"amber","labelSize":14,"width":2}],
   "actors":[{"id":"expv","x":214,"y":50,"w":132,"h":30,"label":"x − μ = 2σ","size":16,"tone":"amber","tag":"la distancia"}],
   "labels":[{"x":212,"y":176,"text":"64 ms","size":16},{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}},
 {"title":"Con los números del ejemplo","focus":[],
  "narrator":"Con «μ = 120 ms», «σ = 32 ms» y «x = 184 ms», la densidad vale «0,000 65».",
  "stage":{"scene":{"paths":[
    {"d":"M 48 210 C 51.7 209.9 62.7 210.2 70 209.6 C 77.3 209.0 84.7 209.5 92 206.6 C 99.3 203.7 106.7 201.3 114 192.1 C 121.3 182.9 128.7 168.4 136 151.7 C 143.3 134.9 150.7 106.9 158 91.6 C 165.3 76.3 172.7 60.0 180 60 C 187.3 60.0 194.7 76.3 202 91.6 C 209.3 106.9 216.7 134.9 224 151.7 C 231.3 168.4 238.7 182.9 246 192.1 C 253.3 201.3 260.7 203.7 268 206.6 C 275.3 209.5 282.7 209.0 290 209.6 C 297.3 210.2 308.3 209.9 312 210","tone":"blue","width":4,"arrow":false},
    {"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false},
    {"d":"M 244 210 L 244 186","tone":"green","width":3,"arrow":false}],
   "actors":[{"id":"value","x":214,"y":50,"w":132,"h":30,"label":"≈ 0,000 65","size":16,"tone":"green","tag":"el resultado"}],
   "marks":[{"kind":"ok","actor":"value"}],
   "icons":[{"kind":"doc","id":"peticion","x":244,"y":228,"size":28,"tone":"green"}],
   "labels":[{"x":344,"y":232,"text":"latencia (ms)","anchor":"end","size":16}]}}}
]}
</script>
</lk-story>
Cómo leerlo: el paso 1 muestra la fórmula entera. Cada paso siguiente resalta un símbolo en la cabecera.

Ese paso dice qué es, para qué se usa y cuánto vale en el ejemplo de latencia. El último paso sustituye los números y da el resultado.

La fórmula evaluada, para leerla de una vez:

<lk-math display>f(184) = \frac{1}{32\sqrt{2\pi}}\,\exp\!\left(-\frac{(184-120)^2}{2\cdot 32^2}\right) \approx 0{,}00065</lk-math>

## Mini-quiz

Las preguntas de esta parte viven en su `mini-quiz/<parte>.json`: el lector las dibuja como el lk-quiz interactivo.
