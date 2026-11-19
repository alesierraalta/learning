package engine

import (
	"strconv"
	"strings"
	"testing"

	"learning/internal/rules"
)

// La prelectura (S27, S28): una parte escrita al contrato nuevo abre con una
// introducción en palabras llanas —de cuatro a seis frases, unas 60 a 160 palabras, en
// párrafos cortos— antes de `## Ruta`, y cada línea numerada de la ruta nombra el
// paso y añade una frase de diez palabras o más con lo que se verá ahí. Ni el resumen
// ni la ruta nombran un término que la parte explica después sin parafrasearlo. Una
// parte antigua, con figuras de legado, sigue pasando igual (S10).

// rutaEtapa es la figura del contrato nuevo: una sola liña basta para que la nota cuente
// como escrita a mano nueva sin tocar ninguna figura de legado.
const rutaEtapa = `<lk-stage>
<script type="application/json">
{"actors":[],"steps":[]}
</script>
</lk-stage>`

// rutaPrelectura es la introducción de la parte: cinco frases llanas, en palabras que
// el lector ya entiende, de lo que va a ver.
const rutaPrelectura = "Antes de entrar en materia, imagina un robot que limpia una sala sin que nadie le diga cómo hacerlo. " +
	"Al principio prueba al azar y casi todo le sale mal. " +
	"Poco a poco descubre qué le conviene hacer en cada momento y lo repite. " +
	"En esta parte vas a ver qué mira antes de moverse y por qué el premio que recibe llega tarde. " +
	"Al terminar, podrás contar con tus palabras cómo aprende algo tan simple como limpiar."

// rutaPrelecturaCorta es la prelectura de S27: dos frases, que ahora se quedan cortas.
const rutaPrelecturaCorta = "Esta parte trata del robot que aprende a limpiar sin que nadie le diga cómo. " +
	"Verás qué mira antes de decidir y por qué el premio llega tarde."

// rutaPrelecturaConTermino usa un término que la parte solo explica después, sin
// parafrasearlo: el lector todavía no sabe qué es una especificación.
const rutaPrelecturaConTermino = "Antes de entrar en materia, imagina un robot que limpia una sala sin que nadie le diga cómo hacerlo. " +
	"Al principio prueba al azar y casi todo le sale mal. " +
	"En esta parte vas a ver cómo la especificación se conecta con lo que el robot debe hacer. " +
	"Poco a poco el robot descubre qué le conviene en cada momento y lo repite. " +
	"Al terminar, podrás contar con tus palabras cómo aprende algo tan simple como limpiar."

// rutaDetallada es la ruta del contrato nuevo: cada línea nombra el paso y dice qué se verá.
const rutaDetallada = `1. El robot y la sala — qué mira el robot antes de decidir cada movimiento que hace.
2. El premio tardío — por qué la recompensa llega muchos pasos después de la acción.
3. La política — qué acción elige el robot en cada casilla del mapa que recorre.`

// rutaPelada es la misma ruta sin la frase descriptiva: solo el nombre del paso.
const rutaPelada = `1. El robot y la sala
2. El premio tardío
3. La política`

// rutaNota arma una parte con una figura del contrato nuevo, la prelectura y la ruta dadas.
func rutaNota(prelectura, ruta string) string {
	return rutaNotaConCuerpo(prelectura, ruta, "El robot mira la sala y elige.")
}

// rutaNotaConCuerpo arma la misma parte con el cuerpo de la sección de contenido dado,
// que es donde la parte define los términos que explica.
func rutaNotaConCuerpo(prelectura, ruta, cuerpo string) string {
	partes := []string{"# Parte 1", prelectura, "## Ruta", ruta,
		"## 1. El robot", cuerpo, rutaEtapa}
	var lineas []string
	for _, p := range partes {
		if p != "" {
			lineas = append(lineas, p+"\n")
		}
	}
	return strings.Join(lineas, "\n")
}

func rutaTestThresholds(t *testing.T) rules.PartStandardThresholds {
	t.Helper()
	return cueThresholds(t, `{"minRutaLines":3,"maxRutaLines":4}`)
}

