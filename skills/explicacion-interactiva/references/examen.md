# Modo examen — preparar el examen con el 20% vital

## Activación y fuente

- El modo examen usa el flujo profundo de Learnings y conserva el universitario tal cual; añade Pareto obligatorio, un formato de evaluación y un simulacro final del mismo formato.
- La fuente puede ser un tema o un bloque largo pegado: temario, apuntes o texto extraído de diapositivas. No exijas que se reduzca a un título ni que se vuelva a resumir. Lee el material, identifica los conceptos y objetivos evaluables, y deriva de ahí el mapa y el plan. El motor recibe los campos de `init`, no el texto fuente.
- Basa las afirmaciones sobre qué entra en el examen en el temario, indicaciones docentes y exámenes anteriores cuando existan. Si esos datos no demuestran que algo «siempre aparece», no lo afirmes como hecho: separa lo explícito de lo probable.

## Preguntas de la FASE 0a

Recoge en la misma llamada y el mismo lote:

1. Formato: **oral / escrito / práctico**.
2. Si es práctico, tipo de práctica: **laboratorios / construir una aplicación / ejercicios / otro**. Si elige «otro», registra cuál.

En este modo Pareto ya está elegido: no preguntes si quiere recortar el contenido ni vuelvas a pedir el alcance. El texto fuente puede pegarse como parte de la petición y no requiere otra pregunta.

## Selección del 20% vital para el examen

Aplica el criterio general de `pareto.md` y selecciona el núcleo con mayor rendimiento **para ese formato de examen**, guiándote por:

1. Los objetivos, temas y tipos de pregunta que el temario o la persona docente señalan como evaluables; prioriza patrones que se repiten en exámenes anteriores si se proporcionan.
2. Los conceptos centrales y sus prerrequisitos: lo que permite resolver o explicar varias preguntas y cuyo desconocimiento causa errores importantes.
3. La forma de evaluación elegida: prioriza lo que la persona tendrá que recuperar, explicar, calcular o hacer durante ese examen.

No confundas Pareto con resumir todo. En `plan.json`, declara el criterio en `pareto.criterio` y nombra concretamente lo excluido en `pareto.descartado`. Recorta la cobertura, no la precisión, las claves de respuesta, el diagnóstico ni la comprobación de que se entendió. Conserva los límites generales del scope pareto y el bloque `## El 20% que rinde el 80%` de cada parte.

## Diagnóstico previo

Mantén el diagnóstico previo del flujo profundo: va antes de explicar y mide qué sabe ya la persona en los conceptos del plan. Usa las rondas, el razonamiento, la confianza, los veredictos por concepto y `diagnosis-sufficiency` de `SKILL.md` y `learning-validation.md`. El formato del examen no sustituye ni recorta ese diagnóstico; el simulacro final es una evaluación distinta y va al cierre.

## Plan según el formato

El plan y cada parte deben preparar para responder o actuar en el examen concreto:

- **Oral**: prioriza el porqué y el cómo, mecanismos, relaciones y distinciones que la persona pueda explicar en voz alta con sus propias palabras. Usa pocas fórmulas; incluye una solo cuando sea necesaria para sostener la explicación.
- **Escrito**: prioriza definiciones precisas, fórmulas y notación, distinciones evaluables y ejercicios típicos resueltos paso a paso.
- **Práctico**: organiza un plan de práctica del tipo elegido. Para laboratorios, secuencia prácticas con resultados comprobables; para construir una aplicación, propone un mini proyecto por entregas; para ejercicios, ordena problemas por habilidad; para «otro», concreta el trabajo. Cada práctica o proyecto debe dejar entregables verificables, no solo una explicación teórica.

Cada parte declara, en su campo `examen`, qué capacidad aporta para aprobar ese formato. La descripción debe tener al menos `minPartChars` caracteres según el contrato del motor; no uses una frase genérica repetida en todas las partes.

## Contrato del motor

### Inicio

Si el prompt incluye `[Modo de estudio: examen — ya decidido en el estudio, con formato ...]`, el estudio ya decidió el modo y el formato: no vuelvas a preguntarlos. Pasa `exam` y, si aparece, `practice` a `learning_stage` `init` exactamente con los valores que trae el prompt, sin traducirlos ni normalizarlos. Si el formato ya viene decidido como práctico pero el prompt no trae el tipo de práctica, pregunta solo ese tipo antes de `init`; nunca lo elijas por defecto. Si el prompt no trae un formato decidido (por ejemplo, un chat fuera del estudio), es obligatorio preguntar el formato antes de `init`; si es práctico, pregunta también el tipo de práctica. Nunca elijas un formato o tipo de práctica por defecto.

En el modo examen, la llamada `learning_stage` de `init` lleva siempre `scope: "pareto"` y `exam` con el formato del motor: `oral`, `written` o `practical`. Mapea la opción visible **escrito** a `written` y **práctico** a `practical` cuando la respuesta se recoge en la conversación; los valores ya suministrados por el estudio se pasan exactamente como aparecen. Solo si el formato es práctico añade `practice` con el tipo elegido; si no, omítelo. No vuelvas a pasar estos campos en etapas posteriores.

Ejemplo para un práctico de aplicación:

```json
{
  "action": "init",
  "topic": "<nombre-de-carpeta>",
  "scope": "pareto",
  "exam": "practical",
  "practice": "construir una aplicación"
}
```

### Plan

En `plan.json`, tanto en `preparation` como en `planning`, conserva el formato del run en `examen.formato`; añade `examen.practica` solo para un práctico:

```json
{
  "examen": {
    "formato": "practical",
    "practica": "construir una aplicación"
  },
  "parts": [
    {
      "id": "p1",
      "title": "<concepto evaluable>",
      "slug": "<slug>",
      "subtema": "<código>",
      "examplesPlanned": true,
      "visualsPlanned": true,
      "examen": "Esta parte practica la capacidad que se evaluará en la entrega de la aplicación."
    }
  ]
}
```

`examen.formato` debe coincidir con el formato registrado por el run; `examen.practica`, si existe, con el tipo enviado en `init`. Cada parte lleva su propia justificación `examen`. El motor valida el plan con `exam-plan` en `preparation` y otra vez en `planning`; no avances si queda bloqueado.

### Simulacro final

El `cuestionario-final.json` es el simulacro: su `formato` debe ser igual al formato del run.

- **Oral**: incluye como mínimo tantas preguntas abiertas como preguntas de opción múltiple.
- **Escrito**: conserva la mezcla actual de preguntas.
- **Práctico**: incluye al menos una pregunta con `"tipo": "practica"` y un campo `"entregable"` no vacío que describa qué debe producir la persona.

El motor comprueba este contrato con `exam-mock` en `final_quiz`. Corrige el artefacto ante un `FAIL`; no lo sustituyas por preguntas conversacionales ni declares aprobado un simulacro que no corresponde al formato.
