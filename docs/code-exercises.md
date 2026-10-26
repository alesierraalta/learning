# Ejercicios de código

Los programas se corrigen ejecutando pruebas de entrada/salida en Docker. La revisión del tutor en el chat complementa ese puntaje.

## Formato del ejercicio

Cada tema contiene `codigo/<id>/ejercicio.json`:

```json
{
  "titulo": "Sumar uno",
  "enunciado": "Lee un entero y escribe el siguiente.",
  "lenguaje": "python",
  "plantilla": "print(int(input()) + 1)\n",
  "parte": "p1",
  "limite_segundos": 2,
  "tests": [
    { "nombre": "ejemplo", "entrada": "1\n", "salida": "2\n" },
    { "nombre": "negativo", "entrada": "-1\n", "salida": "0\n", "oculto": true }
  ]
}
```

`plantilla`, `parte`, `limite_segundos` y `oculto` son opcionales. El límite predeterminado es 2 segundos (máximo 20); se permiten de 1 a 50 pruebas. Cada entrada/salida admite hasta 100 000 caracteres. La comparación normaliza CRLF, espacios al final de cada línea y líneas vacías finales; lo demás debe coincidir exactamente.

## Terminal

Sin compilación ni dependencias, con Node 24:

```sh
node integrations/pi/code-cli.ts --help
node integrations/pi/code-cli.ts --root /ruta/Learnings list
```

El alias del shell `learning code` debe invocar ese archivo. Comandos:

```sh
learning code list [tema]
learning code open tema id
learning code test tema id [archivo]
learning code submit tema id [archivo] --note "Mi duda"
learning code setup [lenguaje...]
```

La raíz se elige por `--root`, después `LEARNINGS_ROOT`, y finalmente `/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings` (la raíz de `aprender` en `.bashrc`). Los temas son sus carpetas directas.

`open` crea `codigo/<id>/mi-solucion.<ext>` desde la plantilla, **sin sobrescribirlo**. Para Java crea `codigo/<id>/mi-solucion/Main.java`, conservando el nombre exigido por la clase pública `Main`. Imprime la ruta absoluta. `test` y `submit` usan ese archivo salvo que se indique otro.

`list` muestra id, título, lenguaje, mejor puntaje y número de entregas. `test` ejecuta solo las pruebas visibles y no guarda nada. `submit` ejecuta todas y guarda `entregas/001.json`, `002.json`, etc., sin sobrescribir intentos, con código, nota, fecha y resultados completos. En la terminal las pruebas ocultas muestran solo nombre y estado. **Después de entregar, dile al tutor en el chat**: la terminal no envía un mensaje automáticamente.

Salidas del proceso: 0 si funcionó y todas las pruebas pasaron; 1 si alguna falló o no compiló; 2 para uso incorrecto, tema/ejercicio desconocido o entorno no disponible. `--help` sale con 0. Si falta una imagen, ejecuta `learning code setup <lenguaje>`. `setup` descarga las imágenes mostrando el progreso y sin repetir imágenes compartidas.

## Agregar un lenguaje

Añade una clave a `integrations/pi/runners.json`:

```json
"python": { "image": "python:3.12-alpine", "file": "main.py", "run": "python3 main.py" }
```

Cada entrada requiere `image`, `file` (nombre simple con extensión) y `run`; `compile` es un comando opcional. Después ejecuta `learning code setup <clave>`. El ejercicio usa esa clave en `lenguaje`: no se modifica código del evaluador.

## Aislamiento

Cada intento usa un contenedor sin red, con raíz de solo lectura, usuario no root, todas las capacidades eliminadas y `no-new-privileges`. Límites: 512 MiB de memoria (sin swap adicional), 1 CPU, 256 procesos, `/tmp` de 64 MiB; archivos limitados mediante `ulimit -f 4096`. Compilación: 60 segundos. Cada prueba tiene su timeout; el contenedor también tiene un plazo global y se elimina al terminar. Código: máximo 100 000 caracteres. La salida mostrada se recorta a 8000 caracteres. Se procesan intentos en serie dentro de cada proceso; no se ejecuta código directamente en el host.

## Vista HTML

- `GET /<token>/<tema>/codigo/<id>`: enunciado, editor, pruebas visibles e historial.
- `POST /<token>/api/code/run`: pruebas visibles (`topic`, `exercise`, `code`), o entrada libre con `input`; no guarda entrega.
- `POST /<token>/submit`: `kind: "code"`, `topic`, `exercise`, `code` y `note` opcional; guarda todas las pruebas y notifica al tutor.

Las rutas usan las comprobaciones de origen del puente. Las entradas y salidas esperadas ocultas nunca se envían a la página; sí quedan en el registro local para la revisión del tutor. Los ejercicios también aparecen en la página del tema y en la parte indicada por `parte`.
