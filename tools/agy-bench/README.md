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
   mensaje al tutor. La opción elegida es la clave del propio `quiz.json`, con su
   razonamiento y `confianza: "seguro"`: un alumno competente, para que el tutor no tenga
   que reenseñar lo que ya se sabe.
3. `POST api/metodo` con `pareto` cuando el motor pide el método.
4. `POST prompt` pidiendo la Parte 1, con el texto que usa el botón del estudio.
5. Espera a que el turno se asiente **con sus correcciones** (el gate del estudio puede
   pedir hasta dos), y mide la parte escrita con las cuatro puertas.

Lo que se registra por tema: veredicto de las cuatro puertas, rondas de corrección
(cada evento `gate` con `passing: false` del log del estudio), piezas, actores y **forma de
cada figura** (cajas, flechas, actores, piezas por escena y por paso: dos cajas y una
flecha es una forma, y cinco temas dibujados igual es el defecto que las puertas no ven),
y una captura de cada parte en negro × ancho.

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
XDG_STATE_HOME=/tmp/bench246/state XDG_CACHE_HOME=/tmp/bench246/cache \
  node bench.mjs run \
    --repo "$HOME/learning" \
    --scratch /tmp/bench246/scratch \
    --out /tmp/bench246/out \
    --port 4799 \
    --vault "$HOME/Learnings"
```

- `--vault` solo se **lee**: antes y después corre `git --no-optional-locks status --porcelain`
  en el vault real (sin refrescar su índice) y lo anota en el informe, para probar que el banco
  no escribió ahí.
- Los temas van en serie (un turno puede tardar ~10 min). `--topic <id>` corre uno solo y
  `--skip-done false` vuelve a medir los ya medidos; `results.json` se escribe después de
  cada tema, así que un corte no pierde lo anterior.
- `--turn-timeout` (segundos, 2700 por defecto) y `--max-turns` (8) acotan un tema que se
  atasque; el tema queda marcado como `stuck` en el informe, no se reintenta a ciegas.

- `run` tiene que correr contra `$HOME/learning`, no contra una copia: el tutor exige que
  `~/.claude/skills/explicacion-interactiva` resuelva al repo que se corre (una copia en `/tmp`
  responde 409 «El tutor no empieza»). Como el despliegue puede mover `main` durante la corrida,
  cada tema guarda `head.start` y `head.end` en `results.json`: si cambian, el informe lo dice.
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

## Salidas

```text
<out>/results.json          todo lo medido, por tema y por turno (incluye la forma de las figuras)
<out>/report.md             la tabla del issue + lo que dijo el motor en cada turno
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
  (4799) y el puente del lector en un puerto libre.
- No copia `preferencias.json` ni `preferencias.md` del alumno: el tutor arranca con las
  preferencias por defecto. Es una diferencia conocida con producción y se anota como
  tal en el informe.
