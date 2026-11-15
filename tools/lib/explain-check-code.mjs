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
