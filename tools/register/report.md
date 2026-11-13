# Registro de la prosa: calibración contra la referencia del alumno

Este informe es el paso de **calibración** del issue #250: mide, no impone. Dice
qué números separan de verdad la prosa que el alumno señala como buena de la
nuestra, de dónde sale cada umbral, y qué medidas del issue original **no**
sirven (hay tres que no separan nada y una que apunta al revés).

Reproducir:

```bash
node tools/register/build-corpus.mjs          # arma el corpus desde las fuentes locales
node tools/register/measure.mjs               # la tabla
node tools/register/measure.mjs --terms       # los términos sin explicar, con su frase
node --test tools/register/measure.test.mjs   # la medida también se prueba
```

## 1. Qué se midió

| corpus | qué es | textos | palabras |
|---|---|---|---|
| `ref` | la explicación de RL que el alumno pegó (ChatGPT), medida **por secciones** | 9 | 1 446 |
| `ref-whole` | la misma explicación, entera (para las medidas de mecanismo) | 1 | 1 446 |
| `ref-exl3` | el informe de EXL3 pegado en el mismo archivo: **contraste negativo** | 10 | 1 630 |
| `ref2` | 6 lecciones publicadas de aprenderust.dev: segundo punto de comparación | 6 | 4 701 |
| `our` | nuestras partes agy: PL/SQL 1 (4 copias), SQL 1, TCP 1, los cinco del bench #246 y 11 ejemplos del kit | 21 | 3 252 |

Decisiones que cambian los números y conviene saber:

- **La referencia son dos textos, no uno.** El archivo pegado trae la explicación
  de RL (el registro que el alumno elogia) y, a continuación, un informe sobre
  EXL3 (registro técnico, sin definir nada). Mezclarlos esconde la diferencia:
  juntos dan 35 % de términos explicados; el de RL solo da 57 %, el de EXL3 26 %.
  Se separan y el de EXL3 se queda como contraste.
- **Se mide por secciones** porque un solo texto no tiene dispersión, y una media
  sin dispersión no permite decir si una medida separa. Las medidas de mecanismo
  (ruta, escena, ejemplo, cuenta) se miden sobre el texto entero: un término se
  explica una vez y luego se usa libremente, así que medirlo por secciones
  convierte una explicación correcta en un fallo.
- **La prosa se extrae sin código, sin tablas, sin piezas `lk-*`, sin quiz y sin
  diagramas de caja.** Se conservan la negrita (es cómo el texto nombra un
  término) y las cuentas paso a paso (son el mecanismo que el alumno elogia), que
  se miden aparte.
- **Un término es técnico si es `código`, si es una sigla o si su raíz no está en
  `lexico-comun.txt`** (22 047 raíces del español corriente, derivadas de la
  lista de frecuencias OpenSubtitles 2018, top 50 000 formas). La lista se
  versiona para que la medida no dependa de la red.

**Actualización (ver §10).** Las líneas de fuente (`**Fuente**:`, `Fuente:`) ya no
se miden como prosa, y los ejemplos del kit se arreglaron al registro. Las cifras de
§3 son la calibración de antes de esos cambios; las de después están en §10.

## 2. El mecanismo, no sólo la frase

El alumno lo dijo explícito: «la receta de esos ejemplos no es frases cortas, es
un mecanismo repetido». Esto es lo que hace la referencia de RL y lo que mide
cada cosa:

| pieza del mecanismo | cómo se ve en la referencia | medida |
|---|---|---|
| ruta al abrir | «Vamos a construirlo en este orden:» + 7 pasos numerados | `route` |
| un solo ejemplo terrenal que muta | el robot aspirador: batería, sala, cocina, cargador, 20+ apariciones | `exampleDominance` |
| escena antes de definición | «Caja negra inicial» → dibujo → «Abramos esa caja» → recién ahí «**Agente** / Es quien toma decisiones» | `sceneFirst` |
| término en negrita + definición de una línea + atadura al ejemplo | «**Entorno** / Es todo aquello con lo que interactúa el agente. / En nuestro ejemplo: entorno = casa + habitaciones + suciedad + batería» | `boldTermsPer1000`, `boldDefined`, `boundWeighted` |
| contraste antes/después como prueba | «Estado A / Estado B», «recompensa → qué acaba de ocurrir / valor → cuánto esperamos conseguir» | `contrastPer1000` |
| aritmética renglón a renglón | «10 / 0,9(−1) = −0,9 / 0,9²(10) = 8,1 / G = 10 − 0,9 + 8,1 / G = 17,2» | `stepsPer1000`, `longestStepRun` |
| frase de una idea | una línea por idea; media de 5,8 palabras por frase | `wordsPerSentence.mean` |

## 3. La tabla

Estas cifras son la calibración, sobre el corpus antes de arreglar los ejemplos del kit y de
excluir las líneas de fuente. Las actuales están en §10.

`ref` = la explicación de RL (media de sus 9 secciones y p90 de la distribución);
`exl3` y `aprenderust` son columnas de contraste; `nuestro` = nuestras 21 partes.
`d` es la d de Cohen entre la referencia y lo nuestro (signo: positivo = la
referencia tiene más).