// Una parte nueva sin prelectura falla, y el mensaje dice dónde va y cómo se escribe.
func TestRutaNewContractAsksForThePreReading(t *testing.T) {
	th := rutaTestThresholds(t)
	findings := rutaFindings(rutaNota("", rutaDetallada), th)
	if len(findings) != 1 {
		t.Fatalf("a new-contract part without a pre-reading: %v, want one finding", findings)
	}
	if !strings.Contains(findings[0], "pre-reading") {
		t.Fatalf("the finding does not name the pre-reading: %q", findings[0])
	}
}

// Una parte nueva con prelectura pero con la ruta pelada falla: cada línea dice qué se verá.
func TestRutaNewContractAsksForADescriptionOnEveryLine(t *testing.T) {
	th := rutaTestThresholds(t)
	findings := rutaFindings(rutaNota(rutaPrelectura, rutaPelada), th)
	if len(findings) != 3 {
		t.Fatalf("a new-contract part with bare route lines: %v, want one finding per line", findings)
	}
	for i, finding := range findings {
		if !strings.Contains(finding, "line "+strconv.Itoa(i+1)) {
			t.Fatalf("finding %d does not name its line: %q", i+1, finding)
		}
	}
}

// Las dos cosas escritas: la ruta pasa.
func TestRutaNewContractPassesWithPreReadingAndDescriptions(t *testing.T) {
	th := rutaTestThresholds(t)
	if findings := rutaFindings(rutaNota(rutaPrelectura, rutaDetallada), th); len(findings) != 0 {
		t.Fatalf("a new-contract part with the pre-reading and the descriptions: %v, want none", findings)
	}
}

// La misma forma con un separador distinto también cuenta: `:` y `-` valen como `—`.
func TestRutaDescriptionSeparators(t *testing.T) {
	th := rutaTestThresholds(t)
	for _, ruta := range []string{
		"1. El robot y la sala: qué mira el robot antes de decidir cada movimiento que hace.\n2. El premio tardío: por qué la recompensa llega muchos pasos después de la acción.\n3. La política: qué acción elige el robot en cada casilla del mapa que recorre.",
		"1. El robot y la sala - qué mira el robot antes de decidir cada movimiento que hace.\n2. El premio tardío - por qué la recompensa llega muchos pasos después de la acción.\n3. La política - qué acción elige el robot en cada casilla del mapa que recorre.",
	} {
		if findings := rutaFindings(rutaNota(rutaPrelectura, ruta), th); len(findings) != 0 {
			t.Fatalf("%q: %v, want none", ruta, findings)
		}
	}
}

// Una frase corta tras el separador no es una descripción: se piden diez palabras o más.
func TestRutaDescriptionNeedsTenWords(t *testing.T) {
	th := rutaTestThresholds(t)
	ruta := "1. El robot y la sala — lo que mira antes de elegir.\n2. El premio tardío — lo que espera después de actuar.\n3. La política — lo que elige en cada casilla."
	findings := rutaFindings(rutaNota(rutaPrelectura, ruta), th)
	if len(findings) != 3 {
		t.Fatalf("three short descriptions: %v, want three findings", findings)
	}
}

// El resumen ya no es de dos o tres frases: es una introducción de cuatro a seis, de 60 a
// 160 palabras, en párrafos cortos (S28, que releva los topes de S27).
func TestRutaPreReadingIsAnIntroduction(t *testing.T) {
	th := rutaTestThresholds(t)
	dosParrafos := rutaPrelectura + "\n\n" + "Con eso en la cabeza, el resto de la parte se lee sin volver atrás y sin adivinar qué viene después."
	casos := map[string]struct {
		prelectura string
		ok         bool
	}{
		"dos frases":                  {rutaPrelecturaCorta, false},
		"siete frases":                {rutaPrelectura + " Y eso es todo. Fin.", false},
		"cuatrocientas palabras":      {strings.TrimSpace(strings.Repeat("El robot mira la sala y elige una acción cada vez que se mueve por ella. ", 20)), false},
		"cinco frases":                {rutaPrelectura, true},
		"dos párrafos de seis frases": {dosParrafos, true},
	}
	for nombre, caso := range casos {
		findings := rutaFindings(rutaNota(caso.prelectura, rutaDetallada), th)
		if caso.ok && len(findings) != 0 {
			t.Fatalf("%s: %v, want none", nombre, findings)
		}
		if !caso.ok && len(findings) == 0 {
			t.Fatalf("%s: want one finding", nombre)
		}
	}
}

