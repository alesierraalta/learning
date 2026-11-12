Objective: una parte se genera en minutos, no en diez, para que esperar no rompa la sesión de estudio. Medir primero, después paralelizar y cachear; nunca bajando fps, resolución ni bitrate, y sin eliminar gates.
Branch: feat/232-generacion-rapida (desde origin/main @ 29cae5c) · Issues #232 #233 #234 #235, milestone 9 · Runner: `node --test tools/video/test/*.test.mjs` · Delivery: ask-on-risk

## Specs

- S1 (medición): ninguna mejora se declara sin duración real por etapa, persistida junto a la salida del render. Hoy solo se imprimen fps/ETA durante la captura (`tools/video/render.mjs:111-117`) y una estimación por conteo de palabras (`tools/audio/render.mjs:41-55`).
- S2 (paralelismo): la captura de frames y la síntesis de voz dejan de ser estrictamente secuenciales. El orden de frames que entra al encoder y las muestras de audio no cambian.
- S3 (caché): editar una escena no re-captura ni re-codifica las demás; la clave de caché se invalida por contenido real.
- S4 (calidad, palabra del humano): "no quiero perder calidad". Prohibido bajar fps, resolución o bitrate, cambiar el encoder, o relajar/eliminar gates.
- S5 (autoridad de los gates): un gate que hoy aborta sigue abortando la entrega; deja de bloquear el render, no su veredicto.
- S6 (alcance): video de la parte y página/parte de estudio, por igual.

## Tasks

- T1 S1 medición de duración por etapa, persistida con la salida — worker — done `ba9f3ef` (#232)
- T2 S2 captura de frames en paralelo, mismo orden y mismos frames — worker — done `48ee47e` (#233)
- T3 S2 navegador reusado y menos overhead por frame — worker — pendiente (#233)
- T4 S3 caché por hash de escena y encode por segmentos con stream copy — worker — pendiente (#234)
- T5 S2 síntesis de voz con concurrencia acotada sobre la caché SHA-256 — worker — pendiente (#235)
- T6 S5 legibilidad concurrente, mismo veredicto y mismo bloqueo de entrega — worker — pendiente (#235)
- T7 S6 página: medir la generación y cachear por sección — worker — pendiente (necesita issue propio)

## Log

- L1 (2026-11-12, humano, verbatim): "Voy a buscar la forma de reducir el tiempo de generación de cualquier cosa, porque creo que se está tardando en exceso y bueno, eso genera bastante fricción porque bueno, tú entras con ganas de estudiar, pero cuando tienes que generar algo de estudio, tarda 10 minutos, no sé si, bueno, 10 minutos, pues por poner un número, pero 10 minutos es bastante. Y bueno, ya se te olvida que estabas estudiando y te vas a hacer otra cosa y no vuelves. Entonces, no quiero perder calidad, pero necesito acelerar el proceso en el cual se generan las cosas, porque como te digo, genera bastante fricción."
- L2 (humano): "3" → el alcance son ambos artefactos, video y página, sin priorizar uno.
- L3 (decisión, humano): implementar el plan completo — medir, frames paralelos, navegador reusado, caché por escena, TTS concurrente y gates concurrentes.
- L4 (decisión, humano): publicar el milestone 9 "Generación rápida de una parte" con 4 issues: #232 medición, #233 frames y overhead, #234 caché y segmentos, #235 audio y gates.
- L5 (evidencia, repo): el render de Parte 3 son 11 316 frames a 20 fps y ~9,5 min (`odd/tasks/educational-video-engine.md`, T3), y la captura es un `screenshot` PNG por frame en serie (`tools/video/render.mjs:114`). Aritmética y registro coinciden: el grueso está en captura y encode, no en el modelo.
- L6 (evidencia, explorador): no hay concurrencia ni caché en `tools/video`; `ffprobe` por beat en serie (`tools/video/lib/audio.mjs:63-89`); TTS un turno por vez con caché SHA-256 (`tools/audio/synth.py:27-43,126-135`); gates sincrónicos antes del render (`render.mjs:34-39,52-57`); la página usa un prompt monolítico sin caché (`studio/ui/studio.js:392-407`, `studio/server.ts:56,624-628`).
- L7 (estado): se trabaja en el worktree `~/documents/learning-worktrees/feat-232-generacion-rapida`. El checkout principal está en `feat/tutor-runtime`, 141 commits detrás de main y con cambios sin commitear en estos mismos archivos: no se toca ni se mezcla.
- L8 (T1, 2026-11-12): `tools/video/lib/timings.mjs` + instrumentación en `render.mjs`; `timings.json` se escribe último, después de `final.srt`, así un render rechazado no deja reporte. Diff aditivo: bucle de frames, argv de ffmpeg y gates intactos. Suite 100 tests / 97 pass / 3 skipped (antes 97/94/3). Dos tests nuevos nacieron en RED con `ENOENT` de `timings.json` tras `run.code === 0`. `encode` se solapa con `capture` por construcción (los frames van por stdin mientras ffmpeg codifica) y el reporte lo declara con `overlaps: "capture"`; por eso la suma de etapas supera `total_ms`. Sin prueba de identidad byte a byte del MP4: la evidencia es el diff aditivo, y T2 traerá la comparación de hashes por frame. Commit `ba9f3ef`.
- L9 (T2, 2026-11-12): captura en N páginas del mismo Chromium, `--workers` (default 4 en esta máquina, `--workers 1` es el camino viejo). Identidad byte a byte probada por hash de frame a 12 y 90 frames y por `framemd5` de los MP4. Ventana de 9 s: capture 12 658 ms → 7 415-7 582 ms (19 → 32 fps), wall 13,5 s → 8,7 s. Memoria acotada a 2 frames por worker; el pico del renderer no cambió (148 → 150 MB a 240 frames). Hallazgo lateral: un ffmpeg muerto colgaba el render más de 300 s; ahora falla en 1,4 s y quedó cubierto por test. Ganancia real ~1,7×, no ~3×: ffmpeg compite por CPU. Commit `48ee47e`.
