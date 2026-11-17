# Ejercicios de código corregidos (Learnings)

Para temas de programación (laboratorios, algoritmos, estructuras de datos, cualquier lenguaje), los ejercicios prácticos de código se escriben como **ejercicios evaluables**: la persona escribe el programa en la vista HTML (o en su editor desde la terminal) y la app lo **ejecuta contra pruebas** en un contenedor aislado. La corrección objetiva sale de ejecutar el código; la revisión del tutor viene después y nunca la sustituye.

## Dónde viven

```
<tema>/codigo/<id>/ejercicio.json        ← lo escribe el tutor
<tema>/codigo/<id>/entregas/001.json     ← las escribe la app en cada entrega (nunca se reescriben)
```

`<id>`: kebab-case corto, ordenable (`p2-suma-pares`, `lab2-matriz-transpuesta`).

## Formato de `ejercicio.json`

```json
{
  "titulo": "Suma de pares",
  "enunciado": "Lee un entero `n` y luego `n` enteros. Escribe la suma de los pares.\n\n**Entrada:** ...\n**Salida:** ...",
  "lenguaje": "c",
  "plantilla": "#include <stdio.h>\n\nint main(void) {\n    // tu código\n    return 0;\n}\n",
  "parte": "p2",
  "limite_segundos": 2,
  "tests": [
    { "nombre": "ejemplo del enunciado", "entrada": "4\n1 2 3 4\n", "salida": "6\n" },
    { "nombre": "sin pares", "entrada": "3\n1 3 5\n", "salida": "0\n" },
    { "nombre": "negativos y cero", "entrada": "3\n-2 0 7\n", "salida": "-2\n", "oculto": true },
    { "nombre": "n = 0", "entrada": "0\n", "salida": "0\n", "oculto": true }
  ]
}
```