| medida | ref | ref sd | ref p90 | exl3 | aprenderust | nuestro | nuestro sd | nuestro p90 | d |
|---|---|---|---|---|---|---|---|---|---|
| palabras/frase media | 5,84 | 1,72 | 6,94 | 8,33 | 12,85 | 9,68 | 1,66 | 12,00 | **−2,28** |
| palabras/frase p90 | 10,33 | 2,64 | 12,80 | 16,21 | 21,03 | 12,99 | 2,35 | 15,00 | **−1,06** |
| palabras/frase máx | 16,33 | 4,18 | 20,20 | 24,30 | 32,00 | 14,90 | 3,13 | 17,00 | +0,39 |
| Fernández-Huerta | 51,28 | 8,31 | 61,72 | 64,38 | 91,61 | 80,33 | 13,20 | 94,93 | −2,65 ⚠ |
| nominalizaciones/100 | 3,26 | 2,11 | 5,50 | 4,47 | 3,13 | 3,52 | 2,84 | 5,84 | −0,10 |
| sujeto abstracto | 16 % | 12 % | 29 % | 11 % | 9 % | 12 % | 10 % | 29 % | +0,36 |
| **términos explicados (por uso)** | **57 %** | — | 57 % | 26 % | 35 % | **24 %** | 34 % | 100 % | **+1,35** |
| términos explicados (por tipo) | 52 % | — | 52 % | 24 % | 35 % | 22 % | 34 % | 100 % | **+1,22** |
| términos atados al ejemplo (por uso) | 36 % | — | 36 % | 12 % | 1 % | 26 % | 36 % | 100 % | +0,37 |
| **negritas-término/1000** | **26,97** | — | 26,97 | 30,67 | 0,00 | **1,43** | 2,31 | 5,08 | **+15,61** |
| ruta al abrir | 100 % | — | 100 % | 100 % | 0 % | 90 % | 30 % | 100 % | +0,45 |
| **escena antes de definición** | **100 %** | — | 100 % | 0 % | 17 % | **52 %** | 51 % | 100 % | **+1,32** |
| dominancia del ejemplo | 63 % | — | 63 % | 33 % | 17 % | 52 % | 51 % | 100 % | +0,30 |
| **contrastes/1000** | **8,50** | 6,39 | 16,35 | 4,17 | 3,03 | **1,87** | 2,79 | 5,08 | **+1,34** |
| **pasos de cuenta/1000** | **53,94** | — | 53,94 | 16,56 | 0,00 | **0,00** | 0,00 | 0,00 | **∞** |
| racha de cuenta más larga | 9 | — | 9 | 12 | 0 | 0 | 0 | 0 | **∞** |
| tuteo | 4 % | 3 % | 7 % | 7 % | 23 % | 3 % | 7 % | 20 % | +0,19 |
| nosotros/imperativo | 12 % | 5 % | 15 % | 4 % | 0 % | 2 % | 3 % | 5 % | **+2,43** |
| código en línea/100 | 0,59 | 0,27 | 0,81 | 1,85 | 0,00 | 1,22 | 2,07 | 2,94 | −0,43 |
| negritas definidas | 44 % | — | 44 % | 34 % | 100 % | 100 % | 0 % | 100 % | ∞ ⚠ |

⚠ = la medida no sirve como puerta; el motivo está en el punto 4.

## 4. Qué separa y qué no

### Separan limpio (|d| ≥ 1 y dirección correcta)

1. **`pasos de cuenta/1000`** — 53,94 contra 0,00. Ninguna de nuestras 21 partes
   muestra una cuenta paso a paso en prosa; la referencia muestra 9 renglones
   seguidos. Es el separador perfecto del corpus.
2. **`negritas-término/1000`** — 26,97 contra 1,43 (d = +15,6). La referencia
   nombra y marca sus términos; nosotros casi no usamos la negrita como
   herramienta. Nuestro p90 es 5,08: estamos en otra escala.
3. **`palabras/frase media`** — 5,84 contra 9,68 (d = −2,28). Y sin solape: la
   referencia nunca pasa de 6,94 y nuestra parte más corta está en 7,80. La
   referencia escribe **una idea por línea**; nosotros, dos o tres.
4. **`términos explicados (por uso)`** — 57 % contra 24 % (d = +1,35). Es la
   medida que pidió el alumno y la que sostiene la regla.
5. **`contrastes/1000`** — 8,50 contra 1,87 (d = +1,34). La referencia prueba
   comparando (antes/después, A/B, «es incorrecto»); nosotros afirmamos.
6. **`escena antes de definición`** — 100 % contra 52 % (d = +1,32). La mitad de
   nuestras partes definen antes de dibujar.
7. **`palabras/frase p90`** — 10,33 contra 12,99 (d = −1,06): incluso la cola de
   frases largas es más corta en la referencia.
8. **`nosotros/imperativo`** — 12 % contra 2 % (d = +2,43). Descriptivo: la
   referencia habla en «abramos / veamos / supongamos», nosotros en impersonal.

