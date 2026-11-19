package engine

import (
	"strconv"
	"strings"
	"testing"

	"learning/internal/rules"
)

// La prelectura (S27): una parte escrita al contrato nuevo abre con un resumen corto de
// lo que va a cubrir —dos o tres frases llanas, sin pasar de 70 palabras— antes de
// `## Ruta`, y cada línea numerada de la ruta nombra el paso y añade una frase de lo
// que se verá ahí. Una parte antigua, con figuras de legado, sigue pasando igual (S10).

// rutaEtapa es la figura del contrato nuevo: una sola liña basta para que la nota cuente
// como escrita a mano nueva sin tocar ninguna figura de legado.
const rutaEtapa = `<lk-stage>
<script type="application/json">
{"actors":[],"steps":[]}
</script>
</lk-stage>`

// rutaPrelectura es el resumen de prelectura: dos frases llanas de lo que se va a ver.
const rutaPrelectura = "Esta parte trata del robot que aprende a limpiar sin que nadie le diga cómo. " +
	"Verás qué mira antes de decidir y por qué el premio llega tarde."

// rutaDetallada es la ruta del contrato nuevo: cada línea nombra el paso y dice qué se verá.
const rutaDetallada = `1. El robot y la sala — qué mira el robot antes de decidir cada acción.
2. El premio tardío — por qué la recompensa llega muchos pasos después.
3. La política — qué acción elige en cada casilla del mapa.`

// rutaPelada es la misma ruta sin la frase descriptiva: solo el nombre del paso.
const rutaPelada = `1. El robot y la sala
2. El premio tardío
3. La política`

// rutaNota arma una parte con una figura del contrato nuevo, la prelectura y la ruta dadas.
func rutaNota(prelectura, ruta string) string {
	partes := []string{"# Parte 1", prelectura, "## Ruta", ruta,
		"## 1. El robot", "El robot mira la sala y elige.", rutaEtapa}
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
		"1. El robot y la sala: qué mira el robot antes de decidir cada acción.\n2. El premio tardío: por qué la recompensa llega muchos pasos después.\n3. La política: qué acción elige en cada casilla del mapa.",
		"1. El robot y la sala - qué mira el robot antes de decidir cada acción.\n2. El premio tardío - por qué la recompensa llega muchos pasos después.\n3. La política - qué acción elige en cada casilla del mapa.",
	} {
		if findings := rutaFindings(rutaNota(rutaPrelectura, ruta), th); len(findings) != 0 {
			t.Fatalf("%q: %v, want none", ruta, findings)
		}
	}
}

// Una frase corta tras el separador no es una descripción: se piden seis palabras o más.
func TestRutaDescriptionNeedsSixWords(t *testing.T) {
	th := rutaTestThresholds(t)
	ruta := "1. El robot y la sala — lo que mira.\n2. El premio tardío — lo que espera.\n3. La política — lo que elige."
	findings := rutaFindings(rutaNota(rutaPrelectura, ruta), th)
	if len(findings) != 3 {
		t.Fatalf("three short descriptions: %v, want three findings", findings)
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

// La prelectura se mide: dos o tres frases y como mucho 70 palabras.
func TestRutaPreReadingShape(t *testing.T) {
	th := rutaTestThresholds(t)
	casos := map[string]struct {
		prelectura string
		ok         bool
	}{
		"una sola frase":   {"Esta parte trata del robot que aprende a limpiar sin que nadie le diga cómo.", false},
		"cuatro frases":    {rutaPrelectura + " Mira. Mira otra vez.", false},
		"noventa palabras": {strings.TrimSpace(strings.Repeat("El robot mira la sala y elige una acción cada vez que se mueve por ella. ", 9)), false},
		"dos frases":       {rutaPrelectura, true},
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
