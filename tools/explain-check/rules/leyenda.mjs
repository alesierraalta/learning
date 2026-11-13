// 7b. La leyenda: una fórmula que no nombra sus símbolos no se entiende. Cada símbolo
// que aparece en una fórmula (latino de una letra o griega) se nombra en las líneas
// siguientes, en la forma `x` es ... o «x → ...». La fórmula también puede venir
// dibujada en una escena, símbolo por símbolo: los callouts de la escena son su
// leyenda, y el arreglo de una fórmula sin leyenda es esa escena, nunca <lk-math>.
//
// Una macro griega es un símbolo: son las variables de la fórmula, y se leen igual
// escritas como macro (`\sigma`) que literales (`σ`). Todo lo demás es un comando:
// da forma (`\frac`, `\left`, `\right`), opera (`\cdot`, `\sum`, `\int`) o nombra
// una función (`\exp`, `\log`, `\mathrm`, `\text`), y un comando no se define en la
// leyenda. `\pi` y `e` son constantes, no símbolos que la parte tenga que nombrar.
const GRIEGAS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'varpi', 'rho', 'varrho', 'sigma',
  'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'digamma',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);
const CONSTANTES = new Set(['pi', 'Pi', 'varpi']);
const LETRAS_CONSTANTES = new Set(['π', 'Π', 'ϖ']);

export default {
  id: 'leyenda',
  check({ src, formulas, dibujadas, planas }) {
    const simbolos = new Set();
    for (const f of formulas.concat(dibujadas).concat(planas)) {
      for (const m of f.match(/\\[A-Za-z]+/g) || []) {
        const nombre = m.slice(1);
        if (GRIEGAS.has(nombre) && !CONSTANTES.has(nombre)) simbolos.add(m);
      }
      const limpio = f.replace(/\\[A-Za-z]+/g, ' ').replace(/\{[^}]*\}/g, ' ');
      // `e` como número de Euler (`e^{…}`) es una constante, no un símbolo.
      const sinEuler = limpio.replace(/(^|[^A-Za-z])e\s*\^/g, ' ');
      for (const w of sinEuler.match(/[A-Za-z]+/g) || []) if (w.length === 1) simbolos.add(w);
      // Una griega literal es un símbolo como cualquier otro, salvo las constantes.
      for (const g of sinEuler.match(/\p{Script=Greek}/gu) || []) if (!LETRAS_CONSTANTES.has(g)) simbolos.add(g);
    }
    const sinNombrar = [...simbolos].filter((s) => {
      // Un símbolo está nombrado si aparece entre comillas o seguido de = → : o "es".
      // El borde es Unicode: `\\b` es ASCII, así que «① γ: …» no nombraba a γ. Y la
      // letra es la misma: `Q` y `q` son símbolos distintos.
      const nombre = s.replace(/^\\/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp('(\\x60|«|")\\s*\\\\?' + nombre + '\\s*(\\x60|»|")|(^|[^\\p{L}\\p{N}_])' + nombre + '\\s*(=|→|->|:|es\\b)', 'u');
      return !patron.test(src);
    });
    const sinFormula = formulas.length === 0 && dibujadas.length === 0 && planas.length === 0;
    // El arreglo es la escena anotada: un callout por símbolo. <lk-math> dibuja una
    // ecuación limpia y sin flechas, así que queda para una cuenta.
    const arreglo = `dibuja la fórmula como escena anotada: un callout numerado por símbolo, con su nombre en su línea de labels («① ${sinNombrar[0]}: …»)`;
    const cuenta = planas.length ? '; <lk-math> es para una cuenta, nunca para explicar una fórmula' : '';
    return {
      ok: sinNombrar.length === 0,
      detail: sinFormula ? 'sin fórmulas' : sinNombrar.length ? `símbolo(s) sin nombrar: ${sinNombrar.join(', ')} · ${arreglo}${cuenta}` : '',
    };
  },
};
