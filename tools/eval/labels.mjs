/** Shared label helpers: Spanish stop words and question/target word overlap. */
import { normalizar } from "../../studio/indice.ts";

export const STOPWORDS = new Set(`
a al alas antes asi cada como con contra cual cuando de del desde dos el ella ellos en entre era es esta estas este estos
fue ha hay la las le les lo los mas más me menos mi mio mucho muy no nos nuestra nuestro o os otra otras otro otros para
pero por porque que quien quienes qué se sea ser si sin sobre solamente son su sus tambien te tiene todo todos tu tus vez
un una uno unos unas u y ya yo ésta éstas éste éstos ése ésas ése ésos aquel aquella aquellos aquellas
cómo cuál cuáles cuándo dónde quién quiénes cuánto cuánta cuántos cuántas ningun ninguna ningunos ningunas ningún
`.trim().split(/\s+/).map(normalizar));

/** Content words only: no articles, function words, punctuation or numbers. */
export function contenido(texto) {
  return new Set(normalizar(texto)
    .split(/\s+/)
    .filter((palabra) => palabra.length > 1 && !/^\d/.test(palabra) && !STOPWORDS.has(palabra)));
}

/** Words shared by a question and its target chunk, after stop-word removal. */
export function solape(pregunta, chunk) {
  const palabras = contenido(pregunta);
  const objetivo = contenido(chunk);
  return [...palabras].filter((palabra) => objetivo.has(palabra));
}