- `lenguaje`: una clave del catálogo fusionado. Los defaults del repo son `python`, `c`, `cpp`, `java`, `javascript`, `sqlite` (alias `sql-sqlite`), `postgres`, `mongodb` y `plsql`; la máquina puede añadir otros en `~/.config/learning/runners.json` (o `$XDG_CONFIG_HOME`, o `$LEARNING_RUNNERS`) y el tema puede añadir los suyos en `<tema>/runners.json`, junto a `plan.json`. **Antes de escribir un ejercicio, mira la lista `runnable` que devuelve `learning_view` y prefiere un lenguaje que corra aquí**; si el tema necesita otro, decláralo en el `runners.json` del tema y di al alumno la línea `docker pull <imagen>` que muestra el lector. La sonda da tres estados: `present`, `missing` y `unknown` (daemon inaccesible, CLI ausente o timeout); solo `present` aparece en `runnable` y `unknown` se lee «no se pudo comprobar», con tamaño y la pista de instalación, pero sin decir «disponible» ni ofrecer descarga (#350). Java: la clase pública se llama `Main` (archivo `Main.java`).
- Añadir un lenguaje es **una sola entrada**: `{ "image", "file", "run", "compile?", "setup?", "entrypoint?", "size?" }`. La entrada siempre nombra una imagen Docker; `image: "host"`, una imagen vacía o un comando `sudo`/`docker run` se rechazan con un aviso y se ignoran, porque ningún lenguaje se ejecuta en el host. Una entrada malformada en una capa eventual se informa en `warnings` y no rompe la página. La capa del tema puede añadir un lenguaje, pero no cambiar uno ya declarado.
- `plsql` usa `main.sql` y el comando `sqlplus` configurado contra una imagen Oracle XE (`gvenzl/oracle-xe:21-slim` por defecto, ~755 MB). La imagen **no hace falta en el arranque**: se instala sólo en la máquina donde se quiera ejecutar PL/SQL (exige aceptar la licencia de Oracle). No hay un `plsql-lite` con SQLite: ejecutar sólo el subconjunto DML calificaría mal bloques anónimos, excepciones y `DBMS_OUTPUT` sin que se note. Si el tema enseña algo que no se puede ejecutar aquí, prefiere un ejercicio de predecir, trazar o explicar código, o un lenguaje con ejecutor disponible (#344).
- Para SQL con base de datos real: `sqlite`/`sql-sqlite` (`main.sql`, imagen de ~30 MB) y `postgres` (`main.sql`, servidor iniciado en `/tmp`, ~116 MB) ejecutan sentencias; `mongodb` (`main.js` para `mongosh`, ~320 MB) ejecuta documentos. Un `setup` opcional del runner prepara la base dentro del contenedor; el tutor escribe la semilla como `setupFile` junto al ejercicio y la app la copia a `.judge/seed`. La salida del setup no aparece si todo va bien; si falla, el panel explica el error, `total` es 0 y la entrega se guarda igual.
- ¿Neo4j? No es default: la imagen oficial pesa ~392 MB comprimida (>1 GB descomprimida) y el servidor JVM pide más memoria que el límite de 512 MB del juez; si una máquina lo tiene, decláralo en su capa correspondiente.
- Las pruebas son de **entrada estándar → salida estándar**, como en los jueces en línea. Se ignoran los espacios al final de línea, las líneas vacías del final y CRLF; todo lo demás debe coincidir exacto, así que el enunciado fija el formato de salida con un ejemplo.
- `parte` (opcional) enlaza el ejercicio a una parte del plan: aparece en la página de esa parte y en su mini-quiz, encima de una caja de respuesta numerada; un ejercicio de una parte siempre lleva su `enunciado`.

## Cómo diseñar las pruebas

1. **Calcula cada `salida` ejecutando una solución de referencia**, nunca de memoria: escribe la solución, córrela con `learning code test` y copia lo que imprime. Un ejercicio con una salida esperada mal calculada no se publica.
2. Mínimo: el ejemplo del enunciado (visible), un caso normal (visible), y ocultos para los bordes: vacío / `n = 0`, un solo elemento, negativos, máximos del enunciado, repetidos.
3. Las **ocultas** existen para que no se programe "para la prueba": la página solo muestra su nombre y si pasó. Nombrarlas por lo que comprueban ("negativos y cero").
4. Para el laboratorio: un ejercicio por habilidad evaluable, de fácil a difícil; el umbral de la parte sigue siendo el 60 %.

## Cómo se los das a la persona

Tras escribir el ejercicio, llama a `learning_view` con `part: "codigo/<id>"` y da la URL. Desde la terminal también puede:

```
learning code list <tema>
learning code open <tema> <id>      # crea su archivo de solución desde la plantilla
learning code test <tema> <id>      # pruebas visibles
learning code submit <tema> <id>    # todas las pruebas, guarda la entrega
```

## Cuando llega una entrega

Un mensaje `[Vista HTML · <tema> · código <id>]` es la entrega: el archivo `entregas/NNN.json` que nombra ya está guardado, con el código, la nota de la persona y el resultado de **todas** las pruebas (ocultas incluidas). Una entrega hecha desde la terminal no llega al chat: si la persona dice que entregó, lee el último `entregas/NNN.json`.

1. **Lo objetivo primero**: puntaje de pruebas, error de compilación, tiempo excedido. No contradigas a las pruebas: si fallan, el programa está mal aunque "se vea bien". Si la entrega dice `Resultado: sin ejecución` y trae «No se puede ejecutar aquí: …», **no hay puntaje**: no digas que aprobó ni que falló. El enunciado, el código y la nota sí llegaron: corrige con la lectura y pide, si hace falta, una ejecución en una máquina con ese entorno (#344).
2. **Diagnostica la causa** de cada prueba fallida (borde no contemplado, formato de salida, desbordamiento, índice fuera de rango), sin darle el código corregido entero: una pista concreta y la línea donde mirar.
3. **Revisión de tutor**: enfoque (¿la idea es correcta y razonable en complejidad?), legibilidad (nombres, funciones, duplicación), errores típicos del lenguaje (memoria en C, `Scanner` en Java, enteros en Python…).
4. **Inyecta la corrección** en la nota de la parte (o en `ejercicios.md`) con el callout de siempre: `> [!success]- Ejercicio <id> — corrección (Pruebas: a/b)` con su código, las pruebas que fallaron y por qué, y la revisión.
5. Si no aprobó, invita a otra entrega: cada intento queda guardado y el historial se ve en la página.