### No separan (y el issue los daba por buenos)

- **`nominalizaciones/100`** — 3,26 contra 3,52 (d = −0,10). **No separa.** La
  referencia nominaliza igual o más que nosotros («cuantización»,
  «implementación», «regularizado»). La densidad de nominalizaciones no es el
  problema; el problema es que el sustantivo abstracto se queda sin explicar.
- **`sujeto abstracto`** — 16 % contra 12 % (d = +0,36). **No separa**, y encima
  apunta al lado contrario. La referencia también escribe «el estado contiene…»,
  «la recompensa evalúa…»: el sujeto abstracto no es el vicio.
- **`código en línea/100`** — 0,59 contra 1,22 (d = −0,43). No separa. Sirve como
  tope de higiene, no como puerta.
- **`tuteo`** — 4 % contra 3 % (d = +0,19). No separa. La referencia casi no
  tutea: usa primera persona del plural e imperativos (`nosotros`).
- **`dominancia del ejemplo`** (63 % vs 52 %) y **`atados al ejemplo`** (36 % vs
  26 %): d = +0,30 y +0,37. No separan con este detector, aunque el mecanismo
  está ahí a la vista. El detector de «ejemplo conductor» es demasiado grueso
  para distinguir «un ejemplo que muta 20 veces» de «tres ejemplos sueltos».
- **`palabras/frase máx`** — 16,33 contra 14,90 (d = +0,39): la referencia tiene
  frases **más largas** en su máximo. Lo que la distingue es la media, no el techo.
- **`ruta al abrir`** — 100 % contra 90 %: ya está adoptado. No hace falta puerta;
  sí conviene que siga en 100 %.
- **`Fernández-Huerta`** — 51,28 contra 80,33 (d = −2,65) **en la dirección
  equivocada**: la referencia es «más difícil» para el índice porque conserva el
  vocabulario técnico y las palabras largas. FH premia la palabra corta; el
  alumno pide conservar el término técnico. **No puede ser puerta.** Se mide y se
  reporta, nada más.
- **`negritas definidas`** — 44 % contra 100 %: el denominador nuestro es 1
  negrita en 21 textos. La tasa es ruido; la puerta es `negritas-término/1000`.

## 5. Umbrales propuestos

Salen de la distribución de la referencia, no de una corazonada: `p90` cuando el
valor alto es malo, `p10` cuando el valor alto es bueno.

### Puertas (las que separan)

| medida | umbral | de dónde sale |
|---|---|---|
| `stepsPer1000` | **≥ 12** y `longestStepRun` **≥ 3** | ref p10 = 12,83; racha mínima útil = 3 renglones |
| `boldTermsPer1000` | **≥ 5** | ref p10 = 5,67 |
| `explainedWeighted` | **≥ 50 %** | ref = 57 % (texto entero) |
| `boundWeighted` | **≥ 25 %** | ref = 36 %; nuestro p90 ya está en 100 % |
| `sceneFirst` | **= 100 %** | ref = 100 % en las 9 secciones |
| `wordsPerSentence.mean` | **≤ 8** | ref p90 = 6,94 y nuestro p10 = 7,80: el corte en 8 no toca a nadie de la referencia |
| `wordsPerSentence.p90` | **≤ 13** | ref p90 = 12,80 |
| `contrastPer1000` | **≥ 4** | ref media − 0,7 sd; es la puerta más floja (nuestra p90 ya es 5,08) |
| `route` | **= 100 %** | ya se cumple; se mantiene para que no se pierda |

### Topes de higiene (no separan, pero evitan el defecto)

| medida | tope | de dónde sale |
|---|---|---|
| `nominalizationsPer100` | ≤ 5,5 | ref p90; nuestro máximo es 11,27 |
| `abstractSubject` | ≤ 30 % | ref p90 = 29 % |
| `codeSpansPer100` | ≤ 3 | ref p90 = 0,81; nuestro máximo es 7,10 |
| `wordsPerSentence.max` | ≤ 30 | ref p90 = 20,2; no es un separador, es un techo |

`Fernández-Huerta` **no lleva umbral**: se reporta y se deja. Poner un mínimo de
FH obligaría a escribir «cosa corta» en vez de «buffer», que es exactamente lo
contrario de lo que pide el alumno.

## 6. Cinco frases nuestras que fallan, y su reescritura

Todas son reales, sacadas del corpus (`--terms` imprime la frase de cada
término). La reescritura sigue el mecanismo: frase corta, sujeto concreto,
término nombrado y definido en palabras llanas, atado al ejemplo que ya corre.

**1.** `our-plsql-parte-1` — «Las sentencias DML modifican datos en el buffer de
sesión antes de confirmarse.»

> Cuando ejecutas un DML, los datos no van al disco: van al buffer de sesión.
> El buffer de sesión es la zona de memoria donde tu sesión guarda los cambios
> sin confirmar. En nuestro ejemplo, el débito de 200 deja el saldo nuevo solo
> en ese buffer; la tabla en disco todavía dice 1000.

**2.** `our-plsql-parte-1` — «Cada fila afectada queda protegida por un bloqueo
exclusivo de transacción.»

