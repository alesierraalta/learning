---
tipo: explicacion
nodo: plsql-bloques-dml
nivel: básico
---

# Parte 1 — Bloques PL/SQL, Variables Escalares, DML y Transacciones

## Ruta

1. Estructura de un bloque anónimo en PL/SQL.
2. Variables escalares con tipado dinámico `%TYPE`.
3. Control transaccional con SAVEPOINT y COMMIT.

## El 20% que rinde el 80%: Bloques PL/SQL y enlace con %TYPE

Imagina un banco con dos cuentas: cuenta 10 y cuenta 20.
Ambas cuentas inician con 1000 de saldo.

**Bloque anónimo**
Es un programa temporal sin nombre. En nuestro ejemplo, ejecuta la transferencia bancaria.

El bloque tiene tres zonas de trabajo.

**DECLARE**
Es la sección que define variables. En nuestro ejemplo, declara la variable v_saldo.

La sección **BEGIN** ejecuta las sentencias obligatorias.
La sección **EXCEPTION** captura los fallos imprevistos.

```sql
DECLARE
  v_saldo cuentas.saldo%TYPE := 1000;
BEGIN
  UPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;
END;
```

**%TYPE**
Es el calificador que copia un tipo. En nuestro ejemplo, v_saldo copia el formato de saldo.

Antes, cambiar la columna rompía el programa.
En cambio, `%TYPE` adapta el tipo de forma automática.

**DML**
Es la sentencia que altera datos. En nuestro ejemplo, UPDATE resta 200 de saldo.

El cambio no viaja todavía al disco.

**Buffer de sesión**
Es la memoria temporal del usuario. En nuestro ejemplo, retiene el saldo 800 de la cuenta 10.

<lk-tables>
<script type="application/json">
{
  "title": "Buffer de sesión frente a disco",
  "caption": "La tabla en memoria retiene el borrador antes de que COMMIT lo grabe en disco.",
  "tables": [
    {
      "id": "buffer",
      "name": "buffer_sesion (RAM)",
      "columns": ["saldo", "estado", "id"],
      "rows": [["800", "candado TX", "10"], ["1000", "reposo", "20"]]
    },
    {
      "id": "disco",
      "name": "cuentas_disco",
      "columns": ["id", "saldo", "guardado"],
      "rows": [["10", "1000", "confirmado"], ["20", "1000", "confirmado"]]
    }
  ],
  "join": {
    "from": "buffer.id",
    "to": "disco.id",
    "on": "buffer.id = disco.id",
    "highlight": ["10"]
  },
  "result": {
    "label": "DISCO TRAS COMMIT",
    "select": ["buffer.id", "buffer.saldo"]
  }
}
</script>
</lk-tables>
Cómo leerlo: la tabla de memoria retiene el borrador y apunta al disco.

## 2. Control transaccional con SAVEPOINT y confirmación

**Transacción**
Es un grupo de operaciones indivisibles. En nuestro ejemplo, agrupa el débito y el crédito.

Cada fila alterada recibe un **candado** de protección.

**SAVEPOINT**
Es una marca intermedia de control. En nuestro ejemplo, fija el punto sp_debito.

Calculamos el saldo intermedio paso a paso.

