/**
 * The dictation service, called the same way from the reader and the studio: upload
 * the recording, wait for the job, read the text, drop the job.
 */

export interface Transcriber {
  url: string;
  token: string;
  deadlineMs?: number;
}

/** A recording the browser sends: shared limit so both surfaces refuse the same size. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** Why a recording did not become text, so each surface can answer with its own status. */
export class TranscribeError extends Error {
  readonly kind: "timeout" | "failed";
  readonly detail?: unknown;

  constructor(kind: "timeout" | "failed", detail?: unknown) {
    super(`transcriber ${kind}`);
    this.name = "TranscribeError";
    this.kind = kind;
    this.detail = detail;
  }
}

const EXTENSIONS: Record<string, string> = { webm: "webm", ogg: "ogg", mp4: "m4a", wav: "wav", mpeg: "mp3" };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Returns what was said. Speaker diarization stays off: dictation is one voice, and
 * "Speaker N:" prefixes would end up inside what the learner wrote.
 */
export async function transcribeAudio(target: Transcriber, audio: Buffer, mediaType: string): Promise<string> {
  const type = mediaType.toLowerCase();
  if (!type.startsWith("audio/")) throw new TranscribeError("failed", "not audio");
  if (audio.length === 0) throw new TranscribeError("failed", "empty audio");
  const ext = EXTENSIONS[type.split(";")[0].slice(6)] ?? "webm";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.deadlineMs ?? 90000);
  const headers = { authorization: `Bearer ${target.token}` };
  const jobs = `${target.url.replace(/\/$/, "")}/api/jobs`;
  let job: string | undefined;
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw new Error("transcriber");
    return response;
  };
  try {
    const uploaded: unknown = await (await call(`${jobs}?filename=dictado.${ext}&diarize=false`, { method: "PUT", body: new Uint8Array(audio) })).json();
    if (!isRecord(uploaded) || typeof uploaded.id !== "string" || !uploaded.id) throw new Error("missing job");
    job = `${jobs}/${encodeURIComponent(uploaded.id)}`;
    while (true) {
      const state: unknown = await (await call(job)).json();
      if (!isRecord(state)) throw new Error("missing state");
      if (state.status === "failed") throw new Error("failed");
      if (state.status === "done") break;
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      if (controller.signal.aborted) throw new Error("timeout");
    }
    const text = await (await call(`${job}/txt`)).text();
    await fetch(job, { method: "DELETE", headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
    job = undefined;
    return text;
  } catch (error) {
    throw new TranscribeError(controller.signal.aborted ? "timeout" : "failed", error);
  } finally {
    clearTimeout(timer);
    // A failed transcription still leaves a job behind: it is dropped, never retried here.
    if (job) await fetch(job, { method: "DELETE", headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