// Una definición en el cuerpo: el término que la parte explica después no puede aparecer
// en la prelectura sin parafrasearse, porque el lector todavía no lo entiende.
func TestRutaPreReadingCannotNameATermDefinedLater(t *testing.T) {
	th := rutaTestThresholds(t)
	cuerpo := "**Especificación**: es el documento que dice qué debe hacer el sistema."
	findings := rutaFindings(rutaNotaConCuerpo(rutaPrelecturaConTermino, rutaDetallada, cuerpo), th)
	if len(findings) != 1 {
		t.Fatalf("a pre-reading that names «especificación»: %v, want one finding", findings)
	}
	if !strings.Contains(strings.ToLower(findings[0]), "especificación") {
		t.Fatalf("the finding does not name the term: %q", findings[0])
	}
}

// La misma frase pasa si el término se parafrasea entre paréntesis justo después.
func TestRutaPreReadingAcceptsAPlainLanguageParaphrase(t *testing.T) {
	th := rutaTestThresholds(t)
	cuerpo := "**Especificación**: es el documento que dice qué debe hacer el sistema."
	prelectura := strings.Replace(rutaPrelecturaConTermino, "la especificación",
		"la especificación (el documento que dice qué debe hacer el sistema)", 1)
	if findings := rutaFindings(rutaNotaConCuerpo(prelectura, rutaDetallada, cuerpo), th); len(findings) != 0 {
		t.Fatalf("a pre-reading that paraphrases the term: %v, want none", findings)
	}
}

// La ruta tampoco nombra el término sin parafrasearlo: la línea dice de qué va el paso en
// palabras que el lector ya entiende.
func TestRutaLineCannotNameATermDefinedLater(t *testing.T) {
	th := rutaTestThresholds(t)
	cuerpo := "**Especificación**: es el documento que dice qué debe hacer el sistema."
	ruta := `1. El robot y la sala — qué mira el robot antes de decidir según la especificación del ejercicio.
2. El premio tardío — por qué la recompensa llega muchos pasos después de la acción.
3. La política — qué acción elige el robot en cada casilla del mapa que recorre.`
	findings := rutaFindings(rutaNotaConCuerpo(rutaPrelectura, ruta, cuerpo), th)
	if len(findings) != 1 {
		t.Fatalf("a route line that names «especificación»: %v, want one finding", findings)
	}
	if !strings.Contains(findings[0], "line 1") || !strings.Contains(strings.ToLower(findings[0]), "especificación") {
		t.Fatalf("the finding does not name the line and the term: %q", findings[0])
	}
	rutaConParafrasis := strings.Replace(ruta, "la especificación del ejercicio",
		"la especificación (el documento que dice qué debe hacer el sistema)", 1)
	if findings := rutaFindings(rutaNotaConCuerpo(rutaPrelectura, rutaConParafrasis, cuerpo), th); len(findings) != 0 {
		t.Fatalf("a route line that paraphrases the term: %v, want none", findings)
	}
}

// Una parte de legado —con figuras antiguas y sin prelectura— sigue pasando igual (S10).
func TestRutaLegacyPartKeepsPassing(t *testing.T) {
	th := rutaTestThresholds(t)
	legacy := rutaNota("", rutaPelada)
	legacy = strings.Replace(legacy, rutaEtapa, standardScene, 1)
	if findings := rutaFindings(legacy, th); len(findings) != 0 {
		t.Fatalf("a legacy part without pre-reading: %v, want none", findings)
	}
}
