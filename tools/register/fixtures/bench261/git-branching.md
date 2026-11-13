---
tipo: explicacion
nodo: git-ramas-punteros-head
nivel: básico
---

# Parte 1 — Ramas como Punteros a Commits y el Rol de HEAD

**Fuente**: Chacon y Straub (2014), *Pro Git*, Capítulo 3.

## Ruta

1. Una rama es un archivo de texto con un puntero.
2. Cada nuevo commit hace avanzar el puntero de la rama.
3. HEAD señala la rama activa en el espacio de trabajo.

## El 20% que rinde el 80%

Presentamos el ejemplo conductor.
Imagina un repositorio con una rama principal.

En nuestro ejemplo, creamos un archivo en el proyecto.

El desarrollador confirma su primer cambio.

Antes, el puntero señalaba el primer commit.
Después, el puntero avanza al nuevo commit.

En cambio, los archivos del historial no se duplican.
Mientras tanto, HEAD acompaña a la rama activa.

Una rama en Git pesa solo cuarenta bytes.

**Rama**: es un puntero móvil hacia un commit.

**Commit**: es una foto inmutable del proyecto.

**HEAD**: es la referencia a la rama actual.

**Puntero**: es la dirección que guarda el hash.

**Grafo**: es la red de commits conectados.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Avance de punteros en Git",
  "viewBox": "0 60 360 190",
  "steps": [
    {
      "title": "Paso 1: Commit inicial",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "HEAD -> ", "id": "h" },
          { "t": "main", "id": "m1" },
          { "t": " -> C1", "id": "c1" }
        ]
      },
      "focus": ["m1"],
      "narrator": "El puntero main y HEAD señalan al commit inicial C1.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "c1", "icon": "file", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "C1" },
            { "id": "p1", "icon": "robot", "x": 260, "y": 150, "size": 56, "tone": "green", "tag": "main" }
          ],
          "moves": [
            { "from": "p1", "to": "c1", "verb": "apunta", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "p1", "label": "HEAD" }
          ]
        }
      }
    },
    {
      "title": "Paso 2: Nuevo commit",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "git commit -> ", "id": "cmd" },
          { "t": "C2", "id": "c2" }
        ]
      },
      "focus": ["c2"],
      "narrator": "Al crear C2, el puntero main avanza automáticamente al nuevo commit.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "c1", "icon": "file", "x": 60, "y": 150, "size": 56, "tone": "blue", "tag": "C1" },
            { "id": "c2", "icon": "file", "x": 180, "y": 150, "size": 56, "tone": "blue", "tag": "C2" },
            { "id": "p1", "icon": "robot", "x": 290, "y": 150, "size": 56, "tone": "green", "tag": "main" }
          ],
          "moves": [
            { "from": "p1", "to": "c2", "verb": "avanza", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "p1", "label": "avanza" }
          ]
        }
      }
    },
    {
      "title": "Paso 3: Nueva rama",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "git branch ", "id": "gb" },
          { "t": "feature", "id": "feat" }
        ]
      },
      "focus": ["feat"],
      "narrator": "La nueva rama feature crea un nuevo puntero que apunta al mismo commit C2.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "p1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "green", "tag": "main" },
            { "id": "c2", "icon": "file", "x": 180, "y": 150, "size": 56, "tone": "blue", "tag": "C2" },
            { "id": "p2", "icon": "robot", "x": 280, "y": 150, "size": 56, "tone": "purple", "tag": "feature" }
          ],
          "moves": [
            { "from": "p2", "to": "c2", "verb": "apunta", "tone": "purple" }
          ],
          "marks": [
            { "kind": "ok", "actors": ["p1", "p2"], "label": "punteros" }
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

## 2. Puntero HEAD y estado de ramas

HEAD indica la rama de trabajo.
El puntero avanza con cada confirmación.

<lk-cards>
<script type="application/json">
{
  "title": "Estados del puntero HEAD",
  "cards": [
    {
      "id": "conectado",
      "verdict": "ok",
      "pill": "EN RAMA",
      "title": "HEAD en rama activa",
      "draw": {
        "refs": [
          { "text": "HEAD", "icon": "read", "tone": "green" }
        ],
        "target": { "text": "refs/heads/main" }
      },
      "reason": "HEAD apunta a main y avanza al confirmar"
    },
    {
      "id": "desvinculado",
      "verdict": "no",
      "pill": "DETACHED",
      "title": "HEAD desvinculado",
      "draw": {
        "refs": [
          { "text": "HEAD", "icon": "write", "tone": "amber" }
        ],
        "target": { "text": "commit C1" }
      },
      "reason": "HEAD apunta directo a C1 sin rama asociada"
    }
  ]
}
</script>
</lk-cards>

Cómo leerlo: los punteros señalan la referencia activa.
La rama main avanza sola al confirmar cambios.

## Mini-quiz

1. ¿Qué información guarda exactamente un archivo de rama dentro de .git/refs/heads?
2. ¿A qué apunta el puntero simbólico HEAD en una sesión de trabajo estándar?
3. ¿Qué ocurre con el puntero de la rama activa al crear un nuevo commit?
