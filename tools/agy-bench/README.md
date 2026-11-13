# agy-bench — el tutor en temas que no tienen ejemplo

Banco de pruebas del issue [#246](https://github.com/alesierraalta/learning/issues/246).

Las pruebas que había hasta ahora son una parte de PL/SQL, un tema cuya forma está
pegada a un ejemplo del kit. Esto mide lo mismo en temas de otros dominios, donde el
tutor no tiene ninguna plantilla que copiar: **Rust borrowing, TCP handshake, Bayes,
Git branching, CSS flexbox**.

El banco no toca producción. Levanta un **segundo estudio** —su propia raíz, su propio
puerto, su propio token y su propio directorio de estado— con el runtime y las reglas de
producción (`agy` + `gemini-3.8-flash-high`, `rules/deep.json`, la skill
`explicacion-interactiva`), y lo maneja por su API HTTP como lo hace
`studio/ui/studio.js`:

1. `POST api/aprender` con el tema en modo Universitario (el tutor inscribe el tema,
   escribe `plan.json` y el diagnóstico).
2. El diagnóstico se responde como lo responde la página: `POST <vista>/submit` en el
   puente del estudio (`kind: "diagnosis"`), que escribe `quiz.answers.json` y entrega el
   mensaje al tutor. Desde #272/#276 el puente dibuja las opciones de cada pregunta en un
   orden por alumno y las renombra A–E, así que la clave del tutor en `quiz.json` ya no es
   la letra que ve la persona. El banco trae el quiz servido de la propia página del
   lector (`<vista>` es el `url` de `api/view?…&part=quiz`; sus preguntas están en el
   bloque `#view-data`, sin claves) y empareja cada clave del tutor con la letra servida
   por el **texto de la opción**. Responde con esa letra, con su razonamiento y
   `confianza: "seguro"`: un alumno competente, para que el tutor no tenga que reenseñar
   lo que ya se sabe. Un tema (Bayes) responde con la opción **E «No sé»** que la página
   ofrece en cada pregunta (última por diseño): el camino del alumno que empieza desde
   cero, no el del que ya sabe.
3. `POST api/metodo` con el método que le toca al tema. La tarjeta de método de la página
   (`studio/ui/studio.js`) ofrece exactamente dos: `pareto` y `preferencias`; no hay
   opción «sorpréndeme» ni «no sé» en esa pregunta, y el motor solo acepta esas dos
   (`studio/server.ts`, `internal/engine/method.go`). El banco los alterna, uno por tema,
   y registra en `results.json` y en el informe cuál se eligió y quién lo eligió (el banco
   o el tutor, si el tutor se adelantó).
4. `POST prompt` pidiendo la Parte 1, con el texto que usa el botón del estudio.
5. Espera a que el turno se asiente **con sus correcciones** (el gate del estudio puede
   pedir hasta dos), y mide la parte escrita con las cuatro puertas.

Lo que se registra por tema: el **método elegido** y su origen, veredicto de las cuatro
puertas, rondas de corrección (cada evento `gate` con `passing: false` del log del
estudio), piezas, actores, **forma de cada figura** (cajas, flechas, actores, piezas por
escena y por paso: dos cajas y una flecha es una forma, y cinco temas dibujados igual es
el defecto que las puertas no ven) y una **huella estructural de la figura principal**
(pieza, piezas usadas, pasos, actores y movimientos por paso), que va en la tabla del
informe para que el esqueleto repetido se lea, no se adivine. Del diagnóstico se guarda
además el emparejamiento **clave del tutor → letra servida**, con el texto de la opción,
para poder auditarlo en `results.json`. También una captura de cada parte en negro × ancho.

| Tema | Método | Diagnóstico |
| --- | --- | --- |
| Rust borrowing | `pareto` | clave del quiz |
| TCP handshake | `preferencias` | clave del quiz |
| Bayes' theorem | `pareto` | «No sé» (E) |
| Git branching | `preferencias` | clave del quiz |
| CSS flexbox | `pareto` | clave del quiz |

Lo medido en la primera corrida está en [`findings.md`](findings.md).

## Dónde corre cada cosa

| Paso | Máquina | Por qué |
| --- | --- | --- |
| `run` | el VPS (`~/learning`, `~/.local/node/bin/node`) | el estudio necesita `bin/learning` (el motor) y el runtime `agy` |
| `shots` | local | renderiza las copias con el lector y saca las capturas |

`run` copia cada tema medido a `<out>/<tema>/vault/<carpeta>/`, así que las capturas se
hacen sin volver a tocar el VPS.

## Cómo se corre

En el VPS (raíz de scratch propia, puerto propio, estado propio):

```bash
# desde la máquina local, una vez:
ssh -x synchub 'mkdir -p /tmp/bench246'
scp tools/agy-bench/bench.mjs synchub:/tmp/bench246/bench.mjs

ssh -x synchub
export PATH=$HOME/.local/node/bin:$HOME/.npm-global/bin:$HOME/.local/bin:$PATH
cd /tmp/bench246
node bench.mjs run \
    --repo "$HOME/learning" \
    --scratch /tmp/bench246/scratch \
    --out /tmp/bench246/out \
    --port 4799 \
    --concurrency 5 \
    --vault "$HOME/Learnings"
```

- `--vault` solo se **lee**: antes y después corre `git --no-optional-locks status --porcelain`
  en el vault real (sin refrescar su índice) y lo anota en el informe, para probar que el banco
  no escribió ahí.
- Los temas corren en paralelo: `--concurrency N` dice cuántos a la vez (5 por defecto; un turno
  puede tardar ~10 min). Cada tema es un proceso (`topic`) con su propio estudio: `run` lo lanza y
  fusiona su resultado en `results.json` y `report.md` al terminar, así que un corte no pierde lo
  que ya terminó. `--topic <id>` corre solo esos temas; `--skip-done false` vuelve a medir los ya
  medidos.
- `--turn-timeout` (segundos, 2700 por defecto) y `--max-turns` (8) acotan un tema que se
  atasque; el tema queda marcado como `stuck` en el informe, no se reintenta a ciegas.

- `run` tiene que correr contra `$HOME/learning`, no contra una copia: el tutor exige que
  `~/.claude/skills/explicacion-interactiva` resuelva al repo que se corre (una copia en `/tmp`
  responde 409 «El tutor no empieza»). Como el despliegue puede mover `main` durante la corrida,
  cada tema guarda `head.start` y `head.end` en `results.json`, y la corrida entera guarda `head`
  (inicio y fin): si cambian, el informe lo dice.
- Las correcciones se cuentan de los informes de tiempo del estudio (`engine-correction` y
  `part-correction`, que no pasan por el log). `gateFailures` cuenta las puertas que fallaron en
  el log: el último fallo de un presupuesto gastado no es una corrección, es el alto que sigue.

Después, en local, las capturas:

```bash
PLAYWRIGHT_MODULE=/home/ale/.npm-global/lib/node_modules/playwright/index.mjs \
  node tools/agy-bench/bench.mjs shots \
    --repo . --out /tmp/bench246/out --shots /tmp/bench-shots
```

`shots` copia los temas a `/tmp/bench-shots/vault/`, levanta el puente del lector sobre
esa copia y abre cada parte con `?theme=black` y el modo ancho activado
(`.reading-toggle`), a 1440 px y escala 2: una captura a página completa y una por cada pieza
(`lk-story`, `lk-cards`, `lk-venn`…), en el mismo modo.

Para volver a pasar las puertas, medir la forma de las figuras y el registro sobre las copias,
sin runtime:

```bash
node tools/agy-bench/bench.mjs gates --repo . --out /tmp/bench246/out
```

## Aislamiento por tema

Un tema no comparte nada con otro de la misma corrida. Cada uno tiene su proceso y su estudio:

| Qué | Dónde (`<scratch>` es `--scratch`, `<id>` el tema) |
| --- | --- |
| Puerto | `--port` más la posición del tema en la lista (4799, 4800…); el 4747 y el 4748 se rechazan |
| Raíz del estudio | `<scratch>/<id>/root` |
| Estado del estudio | `<scratch>/<id>/state` (`opened.json`, `chats.json`, `page-timings/`) |
| Estado de los procesos | `XDG_STATE_HOME=<scratch>/<id>/xdg-state` y `XDG_CACHE_HOME=<scratch>/<id>/xdg-cache`: el motor y el runtime `agy` heredan esas variables |
| Token | derivado del id del tema (sha256, 64 hex): repetir la corrida reusa el mismo origen |

`topic` se niega a correr si su `XDG_STATE_HOME` o su `XDG_CACHE_HOME` no están dentro de su carpeta
de prueba, así que el estado de `learning-studio` no se toca. Lo que el runtime escriba fuera de XDG
(por ejemplo bajo `$HOME`) no se aísla: es un límite conocido.

`report.md` tiene una sección «Aislamiento»: puerto, raíz, estado, token, HEAD y duración de cada
tema, y si los puertos y las raíces son distintos entre sí.

## Salidas

```text
<out>/results.json          todo lo medido, por tema y por turno (incluye la forma de las figuras)
<out>/<tema>-result.json   el resultado de un tema (lo escribe su proceso `topic`; `run` lo fusiona)
<out>/report.md             la tabla del issue (método elegido y huella de la figura principal) + lo que dijo el motor en cada turno
<out>/<tema>-studio.log     el log del estudio: eventos SSE + líneas `estudio:` (JSONL)
<out>/<tema>/vault/<carpeta>  copia del tema medido (plan, quiz, partes, mini-quiz)
<out>/<tema>-timings/      informes de tiempo del estudio: cada llamada al modelo y su motivo
<shots>/<tema>-<parte>-black-wide.png                  página completa
<shots>/<tema>-<parte>-<pieza>-<n>-black-wide.png        una captura por pieza
```

## Qué NO hace

- No escribe en `~/Learnings`, no toca el servicio `learning-studio` ni
  `learning-autodeploy`, no lee `~/.config/learning-studio.env`.
- No usa el puerto 4747/4748 de producción: el estudio de prueba escucha en `--port`
  (`--port` más la posición del tema: 4799, 4800…) y el puente del lector en un puerto libre.
- No copia `preferencias.json` ni `preferencias.md` del alumno: el tutor arranca con las
  preferencias por defecto. Es una diferencia conocida con producción y se anota como
  tal en el informe.
- No comparte estado entre temas: ver «Aislamiento por tema» para lo que queda aislado y lo que no.
