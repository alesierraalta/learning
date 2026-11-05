// El error HTTP del plugin, en su propio módulo.
//
// Vivía en `bridge.ts` y `telemetry.ts` lo importaba de ahí, mientras el puente
// importaba `telemetry.ts` para registrar los quizzes: un ciclo real, con una
// clase que viaja en tiempo de ejecución y no como `import type`. El gate de
// arquitectura lo encontró en su primera pasada.
//
// `bridge.ts` lo sigue exportando, así que quien ya lo importaba desde el
// puente no cambia nada.

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
