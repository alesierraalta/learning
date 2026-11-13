// 5. Mini-quiz (#265): la parte se cierra con su mini-quiz interactivo, el lk-quiz, nunca con una lista
// numerada. En una nota basta el encabezado «## Mini-quiz» sin lista: el lector dibuja las preguntas de
// mini-quiz/<parte>.json. Una página propia tiene que traer el lk-quiz escrito, porque el lector no añade
// nada a una página que escribió el turno.
export default {
  id: 'mini-quiz',
  check({ src, sinCodigo, esPagina }) {
    const seccionQuiz = (src.match(/^##\s*Mini-quiz\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mi) ?? [])[1];
    const listaDeQuiz = seccionQuiz !== undefined && /^\s*\d+[.)]\s/m.test(seccionQuiz.replace(/```[\s\S]*?```/g, ' '));
    const lkQuiz = /<lk-(quick-)?quiz[\s>]/.test(sinCodigo);
    const quiz = !listaDeQuiz && (esPagina ? lkQuiz : lkQuiz || seccionQuiz !== undefined);
    const fallaQuiz = listaDeQuiz
      ? 'la lista numerada bajo «Mini-quiz» es el quiz sin controles · el mini-quiz es el lk-quiz interactivo: deja el encabezado y pon las preguntas en mini-quiz/<parte>.json, que el lector dibuja solo'
      : esPagina ? 'la página no trae el lk-quiz · escribe <lk-quiz></lk-quiz> bajo «Mini-quiz»: el lector no añade el quiz a una página que escribió el turno' : 'no hay mini-quiz';
    return { ok: quiz, detail: quiz ? '' : fallaQuiz };
  },
};
