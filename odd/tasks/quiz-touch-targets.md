# Objetivos táctiles del mini-quiz en el lector — issue #368

## Specs

- S1: Todo control interactivo del quiz mide al menos 44 × 44 px con `pointer: coarse`, sin cambiar la densidad en puntero fino.
- S2: La comprobación es sobre geometría calculada en navegador, a 390 px, en claro y nocturno.
- S3: El resto del lector no cambia: medida de lectura, índice y navegación quedan como están.

## Tasks

- T1 — S1,S2,S3 — medir en navegador y dar 44 × 44 px a opciones, botones, disclosure y confianza del quiz sin mover el resto del lector — `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`, `integrations/pi/kit/test/` — inline — commit: 

## Log

- L1 (issue #368, verbatim):

```
### Goal

En una verificación independiente del lector se midió, con puntero grueso a 390 px, que los controles del mini-quiz quedan por debajo del mínimo táctil de 44 × 44 px, aunque el resto del Studio ya lo cumple.

### Evidencia medida

- `integrations/pi/view/app.css:203` y `:169`, e `integrations/pi/kit/kit.css:326`.
- Botones de acción del quiz: 33–37 px de alto.
- Disclosure («ver pistas» o equivalente): 36 px.
- Filas de opción del quiz: 31 px.
- Etiquetas de confianza: 22 px de objetivo.

Son las tres hojas del puente del lector, no el Studio: `#44` (cerrada) cubrió los objetivos del Studio, no estas.

### Acceptance criteria

- Todo control interactivo del quiz mide al menos 44 × 44 px con `pointer: coarse`, sin cambiar la densidad en puntero fino.
- La comprobación es sobre geometría calculada en navegador, a 390 px, en claro y nocturno.
- El resto del lector no cambia: medida de lectura, índice y navegación quedan como están.
```