> Cada fila que tocas queda bloqueada. Un bloqueo es un aviso que impide a otra
> sesión cambiar esa fila mientras tú no confirmes. En nuestro ejemplo, la fila
> de la cuenta 10 queda bloqueada desde el UPDATE hasta el COMMIT.

**3.** `our-sql-parte-1` — «El motor relacional intercepta y rechaza tuplas
huérfanas antes de persistir cambios.»

> Una tupla huérfana es una fila que apunta a otra que no existe. El motor la
> detecta y rechaza la inserción: el cambio nunca llega al disco. En nuestro
> ejemplo, el empleado 999 apunta al departamento 50, que no está en la tabla, y
> la fila no entra.

**4.** `our-plsql-parte-1` — «El calificador `%TYPE` vincula el tipo de la
variable a una columna de la tabla base.»

> `%TYPE` es una forma de copiar el tipo de una columna sin escribirlo a mano.
> Si `saldo` es `NUMBER(10,2)`, la variable toma ese mismo tipo. En nuestro
> ejemplo, `v_saldo cuentas.saldo%TYPE` vale lo mismo que `NUMBER(10,2)`, pero se
> adapta solo si la columna cambia.

**5.** `our-proof-part` (caption de la escena) — «La sesión en memoria ejecuta el
bloque procedural y retiene los cambios antes de confirmarlos en disco.»

> El bloque se ejecuta dentro de tu sesión. La sesión es tu espacio de trabajo
> privado: ahí viven los cambios que todavía no has confirmado. En nuestro
> ejemplo, tras el UPDATE la sesión ve 800 en la cuenta 10, pero el disco sigue
> en 1000 hasta el COMMIT.

Las cinco fallan por lo mismo: el término aparece, no se dice qué es, y el
ejemplo que la parte ya tiene (cuenta 10, cuenta 20, empleado 999) no se usa para
explicarlo.

## 7. Las dos preferencias: «qué tan simple» y «qué tan técnico»

El registro no es un interruptor, es una **preferencia con dos ejes**, y el valor
por defecto es el de la referencia: muy simple sin perder tecnicidad — el término
se conserva, se nombra y se explica en palabras llanas donde aparece.

### Dónde encajan

`studio/preferences.ts` ya modela exactamente esto: `Aspecto { id, titulo,
descripcion, nivel }` con `nivel ∈ {menos, medio, más}` y una lista `defaults`
cerrada que el validador exige completa. Los dos ejes son **dos aspectos más** en
esa lista:

```ts
{ id: "sencillez",  titulo: "Qué tan simple",  descripcion: "Frases cortas, una idea por línea, con contraste y cuenta paso a paso.", nivel: "más" },
{ id: "tecnicidad", titulo: "Qué tan técnico", descripcion: "El término técnico se conserva, se nombra y se explica en palabras llanas donde aparece.", nivel: "más" },
```

- `studio/sugerencias.ts` no necesita estructura nueva: sus chips ya mueven
  niveles ±1 (`ajustes: { aspecto: ±1 }`). Los chips que faltan son los que
  hablan de estos dos ejes: «No entendí una idea» (`no-entendi`) debería subir
  `tecnicidad`; «Demasiado texto» (`demasiado-texto`) bajar `sencillez`; «Sin
  paso a paso» (`sin-paso-a-paso`) subir `sencillez`.
- `tutorContext()` ya serializa todos los aspectos como
  `- Preferencias: id=nivel, …`, así que los dos ejes llegan al prompt sin tocar
  nada más. `descubrir.ts` puede añadirlos por telemetría igual que el resto.
- La puerta y la preferencia deben leer **los mismos números**: los umbrales de
  esta tabla son la fuente, para que la preferencia no derive del gate.

**Actualización.** La tabla de niveles vive en `rules/deep.json`, bajo
`thresholds.partStandard.register.levels`: el motor (Go) y `tools/register/niveles.mjs`
la leen, sin copia. El motor lee los niveles del alumno de `niveles-alumno.json` en la
raíz de Learnings, que el estudio mantiene igual que su base.

**«Demasiado texto» sube la sencillez.** En esta sección se escribió «bajar». Pero
«más» es el nivel más sencillo, así que el chip sube la sencillez
(`sugerencias.ts`, `demasiado-texto`: `sencillez: 1`). La prueba está en
`studio/sugerencias.test.mjs`.

### Los tres niveles de cada eje

`sencillez` (cuánto se parte la idea):

| medida | menos | medio | **más (defecto)** |
|---|---|---|---|
| `wordsPerSentence.mean` | ≤ 14 | ≤ 11 | **≤ 8** |
| `wordsPerSentence.p90` | ≤ 20 | ≤ 16 | **≤ 13** |
| `contrastPer1000` | ≥ 2 | ≥ 3 | **≥ 4** |
| `stepsPer1000` | ≥ 1 | ≥ 6 | **≥ 12** |
| `sceneFirst` | no exige | ≥ 70 % | **= 100 %** |

`tecnicidad` (cuánto se conserva y se explica el término):

