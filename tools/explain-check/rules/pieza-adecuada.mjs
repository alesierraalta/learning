// 7g. La pieza que le toca a la idea (#245). Dos casos medibles: el código que
// cambia filas guardadas (INSERT/UPDATE/DELETE/JOIN) se cuenta con `lk-tables` o
// `lk-memory`, y el contraste entre el código que compila y el que falla se cuenta
// con `lk-cards`. La tabla de decisión vive en la skill; aquí se mide lo que se
// puede medir sin juicio.
export default {
  id: 'pieza-adecuada',
  check({ src, sinCodigo }) {
    const bloquesCodigo = [...src.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const codigo = bloquesCodigo.join('\n');
    const cambiaFilas = /\b(INSERT|UPDATE|DELETE|JOIN)\b/i.test(codigo);
    const traeTablasOMemoria = /<lk-(tables|memory)[\s>]/.test(sinCodigo);
    const contrastaCodigo = bloquesCodigo.length >= 2 &&
      /no compila|error de compilaci[oó]n|compile error|does not compile|no compile|falla al compilar|panic:/i.test(src);
    const traeTarjetas = /<lk-cards[\s>]/.test(sinCodigo);
    const piezasQueFaltan = [
      cambiaFilas && !traeTablasOMemoria
        ? 'el código cambia filas guardadas (INSERT/UPDATE/DELETE/JOIN) · cuéntalo con <lk-tables> (filas y relaciones) o <lk-memory> (estado en memoria o en disco a lo largo del tiempo)'
        : '',
      contrastaCodigo && !traeTarjetas
        ? 'la parte contrasta el código que compila con el que falla · dibújalo con <lk-cards> (la regla frente a la violación, con su código)'
        : '',
    ].filter(Boolean);
    return { ok: piezasQueFaltan.length === 0, detail: piezasQueFaltan.join(' · ') };
  },
};
