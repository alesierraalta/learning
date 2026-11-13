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
3. Control de la transacción con SAVEPOINT, ROLLBACK parcial y COMMIT.

## El 20% que rinde el 80%: Anatomía del bloque PL/SQL y enlace de variables

Como ejemplo conductor, usamos un sistema bancario de cuentas de clientes. Transferimos fondos entre la cuenta 10 y la cuenta 20.

**Bloque anónimo**
Es un trozo de código PL/SQL. No tiene nombre y se ejecuta una vez.

**SQL**: el lenguaje para pedir y cambiar datos.

En nuestro ejemplo, el bloque resta 200 de la cuenta 10.

Se ejecuta sin nombre. No se guarda en el catálogo.

Consta de tres secciones. DECLARE: variables locales.

BEGIN: sentencias que se ejecutan. EXCEPTION: captura de errores.

```sql
DECLARE
  v_saldo cuentas.saldo%TYPE := 1000;
BEGIN
  UPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;
END;
```

**%TYPE**
Es un calificador: copia el tipo de la columna.

En nuestro ejemplo, `v_saldo` copia el tipo de `saldo`. Si la columna cambia de formato, la variable se adapta sola.

**DML**: las sentencias que cambian datos.

**Buffer**: la memoria donde la sesión guarda los cambios sin confirmar.

**Sesión**: tu conexión con la base de datos.

Antes de confirmar, un DML cambia solo el buffer. Después, el COMMIT escribe en disco.

Hasta confirmar, otra sesión no puede cambiar esa fila.

<lk-memory>
<script type="application/json">
{"title":"La sesión y el disco","caption":"El bloque escribe en el buffer de la sesión y COMMIT lo graba en disco.","columns":[{"id":"s","label":"SESIÓN"},{"id":"d","label":"DISCO"}],"steps":[
 {"code":"v_saldo := 1000","rows":[
  {"s":{"id":"v1","name":"v_saldo","cells":["1000"],"tone":"blue"},"d":{"id":"f1","name":"cuentas","cells":["1000"],"tone":"slate"}}]},
 {"code":"UPDATE cuentas SET saldo = 800 WHERE id = 10","rows":[
  {"s":{"id":"b2","name":"buffer","cells":["800"],"tone":"amber"},"d":{"id":"l2","name":"fila 10","pill":{"text":"TX","tone":"red"},"cells":["1000"],"tone":"red"}}]},
 {"code":"COMMIT","rows":[
  {"s":{"id":"v3","name":"v_saldo","cells":["1000"],"tone":"blue"},"d":{"id":"f3","name":"cuentas","pill":{"text":"grabado","tone":"green"},"cells":["800"],"tone":"green"}}]}
]}
</script>
</lk-memory>

Cómo leerlo: a la izquierda está la sesión. Tiene su variable y su buffer.

La columna derecha es el disco. Solo el COMMIT lo cambia.

## Control transaccional fino: SAVEPOINT, reversión parcial y confirmación

**Transacción**: es un grupo de cambios que se confirman o se deshacen juntos.

**SAVEPOINT**: fija un punto con nombre dentro de la transacción.

Marcador: la señal con nombre que marca ese punto.

No graba cambios en disco ni libera bloqueos. Lo anota en el registro de deshacer.

Ese registro, llamado Undo, guarda cómo volver atrás.

```sql
SAVEPOINT sp_debito;
UPDATE cuentas SET saldo = saldo + 500 WHERE id = 20;
IF v_saldo < 1500 THEN
  ROLLBACK TO sp_debito;
END IF;
COMMIT;
```

**ROLLBACK**: deshace los cambios hasta un punto fijado.

La sentencia ROLLBACK TO deshace solo lo posterior al punto fijado.

En nuestro ejemplo, el débito de la cuenta 10 se conserva. El crédito posterior se descarta.

**COMMIT**: confirma todos los cambios pendientes y los escribe en disco.

Al confirmar, se liberan los bloqueos para las demás sesiones.

<lk-story>
<script type="application/json">
{
 "kind": "derivation",
 "title": "Ciclo transaccional con SAVEPOINT y ROLLBACK TO",
 "viewBox": "0 0 360 260",
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "slate",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "slate",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "blue",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64,
       "state": "locked"
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "slate",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64
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
       "label": "debitado",
       "actors": [
        "saldo10"
       ]
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "blue",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64,
       "state": "locked"
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "slate",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64
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
       "label": "marcador",
       "actors": [
        "saldo10"
       ]
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "blue",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64,
       "state": "locked"
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "amber",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64,
       "state": "locked"
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
       "label": "acreditado",
       "actors": [
        "saldo20"
       ]
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "blue",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64,
       "state": "locked"
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "slate",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64
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
       "label": "anulado",
       "actors": [
        "saldo20"
       ]
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
       "x": 90,
       "y": 120,
       "label": "Cuenta 10",
       "tone": "green",
       "tag": "Cuenta 10",
       "kind": "row",
       "size": 64
      },
      {
       "id": "c20",
       "x": 270,
       "y": 120,
       "label": "Cuenta 20",
       "tone": "green",
       "tag": "Cuenta 20",
       "kind": "row",
       "size": 64
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

Cómo leerlo: el paso 1 deja las dos cuentas en reposo. Cada paso resalta su parte; su ✓ o su ✗ dice qué saldo aprueba.

## Mini-quiz

Las preguntas de esta parte viven en su `mini-quiz/<parte>.json`: el lector las dibuja como el lk-quiz interactivo.