| medida | menos | medio | **más (defecto)** |
|---|---|---|---|
| `explainedWeighted` | ≥ 20 % | ≥ 35 % | **≥ 50 %** |
| `boundWeighted` | ≥ 10 % | ≥ 18 % | **≥ 25 %** |
| `boldTermsPer1000` | ≥ 1 | ≥ 3 | **≥ 5** |
| `codeSpansPer100` | ≤ 8 | ≤ 5 | **≤ 3** |

Con `tecnicidad: menos` el texto puede usar menos términos y más analogía; con
`más` el término se queda y **se paga** con una definición llana y una atadura al
ejemplo. Nunca se resuelve borrando el término: eso es lo que el alumno prohíbe.

## 8. Anexo: todos los términos sin explicar de nuestro corpus

Salida de `node tools/register/measure.mjs --corpus our --terms`. Un término
cuenta como técnico si es `código`, si es una sigla o si su raíz no está en el
léxico corriente. Las cuatro copias de PL/SQL 1 (`plsql-parte-1`,
`plsql-parte-1-actores`, `proof-part`, `kit-plsql-transaccion`) son el mismo
texto: se listan una vez. Los identificadores de ejemplo (`c1`, `&libro`,
`refs/heads/main`) se filtran como valores, no como términos.

**bench-bayes-theorem** — 3 de 4

- `Probability` [rare] — «**Fuente**: Probability and Statistics (DeGroot & Schervish), sección 2.1 «Conditional Probability».»
- `subconjunto` [rare] — «Restringimos el espacio muestral al subconjunto determinado por la condición dada.»
- `simultáneos` [rare] — «Obtenemos la regla del producto para calcular la probabilidad de eventos simultáneos.»

**bench-css-flexbox** — 7 de 10

- `CSS` [acronym] — «**Fuente**: CSS Flexible Box Layout Module Level 1 (W3C Recommendation), sección 2 «Flex Layout Box Model and Terminology».»
- `Layout` [rare] — «**Fuente**: CSS Flexible Box Layout Module Level 1 (W3C Recommendation), sección 2 «Flex Layout Box Model and Terminology».»
- `perpendicular` [rare] — «Identificamos el eje principal y el eje cruzado perpendicular.»
- `modelo` [rare] — «Flexbox establece un modelo unidimensional donde los elementos se ordenan sobre un eje.»
- `unidimensional` [rare] — «Flexbox establece un modelo unidimensional donde los elementos se ordenan sobre un eje.»
- `directriz` [rare] — «El eje principal es la dirección directriz sobre la cual se colocan los ítems flexibles.»
- `multimedia` [rare] — «Una botonera de reproducción multimedia con controles alineados.»

**bench-git-branching** — 11 de 13

- `tienda-app` [code] — «En nuestro ejemplo, el proyecto `tienda-app` registra dos confirmaciones consecutivas.»
- `main` [code] — «El commit inicial `c1` precede al commit `c2`, y la rama `main` apunta a `c2`.»
- `produccion` [code] — «La rama `produccion` en un servicio de despliegue continuo.»
- `master` [code] — «La referencia `master` en un proyecto heredado de código abierto.»
- `pruebas` [code] — «Una rama temporal `pruebas` para validar cambios locales.»
- `commits` [rare] — «Representamos el historial de commits encadenados hacia sus ancestros.»
- `commit` [rare] — «Definimos una rama como un puntero móvil hacia un commit concreto.»
- `bytes` [rare] — «Una rama en Git no es una copia de archivos sino un puntero liviano de 41 bytes.»
- `hash` [rare] — «El archivo de la rama contiene solo el identificador hash del commit más reciente.»
- `repositorio` [rare] — «Un puntero de rama asocia un nombre legible con un commit específico del repositorio.»
- `refs` [rare] — «En nuestro ejemplo: pieza = puntero `refs/heads/main` con el hash de `c2`.»

**bench-rust-borrowing** — 12 de 15

- `ref1` [code] — «Observa cómo `ref1` y `ref2` leen simultáneamente los caracteres de `libro`.»
- `ref2` [code] — «Observa cómo `ref1` y `ref2` leen simultáneamente los caracteres de `libro`.»
- `Rust` [rare] — «**Fuente**: The Rust Programming Language, capítulo 4.2 «References and Borrowing».»
- `inmutables` [rare] — «Creamos referencias inmutables `&libro` para lectura compartida.»
- `compilador` [rare] — «Comprobamos cómo el compilador garantiza acceso concurrente sin mover ownership.»
- `concurrente` [rare] — «Comprobamos cómo el compilador garantiza acceso concurrente sin mover ownership.»
- `ownership` [rare] — «Comprobamos cómo el compilador garantiza acceso concurrente sin mover ownership.»
- `préstamo` [rare] — «Un préstamo inmutable permite acceder a un dato sin transferir su propiedad.»
- `valor` [rare] — «El operador `&` crea una vista de solo lectura hacia el valor original.»
- `metadatos` [rare] — «La memoria asigna los metadatos en el stack y los caracteres en el heap.»
- `heap` [rare] — «La memoria asigna los metadatos en el stack y los caracteres en el heap.»
- `alterarlo` [rare] — «`&cuenta` para consultar el saldo bancario sin alterarlo.»

