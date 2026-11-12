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
{"viewBox":"0 0 720 300","title":"Arquitectura de memoria en un bloque PL/SQL","caption":"La sesión en memoria ejecuta el bloque procedural y retiene los cambios antes de confirmarlos en disco.","scene":{
  "boxes":[
    {"x":40,"y":40,"w":280,"h":180,"label":"Memoria de sesión","sub":"v_saldo: 1000","size":20,"subSize":16,"tone":"blue"},
    {"x":400,"y":40,"w":280,"h":180,"label":"Base de datos","sub":"cuentas en disco","size":20,"subSize":16,"tone":"green"}
  ],
  "arrows":[
    {"x1":324,"y1":130,"x2":396,"y2":130,"tone":"blue","width":3,"label":"DML","labelSize":16}
  ],
  "labels":[
    {"x":360,"y":270,"text":"Bloqueo exclusivo de fila (TX lock)","anchor":"middle","size":16,"tone":"amber"}
  ]
}}
</script>
</lk-scene>

Cómo leerlo: la caja izquierda es la memoria de sesión con la variable tipada. La caja derecha es el disco, con las filas bloqueadas mientras la transacción sigue abierta.

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
{
 "kind": "derivation",
 "title": "Ciclo transaccional con SAVEPOINT y ROLLBACK TO",
 "viewBox": "0 0 360 240",
 "steps": [
  {
   "title": "Estado inicial",
   "narrator": "La tabla cuentas tiene dos registros con saldo 1000 en reposo.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "DECLARE ",
      "id": "declare"
     },
     {
      "t": "v_saldo",
      "id": "var"
     },
     {
      "t": " cuentas.saldo%TYPE",
      "id": "type"
     },
     {
      "t": " := 1000;",
      "id": "init"
     }
    ]
   },
   "focus": [
    "var"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "slate",
       "tag": "saldo 1000"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "slate",
       "tag": "saldo 1000"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "1000",
       "tone": "slate"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1000",
       "tone": "slate"
      }
     ]
    }
   }
  },
  {
   "title": "Débito en la cuenta 10",
   "narrator": "UPDATE resta 200 en la cuenta 10; la fila queda modificada en el buffer.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "UPDATE ",
      "id": "upd"
     },
     {
      "t": "cuentas",
      "id": "tabla"
     },
     {
      "t": " SET saldo = saldo - 200",
      "id": "set"
     },
     {
      "t": " WHERE id = 10;",
      "id": "where"
     }
    ]
   },
   "focus": [
    "set"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "blue",
       "tag": "bloqueo TX"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "slate",
       "tag": "saldo 1000"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "800",
       "tone": "blue"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1000",
       "tone": "slate"
      }
     ],
     "marks": [
      {
       "kind": "ok",
       "actor": "saldo10",
       "label": "debitado"
      }
     ]
    }
   }
  },
  {
   "title": "Punto de control sp_debito",
   "narrator": "SAVEPOINT fija un marcador en el segmento de rollback.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "SAVEPOINT ",
      "id": "sp"
     },
     {
      "t": "sp_debito",
      "id": "nombre"
     },
     {
      "t": ";",
      "id": "fin"
     }
    ]
   },
   "focus": [
    "nombre"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "blue",
       "tag": "bloqueo TX"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "slate",
       "tag": "saldo 1000"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "800",
       "tone": "blue"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1000",
       "tone": "slate"
      }
     ],
     "marks": [
      {
       "kind": "ok",
       "actor": "saldo10",
       "label": "marcador"
      }
     ]
    }
   }
  },
  {
   "title": "Crédito condicional en la cuenta 20",
   "narrator": "UPDATE suma 500 en la cuenta 20, y las dos filas quedan bloqueadas.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "UPDATE ",
      "id": "upd"
     },
     {
      "t": "cuentas",
      "id": "tabla"
     },
     {
      "t": " SET saldo = saldo + 500",
      "id": "set"
     },
     {
      "t": " WHERE id = 20;",
      "id": "where"
     }
    ]
   },
   "focus": [
    "set"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "blue",
       "tag": "bloqueo TX"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "amber",
       "tag": "bloqueo TX"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "800",
       "tone": "blue"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1500",
       "tone": "amber"
      }
     ],
     "moves": [
      {
       "from": "c10",
       "to": "c20",
       "verb": "+500",
       "tone": "amber"
      }
     ],
     "marks": [
      {
       "kind": "ok",
       "actor": "saldo20",
       "label": "acreditado"
      }
     ]
    }
   }
  },
  {
   "title": "Reversión parcial ROLLBACK TO",
   "narrator": "ROLLBACK TO sp_debito anula el crédito y conserva el débito.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "ROLLBACK TO ",
      "id": "rb"
     },
     {
      "t": "sp_debito",
      "id": "nombre"
     },
     {
      "t": ";",
      "id": "fin"
     }
    ]
   },
   "focus": [
    "nombre"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "blue",
       "tag": "bloqueo TX"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "slate",
       "tag": "saldo 1000"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "800",
       "tone": "blue"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1000",
       "tone": "slate"
      }
     ],
     "marks": [
      {
       "kind": "no",
       "actor": "saldo20",
       "label": "anulado"
      }
     ]
    }
   }
  },
  {
   "title": "Confirmación final COMMIT",
   "narrator": "COMMIT graba el saldo 800 en disco y libera todos los bloqueos.",
   "equation": {
    "size": 18,
    "atoms": [
     {
      "t": "COMMIT",
      "id": "commit"
     },
     {
      "t": ";",
      "id": "fin"
     }
    ]
   },
   "focus": [
    "commit"
   ],
   "stage": {
    "scene": {
     "actors": [
      {
       "id": "c10",
       "x": 20,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 10",
       "size": 16,
       "tone": "green",
       "tag": "saldo fijo"
      },
      {
       "id": "c20",
       "x": 220,
       "y": 60,
       "w": 120,
       "h": 60,
       "label": "Cuenta 20",
       "size": 16,
       "tone": "green",
       "tag": "saldo fijo"
      }
     ],
     "props": [
      {
       "id": "saldo10",
       "kind": "value",
       "on": "c10",
       "side": "below",
       "label": "800",
       "tone": "green"
      },
      {
       "id": "saldo20",
       "kind": "value",
       "on": "c20",
       "side": "below",
       "label": "1000",
       "tone": "green"
      }
     ],
     "marks": [
      {
       "kind": "ok",
       "actors": [
        "saldo10",
        "saldo20"
       ],
       "label": "confirmado"
      }
     ]
    }
   }
  }
 ]
}
</script>
</lk-story>

Cómo leerlo: el paso 1 deja las dos cuentas en reposo. Cada paso resalta su token y su ✓ o su ✗ dice qué saldo aprueba.

## Mini-quiz

1. Declaramos «v_saldo cuentas.saldo%TYPE := 1000;». ¿Qué ventaja aporta el calificador %TYPE frente a NUMBER(10,2)?

2. Fijamos `SAVEPOINT sp_debito;` tras debitar 200 a cuenta 10 y sumamos 500 a cuenta 20. Al ejecutar `ROLLBACK TO sp_debito;`, ¿qué saldo conserva cada cuenta?

3. Tras ejecutar sentencias DML en PL/SQL, ¿qué efecto produce la sentencia COMMIT sobre datos y bloqueos?
