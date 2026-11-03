// Read the visual track a part already owns: its <lk-walkthrough> decks.
// A deck is inline JSON in the note; the video animates the very same scenes,
// so the video can never draw something the note does not draw.
const DECK = /<lk-walkthrough[^>]*>\s*<script type="application\/json">([\s\S]*?)<\/script>/g;

export function extractDecks(markdown) {
  const decks = [];
  for (const match of markdown.matchAll(DECK)) {
    let deck;
    try {
      deck = JSON.parse(match[1]);
    } catch (cause) {
      throw new Error(`walkthrough deck #${decks.length + 1} is not valid JSON: ${cause.message}`, { cause });
    }
    if (!deck || typeof deck.title !== "string") throw new Error("walkthrough deck without a title");
    if (!Array.isArray(deck.steps) || deck.steps.length === 0) throw new Error(`deck "${deck.title}" has no steps`);
    for (const [i, step] of deck.steps.entries()) {
      if (!step || typeof step.scene !== "object") throw new Error(`deck "${deck.title}" step ${i} has no scene`);
    }
    decks.push({ title: deck.title, viewBox: deck.viewBox || "0 0 360 290", steps: deck.steps });
  }
  return decks;
}

export function deckByTitle(decks, title) {
  const deck = decks.find((d) => d.title === title);
  if (!deck) {
    const known = decks.map((d) => `"${d.title}"`).join(", ");
    throw new Error(`deck "${title}" is not in the note (available: ${known || "none"})`);
  }
  return deck;
}