**bench-tcp-handshake** — 13 de 16

- `RFC` [acronym] — «**Fuente**: RFC 9293, sección 3.4 «Establishing a Connection».»
- `segmento` [rare] — «El cliente envía un segmento SYN para solicitar apertura y sincronizar su secuencia.»
- `SYN` [acronym] — «El cliente envía un segmento SYN para solicitar apertura y sincronizar su secuencia.»
- `ESTABLISHED` [acronym] — «El cliente devuelve un ACK y ambos extremos transicionan a ESTABLISHED.»
- `handshake` [rare] — «El handshake de tres vías abre un canal confiable entre dos extremos antes de transferir datos.»
- `videollamada` [rare] — «Un paquete de inicio en una videollamada WebRTC.»
- `socket` [rare] — «La apertura de un socket hacia PostgreSQL.»
- `HTTPS` [acronym] — «Una conexión HTTPS desde un navegador web.»
- `sesión` [rare] — «Una sesión SSH para administración remota.»
- `SSH` [acronym] — «Una sesión SSH para administración remota.»
- `TCP` [acronym] — «Al exigir que cada SYN reciba acuse, TCP verifica que ambos interlocutores están activos.»
- `interlocutores` [rare] — «Al exigir que cada SYN reciba acuse, TCP verifica que ambos interlocutores están activos.»
- `interlocutor` [rare] — «Cada paquete confirma el avance del interlocutor sumando una unidad a su secuencia.»

**kit-formula-anotada** — 3 de 4

- `<lk-math>` [code] — «La misma fórmula, cuando la parte la opera, va con `<lk-math>` y su cuenta renglón a renglón.»
- `callout` [rare] — «Cada símbolo lleva un callout numerado, y cada»
- `renglón` [rare] — «La misma fórmula, cuando la parte la opera, va con `<lk-math>` y su cuenta renglón a renglón.»

**kit-memoria-string-rust** — 1 de 1

- `heap` [rare] — «El texto vive en el heap.»

**kit-prestamos-rust** — 4 de 4

- `compilan` [rare] — «Muchas lecturas a la vez compilan.»
- `compila` [rare] — «Una sola escritura compila.»
- `valor` [rare] — «Una referencia presta el valor sin darlo.»
- `borrow` [rare] — «El borrow checker cuenta quién lee y quién escribe.»

**kit-propiedad-rust** — 2 de 2

- `valor` [rare] — «Un valor tiene una sola dueña.»
- `ámbito` [rare] — «Al acabar el ámbito, el valor se libera.»

**kit-sql-group-by** — 3 de 3

- `GROUP` [acronym] — «GROUP BY junta las filas que repiten ese nombre.»
- `COUNT` [acronym] — «COUNT cuenta cuántas filas cayeron en cada grupo.»
- `valor` [rare] — «Un grupo es una fila nueva por cada valor distinto.»

**kit-sql-join-videojuegos** — 1 de 1

- `JOIN` [acronym] — «JOIN une cada fila con la fila que tiene el mismo id.»

**kit-sql-venn-joins** — 4 de 4

- `INNER` [acronym] — «INNER JOIN deja solo las filas que coinciden.»
- `JOIN` [acronym] — «INNER JOIN deja solo las filas que coinciden.»
- `LEFT` [acronym] — «LEFT JOIN deja todas las de la izquierda.»
- `FULL` [acronym] — «FULL JOIN deja todas las de las dos tablas.»

**plsql-parte-1** — 23 de 23

- `%TYPE` [code] — «Estructura del bloque anónimo y enlace seguro con `%TYPE`.»
- `SQL` [acronym] — «**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.»
- `bloque` [rare] — «Estructura del bloque anónimo y enlace seguro con `%TYPE`.»
- `anónimo` [rare] — «Estructura del bloque anónimo y enlace seguro con `%TYPE`.»
- `TYPE` [acronym] — «Estructura del bloque anónimo y enlace seguro con `%TYPE`.»
- `DML` [acronym] — «Modificación de datos con DML y buffer de sesión.»
- `buffer` [rare] — «Modificación de datos con DML y buffer de sesión.»
- `sesión` [rare] — «Modificación de datos con DML y buffer de sesión.»
- `transaccional` [rare] — «Control transaccional con SAVEPOINT, ROLLBACK parcial y COMMIT.»
- `SAVEPOINT` [acronym] — «Control transaccional con SAVEPOINT, ROLLBACK parcial y COMMIT.»
- `ROLLBACK` [acronym] — «Control transaccional con SAVEPOINT, ROLLBACK parcial y COMMIT.»
- `COMMIT` [acronym] — «Control transaccional con SAVEPOINT, ROLLBACK parcial y COMMIT.»
- `procedural` [rare] — «Un bloque anónimo PL/SQL agrupa lógica procedural y sentencias SQL.»
- `DECLARE` [acronym] — «Consta de tres secciones: DECLARE para variables locales, BEGIN para sentencias ejecutables y EXCEPTION para capturar errores.»
- `BEGIN` [acronym] — «Consta de tres secciones: DECLARE para variables locales, BEGIN para sentencias ejecutables y EXCEPTION para capturar errores.»
- `EXCEPTION` [acronym] — «Consta de tres secciones: DECLARE para variables locales, BEGIN para sentencias ejecutables y EXCEPTION para capturar errores.»
- `bloqueo` [rare] — «Cada fila afectada queda protegida por un bloqueo exclusivo de transacción.»
- `transacción` [rare] — «Cada fila afectada queda protegida por un bloqueo exclusivo de transacción.»
- `tipada` [rare] — «Cómo leerlo: la caja izquierda representa la memoria de sesión con la variable tipada.»
- `marcador` [rare] — «El comando SAVEPOINT establece un marcador con nombre en el segmento de deshacer (Undo).»
- `segmento` [rare] — «El comando SAVEPOINT establece un marcador con nombre en el segmento de deshacer (Undo).»
- `revierte` [rare] — «La sentencia ROLLBACK TO revierte solo las modificaciones posteriores al punto fijado.»
- `revierten` [rare] — «Cada paso siguiente ejecuta una sentencia y resalta qué cambios se conservan y cuáles se revierten.»

