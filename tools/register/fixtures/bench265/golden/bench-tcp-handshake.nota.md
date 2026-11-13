TCP handshake · Parte 1

# Parte 1 — El saludo inicial y los números de secuencia

El saludo de tres vías (three-way handshake) de TCP inicia con un segmento SYN enviado por el cliente para sincronizar su número de secuencia inicial (ISN) y solicitar la apertura de un canal bidireccional fiable.

Fuente: Documento RFC 793 por Postel (1981), sección sobre apertura de conexiones.

## El 20% que rinde el 80%

Imagina un cliente web en la dirección IP 192.168.1.10.

Quiere abrir una conexión con el servidor web 93.184.216.34.

**Cliente**: Es el equipo que inicia la comunicación. En nuestro ejemplo, el cliente es 192.168.1.10.

**Servidor**: Es el equipo remoto que atiende peticiones. En nuestro ejemplo, el servidor es 93.184.216.34.

**Handshake**: Es el acuerdo previo en tres pasos. En nuestro ejemplo, el handshake sincroniza ambos equipos.

**Segmento SYN**: Es el primer paquete de sincronización. En nuestro ejemplo, el segmento SYN viaja al servidor.

**Número de secuencia**: Es el contador de bytes transmitidos. En nuestro ejemplo, el número de secuencia inicial es 1000.

Antes, la red transmitía datos sin sincronizar contadores.

En cambio, TCP negocia las secuencias antes de transferir.

Sin embargo, este paquete inicial todavía no lleva datos.

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

1. ¿Por qué el cliente genera un número de secuencia inicial aleatorio en el handshake?

2. ¿Cuántos bytes de datos útiles transporta habitualmente el primer segmento SYN?

3. ¿A qué estado pasa el cliente tras emitir el paquete SYN hacia la red?
