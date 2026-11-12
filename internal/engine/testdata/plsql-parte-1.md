---
tipo: explicacion
nodo: plsql-bloques-dml
nivel: básico
---

# Parte 1 — Bloques PL/SQL, Variables Escalares, DML y Transacciones

**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.

## Ruta

1. Estructura del bloque anónimo y enlace seguro con `%TYPE`.
2. Modificación de datos con DML y buffer de sesión.
3. Control transaccional con SAVEPOINT, ROLLBACK parcial y COMMIT.

## El 20% que rinde el 80%: Anatomía del bloque PL/SQL y enlace de variables

Como ejemplo conductor, usamos un sistema bancario de cuentas de clientes. Transferimos fondos entre la cuenta 10 y la cuenta 20.

Un bloque anónimo PL/SQL agrupa lógica procedural y sentencias SQL. Se ejecuta sin guardarse con nombre en el catálogo.

Consta de tres secciones: DECLARE para variables locales, BEGIN para sentencias ejecutables y EXCEPTION para capturar errores.

```sql
DECLARE
  v_saldo cuentas.saldo%TYPE := 1000;
BEGIN
  UPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;
END;
```

El calificador `%TYPE` vincula el tipo de la variable a una columna de la tabla base. Si la columna cambia de formato, la variable se adapta automáticamente.

Las sentencias DML modifican datos en el buffer de sesión antes de confirmarse. Cada fila afectada queda protegida por un bloqueo exclusivo de transacción.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","title":"Arquitectura de memoria en un bloque PL/SQL","caption":"La sesión en memoria ejecuta el bloque procedural y retiene los cambios antes de confirmarlos en disco.","scene":{
  "boxes":[
    {"x":20,"y":30,"w":130,"h":100,"label":"Memoria de Sesión","sub":"v_saldo: 1000","tone":"blue"},
    {"x":210,"y":30,"w":130,"h":100,"label":"Base de Datos","sub":"cuentas en disco","tone":"green"}
  ],
  "arrows":[
    {"x1":150,"y1":80,"x2":210,"y2":80,"tone":"blue"}
  ],
  "labels":[
    {"x":180,"y":70,"text":"DML","anchor":"middle","size":12,"tone":"blue"},
    {"x":180,"y":165,"text":"Bloqueo exclusivo de fila (TX lock)","anchor":"middle","size":13,"tone":"amber"}
  ]
}}
</script>
</lk-scene>

Cómo leerlo: la caja izquierda representa la memoria de sesión con la variable tipada. La caja derecha muestra el disco con las filas bloqueadas.

## Control transaccional fino: SAVEPOINT, reversión parcial y confirmación

Una transacción agrupa operaciones que deben confirmarse o revertirse como un todo atómico.

El comando SAVEPOINT establece un marcador con nombre en el segmento de deshacer (Undo). No graba cambios en disco ni libera bloqueos.

```sql
SAVEPOINT sp_debito;
UPDATE cuentas SET saldo = saldo + 500 WHERE id = 20;
IF v_saldo < 1500 THEN
  ROLLBACK TO sp_debito;
END IF;
COMMIT;
```

La sentencia ROLLBACK TO revierte solo las modificaciones posteriores al punto fijado. El débito inicial en la cuenta 10 se conserva, mientras el crédito posterior se descarta.

