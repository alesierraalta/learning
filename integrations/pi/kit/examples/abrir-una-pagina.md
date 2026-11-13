# Abrir una página web: qué viaja entre tu equipo y el servidor

En nuestro ejemplo, escribes www.example.com en el navegador.

Tu equipo es el **cliente**: pide la página.

El **servidor** es otro equipo. Guarda la página.

**Protocolo**: es un conjunto de reglas. Dice qué mensaje se envía y en qué orden.

## Ruta

1. **DNS**: traduce el nombre en una dirección IP.
2. **TCP**: abre una conexión fiable con esa dirección.
3. **HTTP**: pide la página por esa conexión.

## 1. Los tres viajes

**DNS**: es el sistema que traduce nombres en direcciones IP. En nuestro ejemplo, el DNS está en 8.8.8.8.

Antes de pedir la página, tu equipo pregunta por el nombre. Después, el DNS responde con una dirección.

**Dirección IP**: es el número que identifica a cada equipo. En nuestro ejemplo, tu equipo es 192.168.1.10.

Los datos viajan en **paquetes**. Un paquete es un trozo de datos con origen y destino.

El paquete sale de tu equipo y pasa por el **router**. El router es el aparato que une tu red con internet.

**Puerto**: es el número que identifica un servicio. El DNS atiende en el puerto 53.

**TTL**: es el tiempo que tu equipo guarda una respuesta. En nuestro ejemplo, son 3600 segundos.

Antes de enviar datos, **TCP** saluda. El saludo tiene tres mensajes.

**SYN**: es el primer mensaje. Significa «quiero abrir».

**SYN-ACK**: es la respuesta. Significa «acepto, y también abro».

**ACK**: es la confirmación. Significa «recibido».

Después viaja la **petición**: el mensaje que pide algo. **GET**: es el método que pide una página.

**Cabecera**: es una línea extra de datos. **Host**: indica el nombre del sitio.

El servidor responde **200 OK**: «todo bien». Después envía el documento **HTML**.

**HTML**: es el lenguaje que describe lo que ves en una página.

**CSS**: son las hojas de estilo. Dan color y forma.

Antes de dibujar, el navegador lee el HTML. Después, aplica el CSS.

Cuatro sistemas y ocho pasos. Avanza con los controles: el mapa enfoca a los que hablan.

