---
tipo: explicacion
nodo: rust-ownership-borrowing
nivel: básico
---

# Parte 1 — Propiedad, Movimiento y Préstamos Inmutables

**Fuente**: Klabnik y Nichols (2023), *The Rust Programming Language*, Capítulo 4.

## Ruta

1. Un valor tiene una sola variable dueña.
2. Mover transfiere la propiedad a otra variable.
3. Prestar con «&» permite lecturas compartidas.

## El 20% que rinde el 80%

Presentamos el ejemplo conductor.
Imagina un sensor de calor.

En nuestro ejemplo, el sensor guarda el texto «calor».

La variable s1 es la dueña del texto.

Antes, s1 poseía el dato sola.
Después, una referencia presta el valor.

El préstamo solo permite leer.

**Compilador**: es el programa que revisa el código.

**Valor**: es el dato de una variable.

**Propiedad**: es la regla de la dueña única.

**Préstamo**: es el permiso temporal para leer.

**Borrow checker**: es el revisor de préstamos.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Propiedad y préstamo inmutable",
  "viewBox": "0 60 360 190",
  "steps": [
    {
      "title": "Una dueña",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "let ", "id": "let" },
          { "t": "s1", "id": "s1" },
          { "t": " = String::from(\"calor\");", "id": "end" }
        ]
      },
      "focus": ["s1"],
      "narrator": "La variable «s1» es la dueña del texto en memoria.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "s1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "s1" }
          ],
          "props": [
            { "id": "valor", "kind": "value", "on": "s1", "side": "right", "label": "\"calor\"", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "s1", "label": "dueña" }
          ]
        }
      }
    },
    {
      "title": "Primer préstamo",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "let ", "id": "let" },
          { "t": "r1", "id": "r1" },
          { "t": " = &s1;", "id": "ref1" }
        ]
      },
      "focus": ["r1"],
      "narrator": "La referencia «r1» presta el valor de «s1» para leer.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "s1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "s1" },
            { "id": "r1", "icon": "robot", "x": 250, "y": 150, "size": 56, "tone": "green", "tag": "r1: &s1" }
          ],
          "props": [
            { "id": "valor", "kind": "value", "on": "s1", "side": "right", "label": "\"calor\"", "tone": "green" },
            { "id": "ojo1", "kind": "read", "on": "r1", "side": "right", "tone": "green" }
          ],
          "moves": [
            { "from": "valor", "to": "r1", "verb": "presta", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "r1", "label": "presta" }
          ]
        }
      }
    },
    {
      "title": "Segundo préstamo",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "let ", "id": "let" },
          { "t": "r2", "id": "r2" },
          { "t": " = &s1;", "id": "ref2" }
        ]
      },
      "focus": ["r2"],
      "narrator": "La referencia «r2» también presta el valor a la vez.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "s1", "icon": "robot", "x": 60, "y": 150, "size": 56, "tone": "blue", "tag": "s1" },
            { "id": "r1", "icon": "robot", "x": 170, "y": 150, "size": 56, "tone": "green", "tag": "r1: &s1" },
            { "id": "r2", "icon": "robot", "x": 280, "y": 150, "size": 56, "tone": "green", "tag": "r2: &s1" }
          ],
          "props": [
            { "id": "valor", "kind": "value", "on": "s1", "side": "right", "label": "\"calor\"", "tone": "green" },
            { "id": "ojo1", "kind": "read", "on": "r1", "side": "right", "tone": "green" },
            { "id": "ojo2", "kind": "read", "on": "r2", "side": "right", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actors": ["r1", "r2"], "label": "compila" }
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

## 2. Reglas de préstamo y propiedad

Las reglas conviven bajo el compilador.
El dato se lee sin moverlo.

<lk-cards>
<script type="application/json">
{
  "title": "Reglas de préstamo y propiedad",
  "cards": [
    {
      "id": "muchas",
      "verdict": "ok",
      "pill": "COMPILA",
      "title": "Muchas lecturas",
      "draw": {
        "refs": [
          { "text": "&s1", "icon": "read", "tone": "green" },
          { "text": "&s1", "icon": "read", "tone": "green" }
        ],
        "target": { "text": "s1" }
      },
      "reason": "Varios lectores leen a la vez sin conflicto"
    },
    {
      "id": "mover",
      "verdict": "no",
      "pill": "NO COMPILA",
      "title": "Mover y leer",
      "draw": {
        "refs": [
          { "text": "s2 = s1", "icon": "write", "tone": "amber" }
        ],
        "target": { "text": "s1" }
      },
      "reason": "s1 pierde la propiedad tras el movimiento"
    }
  ]
}
</script>
</lk-cards>

Cómo leerlo: los robots verdes leen el dato.
La variable s1 sigue siendo la dueña.

## Mini-quiz

1. ¿Por qué una referencia inmutable no quita la propiedad a la variable dueña?
2. ¿Cuántas referencias inmutables pueden leer a la vez un valor?
3. ¿Qué ocurre si intentas usar una variable tras mover su propiedad?
