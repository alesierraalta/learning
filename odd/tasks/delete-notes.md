# Borrar notas (papelera recuperable)

Feature: desde el estudio se puede borrar cualquier nota —una nota rápida, una parte o un tema completo— y nada se destruye: todo se mueve a `.papelera/` dentro del vault.

## Specs

S1 — Se puede borrar cualquier nota: una nota rápida, una parte de un tema y un tema completo.
S2 — Borrar no destruye: lo borrado se mueve a `.papelera/` dentro del vault, con un manifiesto que dice qué era, de dónde vino y cuándo, para poder restaurarlo a mano.
S3 — Borrar una parte se lleva sus archivos (explicación, html, app, demos, mini-quiz) y quita su entrada del plan, para que la parte deje de listarse.
S4 — Solo se borra dentro del vault: identificadores validados, ninguna ruta fuera de la raíz, ningún enlace simbólico que escape, y nunca `.papelera`, `rapidos` ni la raíz misma.
S5 — La interfaz pide confirmación nombrando exactamente lo que se moverá y la biblioteca se actualiza sin recargar la página.

## Tasks

| ID | Specs | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | S2, S4 | inline — `deleteNote()` en el puente: papelera, manifiesto, guardas | ec39ad4 |
| T2 | S3 | inline — reescritura de `plan.json` al borrar una parte | ec39ad4 |
| T3 | S1, S4 | inline — `POST delete` en el estudio | ec39ad4 |
| T4 | S1, S5 | inline — botones, confirmación y refresco en la UI | ec39ad4 |
| T5 | S2 | inline — documentación de la papelera | ec39ad4 |

## Log

L1 (usuario): «Puedas en paralelo, necesito que también hagas una parte para que se puedan borrar las notas, sea cual sea.»

L2 (usuario, decisión): «Papelera recuperable — La nota se mueve a .papelera/ dentro del vault; se puede restaurar y nunca se pierde nada.»

L3 (reconocimiento): `listTopics` ya ignora los directorios que empiezan por punto, así que `.papelera` no aparece como tema ni entra en el motor; el respaldo del vault (`git add -A`) conserva además las notas borradas en el historial.
