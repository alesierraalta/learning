export default {
  id: 'codigo-pagina',
  authoringOnly: false,
  check({ lineasFencesMarkdown }) {
    return {
      ok: lineasFencesMarkdown.length === 0,
      detail: lineasFencesMarkdown.length
        ? `${lineasFencesMarkdown.map((linea) => `línea ${linea}`).join(', ')}: usa <pre><code class="language-…"> en lugar de un fence Markdown`
        : '',
    };
  },
};
