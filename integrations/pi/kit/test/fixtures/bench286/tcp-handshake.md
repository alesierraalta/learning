---
tipo: explicacion
nodo: 1.1
nivel: básico
---

# Parte 1 — Sincronización inicial: bandera SYN y número de secuencia aleatorio (ISN)

## Ruta

1. El cliente elige un número de secuencia inicial aleatorio.
2. El cliente envía el paquete SYN al servidor web.
3. El servidor recibe el paquete y reserva recursos locales.

## El saludo inicial y la sincronización con SYN

Imagina un cliente web en la dirección IP 192.168.1.10.

Quiere abrir una conexión con el servidor web 93.184.216.34.

**Cliente**
Es el equipo que inicia la comunicación. En nuestro ejemplo, el cliente es 192.168.1.10.

Ese cliente necesita un interlocutor que acepte la conexión.

**Servidor**
Es el equipo remoto que atiende peticiones. En nuestro ejemplo, el servidor es 93.184.216.34.

Antes de hablar, los dos equipos se ponen de acuerdo.

**Handshake**
Es el acuerdo previo en tres pasos. En nuestro ejemplo, el handshake sincroniza ambos equipos.

El cliente arma el primer mensaje de ese acuerdo.

**Segmento SYN**
Es el primer paquete de sincronización. En nuestro ejemplo, el segmento SYN viaja al servidor.

Ese paquete lleva el número con el que empieza la cuenta de bytes.

**Número de secuencia**
Es el contador de bytes transmitidos. En nuestro ejemplo, el número de secuencia inicial es 1000.

Antes, la red transmitía datos sin sincronizar contadores.

En cambio, TCP negocia las secuencias antes de transferir.

Sin embargo, este paquete inicial todavía no lleva datos.

**Fuente**: RFC 793 por Postel (1981) y RFC 6528 por Gont y Bellovin (2012).

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Apertura de conexión: envío del paquete SYN","viewBox":"0 60 360 190","steps":[
 {"title":"Elige el contador","equation":{"size":22,"atoms":[{"t":"seq = ","id":"s"},{"t":"1000","id":"n"}]},"focus":["n"],
  "narrator":"El cliente genera un número de secuencia inicial aleatorio.",
  "stage":{"scene":{
   "arrows":[{"x1":80,"y1":80,"x2":250,"y2":80,"tone":"blue","label":"canal TCP"}],
   "actors":[{"id":"cli","kind":"user","x":80,"y":150,"size":56,"tone":"blue","tag":"Cliente"},{"id":"srv","kind":"server","x":250,"y":150,"size":56,"tone":"slate","tag":"Servidor"}],
   "props":[{"id":"p1","kind":"packet","on":"cli","side":"left","tone":"blue"}],
   "marks":[{"kind":"ok","actors":["cli"],"label":"listo"}]}}},
 {"title":"Envía el paquete","equation":{"size":22,"atoms":[{"t":"SYN: ","id":"f"},{"t":"seq 1000","id":"s"}]},"focus":["f","s"],
  "narrator":"El cliente envía el segmento SYN hacia el servidor remoto.",
  "stage":{"scene":{
   "arrows":[{"x1":80,"y1":80,"x2":250,"y2":80,"tone":"amber","label":"envío SYN"}],
   "actors":[{"id":"cli","kind":"user","x":80,"y":150,"size":56,"tone":"blue","state":"active","tag":"Cliente"},{"id":"srv","kind":"server","x":250,"y":150,"size":56,"tone":"slate","tag":"Servidor"}],
   "moves":[{"actor":"cli","toX":80,"toY":150}],
   "props":[{"id":"p1","kind":"packet","on":"cli","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["cli"],"label":"enviado"}]}}},
 {"title":"Pasa a espera","equation":{"size":22,"atoms":[{"t":"estado: ","id":"e"},{"t":"SYN-SENT","id":"st"}]},"focus":["st"],
  "narrator":"El cliente pasa a estado SYN-SENT esperando la respuesta.",
  "stage":{"scene":{
   "arrows":[{"x1":80,"y1":80,"x2":250,"y2":80,"tone":"slate","label":"en tránsito"}],
   "actors":[{"id":"cli","kind":"user","x":80,"y":150,"size":56,"tone":"blue","state":"waiting","tag":"Cliente"},{"id":"srv","kind":"server","x":250,"y":150,"size":56,"tone":"green","state":"active","tag":"Servidor"}],
   "marks":[{"kind":"ok","actors":["srv"],"label":"recibido"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Campos del paquete de saludo inicial","cards":[
 {"id":"syn","verdict":"ok","pill":"CORRECTO","title":"Flag SYN","draw":{"refs":[{"text":"SYN","icon":"read","tone":"green"}],"target":{"text":"petición"}},"reason":"Lee y sincroniza secuencias"},
 {"id":"isn","verdict":"ok","pill":"CORRECTO","title":"Campo seq","draw":{"refs":[{"text":"1000","icon":"read","tone":"blue"}],"target":{"text":"contador"}},"reason":"Lee el valor inicial"},
 {"id":"datos","verdict":"no","pill":"RECHAZADO","title":"Datos en SYN","draw":{"refs":[{"text":"100 B","icon":"write","tone":"amber"}],"target":{"text":"datos"}},"reason":"Escribe datos sin conexión previa"}
]}
</script>
</lk-cards>

Cómo leerlo: las tarjetas comparan los tres campos principales del paquete de saludo.

## Mini-quiz

<lk-quiz></lk-quiz>

```text
En nuestro ejemplo, el cliente inicia la conexión con número de secuencia inicial 1000. ¿Qué bandera viaja activada en este primer paquete y qué valor de acuse lleva?
¿Por qué el cliente no debe fijar su número de secuencia inicial en una constante como cero según el estándar RFC 6528?
Tras emitir el segmento SYN con secuencia 1000 hacia el servidor, ¿a qué estado del protocolo transiciona el socket del cliente?
```