<lk-story>
<script type="application/json">
{
 "summary": {
  "title": "La cuenta del ciclo",
  "text": "El débito de 200 sobrevive y el crédito de 500 se revierte: de los 2000 iniciales faltan 200.",
  "metrics": [["Cuenta 10", "800"], ["Cuenta 20", "1000"], ["Total", "1800"], ["Faltan", "200"]]
 },
 "kind": "derivation",
 "title": "La cuenta del SAVEPOINT, renglón por renglón",
 "viewBox": "0 0 360 260",
 "steps": [
  {
   "title": "Débito en la cuenta 10",
   "facts": [["saldo", "el saldo de la cuenta 10 al empezar: 1000"], ["resta", "lo que descuenta el UPDATE: 200"], ["res", "el saldo que queda tras el débito: 800"]],
   "narrator": "UPDATE resta «200» al saldo «1000» de la cuenta 10. Quedan «800».",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "1000", "id": "saldo" },
     { "t": " − ", "id": "menos" },
     { "t": "200", "id": "resta" },
     { "t": " = ", "id": "eq" },
     { "t": "800", "id": "res" }
    ]
   },
   "focus": ["res"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "ok", "label": "debitado", "actors": ["saldo10"] }
     ]
    }
   }
  },
  {
   "title": "Crédito en la cuenta 20",
   "narrator": "El segundo UPDATE suma «500» a la cuenta 20, que pasa de «1000» a «1500».",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "1000", "id": "saldo" },
     { "t": " + ", "id": "mas" },
     { "t": "500", "id": "credito" },
     { "t": " = ", "id": "eq" },
     { "t": "1500", "id": "res" }
    ]
   },
   "focus": ["credito", "res"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "amber", "tag": "Cuenta 20", "kind": "row", "size": 64, "state": "locked" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1500", "tone": "amber" }
     ],
     "moves": [
      { "from": "c10", "to": "c20", "verb": "+500", "tone": "amber" }
     ],
     "marks": [
      { "kind": "ok", "label": "acreditado", "actors": ["saldo20"] }
     ]
    }
   }
  },
  {
   "title": "La reversión devuelve el crédito",
   "narrator": "ROLLBACK TO sp_debito devuelve «500»: la cuenta 20 vuelve de «1500» a «1000».",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "1500", "id": "saldo" },
     { "t": " − ", "id": "menos" },
     { "t": "500", "id": "devuelto" },
     { "t": " = ", "id": "eq" },
     { "t": "1000", "id": "res" }
    ]
   },
   "focus": ["devuelto", "res"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "no", "label": "anulado", "actors": ["saldo20"] }
     ]
    }
   }
  },
  {
   "title": "Los dos saldos juntos",
   "narrator": "Lo que queda en el banco es la suma: «800» más «1000» son «1800».",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "800", "id": "saldo10" },
     { "t": " + ", "id": "mas" },
     { "t": "1000", "id": "saldo20" },
     { "t": " = ", "id": "eq" },
     { "t": "1800", "id": "res" }
    ]
   },
   "focus": ["saldo10", "saldo20", "res"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "green", "tag": "Cuenta 10", "kind": "row", "size": 64 },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "green", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "green" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "green" }
     ],
     "marks": [
      { "kind": "ok", "label": "sumados", "actors": ["saldo10", "saldo20"] }
     ]
    }
   }
  },
  {
   "title": "Cuánto falta de los 2000 iniciales",
   "ring": "c10",
   "narrator": "Al empezar había «2000» entre las dos cuentas. Quedan «1800», así que faltan «200».",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "2000", "id": "inicial" },
     { "t": " − ", "id": "menos" },
     { "t": "1800", "id": "total" },
     { "t": " = ", "id": "eq" },
     { "t": "200", "id": "res" }
    ]
   },
   "focus": ["total", "res"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64 },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "green", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "green" }
     ],
     "marks": [
      { "kind": "ok", "label": "faltan 200", "actors": ["saldo10"] }
     ]
    }
   }
  }
 ]
}
</script>
</lk-story>

```sql
SAVEPOINT sp_debito;
UPDATE cuentas SET saldo = saldo + 500 WHERE id = 20;
IF v_saldo < 1500 THEN
  ROLLBACK TO sp_debito;
END IF;
COMMIT;
```

Si una regla se incumple, la sesión retrocede.

**ROLLBACK**
Es la orden que deshace modificaciones. En nuestro ejemplo, anula la suma en cuenta 20.

Antes de confirmar, el cambio es provisional.
Después del **COMMIT**, el cambio queda permanente.

