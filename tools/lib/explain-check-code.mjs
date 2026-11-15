const HTML_PRE = /<pre\b[^>]*>[\s\S]*?<\/pre>/gi;
const MARKDOWN_FENCE = /```[\s\S]*?```/g;

const fueraDePre = (text) => text.replace(HTML_PRE, (block) => block.replace(/[^\n]/g, ' '));

export function lineasConFencesMarkdown(text) {
  return fueraDePre(text).split(/\r?\n/)
    .flatMap((linea, index) => /^\s*```/.test(linea) ? [index + 1] : []);
}

export function sinCodigo(text, esPagina = false) {
  return (esPagina ? fueraDePre(text) : text).replace(MARKDOWN_FENCE, '\n\n');
}

// Las cercas de Markdown fuera, renglón por renglón: cada cerca queda como una marca que no es blanco (una frase o una
// fórmula a cada lado quedan separadas) y sus renglones como blancos (cada número de línea sigue siendo el del archivo).
export function sinCercasPorRenglon(text) {
  return text.replace(MARKDOWN_FENCE, (cerca) => `\u0001${cerca.slice(1).replace(/[^\n]/g, ' ')}`);
}
