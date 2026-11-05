// Colour mixing lives in draw.js: a fill leans toward its own paper, never
// layered with alpha over an unknown background.
import visuals from "./draw.js";

export const mix = visuals.mix;
export const luminance = visuals.luminance;
export const contrast = visuals.contrast;