**COMMIT**
Es la orden que graba en disco. En nuestro ejemplo, libera candados y confirma los saldos.

**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.

<lk-story>
<script type="application/json">
{"summary":{"title":"Lo que queda","metrics":[["Pasos","6"]]},
 "kind": "derivation",
 "title": "Ciclo transaccional con SAVEPOINT y ROLLBACK TO",
 "viewBox": "0 0 360 260",
 "steps": [
  {
   "title": "Estado inicial","facts":[["c10","Cuenta 10"],["c20","Cuenta 20"],["saldo10","1000"]],
   "narrator": "La tabla cuentas tiene dos registros con saldo 1000 en reposo.",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "DECLARE ", "id": "declare" },
     { "t": "v_saldo", "id": "var" },
     { "t": " cuentas.saldo%TYPE", "id": "type" },
     { "t": " := 1000;", "id": "init" }
    ]
   },
   "focus": ["var"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "slate", "tag": "Cuenta 10", "kind": "row", "size": 64 },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "1000", "tone": "slate" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ]
    }
   }
  },
  {
   "title": "Débito en la cuenta 10","ring":"c10",
   "narrator": "UPDATE resta 200 en la cuenta 10; la fila queda modificada en el buffer.",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "UPDATE ", "id": "upd" },
     { "t": "cuentas", "id": "tabla" },
     { "t": " SET saldo = saldo - 200", "id": "set" },
     { "t": " WHERE id = 10;", "id": "where" }
    ]
   },
   "focus": ["set"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "ok", "label": "debitado", "actors": ["saldo10"] }
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
     { "t": "SAVEPOINT ", "id": "sp" },
     { "t": "sp_debito", "id": "nombre" },
     { "t": ";", "id": "fin" }
    ]
   },
   "focus": ["nombre"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "ok", "label": "marcador", "actors": ["saldo10"] }
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
     { "t": "UPDATE ", "id": "upd" },
     { "t": "cuentas", "id": "tabla" },
     { "t": " SET saldo = saldo + 500", "id": "set" },
     { "t": " WHERE id = 20;", "id": "where" }
    ]
   },
   "focus": ["set"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "amber", "tag": "Cuenta 20", "kind": "row", "size": 64, "state": "locked" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1500", "tone": "amber" }
     ],
     "moves": [
      { "from": "c10", "to": "c20", "verb": "+500", "tone": "amber" }
     ],
     "marks": [
      { "kind": "ok", "label": "acreditado", "actors": ["saldo20"] }
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
     { "t": "ROLLBACK TO ", "id": "rb" },
     { "t": "sp_debito", "id": "nombre" },
     { "t": ";", "id": "fin" }
    ]
   },
   "focus": ["nombre"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "blue", "tag": "Cuenta 10", "kind": "row", "size": 64, "state": "locked" },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "slate", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "no", "label": "anulado", "actors": ["saldo20"] }
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
     { "t": "COMMIT", "id": "commit" },
     { "t": ";", "id": "fin" }
    ]
   },
   "focus": ["commit"],
   "stage": {
    "scene": {
     "arrows": [
      { "x1": 90, "y1": 50, "x2": 270, "y2": 50, "tone": "slate", "label": "transferencia" }
     ],
     "actors": [
      { "id": "c10", "x": 90, "y": 120, "label": "Cuenta 10", "tone": "green", "tag": "Cuenta 10", "kind": "row", "size": 64 },
      { "id": "c20", "x": 270, "y": 120, "label": "Cuenta 20", "tone": "green", "tag": "Cuenta 20", "kind": "row", "size": 64 }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "green" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "green" }
     ],
     "marks": [
      { "kind": "ok", "actors": ["saldo10", "saldo20"], "label": "confirmado" }
     ]
    }
   }
  }
 ]
}
</script>
</lk-story>
Cómo leerlo: cada paso resalta el token de código en la cabecera.

## Mini-quiz
