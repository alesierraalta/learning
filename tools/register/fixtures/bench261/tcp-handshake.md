---
tipo: explicacion
nodo: tcp-tres-vias-syn-ack
nivel: básico
---

# Parte 1 — El Saludo de Tres Vías y Sincronización de Secuencias

**Fuente**: Postel (1981), *RFC 793: Transmission Control Protocol*, Sección 3.4.

## Ruta

1. El cliente pide abrir la conexión con un número inicial.
2. El servidor responde y confirma el número recibido.
3. El cliente confirma la respuesta y abre el canal.

## El 20% que rinde el 80%

Presentamos el ejemplo conductor.
Imagina un cliente web y un servidor.

En nuestro ejemplo, el cliente inicia una conexión hacia el servidor.

La conexión requiere sincronizar ambos extremos.

Antes, el canal estaba cerrado.
Después, ambos acuerdan sus números.

En cambio, si un paquete se pierde, el emisor lo envía otra vez.
Mientras tanto, el servidor espera la confirmación.

El acuerdo establece el canal fiable.

**Segmento**: es el paquete que viaja por la red.

**Bandera**: es la señal de aviso dentro del paquete.

**Secuencia**: es la cuenta de los datos enviados.

**Confirmación**: es la cuenta del siguiente dato esperado.

**Saludo**: es el acuerdo inicial de tres pasos.

**SYN**: es el primer aviso para pedir conexión.

**ACK**: es la respuesta que confirma la recepción.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Saludo de tres vías",
  "viewBox": "0 60 360 190",
  "steps": [
    {
      "title": "Paso 1: SYN",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "SYN: ", "id": "t1" },
          { "t": "seq=1000", "id": "seq1" }
        ]
      },
      "focus": ["seq1"],
      "narrator": "El cliente envía un paquete SYN con su secuencia inicial 1000.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "c1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Cliente" },
            { "id": "s1", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Servidor" }
          ],
          "moves": [
            { "from": "c1", "to": "s1", "verb": "SYN", "tone": "blue" }
          ],
          "marks": [
            { "kind": "ok", "actor": "c1", "label": "SYN" }
          ]
        }
      }
    },
    {
      "title": "Paso 2: SYN-ACK",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "SYN-ACK: ", "id": "t2" },
          { "t": "seq=5000, ack=1001", "id": "ack1" }
        ]
      },
      "focus": ["ack1"],
      "narrator": "El servidor confirma con ack 1001 y propone su secuencia 5000.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "c1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Cliente" },
            { "id": "s1", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Servidor" }
          ],
          "moves": [
            { "from": "s1", "to": "c1", "verb": "SYN-ACK", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "s1", "label": "SYN-ACK" }
          ]
        }
      }
    },
    {
      "title": "Paso 3: ACK",
      "equation": {
        "size": 22,
        "atoms": [
          { "t": "ACK: ", "id": "t3" },
          { "t": "seq=1001, ack=5001", "id": "ack2" }
        ]
      },
      "focus": ["ack2"],
      "narrator": "El cliente confirma con ack 5001 y la sesión queda abierta.",
      "stage": {
        "scene": {
          "paths": [
            { "d": "M 30 204 L 330 204", "tone": "slate", "width": 2, "arrow": false }
          ],
          "actors": [
            { "id": "c1", "icon": "robot", "x": 80, "y": 150, "size": 56, "tone": "blue", "tag": "Cliente" },
            { "id": "s1", "icon": "server", "x": 260, "y": 150, "size": 56, "tone": "purple", "tag": "Servidor" }
          ],
          "moves": [
            { "from": "c1", "to": "s1", "verb": "ACK", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actors": ["c1", "s1"], "label": "conectado" }
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

## 2. Validación de números de secuencia

Ambos extremos validan cada acuse recibido.
El acuse avanza una posición por el bit de control.

<lk-cards>
<script type="application/json">
{
  "title": "Confirmación de secuencias",
  "cards": [
    {
      "id": "correcto",
      "verdict": "ok",
      "pill": "CONECTADO",
      "title": "Confirmación válida",
      "draw": {
        "refs": [
          { "text": "ack = 5001", "icon": "read", "tone": "green" }
        ],
        "target": { "text": "ISN_s + 1" }
      },
      "reason": "El cliente confirma el byte fantasma del SYN"
    },
    {
      "id": "incorrecto",
      "verdict": "no",
      "pill": "RECHAZADO",
      "title": "Secuencia repetida",
      "draw": {
        "refs": [
          { "text": "ack = 5000", "icon": "write", "tone": "amber" }
        ],
        "target": { "text": "ISN_s" }
      },
      "reason": "No incrementa el acuse y el servidor descarta el paquete"
    }
  ]
}
</script>
</lk-cards>

Cómo leerlo: los clientes y servidores verifican el acuse.
La conexión se completa al confirmar el siguiente byte.

## Mini-quiz

1. ¿Por qué el paquete SYN incrementa en uno el número de confirmación aunque no lleve datos?
2. ¿Qué número de acuse envía el cliente tras recibir el SYN-ACK con seq=5000?
3. ¿Cuál es el estado de la conexión tras completarse el envío del último ACK?
