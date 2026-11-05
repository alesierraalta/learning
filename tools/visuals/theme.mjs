// One palette, two papers. A figure never picks a colour: it names a tone, and
// the theme decides what that tone looks like on white and on black.
export const TONES = ["ink", "slate", "line", "soft", "blue", "green", "amber", "red", "muted", "paper"];

export const THEMES = {
  light: {
    paper: "#ffffff",
    ink: "#0F2E3D",
    slate: "#41586B",
    line: "#D7DEE3",
    soft: "#F4F7F8",
    blue: "#004276",
    green: "#21594F",
    amber: "#8A6B3F",
    red: "#B3261E",
    muted: "#8A99A3",
  },
  dark: {
    paper: "#0B0B0C",
    ink: "#F1EFE8",
    slate: "#B9C2C7",
    line: "#2A3238",
    soft: "#14181B",
    blue: "#7FB6E4",
    green: "#6FC3A8",
    amber: "#D8B36A",
    red: "#F08A80",
    muted: "#8695A0",
  },
};

export function theme(name) {
  const found = THEMES[name];
  if (!found) throw new Error(`unknown theme "${name}" (themes: ${Object.keys(THEMES).join(", ")})`);
  return found;
}
