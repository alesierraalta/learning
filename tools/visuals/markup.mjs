// The drawing lives in draw.js, one classic script the CLI and the reader both
// load. These named exports keep the engine's module surface: callers import the
// same functions, whether they run in Node or in a browser.
import visuals from "./draw.js";

export const CELL_KINDS = visuals.CELL_KINDS;
export const DIRECTIONS = visuals.DIRECTIONS;
export const signed = visuals.signed;
export const varsStyle = visuals.varsStyle;
export const themeCss = visuals.themeCss;
export const renderScene = visuals.renderScene;
export const sceneProblems = visuals.sceneProblems;
export const sceneDraws = visuals.sceneDraws;
