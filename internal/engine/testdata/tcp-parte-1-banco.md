---
tipo: explicacion
nodo: tres-vias
nivel: básico
---

# Parte 1: Establecimiento de conexión y sincronización de tres vías

**Fuente**: RFC 9293, sección 3.4 «Establishing a Connection».

## Ruta

1. El cliente envía un segmento SYN para solicitar apertura y sincronizar su secuencia.
2. El servidor responde con SYN-ACK confirmando el pedido y ofreciendo su propia secuencia.
3. El cliente devuelve un ACK y ambos extremos transicionan a ESTABLISHED.

## El 20% que rinde el 80%

El handshake de tres vías abre un canal confiable entre dos extremos antes de transferir datos.
Cada máquina elige un número de secuencia inicial que la otra debe confirmar.

En nuestro ejemplo, un cliente web se conecta al servidor en el puerto 80.
El cliente inicia con `Seq = 1000` y el servidor responde con `Seq = 5000`.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","caption":"El cliente inicia la negociación con un segmento SYN hacia el servidor en escucha.","scene":{
  "boxes":[
    {"x":60,"y":15,"w":280,"h":130,"label":"Cliente (SYN_SENT)","tone":"blue","size":18},
    {"x":420,"y":15,"w":280,"h":130,"label":"Servidor (LISTEN)","tone":"green","size":18}
  ],
  "arrows":[
    {"x1":340,"y1":95,"x2":420,"y2":95,"label":"SYN","labelBeside":true}
  ]
}}
</script>
</lk-scene>

### **Pieza**
Un segmento SYN sincroniza números de secuencia sin transportar carga útil.
En nuestro ejemplo: pieza = segmento SYN con `Seq = 1000`.
Podría ser también:
- Un paquete de inicio en una videollamada WebRTC.
- La apertura de un socket hacia PostgreSQL.
- Una conexión HTTPS desde un navegador web.
- Una sesión SSH para administración remota.

## Cómo sincronizan los extremos en el canal

El intercambio evita que segmentos duplicados viejos abran conexiones fantasma.
Al exigir que cada SYN reciba acuse, TCP verifica que ambos interlocutores están activos.

Observa cómo fluyen los tres segmentos ordenados en el tiempo.
Cada paquete confirma el avance del interlocutor sumando una unidad a su secuencia.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Establecimiento del handshake TCP","viewBox":"0 0 360 220","steps":[
 {"title":"Paso 1: Cliente envía SYN","equation":{"size":22,"atoms":[{"t":"Cliente","id":"c"},{"t":" ---[ SYN, Seq=1000 ]---> ","id":"syn"},{"t":"Servidor","id":"s"}]},"focus":["syn"],
  "narrator":"El cliente inicia la conexión enviando su flag SYN y su número de secuencia inicial.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},
    {"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}
   ],
   "props":[{"id":"p1","kind":"value","on":"cli","side":"right","label":"SYN","tone":"blue"}]
  }}},
 {"title":"Paso 2: Servidor responde SYN-ACK","equation":{"size":22,"atoms":[{"t":"Servidor","id":"s"},{"t":" <---[ SYN-ACK, Ack=1001 ]--- ","id":"synack"},{"t":"Cliente","id":"c"}]},"focus":["synack"],
  "narrator":"El servidor confirma el SYN recibido con Ack=1001 y envía su propio número de secuencia.",
  "scene":{"arrows":[{"x1":270,"y1":140,"x2":70,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},
    {"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}
   ],
   "props":[{"id":"p2","kind":"value","on":"srv","side":"left","label":"SYN-ACK","tone":"green"}],
   "marks":[{"kind":"ok","actors":["srv"]}]
  }}},
 {"title":"Paso 3: Cliente confirma con ACK","equation":{"size":22,"atoms":[{"t":"Cliente","id":"c"},{"t":" ---[ ACK, Ack=5001 ]---> ","id":"ack"},{"t":"Servidor","id":"s"}]},"focus":["ack"],
  "narrator":"El cliente confirma el SYN del servidor con Ack=5001 y ambos extremos quedan en ESTABLISHED.",
  "scene":{"arrows":[{"x1":70,"y1":140,"x2":270,"y2":140}]},
  "stage":{"scene":{
   "actors":[
    {"id":"cli","icon":"robot","x":70,"y":140,"size":56,"tone":"blue","tag":"Cliente"},
    {"id":"srv","icon":"robot","x":270,"y":140,"size":56,"tone":"green","tag":"Servidor"}
   ],
   "props":[{"id":"p3","kind":"value","on":"cli","side":"right","label":"ACK","tone":"green"}],
   "marks":[{"kind":"ok","actors":["cli"]}]
  }}}
]}
</script>
</lk-story>

## Mini-quiz

1. ¿Qué flag TCP envía el cliente en el primer segmento para abrir la conexión?
- **A**: El flag SYN para sincronizar los números de secuencia iniciales.
- **B**: El flag PSH para procesar datos de inmediato.
- **C**: El flag URG con prioridad de transporte.
- **D**: El flag RST para reiniciar la sesión.
- **E**: No sé

2. ¿Qué flags devuelve el servidor en el segundo paso al responder al SYN?
- **A**: SYN y ACK a la vez para confirmar y sincronizar su ISN.
- **B**: Solo ACK, sin sincronizar su secuencia.
- **C**: Dos segmentos separados: primero ACK y luego SYN.
- **D**: Solo FIN para terminar el canal.
- **E**: No sé

3. ¿En qué estado queda el servidor tras recibir el tercer segmento (ACK) del cliente?
- **A**: ESTABLISHED, abriendo el canal para transmitir datos.
- **B**: SYN-RECEIVED, esperando otro paquete del cliente.
- **C**: LISTEN, volviendo al estado pasivo original.
- **D**: CLOSE-WAIT, preparando el cierre del socket.
- **E**: No sé

<lk-quiz>{"id":"p1"}</lk-quiz>
