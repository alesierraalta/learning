# Mover un String en Rust: qué pasa en la memoria

## Ruta

1. Un String guarda un puntero, una longitud y una capacidad en el stack.
2. El texto vive en el heap.
3. Mover copia el puntero y deja inválida a la dueña vieja.

Cada paso repite la línea que explica. Mira dónde está cada cosa.

<lk-memory>
<script type="application/json">
{"title":"Mover un String","caption":"La flecha nace en la dueña y llega al texto del heap. Una dueña movida no apunta a nada: su flecha termina en una ✗.","columns":[{"id":"stack","label":"STACK"},{"id":"heap","label":"HEAP"}],"steps":[
 {"code":"let s1 = String::from(\"hola\");","rows":[
  {"stack":{"id":"s1","name":"s1","pill":{"text":"dueña","tone":"green"},"cells":["ptr","len 4","cap 4"],"tone":"green","points":"h1"},"heap":{"id":"h1","cells":["h","o","l","a"],"tone":"amber"}}]},
 {"code":"let s2 = s1;","rows":[
  {"stack":{"id":"s1x","name":"s1","pill":{"text":"movida","tone":"red"},"cells":["ptr","len 4","cap 4"],"state":"invalid"}},
  {"stack":{"id":"s2","name":"s2","pill":{"text":"dueña","tone":"green"},"cells":["ptr","len 4","cap 4"],"tone":"green","points":"h2"},"heap":{"id":"h2","cells":["h","o","l","a"],"tone":"amber"}}]},
 {"code":"println!(\"{s1}\"); // error","rows":[
  {"stack":{"id":"s1y","name":"s1","pill":{"text":"error","tone":"red"},"cells":["ptr","len 4","cap 4"],"state":"invalid"}},
  {"stack":{"id":"s2b","name":"s2","pill":{"text":"dueña","tone":"green"},"cells":["ptr","len 4","cap 4"],"tone":"green","points":"h3"},"heap":{"id":"h3","cells":["h","o","l","a"],"tone":"amber"}}]}
]}
</script>
</lk-memory>
## Mini-quiz

1. ¿Qué copia «let s2 = s1;» y qué deja intacto?
