# Modo audio — validar, explicar, validar

## Cuándo aplica

- El estudio entrega `[Modo de estudio: audio — …]` en el prompt: el modo ya está decidido. No preguntes por él, no ofrezcas otros modos y no abras un diálogo para elegirlos.
- Aplica también cuando la persona pide estudiar sin leer, con audios breves y respuestas dichas en voz alta. Da por hecho el recorte a lo que más importa para el examen; no pidas que lo confirmen.
- Este modo queda fuera del motor: no llames a `learning_stage`, no escribas `plan.json` ni stages, y no escribas una nota ni prosa de explicación en el chat ni en archivos. Solo `sesion.json`, `veredictos.json`, los JSON de spec y las cápsulas.
- Si hay fuentes subidas, léelas todas antes de recortar: en un PDF, el `.txt` como apoyo y cada PNG de página como imagen. Toma los conceptos de ahí, nunca de memoria. No copies los archivos ni los pases al motor.

## Cortar el tema en bloques

- Parte el tema o las fuentes en los **1 a 6 bloques** que más rinden para el examen: lo que se pregunta, lo que permite resolver otras preguntas y sus prerrequisitos. Fuera quedan la anécdota, el contexto que no se evalúa y el relleno. Recorta cobertura, no precisión.
- Cada bloque lleva **1 a 4 conceptos** y **1 a 3 preguntas abiertas de apertura**; apunta a **dos por bloque**. Cada pregunta se puede responder en voz alta en menos de un minuto, no se resuelve con sí/no y no nombra el concepto que quiere evocar.
- Escribe `audios/<sesion>/sesion.json`, donde `<sesion>` es un id único con la misma regla de los demás ids (minúsculas, dígitos y guiones, por ejemplo `admin-proyectos`); una carpeta con otro nombre no es una sesión:

```json
{
  "titulo": "Administración de proyectos",
  "bloques": [
    {
      "id": "b1",
      "titulo": "Ruta crítica",
      "conceptos": [{ "codigo": "ruta-critica", "nombre": "Ruta crítica" }],
      "preguntas": [{ "id": "b1-p1", "enunciado": "¿Qué pasa si se retrasa una tarea de la ruta crítica?", "conceptos": ["ruta-critica"] }],
      "consigna": "Explica qué es la ruta crítica y para qué sirve."
    }
  ]
}
```

- Los ids y códigos siguen `^[a-z0-9][a-z0-9-]{0,39}$` y son únicos en toda la sesión. Los `conceptos` de cada pregunta son un subconjunto no vacío de los códigos del bloque, y cada concepto del bloque aparece en al menos una pregunta. La `consigna` es la instrucción breve para explicar el bloque en voz alta, no texto de estudio.
- Si una sesión rompe una de estas reglas o los límites de bloques, conceptos o preguntas, la página la rechaza con un mensaje que nombra la regla: corrige el archivo antes de continuar. Nunca escribas `respuestas.json`: es del puente.

## Cuando la página entrega las respuestas de apertura

- La entrega `[Vista HTML · audios · <sesion> · preguntas]` llega después de que la página guardara `respuestas.json` con `previas: {"<preguntaId>": "<text>"}`. Lee las respuestas y decide, por cada concepto con respuesta no vacía, si quedó `claro`, `dudoso` o `laguna` según lo que la persona dijo en las preguntas de ese bloque.
- Escribe `audios/<sesion>/veredictos.json`:

```json
{
  "previas": [{ "bloque": "b1", "codigo": "ruta-critica", "estado": "claro", "evidencia": "porque si se retrasa esa tarea se retrasa todo el proyecto" }],
  "explicaciones": []
}
```

- `evidencia` es una cita **literal** de lo que la persona respondió a las preguntas de ese bloque, no un resumen ni una frase inventada. La página normaliza solo los espacios en blanco; un veredicto cuya cita no aparezca literalmente se descarta y el concepto queda sin juzgar. No escribas veredictos para conceptos cuyas preguntas quedaron todas vacías: esos conceptos son `laguna` sin veredicto del tutor.
- Después de los veredictos, produce una cápsula para **cada bloque que no haya quedado con todos sus conceptos `claro`**. Un bloque totalmente `claro` se salta y no lleva cápsula.

## Cápsulas

- Usa la skill `learnings-audio` en su perfil de cápsula: `audios/<sesion>/<bloque>.m4a` con `audios/<sesion>/<bloque>.srt` al lado. Escribe la spec en `tools/audio/specs/audio-<sesion>-<bloque>.json` con `"capsule": true`, el id del bloque en `part` y el id de la sesión en `topic`; `minutes` vale de 5 a 8 (6 por defecto).
- Cada cápsula dura de 5 a 8 minutos y lleva **un capítulo por concepto**, en el mismo orden de `sesion.json`. Cada afirmación, número y ejemplo sale de las fuentes de la sesión; una fuente delgada da una cápsula más corta, nunca relleno general. No escribas la transcripción en el chat ni en el vault como texto de lectura.

## Cuando la página entrega una explicación

- La entrega `[Vista HTML · audios · <sesion> · explicación · <bloque>]` llega con `respuestas.json` actualizado: `explicaciones: {"<bloqueId>": "<text>"}` contiene lo que la persona dijo en voz alta sobre ese bloque. No se lo pidas dos veces ni expliques tú el bloque otra vez.
- Añade un veredicto por concepto de ese bloque a `explicaciones` en `veredictos.json`, con `bloque`, `codigo`, `estado` (`claro`, `dudoso` o `laguna`), `evidencia` citada literalmente de la explicación guardada y `correccion` de **dos o tres líneas** que diga qué faltó o qué estuvo mal.
- Todos los conceptos del bloque llevan veredicto, también los que la persona no mencionó: ese concepto es `laguna`, su `evidencia` es el fragmento de la explicación donde debía aparecer y la `correccion` dice qué faltó. Sin ese veredicto el bloque nunca se completa.
- La misma regla de cita literal manda: si la `evidencia` no está en las palabras guardadas del bloque, la página descarta el veredicto y el concepto sigue sin juzgar. Cuando la página señala que el bloque quedó completo, termina el turno sin prosa de lectura.

Escribe siempre en español neutro, sin voseo ni giros regionales.
