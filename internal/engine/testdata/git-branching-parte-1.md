---
tipo: explicacion
nodo: punteros-commits-head
nivel: básico
---
# Punteros a commits y el rol de HEAD

**Fuente**: Pro Git (Chacon & Straub, Cap. 3).

## Ruta

1. Un commit es una foto fija e inmutable.
2. Una rama es un puntero móvil con nombre.
3. HEAD es la referencia que apunta a la rama.
4. Cada commit avanza la rama y HEAD.

## El 20% que rinde el 80%

Imagina un repositorio con una receta.

El archivo tiene los ingredientes.

**Commit**
Es una foto fija de los archivos.

En nuestro ejemplo, guarda los ingredientes iniciales.

**Puntero**
Es una referencia que guarda un identificador.

En nuestro ejemplo, indica dónde está la receta.

**Rama**
Es un puntero con nombre propio.

Apunta al último commit del trabajo.

Antes de crear ramas, solo existe `main`.

**HEAD**
Es la referencia a la rama activa.

En nuestro ejemplo, apunta a `main`.


<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 360 100",
  "title": "Estructura de punteros en Git",
  "caption": "HEAD apunta a la rama activa; la rama apunta al commit más reciente con su foto.",
  "scene": {
    "boxes": [
      { "x": 16,  "y": 12, "w": 86, "h": 76, "label": "HEAD",   "sub": "activa", "tone": "blue",  "rx": 0, "size": 18, "subSize": 14, "subDy": 20 },
      { "x": 134, "y": 12, "w": 86, "h": 76, "label": "main",   "sub": "rama",   "tone": "green", "rx": 0, "size": 18, "subSize": 14, "subDy": 20 },
      { "x": 252, "y": 12, "w": 92, "h": 76, "label": "Commit", "sub": "1a2b3c", "tone": "slate", "rx": 0, "size": 18, "subSize": 14, "subDy": 20 }
    ],
    "icons": [
      { "kind": "doc", "x": 322, "y": 30, "size": 20, "tone": "slate" }
    ],
    "arrows": [
      { "x1": 102, "y1": 50, "x2": 134, "y2": 50, "tone": "blue",  "width": 2 },
      { "x1": 220, "y1": 50, "x2": 252, "y2": 50, "tone": "green", "width": 2 }
    ]
  }
}
</script>
</lk-scene>

## Cómo avanzan las referencias con un commit

Al confirmar cambios, Git crea un commit.

El commit nuevo enlaza a su padre.

Antes del commit, `main` miraba al inicio. Después del commit, `main` avanza a la nueva foto.

HEAD sigue apuntando a `main`. En cambio, como `main` avanzó, HEAD ve la nueva foto.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Avance de punteros en Git",
  "viewBox": "0 0 360 230",
  "steps": [
    {
      "title": "Foto inicial",
      "equation": {
        "size": 18,
        "atoms": [
          {"t": "git commit -m \"Foto 1\"", "id": "c1"}
        ]
      },
      "focus": ["c1"],
      "narrator": "El commit inicial guarda los ingredientes. La rama main apunta a este commit.",
      "stage": {
        "scene": {
          "actors": [
            {"id": "c1", "icon": "file", "x": 80, "y": 130, "size": 48, "tone": "slate", "tag": "1a2b3c"}
          ],
          "props": [
            {"id": "main", "kind": "value", "at": [210, 130], "label": "main", "tone": "green"},
            {"id": "head", "kind": "value", "at": [80, 185], "label": "HEAD", "tone": "blue"}
          ]
        }
      }
    },
    {
      "title": "Nuevo commit",
      "equation": {
        "size": 18,
        "atoms": [
          {"t": "git commit -m \"Foto 2\"", "id": "c2"}
        ]
      },
      "focus": ["c2"],
      "narrator": "Al crear un commit, main avanza. HEAD acompaña a la rama.",
      "stage": {
        "scene": {
          "actors": [
            {"id": "c1", "icon": "file", "x": 70, "y": 130, "size": 48, "tone": "slate", "tag": "1a2b3c"},
            {"id": "c2", "icon": "file", "x": 280, "y": 130, "size": 48, "tone": "green", "tag": "5d6e7f"}
          ],
          "props": [
            {"id": "main", "kind": "value", "at": [150, 145], "label": "main", "tone": "green"},
            {"id": "head", "kind": "value", "at": [70, 185], "label": "HEAD", "tone": "blue"}
          ],
          "moves": [
            {"from": "main", "to": "c2", "verb": "avanza", "tone": "green"}
          ]
        }
      }
    },
    {
      "title": "Nueva rama",
      "equation": {
        "size": 18,
        "atoms": [
          {"t": "git checkout -b feature", "id": "b1"}
        ]
      },
      "focus": ["b1"],
      "narrator": "feature nace en el commit actual. HEAD ahora mira a feature.",
      "stage": {
        "scene": {
          "actors": [
            {"id": "c1", "icon": "file", "x": 70, "y": 130, "size": 48, "tone": "slate", "tag": "1a2b3c"},
            {"id": "c2", "icon": "file", "x": 250, "y": 130, "size": 48, "tone": "green", "tag": "5d6e7f"}
          ],
          "props": [
            {"id": "main", "kind": "value", "at": [160, 130], "label": "main", "tone": "slate"},
            {"id": "feat", "kind": "value", "at": [315, 130], "label": "feature", "tone": "amber"},
            {"id": "head", "kind": "value", "at": [250, 185], "label": "HEAD", "tone": "blue"}
          ],
          "marks": [
            {"kind": "ok", "actor": "c1", "label": "padre"}
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

## Mini-quiz

<lk-quiz>
<script type="application/json">
{
  "questions": [
    {"enunciado": "¿Qué representa físicamente una rama en el sistema de archivos de Git?"},
    {"enunciado": "Si el puntero HEAD contiene 'ref: refs/heads/main', ¿a qué apunta directamente HEAD?"},
    {"enunciado": "¿Qué ocurre con los commits anteriores cuando la rama avanza tras crear un commit nuevo?"}
  ]
}
</script>
</lk-quiz>
