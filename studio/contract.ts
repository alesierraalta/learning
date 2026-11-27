/**
 * Kept as a re-export for the studio's own tests: the single source lives in
 * `integrations/pi/contract.ts`, which neither runtime owns, so `integrations/pi`
 * never has to depend on `studio/`.
 */
export { OPEN_RESPONSE_TUTOR_PROMPT, VISUAL_CONTRACT_PROMPT, withOpenResponseContract, withVisualContract } from "../integrations/pi/contract.ts";
