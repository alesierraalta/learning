// Markdown en una página HTML (#323). El tutor escribe la página a mano y el lector la lee como HTML: la sintaxis
// de Markdown que queda fuera de `<script>`, `<style>`, `<pre>` y `<code>` se imprime tal cual. Son las cercas (```),
// los `$$` y los títulos o viñetas que empiezan una línea. El código de un bloque es HTML y no se mide, ni el estilo,
// que es CSS. Una nota de Markdown no se mide aquí: sus cercas son código.

// Lo que el lector ve de la página: los bloques de código, de script y de estilo se quitan, pero se conservan sus
// saltos de línea, para que el número de línea sea el del archivo.
const CODIGO = [/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, /<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, /<code\b[^>]*>[\s\S]*?<\/code\s*>/gi];
const sinCodigo = (html) => CODIGO.reduce((texto, re) => texto.replace(re, (bloque) => bloque.replace(/[^\n]/g, '')), html);

// Cada marca de Markdown, con lo que la página escribe en su lugar. El orden es el de la lista de arriba.
const MARCAS = [
  { marca: 'cerca de código (```)', mide: (linea) => linea.includes('```'), en: 'escribe el bloque con <pre><code>…</code></pre>' },
  { marca: 'fórmula en $$', mide: (linea) => linea.includes('$$'), en: 'escribe la fórmula con <lk-math display>…</lk-math>' },
  { marca: 'título de Markdown', mide: (linea) => /^[ \t]*#{1,6}[ \t]+\S/.test(linea), en: 'escribe el título con <h2>…</h2> (o el nivel que toque)' },
  { marca: 'viñeta de Markdown', mide: (linea) => /^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+\S/.test(linea), en: 'escribe la lista con <ul><li>…</li></ul> u <ol><li>…</li></ol>' },
];

export default {
  id: 'markdown-en-html',
  check(nota) {
    if (!nota.esPagina) return { ok: true, detail: 'una nota, no una página HTML' };
    const items = [];
    sinCodigo(nota.crudo).split('\n').forEach((linea, i) => {
      const marca = MARCAS.find((m) => m.mide(linea));
      if (marca) items.push({ linea: `línea ${i + 1} · ${marca.marca}: ${marca.en}` });
    });
    return items.length
      ? { ok: false, detail: `${items.length} línea(s) con Markdown en una página HTML`, items }
      : { ok: true, detail: '' };
  },
};
