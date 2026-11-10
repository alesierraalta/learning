# Pareto — entender lo máximo con el mínimo esfuerzo

La ley de Pareto aplicada a una explicación: el 20% del contenido que rinde el 80% del resultado. No es «explicar menos»: es **elegir el 20% correcto y declarar qué queda fuera**. Una explicación corta sin criterio no es Pareto, es incompleta.

## Cuándo se pregunta

Siempre, en la **misma llamada** de la FASE 0a que el modo, antes de investigar, escribir o crear carpeta. Dos preguntas en una llamada:

1. **Modo**: universitario / rápido con quiz / rápido desde cero.
2. **Pareto**: «¿Aprendemos con la ley de Pareto? Te explico solo el 20% del contenido que rinde el 80% del resultado — entender lo máximo con el mínimo esfuerzo.» Opciones: **sí, solo lo vital (Pareto)** · **no, el tema completo**.

Si la persona ya lo pidió por su cuenta («solo lo esencial», «lo mínimo para usarlo», «Pareto»), no se vuelve a preguntar: se registra como sí. Si la respuesta llega ambigua, se asume **completo** y se sigue; nunca se recorta sin permiso.

## Cómo se elige el 20%

Tres criterios, en este orden, y el resultado se escribe en una o dos frases (es el `pareto.criterio` del plan, mínimo 24 caracteres):

1. **Frecuencia real de uso**: qué se usa casi todos los días en el trabajo o en el examen.
2. **Poder explicativo**: qué concepto, entendido, desbloquea la mayor cantidad de los demás.
3. **Costo de no saberlo**: qué error caro evita.

Lo que no entra por ninguno de los tres va a `pareto.descartado`, con nombre concreto («historia del estándar», «casos borde de exportación»), no con un «etc.» o un «otros».

## Qué se recorta y qué nunca

| Se recorta | Nunca se recorta |
|---|---|
| Número de partes: **máximo 4** | El quiz, sus claves y la calidad de la pregunta |
| Palabras por parte: **máximo 1600** | El diagnóstico y sus veredictos por concepto |
| Temas secundarios, historia, casos borde, ampliaciones | El vuelco (explicar con tus palabras) |
| Ejemplos de adorno: uno que pruebe vale más que tres que ilustren | La bibliografía y la precisión técnica |
| | El bloque `## El 20% que rinde el 80%` de cada parte |

Regla de oro: **se recorta la cobertura, nunca la prueba de que se entendió**. Un quiz recortado mide menos y el motor lo bloquea.

## En Learnings (modo universitario)

1. `learning_stage` `action: "init"`, `topic: "<carpeta>"`, **`scope: "pareto"`**. El scope se fija al iniciar; un tema en marcha no cambia de scope.
2. En `plan.json` (etapa `preparation` y otra vez en `planning`, porque planning reescribe el archivo):

```json
{
  "topic": "…",
  "parts": [
    { "id": "p1", "title": "…", "slug": "…", "subtema": "…",
      "examplesPlanned": true, "visualsPlanned": true,
      "pareto": "la capacidad que esta parte compra hacia el 80%" }
  ],
  "pareto": {
    "criterio": "por qué estos conceptos son el 20% que rinde el 80%",
    "descartado": ["contenido concreto que queda fuera", "…"]
  }
}
```

3. Cada parte abre con `## El 20% que rinde el 80%` y su contenido cabe en 1600 palabras; el resto de la parte es el desarrollo mínimo de esa capacidad.
4. El motor valida `pareto-plan` en `preparation` **y** en `planning` y `pareto-part` en `explanation`: si falta el criterio, la lista de descartado, el `pareto` de una parte o el bloque, la etapa queda `blocked` con el motivo exacto. No se avanza a mano.
5. La rúbrica `pareto-value` (solo en scope pareto) juzga una cosa: ¿esta parte entrega de verdad la rebanada vital y deja fuera lo que el plan declaró fuera? No exige cobertura.

## En modo rápido (nota de Obsidian)

Sin motor y sin plan, la misma disciplina en la nota:

- Abre con `## El 20% que rinde el 80%`: tres a cinco líneas con lo que hay que entender.
- El quiz de 3 preguntas se mantiene tal cual (variante con quiz).
- Cierra con `### Lo que queda fuera (y por qué)`: dos o tres líneas nombrando lo omitido y cuándo haría falta.
- Un visual por idea clave, como siempre; ninguno de adorno.

## Fallas típicas

- **Recorte sin criterio**: menos partes, nada declarado fuera. El motor lo bloquea; en modo rápido lo delata la sección final vacía.
- **Recortar la medición**: quitar preguntas o claves para que la nota sea corta. Rompe el contrato.
- **Cambiar el scope a mitad de tema**: el estado ya lo fijó; si la persona quiere el tema completo, se abre otro tema.
- **Confundir Pareto con resumen**: un resumen comprime el mismo contenido; Pareto elige otro subconjunto y lo nombra.