**sql-parte-1** — 16 de 18

- `PRIMARY` [code] — «La clave primaria (`PRIMARY KEY`) impone dos reglas simultáneas e inmutables: unicidad estricta y obligatoriedad (`NO...»
- `NO...` [code] — «La clave primaria (`PRIMARY KEY`) impone dos reglas simultáneas e inmutables: unicidad estricta y obligatoriedad (`NO...»
- `SQL` [acronym] — «**Fuente**: Silberschatz, Korth & Sudarshan, *Database System Concepts*, Cap. 2; Oracle Database *SQL Language Refere...»
- `foránea` [rare] — «La clave foránea vincula la tabla dependiente restringiendo sus valores a claves existentes.»
- `tuplas` [rare] — «El motor relacional intercepta y rechaza tuplas huérfanas antes de persistir cambios.»
- `modelo` [rare] — «El modelo relacional organiza la información en tablas bidimensionales compuestas por tuplas y atributos.»
- `bidimensionales` [rare] — «El modelo relacional organiza la información en tablas bidimensionales compuestas por tuplas y atributos.»
- `estruc` [rare] — «Esta estruc...»
- `KEY` [acronym] — «La clave primaria (`PRIMARY KEY`) impone dos reglas simultáneas e inmutables: unicidad estricta y obligatoriedad (`NO...»
- `FOREIGN` [acronym] — «Por su parte, la clave foránea (`FOREIGN KEY`) vincula una tabla dependiente con la tabla maestra correspondiente.»
- `EMPLOYEE` [acronym] — «Cómo leerlo: EMPLOYEE referencia con su clave foránea la clave primaria de la tabla maestra DEPARTMENT.»
- `DEPARTMENT` [acronym] — «Cómo leerlo: EMPLOYEE referencia con su clave foránea la clave primaria de la tabla maestra DEPARTMENT.»
- `huérfana` [rare] — «Si insertamos un empleado con un departamento inexistente, el motor bloquea la fila huérfana.»
- `bloqueo` [rare] — «Cómo leerlo: recorrido de cuatro pasos sobre validación de claves foráneas y bloqueo de tuplas huérfanas.»
- `UNIQUE` [acronym] — «Una columna tiene la restricción UNIQUE.»
- `recall` [rare] — «[full output: rtk recall b8fdb329228a8579]»

**tcp-parte-1-banco** — 13 de 16

- `RFC` [acronym] — «**Fuente**: RFC 9293, sección 3.4 «Establishing a Connection».»
- `segmento` [rare] — «El cliente envía un segmento SYN para solicitar apertura y sincronizar su secuencia.»
- `SYN` [acronym] — «El cliente envía un segmento SYN para solicitar apertura y sincronizar su secuencia.»
- `ESTABLISHED` [acronym] — «El cliente devuelve un ACK y ambos extremos transicionan a ESTABLISHED.»
- `handshake` [rare] — «El handshake de tres vías abre un canal confiable entre dos extremos antes de transferir datos.»
- `videollamada` [rare] — «Un paquete de inicio en una videollamada WebRTC.»
- `socket` [rare] — «La apertura de un socket hacia PostgreSQL.»
- `HTTPS` [acronym] — «Una conexión HTTPS desde un navegador web.»
- `sesión` [rare] — «Una sesión SSH para administración remota.»
- `SSH` [acronym] — «Una sesión SSH para administración remota.»
- `TCP` [acronym] — «Al exigir que cada SYN reciba acuse, TCP verifica que ambos interlocutores están activos.»
- `interlocutores` [rare] — «Al exigir que cada SYN reciba acuse, TCP verifica que ambos interlocutores están activos.»
- `interlocutor` [rare] — «Cada paquete confirma el avance del interlocutor sumando una unidad a su secuencia.»

## 9. Límites de esta medición

- **La extracción de la referencia convierte cada línea en una frase.** La
  referencia escribe una idea por línea y a veces corta con dos puntos
  («Puede salir:»), así que su media de 5,84 palabras por frase está algo inflada
  hacia abajo. Es parte del estilo que el alumno elogia, pero conviene saberlo
  antes de convertir el 8 en una puerta dura.
- **El detector de «explicado» es un proxy.** Exige una frase llana con verbo
  explicativo (`es`, `significa`, `contiene`, `intenta`, `mide`…) o una glosa con
  dos puntos, en la misma frase o la siguiente. No entiende una definición
  perfecta escrita con otros verbos. La distinción que sí captura es real: la
  referencia explica con verbos explicativos y nuestras partes describen con
  verbos de máquina (`ejecuta`, `intercepta`, `fija`, `retiene`, `vincula`).
- **La referencia no llega al 100 %.** Se queda en 57 % por uso: deja sin definir
  `MDP`, `POMDP`, `UCB`, `multi-armed bandits`, `model-based` y `average reward`,
  porque son referencias hacia adelante. El umbral de 50 % sale de ahí, no de un
  ideal.
- **El léxico corriente tiene falsos positivos y falsos negativos.** «compila»,
  «bytes», «hash» o «interlocutores» caen como técnicos por morfología;
  «sesión» y «commit» se fuerzan como técnicos con una lista corta porque la
  frecuencia sola los dejaría pasar. La lista está en `measure.mjs`
  (`TECHNICAL_EXTRA`) y es corta a propósito.
- **`exampleDominance` y `boundWeighted` no separan con este detector.** El
  mecanismo está en la referencia a la vista, pero medirlo bien pide detectar el
  anáfora del ejemplo («el robot», «nuestro robot», «el mismo robot»), no sólo la
  palabra repetida. Queda como trabajo del paso siguiente si se quiere puerta.

## 10. Después de los arreglos (kit, fuentes y motor)

Qué cambió desde la calibración:

- **Las líneas de fuente no son prosa.** `**Fuente**: …`, `Fuente: …` y `### **Fuente**`
  nombran el origen del texto. No se miden ni se citan como términos. Una frase que
  empieza por «Fuente de datos…» sigue siendo prosa.
- **Los 11 ejemplos del kit pasan las seis reglas de registro.** Solo se tocó la prosa:
  términos definidos en negrita con su definición en la línea siguiente, «Antes… Después…»,
  un «Imagina…» antes de la primera definición y frases divididas. `curva-gaussiana` y
  `formula-anotada` solo tenían hallazgos de registro arreglados; sus fallos estructurales
  (ruta, historia, mini-quiz, recorrido de fórmula) ya estaban en HEAD y siguen ahí.
- **Decisión pendiente: el nombre del archivo.** Los niveles se leen de `niveles-alumno.json` en la raíz de Learnings, no de `preferencias.json`: el almacén de la base (`studio/store.test.mjs`) prohíbe escribir ese nombre otra vez, y el archivo heredado no se toca. Si se quiere `preferencias.json`, hay que cambiar ese contrato (un test fuera de esta superficie) y cambiar el nombre en tres sitios: `studio/preferences.ts` (`MIRROR_FILE`), `tools/register/preferencias.mjs` (`PREFERENCIAS`) y `internal/engine/register.go` (`registerPreferences`).
- **El motor y el checador leen los mismos niveles.** Con `sencillez=menos` los dos
  responden igual (`TestEngineAndExplainCheckAgreeOnTheLearnersLevels`).

Cifras después de los cambios (el mismo corpus de §1, separado en dos grupos):

| medida | kit (arreglado, 11 textos) | agy + bench (sin tocar, 10 textos) | referencia (RL) |
|---|---|---|---|
| palabras/frase, media | 7,4 | 10,5 | 5,8 |
| términos explicados, por uso | 99 % | 19 % | 57 % |
| negritas-término por 1000 palabras | 19,2 | 3,2 | 27,0 |
| contrastes por 1000 palabras | 18,7 | 2,7 | 8,5 |
| pasos de cuenta por 1000 palabras | 0,0 | 0,0 | 53,9 |
| Fernández-Huerta (no se hace cumplir) | 86,6 | 68,3 | 51,3 |

Lectura: los agy y el bench siguen del lado que la calibración rechazó, y el kit ya está
del lado de la referencia. Las medidas que separan (términos explicados, negritas,
contrastes) siguen separando a los textos que aún no están arreglados. Dos notas de
honestidad sobre la tabla de §3: su fila «escena antes de definición» usa el indicador
booleano de `measure.mjs`, mientras que la regla que se hace cumplir (`sin-escena-antes`)
mide la parte de definiciones que van después del ejemplo, y el kit pasa esa regla. Y
`plsql-transaccion` queda en 430 de 450 palabras de prosa: el arreglo no añadió más que lo
necesario.

Lo que queda fuera de esta medición: las notas de `content/` del repositorio no se han medido
en este paso, y el bench #246 no se ha vuelto a correr; esa prueba es la que daría la cifra de
aprobación con agentes en marcha.
