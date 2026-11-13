// El registro de las reglas de una nota, en el orden en que se reportan (#269). Cada regla
// vive en su archivo de `rules/`, con su `id` y su `check(nota, ctx)`. Añadir una regla es su
// archivo y una línea aquí, en el lugar que le toca: el orden es el del informe.
import ruta from './rules/ruta.mjs';
import sinResumen from './rules/sin-resumen.mjs';
import secciones from './rules/secciones.mjs';
import escena from './rules/escena.mjs';
import recorrido from './rules/recorrido.mjs';
import historia from './rules/historia.mjs';
import miniQuiz from './rules/mini-quiz.mjs';
import ascii from './rules/ascii.mjs';
import frases from './rules/frases.mjs';
import parrafos from './rules/parrafos.mjs';
import tamano from './rules/tamano.mjs';
import leyenda from './rules/leyenda.mjs';
import formulaWalkthrough from './rules/formula-walkthrough.mjs';
import historiaCabecera from './rules/historia-cabecera.mjs';
import actorSinPersonaje from './rules/actor-sin-personaje.mjs';
import escenarioDeCajas from './rules/escenario-de-cajas.mjs';
import piezaAdecuada from './rules/pieza-adecuada.mjs';
import historiaQuieta from './rules/historia-quieta.mjs';
import cabeceraConFlechas from './rules/cabecera-con-flechas.mjs';
import claveMuerta from './rules/clave-muerta.mjs';
import marcaEco from './rules/marca-eco.mjs';
import veredictoSinError from './rules/veredicto-sin-error.mjs';
import accesorioSinSentido from './rules/accesorio-sin-sentido.mjs';
import personajeSinSentido from './rules/personaje-sin-sentido.mjs';
import registro from './rules/registro.mjs';
import figuras from './rules/figuras.mjs';

export const REGLAS = [
  ruta,
  sinResumen,
  secciones,
  escena,
  recorrido,
  historia,
  miniQuiz,
  ascii,
  frases,
  parrafos,
  tamano,
  leyenda,
  formulaWalkthrough,
  historiaCabecera,
  actorSinPersonaje,
  escenarioDeCajas,
  piezaAdecuada,
  historiaQuieta,
  cabeceraConFlechas,
  claveMuerta,
  marcaEco,
  veredictoSinError,
  accesorioSinSentido,
  personajeSinSentido,
  registro,
  figuras,
];
