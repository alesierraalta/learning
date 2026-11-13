---
tipo: explicacion
nodo: plsql-bloques-dml
nivel: básico
---

# Parte 1 — Bloques PL/SQL, Variables Escalares, DML y Transacciones

**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.

## Ruta

1. Bloque anónimo y enlace seguro con `%TYPE`.
2. Cambios con DML en el buffer de sesión.
3. Control con SAVEPOINT, reversión parcial y COMMIT.

## El 20% que rinde el 80%: Anatomía del bloque PL/SQL y enlace de variables

El ejemplo conductor: un banco con dos cuentas.
Cada cuenta empieza con un saldo de 1000.

Un bloque anónimo es un programa sin nombre en el catálogo.
Se ejecuta una sola vez, en el servidor.

Tiene tres secciones:
- DECLARE: variables.
- BEGIN: instrucciones que se ejecutan.
- EXCEPTION: captura de errores.
BEGIN es la única sección obligatoria.

```sql
DECLARE
  v_saldo cuentas.saldo%TYPE := 1000;
BEGIN
  UPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;
END;
```

**%TYPE**: es un calificador que copia el tipo de una columna.
Si la columna cambia, la variable se ajusta sola.

**DML**: son las sentencias que cambian datos, como UPDATE o INSERT.

**UPDATE**: cambia el valor de una fila.

**INSERT**: añade una fila nueva.
**Buffer**: es la memoria donde se guardan los cambios sin confirmar.

**Sesión**: es tu conexión con la base de datos.

**COMMIT**: graba los cambios pendientes en el disco.

Otra sesión no los ve hasta el COMMIT.

<lk-tables>
<script type="application/json">
{
  "title": "Buffer de sesión frente a tablas en disco",
  "caption": "La tabla en memoria retiene la fila modificada antes de que COMMIT la confirme en disco.",
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

Cómo leerlo: a la izquierda, la memoria. A la derecha, el disco.

Antes del COMMIT, el disco dice 1000.

Después, dice 800.

## 2. Control transaccional fino: SAVEPOINT, reversión parcial y confirmación

**Transacción**: es un grupo de cambios que se confirman o se cancelan juntos.
Cada fila modificada recibe un candado exclusivo.

**SAVEPOINT**: es un comando que fija una marca con nombre.
No toca el disco.






```sql
SAVEPOINT sp_debito;
UPDATE cuentas SET saldo = saldo + 500 WHERE id = 20;
IF v_saldo < 1500 THEN
  ROLLBACK TO sp_debito;
END IF;
COMMIT;
```

**ROLLBACK**: deshace los cambios hasta el punto fijado.
Antes del ROLLBACK, la cuenta 20 vale 1500.

Después, vale 1000. La cuenta 10 conserva 800.

Al COMMIT, los cambios pendientes van al disco.
Desde ese momento, los saldos son públicos.

<lk-story>
<script type="application/json">
{
 "kind": "derivation",
 "title": "Ciclo transaccional con SAVEPOINT y ROLLBACK TO",
 "viewBox": "0 0 360 250",
 "steps": [
  {
   "title": "Estado inicial en reposo",
   "narrator": "La cuenta 10 y la cuenta 20 inician con 1000 cada una.",
   "equation": {
    "size": 18,
    "atoms": [
     { "t": "DECLARE ", "id": "declare" },
     { "t": "v_saldo", "id": "var" },
     { "t": " cuentas.saldo%TYPE", "id": "type" },
     { "t": " := 1000;", "id": "init" }
    ]
   },
   "focus": ["var", "type"],
   "stage": {
    "scene": {
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "slate", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "slate", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "1000", "tone": "slate" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ]
    }
   }
  },
  {
   "title": "Débito en la cuenta 10",
   "narrator": "UPDATE resta 200 en cuenta 10: 1000 − 200 = 800.",
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
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "blue", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "slate", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "ok", "actor": "saldo10", "label": "debitado" }
     ]
    }
   }
  },
  {
   "title": "Punto de control SAVEPOINT",
   "narrator": "SAVEPOINT fija una marca con nombre sin tocar el disco.",
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
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "blue", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "slate", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "ok", "actor": "saldo10", "label": "marcador" }
     ]
    }
   }
  },
  {
   "title": "Crédito condicional en cuenta 20",
   "narrator": "UPDATE suma 500 en cuenta 20: 1000 + 500 = 1500.",
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
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "blue", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "amber", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1500", "tone": "amber" }
     ],
     "moves": [
      { "from": "c10", "to": "c20", "verb": "+500", "tone": "amber" }
     ],
     "marks": [
      { "kind": "ok", "actor": "saldo20", "label": "acreditado" }
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
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "blue", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "slate", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "blue" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "slate" }
     ],
     "marks": [
      { "kind": "no", "actor": "saldo20", "label": "anulado" }
     ]
    }
   }
  },
  {
   "title": "Confirmación final COMMIT",
   "narrator": "COMMIT graba los cambios en disco y libera todos los candados.",
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
     "actors": [
      { "id": "c10", "kind": "row", "x": 90, "y": 120, "size": 56, "tone": "green", "tag": "Cuenta 10" },
      { "id": "c20", "kind": "row", "x": 270, "y": 120, "size": 56, "tone": "green", "tag": "Cuenta 20" }
     ],
     "props": [
      { "id": "saldo10", "kind": "value", "on": "c10", "side": "below", "label": "800", "tone": "green" },
      { "id": "saldo20", "kind": "value", "on": "c20", "side": "below", "label": "1000", "tone": "green" }
     ],
     "marks": [
      { "kind": "ok", "actor": "saldo10", "label": "confirmado" },
      { "kind": "ok", "actor": "saldo20", "label": "confirmado" }
     ]
    }
   }
  }
 ]
}
</script>
</lk-story>

Cómo leerlo: cada paso resalta su instrucción en la cabecera.

Los personajes muestran qué cuenta cambia y cuándo se confirma.

## Mini-quiz

1. Declaramos «v_saldo cuentas.saldo%TYPE := 1000;». ¿Qué ventaja aporta el calificador %TYPE frente a NUMBER(10,2)?

2. Ambas cuentas inician con 1000. Tras debitar 200, fijar SAVEPOINT y sumar 500, ¿qué saldos quedan tras ROLLBACK TO?

3. Tras ejecutar DML en PL/SQL, ¿qué efecto produce la sentencia COMMIT sobre datos y candados?
