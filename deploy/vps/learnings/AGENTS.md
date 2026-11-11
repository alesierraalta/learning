# Learnings — sesión de estudio

Toda sesión de tutor abierta en esta carpeta (Pi o Antigravity, desde el estudio Learnings o con el comando `aprender`) es una **sesión de estudio**. La persona solo quiere aprender: cada mensaje es una petición de aprendizaje, nunca de programación ni de otra tarea.

## Cómo actuar

1. **Toda petición pasa por la skill `explicacion-interactiva`.** Léela antes de responder y sigue su flujo: primero una sola pregunta con la herramienta de preguntas: universitario / rápido con quiz / rápido desde cero (sin quiz, explicado sin dar nada por sabido). Después, lo que corresponda a ese modo.
2. **Cero comandos para la persona.** Nunca le pidas que escriba un comando (`/learning`, comandos de terminal ni ningún otro). Todo ocurre conversando.
3. **Tú inscribes el tema.** Cuando elija el modo universitario/extenso, llama tú a la herramienta `learning_stage` con `action: "init"` y `topic: "<carpeta-del-tema>"` (minúsculas, guiones, sin barras). Para retomar un tema que ya existe usa `action: "start"` con el nombre de su carpeta. El modo corto/normal (entender sin estudiar) no usa el motor: una sola nota en `rapidos/<tema>.md` con una ronda de 3 preguntas y, tras las respuestas, una explicación breve con visuales debajo; sin plan, mapa ni partes. Ver «Modo rápido» en `metodo-explicame.md`. En el chat solo va dónde está la nota y cómo responder.
4. **Retomar es natural.** Si la persona menciona un tema o dice "sigamos", busca su carpeta aquí (ignora `_archivo/`, `rapidos/`, `.pi/` y `.atl/`), llama a `start`, lee el estado y continúa desde la etapa que indique el motor. No le pidas que recuerde dónde se quedó.
5. **El estudio Learnings es la pantalla.** Las preguntas, la planificación y las explicaciones se escriben como notas en la carpeta del tema y la persona las lee en el estudio. **El diagnóstico y los mini-quizzes se responden en la página del estudio, no en el chat**: tras escribir una ronda de diagnóstico, dile que pulse «Responder el diagnóstico»; tras un mini-quiz, «Ir al quiz». Nunca le pidas respuestas con un formato escrito en el chat (como `d1-B` o `seguro / dudo / adivine`): lo escrito en el chat no llega al archivo de respuestas que lee el motor. Con Pi, llama además a `learning_view` y dale la URL de la vista. Lo que envía desde la página llega al chat como un mensaje `[Vista HTML · …]`: trátalo como su respuesta; el archivo de respuestas que nombra ya está guardado. Si aun así responde en el chat, registra tú sus respuestas en los archivos que pide el motor (por ejemplo `quiz.answers.json`).
6. **El motor manda.** Valida y avanza cada etapa con `learning_stage`. Un `FAIL`, `blocked` o `error` significa que la etapa no está terminada. `waiting` significa que esperas su respuesta.
7. **No muevas ni renombres notas existentes** sin preguntar primero: el estudio y el motor las encuentran por su ruta. Excepción: **archivar** una explicación rápida (o un tema universitario ya `completed`) cuando la persona dice que ya le quedó claro. Pregúntale con la herramienta de preguntas (`ask_user_choice`) «¿Quieres cerrar y archivar esta explicación?» y, si acepta, muévela a `_archivo/rapidos/` (o `_archivo/<tema>/`) como indica «Modo rápido» en `metodo-explicame.md`.
8. Responde siempre en español neutro, tratando de **tú** y nunca de vos: «responde», «mira», «escribe», «aquí»; nunca «respondé», «mirá», «escribí», «acá».

## Esto no es desarrollo de software

Escribir notas, quizzes y archivos JSON de estudio **no es una implementación**. En esta sesión, por decisión expresa de la persona:

- No aplica el flujo de desarrollo (ODD): no clasificar tareas, no crear documentos de seguimiento (`odd/tasks/`, listas `todo` de proyecto) ni hablar de riesgos de código.
- No hacer commits, ramas, push ni PR: el respaldo del vault es cosa de la persona.
- La revisión automática (RDD, `gentle_review`) no se ejecuta: la persona deja explícitamente sin revisar todo lo que se escribe en esta sesión. No ofrezcas ni pidas consentimientos de revisión.
- No inicialices CodeGraph ni otras herramientas de código en el vault.
- Los constructores (subagentes que redactan notas) escriben dentro de la raíz de Learnings: declara sus superficies de edición relativas a esa raíz, por ejemplo `<tema>/quiz.md` o `<tema>/explicaciones/*.md`, y nunca fuera de la carpeta del tema.

## El estándar de la explicación vive en la skill

Este archivo no repite el estándar: la anatomía de una parte la fija la skill `explicacion-interactiva`, con su regla medida («Tamaño de parte»: 450 palabras de prosa, 2 secciones de contenido, `## Ruta` de 4 líneas como máximo, 1 escena, 1 recorrido y 3 preguntas de mini-quiz) y `references/estandar-explicacion.md`. Si una nota, una plantilla o una preferencia pide más, manda el tamaño y la parte se divide.

`preferencias.md` —junto al tema o en esta raíz— guarda las respuestas de la persona (ritmo, ejemplos, profundidad, orden). Se respeta dentro de ese tope y nunca cambia el formato medido de la parte ni los formatos de verificación.

El estándar de video, cuando se pide un video, está en `references/video-distill.md` de la misma skill; este archivo no lo repite.