<lk-explorer>
<script type="application/json">
{"title":"Abrir una página web","caption":"El paso activo enfoca a los dos sistemas que hablan y muestra qué viaja entre ellos. El registro guarda lo que ya pasó.","rows":[["client","router"],["dns","web"]],"views":["map","sequence"],
 "actors":[
  {"id":"client","name":"Cliente","detail":"192.168.1.10","kind":"person","tone":"blue"},
  {"id":"router","name":"Router","detail":"une tu red con internet","kind":"gear","tone":"slate"},
  {"id":"dns","name":"DNS","detail":"8.8.8.8","kind":"database","tone":"amber"},
  {"id":"web","name":"Servidor web","detail":"93.184.216.34","kind":"server","tone":"green"}],
 "links":[{"from":"client","to":"router"},{"from":"router","to":"dns"},{"from":"router","to":"web"}],
 "steps":[
  {"title":"La consulta","subtitle":"pregunta por el nombre","focus":["client","dns"],
   "travels":{"from":"client","to":"dns","label":"www.example.com","kind":"query"},
   "details":{"text":"El cliente pregunta al DNS, en 8.8.8.8, qué IP tiene el nombre. Pide el tipo A: una dirección IPv4 de cuatro números.","rows":[["CONSULTA","www.example.com"],["TIPO","A (IPv4)"],["PUERTO","53"]]},
   "log":{"from":"client","to":"dns","kind":"query","info":"¿A qué IP va www.example.com?"}},
  {"title":"La respuesta","subtitle":"vuelve la dirección","focus":["dns","client"],
   "travels":{"from":"dns","to":"client","label":"93.184.216.34","kind":"answer"},
   "details":{"text":"El DNS responde con la IP del servidor. El cliente guarda la respuesta el tiempo que indica el TTL.","rows":[["IP","93.184.216.34"],["TTL","3600 segundos"],["PUERTO","53"]]},
   "log":{"from":"dns","to":"client","kind":"answer","info":"La IP de www.example.com"}},
  {"title":"El saludo","subtitle":"pide abrir la conexión","focus":["client","web"],
   "travels":{"from":"client","to":"web","label":"SYN","kind":"syn"},
   "details":{"text":"TCP empieza con SYN: el cliente pide abrir la conexión. Todavía no viaja ningún dato de la página.","rows":[["FLAGS","SYN"],["PUERTO","80 (HTTP)"],["DATOS","ninguno"]]},
   "log":{"from":"client","to":"web","kind":"syn","info":"Quiero abrir la conexión"}},
  {"title":"La aceptación","subtitle":"responde y propone el suyo","focus":["web","client"],
   "travels":{"from":"web","to":"client","label":"SYN-ACK","kind":"ack"},
   "details":{"text":"El servidor acepta el saludo y propone el suyo. Con esa respuesta, el cliente sabe que el servidor está listo.","rows":[["FLAGS","SYN + ACK"],["PUERTO","80"],["DATOS","ninguno"]]},
   "log":{"from":"web","to":"client","kind":"ack","info":"Acepto y propongo el mío"}},
  {"title":"La confirmación","subtitle":"cierra el saludo","focus":["client","web"],
   "travels":{"from":"client","to":"web","label":"ACK","kind":"ack"},
   "details":{"text":"El cliente cierra el saludo con ACK. Desde aquí la conexión está abierta en los dos lados.","rows":[["FLAGS","ACK"],["ESTADO","abierta"],["DATOS","listos"]]},
   "log":{"from":"client","to":"web","kind":"ack","info":"Confirmo: la conexión está abierta"}},
  {"title":"La petición","subtitle":"pide la página","focus":["client","web"],
   "travels":{"from":"client","to":"web","label":"GET /","kind":"get"},
   "details":{"text":"Por la conexión abierta, el navegador envía la petición: el método GET y la página /.","rows":[["MÉTODO","GET"],["RUTA","/"],["HOST","www.example.com"]]},
   "log":{"from":"client","to":"web","kind":"get","info":"GET / con Host: www.example.com"}},
  {"title":"La página","subtitle":"llega el documento","focus":["web","client"],
   "travels":{"from":"web","to":"client","label":"200 OK","kind":"ok"},
   "details":{"text":"El servidor responde 200 OK, que significa «todo bien», y envía el documento HTML.","rows":[["ESTADO","200 OK"],["TIPO","text/html"],["TAMAÑO","1,2 kB"]]},
   "log":{"from":"web","to":"client","kind":"ok","info":"200 OK y el HTML de la página"}},
  {"title":"El dibujo","subtitle":"arma la pantalla","focus":["client"],
   "travels":{"from":"client","to":"client","label":"HTML + CSS","kind":"render"},
   "details":{"text":"El navegador lee el HTML y aplica el CSS. Con eso dibuja la pantalla.","rows":[["HTML","leído"],["CSS","aplicado"],["PANTALLA","lista"]]},
   "log":{"from":"client","to":"client","kind":"render","info":"El navegador dibuja la página"}}
 ]}
</script>
</lk-explorer>

## Mini-quiz

1. ¿Qué viaja en el paso 1 y qué vuelve en el paso 2?
- a) Una página. No: llega en el paso 7.
- b) Una pregunta por el nombre y la IP que vuelve. Sí.
- c) Un saludo SYN. No: va en el paso 3.

2. ¿Por qué el cliente envía SYN antes de pedir la página?
- a) Para que el DNS dé la IP. No: responde en el paso 2.
- b) Para abrir la conexión antes de mandar datos. Sí.
- c) Para que el servidor cambie su IP. No: su IP no cambia.
