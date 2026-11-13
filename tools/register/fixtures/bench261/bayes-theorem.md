---
tipo: explicacion
nodo: bayes-probabilidad-condicional
nivel: básico
---

# Parte 1 — Probabilidad Condicional y la Regla del Producto

**Fuente**: Ross (2014), *A First Course in Probability*, Capítulo 3.

## Ruta

1. La condición reduce el espacio de casos posibles.
2. La probabilidad condicional divide la intersección entre la condición.
3. La regla del producto calcula la probabilidad conjunta.

## El 20% que rinde el 80%

Presentamos el ejemplo conductor.
Imagina un paciente y un laboratorio.

En nuestro ejemplo, evaluamos una prueba.

Buscamos detectar una infección.

Antes, mirábamos a toda la población.
Después, miramos solo el grupo positivo.

En cambio, omitir la condición falla.
Mientras tanto, calculamos la fracción.

El nuevo dato reduce el espacio.

**Espacio**: es el conjunto de casos posibles.

**Evento**: es el suceso a medir.

**Condicional**: es la probabilidad con información previa.

**Intersección**: es la coincidencia de dos eventos.

**Producto**: es la multiplicación de probabilidades.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Reducción del espacio muestral",
  "viewBox": "0 60 360 190",
  "steps": [
    {
      "title": "Paso 1: Definición",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "P(A|B) = ", "id": "t1" },
          { "t": "P(A ∩ B) / P(B)", "id": "def" }
        ]
      },
      "focus": ["def"],
      "narrator": "La probabilidad de A dado B divide la intersección entre el total de B.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "u1", "icon": "user", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Paciente" },
            { "id": "lab", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Laboratorio" }
          ],
          "moves": [
            { "from": "u1", "to": "lab", "verb": "Muestra", "tone": "blue" }
          ],
          "marks": [
            { "kind": "ok", "actor": "u1", "label": "espacio" }
          ]
        }
      }
    },
    {
      "title": "Paso 2: Sustitución",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "P(A|B) = ", "id": "t1" },
          { "t": "0.20 / 0.40", "id": "num" }
        ]
      },
      "focus": ["num"],
      "narrator": "Sustituimos la intersección 0.20 y la probabilidad de B 0.40.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "u1", "icon": "user", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Paciente" },
            { "id": "lab", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Laboratorio" }
          ],
          "moves": [
            { "from": "lab", "to": "u1", "verb": "Condiciona", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "lab", "label": "0.20/0.40" }
          ]
        }
      }
    },
    {
      "title": "Paso 3: Resultado",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "P(A|B) = ", "id": "t1" },
          { "t": "0.50", "id": "res" }
        ]
      },
      "focus": ["res"],
      "narrator": "El cociente final reduce el espacio y da una probabilidad del 50%.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "u1", "icon": "user", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Paciente" },
            { "id": "lab", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Laboratorio" }
          ],
          "moves": [
            { "from": "lab", "to": "u1", "verb": "Resultado", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actors": ["u1", "lab"], "label": "0.50" }
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

## 2. La región compartida entre eventos

El diagrama muestra la intersección.
La zona contiene los casos comunes.

<lk-venn>
<script type="application/json">
{
  "sets": [
    { "id": "a", "label": "A", "note": "Infección" },
    { "id": "b", "label": "B", "note": "Positivo" }
  ],
  "fill": ["a+b"],
  "op": "P(A ∩ B)",
  "says": "Casos con infección y prueba positiva"
}
</script>
</lk-venn>

Cómo leerlo: la sombra muestra la intersección.
El cálculo divide entre el círculo B.

## Mini-quiz

1. ¿Por qué la probabilidad condicional P(A|B) utiliza P(B) como denominador?
2. ¿Qué ocurre con el espacio muestral al saber con certeza que el evento B ocurrió?
3. ¿Cuál es el valor de P(A|B) si P(A ∩ B) = 0.20 y P(B) = 0.40?
