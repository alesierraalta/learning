---
tipo: explicacion
nodo: arquitectura-claves-integridad
nivel: básico
---
# Parte 1 — Arquitectura Relacional, Claves e Integridad Referencial
**Fuente**: Silberschatz, Korth & Sudarshan, *Database System Concepts*, Cap. 2; Oracle Database *SQL Language Refere...
## Ruta
1. La clave primaria garantiza unicidad y obligatoriedad en cada fila de la tabla maestra.
2. La clave foránea vincula la tabla dependiente restringiendo sus valores a claves existentes.
3. El motor relacional intercepta y rechaza tuplas huérfanas antes de persistir cambios.
## El 20% que rinde el 80% — Identidad de entidad y consistencia referencial
El modelo relacional organiza la información en tablas bidimensionales compuestas por tuplas y atributos. Esta estruc...
La clave primaria (`PRIMARY KEY`) impone dos reglas simultáneas e inmutables: unicidad estricta y obligatoriedad (`NO...
Por su parte, la clave foránea (`FOREIGN KEY`) vincula una tabla dependiente con la tabla maestra correspondiente. Su...
<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 150",
  "title": "Estructura relacional maestro-detalle",
  "caption": "La tabla dependiente EMPLOYEE referencia mediante su clave foránea la clave primaria de la tabla maestr...
  "scene": {
    "boxes": [
      { "x": 20,  "y": 24, "w": 200, "h": 100, "label": "EMPLOYEE", "sub": "Hija · dept_id (FK)", "tone": "slate", "r...
      { "x": 540, "y": 24, "w": 200, "h": 100, "label": "DEPARTMENT", "sub": "Padre · dept_id (PK)", "tone": "blue", ...
    ],
    "arrows": [
      { "x1": 220, "y1": 74, "x2": 540, "y2": 74, "label": "FK apunta a PK existente", "tone": "blue", "labelSize": 1...
    ]
  }
}
</script>
</lk-scene>
Cómo leerlo: EMPLOYEE referencia con su clave foránea la clave primaria de la tabla maestra DEPARTMENT.
## El ejemplo conductor: departamentos y empleados
En nuestro ejemplo, modelamos una sucursal con dos tablas: `DEPARTMENT` (departamentos) y `EMPLOYEE` (empleados). Cad...
Si insertamos un empleado con un departamento inexistente, el motor bloquea la fila huérfana. De igual modo, no permi...
<lk-walkthrough class="lk-wt-compact" title="Validación de integridad referencial en cuatro pasos">
<script type="application/json">
{
  "title": "Validación de integridad referencial",
  "viewBox": "0 0 360 240",
  "steps": [
    {
      "title": "Alta del departamento maestro",
      "text": "Se crea el departamento 10 en la tabla maestra. Su clave primaria fija una identidad única.",
      "scene": {
        "boxes": [
          {"x": 20, "y": 80, "w": 120, "h": 50, "label": "EMPLOYEE", "size": 13, "tone": "slate", "rx": 6},
          {"x": 220, "y": 80, "w": 120, "h": 50, "label": "DEP 10", "size": 14, "tone": "blue", "rx": 6}
        ],
        "arrows": [
          {"x1": 140, "y1": 105, "x2": 220, "y2": 105, "label": "PK lista", "tone": "blue"}
        ],
        "labels": [
          {"x": 80, "y": 60, "text": "Sin filas aún", "size": 12, "tone": "slate", "anchor": "middle"},
          {"x": 280, "y": 60, "text": "Ventas (10)", "size": 12, "tone": "ink", "anchor": "middle"}
        ]
      }
    },
    {
      "title": "Inserción válida del empleado",
      "text": "Se inserta el empleado 101 con clave foránea 10. La referencia existe y la inserción se confirma.",
      "scene": {
        "boxes": [
          {"x": 20, "y": 80, "w": 120, "h": 50, "label": "EMP 101", "size": 14, "tone": "green", "rx": 6},
          {"x": 220, "y": 80, "w": 120, "h": 50, "label": "DEP 10", "size": 14, "tone": "blue", "rx": 6}
        ],
        "arrows": [
          {"x1": 140, "y1": 105, "x2": 220, "y2": 105, "label": "FK conecta", "tone": "green"}
        ],
        "labels": [
          {"x": 80, "y": 60, "text": "Gómez (10)", "size": 12, "tone": "green", "anchor": "middle"},
          {"x": 280, "y": 60, "text": "Ventas (10)", "size": 12, "tone": "ink", "anchor": "middle"}
        ]
      }
    },
    {
      "title": "Intento de inserción huérfana",
      "text": "Se intenta registrar al empleado 102 con departamento 99. Dicho departamento no existe.",
      "scene": {
        "boxes": [
          {"x": 20, "y": 80, "w": 120, "h": 50, "label": "EMP 102", "size": 14, "tone": "red", "rx": 6},
          {"x": 220, "y": 80, "w": 120, "h": 50, "label": "DEP 10", "size": 14, "tone": "blue", "rx": 6}
        ],
        "arrows": [
          {"x1": 140, "y1": 105, "x2": 220, "y2": 105, "label": "Sin padre", "tone": "red"}
        ],
        "labels": [
          {"x": 80, "y": 60, "text": "Pérez (99)", "size": 12, "tone": "red", "anchor": "middle"},
          {"x": 280, "y": 60, "text": "Ventas (10)", "size": 12, "tone": "ink", "anchor": "middle"}
        ]
      }
    },
    {
      "title": "Rechazo por violación de integridad",
      "text": "El motor relacional aborta la inserción y arroja un error de integridad referencial.",
      "scene": {
        "boxes": [
          {"x": 20, "y": 80, "w": 120, "h": 50, "label": "BLOQUEADO", "size": 13, "tone": "red", "rx": 6},
          {"x": 220, "y": 80, "w": 120, "h": 50, "label": "DEP 10", "size": 14, "tone": "blue", "rx": 6}
        ],
        "arrows": [
          {"x1": 140, "y1": 105, "x2": 220, "y2": 105, "label": "ORA-02291", "tone": "red"}
        ],
        "labels": [
          {"x": 80, "y": 60, "text": "Rechazado", "size": 12, "tone": "red", "anchor": "middle"},
          {"x": 280, "y": 60, "text": "Ventas (10)", "size": 12, "tone": "ink", "anchor": "middle"}
        ]
      }
    }
  ]
}
</script>
</lk-walkthrough>
Cómo leerlo: recorrido de cuatro pasos sobre validación de claves foráneas y bloqueo de tuplas huérfanas.
## Mini-quiz
### Pregunta 1
Una columna tiene la restricción UNIQUE. ¿Por qué no basta para ser Clave Primaria (PRIMARY KEY)?
### Pregunta 2
En DEPARTMENT y EMPLOYEE existe una clave foránea sin borrado en cascada. ¿Qué ocurre al borrar un departamento con e...
### Pregunta 3
El diseño lógico no depende del almacenamiento físico en disco. ¿Qué principio relacional garantiza esta independencia?
[full output: rtk recall b8fdb329228a8579]
