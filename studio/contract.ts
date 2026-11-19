/**
 * Kept as a re-export for the studio's own tests: the single source lives in
 * `integrations/pi/contract.ts`, which neither runtime owns, so `integrations/pi`
 * never has to depend on `studio/`.
 */
export { VISUAL_CONTRACT_PROMPT, withVisualContract } from "../integrations/pi/contract.ts";