La sentencia COMMIT confirma todos los cambios pendientes en el registro Redo y en disco. En ese instante se liberan los bloqueos de fila para las demás sesiones.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Ciclo transaccional con SAVEPOINT y ROLLBACK TO","viewBox":"0 0 360 210","steps":[
  {"title":"Estado inicial","narrator":"La tabla cuentas contiene dos registros con saldo 1000 en reposo.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 1000","tone":"slate"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}
     ],
     "labels":[{"x":180,"y":175,"text":"Sin transacción activa","anchor":"middle","size":13,"tone":"slate"}]
   }},
   "scene":{"arrows":[{"x1":97,"y1":20,"x2":262,"y2":20,"tone":"slate","label":"saldo base"}]}},
  {"title":"Débito en cuenta 10","narrator":"UPDATE resta 200 en cuenta 10; la fila queda modificada en buffer con bloqueo.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"blue"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}
     ],
     "labels":[{"x":180,"y":175,"text":"Transacción abierta: bloqueo en cuenta 10","anchor":"middle","size":13,"tone":"blue"}],
     "marks":[{"kind":"ok","actors":["c10"]}]
   }},
   "scene":{"arrows":[{"x1":97,"y1":140,"x2":97,"y2":160,"tone":"blue","label":"débito"}]}},
  {"title":"Punto de control sp_debito","narrator":"SAVEPOINT fija un marcador en el segmento de rollback.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"blue"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}
     ],
     "labels":[{"x":180,"y":175,"text":"Punto fijado: sp_debito","anchor":"middle","size":13,"tone":"amber"}],
     "marks":[{"kind":"ok","actors":["c10"]}]
   }},
   "scene":{"arrows":[{"x1":97,"y1":20,"x2":97,"y2":35,"tone":"amber","label":"marca"}]}},
  {"title":"Crédito condicional en cuenta 20","narrator":"UPDATE suma 500 en cuenta 20, quedando ambas filas bloqueadas.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"blue"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1500","tone":"amber"}
     ],
     "labels":[{"x":180,"y":175,"text":"Modificación posterior al SAVEPOINT","anchor":"middle","size":13,"tone":"amber"}],
     "marks":[{"kind":"ok","actors":["c20"]}]
   }},
   "scene":{"arrows":[{"x1":262,"y1":140,"x2":262,"y2":160,"tone":"amber","label":"crédito"}]}},
  {"title":"Reversión parcial ROLLBACK TO","narrator":"ROLLBACK TO sp_debito anula el crédito en cuenta 20 y preserva cuenta 10.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800","tone":"blue"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000","tone":"slate"}
     ],
     "labels":[{"x":180,"y":175,"text":"Cuenta 20 restaurada; cuenta 10 retenida","anchor":"middle","size":13,"tone":"blue"}],
     "marks":[{"kind":"no","actors":["c20"]}]
   }},
   "scene":{"arrows":[{"x1":262,"y1":20,"x2":262,"y2":35,"tone":"blue","label":"anulado"}]}},
  {"title":"Confirmación final COMMIT","narrator":"COMMIT graba el saldo 800 en disco y libera todos los bloqueos.",
   "stage":{"scene":{
     "boxes":[
       {"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","sub":"saldo: 800 (Fijo)","tone":"green"},
       {"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","sub":"saldo: 1000 (Fijo)","tone":"green"}
     ],
     "labels":[{"x":180,"y":175,"text":"Confirmado en disco; bloqueos liberados","anchor":"middle","size":13,"tone":"green"}],
     "marks":[{"kind":"ok","actors":["c10","c20"]}]
   }},
   "scene":{"arrows":[{"x1":97,"y1":140,"x2":262,"y2":140,"tone":"green","label":"confirmado"}]}}
]}
</script>
</lk-story>

Cómo leerlo: el paso 1 muestra los saldos iniciales. Cada paso siguiente ejecuta una sentencia y resalta qué cambios se conservan y cuáles se revierten.

## Mini-quiz

1. Declaramos «v_saldo cuentas.saldo%TYPE := 1000;». ¿Qué ventaja aporta el calificador %TYPE frente a NUMBER(10,2)?

2. Fijamos `SAVEPOINT sp_debito;` tras debitar 200 a cuenta 10 y sumamos 500 a cuenta 20. Al ejecutar `ROLLBACK TO sp_debito;`, ¿qué saldo conserva cada cuenta?

3. Tras ejecutar sentencias DML en PL/SQL, ¿qué efecto produce la sentencia COMMIT sobre datos y bloqueos?
