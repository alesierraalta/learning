package engine

import "learning/internal/rules"

// standardRule is one rule of the explanation standard: its id, which is also the
// slug of its file (`standard_<id>.go`, with `_` for `-`), and its check. The id of a
// rule the explain-check tool measures is that tool's rule file slug, under
// `tools/explain-check/rules/`.
type standardRule struct {
	id    string
	check func(text string, th rules.PartStandardThresholds) []string
}

// standardRules is the table standardFindings runs, in the order its findings are
// reported. Adding a rule is its file, one entry here and its test. The id of a
// rule that also has a tool file under `tools/explain-check/rules/` is that file's
// slug; `movimiento-no-dibujado` has none because the tool already measures the
// drawing with `scene-lint` (its `figuras` rule).
var standardRules = []standardRule{
	{"tamano", tamanoFindings},
	{"secciones", seccionesFindings},
	{"ruta", rutaFindings},
	{"escena", sceneFindings},
	{"recorrido", walkthroughFindings},
	{"formula-walkthrough", formulaWalkthroughFindings},
	{"historia", storyLanguageFindings},
	{"historia-cabecera", storyHeaderFindings},
	{"escenario-de-historia", storyStageFindings},
	{"actor-sin-personaje", actorCharacterFindings},
	{"escenario-de-cajas", sceneStageFindings},
	{"historia-quieta", storyMotionFindings},
	{"movimiento-no-dibujado", moveUndrawnFindings},
	{"cabecera-con-flechas", arrowFlowFindings},
	{"clave-muerta", deadKeyFindings},
	{"marca-eco", markEchoFindings},
	{"veredicto-sin-error", verdictErrorFindings},
	{"accesorio-sin-sentido", accessorySenseFindings},
	{"personaje-sin-sentido", characterSenseFindings},
	{"parrafos", parrafosFindings},
	{"ascii", asciiFindings},
	{"leyenda", legendFindings},
	{"sin-resumen", sinResumenFindings},
}

// standardFindings returns one finding per rule the part misses, each naming the
// rule, the measured value, the limit and the fix, so the tutor can correct the
// part from the message alone.
func standardFindings(text string, th rules.PartStandardThresholds) []string {
	var findings []string
	for _, rule := range standardRules {
		findings = append(findings, rule.check(text, th)...)
	}
	return findings
}
