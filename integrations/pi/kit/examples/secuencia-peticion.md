---
tipo: explicacion
nodo: ejemplo-secuencia-peticion
nivel: básico
---

# Una petición por tres actores

**Secuencia**: la forma de dibujar «quién dice qué a quién, en qué orden» cuando hay más de un
actor. Arriba están los actores con su línea de vida; cada mensaje baja una fila y su pendiente
es el tiempo que tarda en llegar. El color dice de qué categoría es el mensaje. En el teléfono
la figura se desliza dentro de su marco: la letra no se encoge.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Una petición: cliente, API y base de datos",
  "viewBox": "0 0 680 360",
  "steps": [
    {
      "title": "El cliente pide",
      "narrator": "La petición sale del cliente y llega a la API. Es el primer mensaje y viaja con la categoría azul.",
      "stage": { "scene": { "sequence": {
        "id": "pedido",
        "actors": [
          { "id": "cli", "label": "Cliente", "sub": "navegador" },
          { "id": "api", "label": "API", "sub": "servicio" },
          { "id": "db", "label": "Base", "sub": "datos" }
        ],
        "messages": [
          { "from": "cli", "to": "api", "label": "GET /pedido", "kind": "blue", "at": 0, "flow": true }
        ],
        "phases": [
          { "label": "Petición", "at": 0, "tone": "blue" }
        ],
        "legend": { "blue": "petición", "amber": "consulta", "green": "respuesta" }
      } } },
      "facts": [["tiempo", "0 · petición"], ["emisor", "Cliente"]]
    },
    {
      "title": "La API consulta",
      "narrator": "La API valida la sesión y pide la fila a la base. El mensaje cambia de categoría: ámbar.",
      "ring": "pedido",
      "stage": { "scene": { "sequence": {
        "id": "pedido",
        "actors": [
          { "id": "cli", "label": "Cliente", "sub": "navegador" },
          { "id": "api", "label": "API", "sub": "servicio" },
          { "id": "db", "label": "Base", "sub": "datos" }
        ],
        "messages": [
          { "from": "cli", "to": "api", "label": "GET /pedido", "kind": "blue", "at": 0, "flow": true },
          { "from": "api", "to": "db", "label": "SELECT id", "kind": "amber", "at": 1 }
        ],
        "phases": [
          { "label": "Petición", "at": 0, "tone": "blue" }
        ],
        "notes": [{ "at": 1, "text": "La API valida la sesión antes de consultar." }],
        "legend": { "blue": "petición", "amber": "consulta", "green": "respuesta" }
      } } },
      "facts": [["tiempo", "1 · consulta"], ["emisor", "API"]]
    },
    {
      "title": "La respuesta vuelve",
      "narrator": "La base devuelve la fila y la API responde al cliente. La banda verde separa la respuesta de la petición.",
      "stage": { "scene": { "sequence": {
        "id": "pedido",
        "actors": [
          { "id": "cli", "label": "Cliente", "sub": "navegador" },
          { "id": "api", "label": "API", "sub": "servicio" },
          { "id": "db", "label": "Base", "sub": "datos" }
        ],
        "messages": [
          { "from": "cli", "to": "api", "label": "GET /pedido", "kind": "blue", "at": 0, "flow": true },
          { "from": "api", "to": "db", "label": "SELECT id", "kind": "amber", "at": 1 },
          { "from": "db", "to": "api", "label": "fila", "kind": "green", "at": 2 },
          { "from": "api", "to": "cli", "label": "200 OK", "kind": "green", "at": 3, "flow": true }
        ],
        "phases": [
          { "label": "Petición", "at": 0, "tone": "blue" },
          { "label": "Respuesta", "at": 2, "tone": "green" }
        ],
        "notes": [{ "at": 1, "text": "La API valida la sesión antes de consultar." }],
        "legend": { "blue": "petición", "amber": "consulta", "green": "respuesta" }
      } } },
      "facts": [["mensajes", "4"], ["categorías", "3"]]
    }
  ],
  "summary": {
    "title": "Cuatro mensajes, un solo orden",
    "text": "La petición baja por los actores y la respuesta sube. El color y la fila dicen qué pasa en cada momento sin leer una lista.",
    "metrics": [["mensajes", "4"], ["actores", "3"]]
  }
}
</script>
</lk-story>

Cómo leerlo: cada ficha de arriba es un actor; su línea de vida baja hasta el final. Las flechas
se leen de arriba abajo, y el color de cada una se nombra en la leyenda del pie. La secuencia es
una pieza de estado: al pasar de paso, lo que sigue se desliza desde donde estaba y lo que cambia
destella una vez.
