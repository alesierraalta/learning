// One palette, two papers: the tokens live in draw.js so a note figure, a still
// and a video frame read the same values. Imported through this module by the
// CLI and the tests.
import visuals from "./draw.js";

export const TONES = visuals.TONES;
export const THEMES = visuals.THEMES;
export const theme = visuals.theme;
