// 9. El registro: seis reglas que separan la referencia de lo nuestro (`tools/register/`). Cada una
// mide con el umbral del nivel que el alumno eligió en sus preferencias; sin preferencias, «más» en
// los dos ejes, que son los valores de la referencia. Un hallazgo cita la frase y dice cómo reescribirla.
// Son siete filas: cada una trae su propio `rule`, y el registro las devuelve tal cual.
import { hallazgosDeRegistro } from '../../register/hallazgos.mjs';
import { umbralesDe } from '../../register/niveles.mjs';
import { preferenciasDe } from '../../register/preferencias.mjs';

export default {
  id: 'registro',
  check({ src }, { file }) {
    return hallazgosDeRegistro(src, umbralesDe(preferenciasDe(file)));
  },
};
