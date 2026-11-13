// La nota de una página HTML (#265). Una página que escribió un turno se mide con las mismas reglas que
// su nota: aquí se traduce a la forma que esas reglas leen. Los títulos, las listas y los párrafos vuelven a
// Markdown; cada figura del kit (`<lk-…>` con su JSON) pasa tal cual, porque el lector la dibuja igual en
// las dos. El motor (`internal/engine/nota_html.go`) hace la misma traducción, y un test cruza las dos salidas.

const FIGURA = /<(lk-[a-z][a-z-]*)\b[^>]*>[\s\S]*?<\/\1>/g;
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Un bloque de texto: las marcas en línea se vuelven Markdown y el resto de etiquetas se quitan.
const enLinea = (cuerpo) => cuerpo
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/?(strong|b)\b[^>]*>/gi, '**')
  .replace(/<\/?(em|i)\b[^>]*>/gi, '*')
  .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  .replace(/<[^>]+>/g, '')
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) => (e === '#39' ? "'" : ENTIDADES[e]));

// Cada elemento es su propia línea, sin líneas en blanco entre ellos: una lista es un bloque, como en la nota.
const elementos = (cuerpo, marca) => {
  let n = 0;
  return cuerpo.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, li) => `${marca(++n)}${enLinea(li).trim()}\n`);
};

/** La página como nota de Markdown: el texto que el lector ve, con sus figuras del kit intactas. */
export function notaDeHtml(html) {
  const guardadas = [];
  const guarda = (bloque) => `\u0000${guardadas.push(bloque) - 1}\u0000`;
  const texto = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(FIGURA, guarda)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(link|meta|title)\b[^>]*>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, cuerpo) => `\n\n${'#'.repeat(Number(n))} ${enLinea(cuerpo).trim()}\n\n`)
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, cuerpo) => `\n\n${elementos(cuerpo, (i) => `${i}. `)}\n\n`)
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, cuerpo) => `\n\n${elementos(cuerpo, () => '- ')}\n\n`)
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, cuerpo) => `\n\n${enLinea(cuerpo).trim()}\n\n`)
    .replace(/<\/?(main|section|article|div|body|html|header|footer|figure|figcaption)\b[^>]*>/gi, '\n\n');
  const nota = enLinea(texto)
    .replace(/\u0000(\d+)\u0000/g, (_, i) => guardadas[Number(i)])
    .split('\n').map((l) => l.trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${nota}\n`;
}
