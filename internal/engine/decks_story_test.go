package engine

import (
	"strings"
	"testing"

	"learning/internal/rules"
)

// The sixth bench run (#291) filed three real parts: Bayes, Git and Rust declare
// `demosPlanned: true` in their plan and draw their story, and the engine blocked
// all three with "without a single arrow". The notes below are the run's own
// text, copied from its vault unchanged, so the RED and the GREEN are measured on
// what the tutor wrote.
// tick is a backtick: the notes quote commands and paths with it.
const tick = "\x60"

const (
	bench291Bayes = `---
tipo: explicacion
nodo: probabilidad-condicional-y-prior
nivel: básico
---

# Parte 1 — Probabilidad condicional, espacio muestral y creencia previa (Prior)

## Ruta

1. Contar a las mil personas en grupos de enfermos y sanos.
2. Aislar a las personas que obtienen un resultado positivo.
3. Dividir los casos: el resultado sale de los conteos.

## El 20% que rinde el 80%

Imagina mil personas en una clínica. Diez de ellas tienen una infección.

La prueba da positivo a nueve enfermos. En cambio, da positivo también a 99 personas sanas.

<lk-tree>
<script type="application/json">
{"title":"De mil personas","caption":"Cada rama lleva cuántas personas pasan y qué parte del grupo de arriba son. Las dos hojas destacadas son los positivos.","nodes":[
 {"id":"todas","lines":["1000 personas"],"kind":"user","tone":"slate"},
 {"id":"enf","lines":["enfermos"],"kind":"user","tone":"blue"},
 {"id":"san","lines":["sanos"],"kind":"user","tone":"slate"},
 {"id":"enf-pos","lines":["positivos"],"kind":"user","tone":"amber","highlight":true},
 {"id":"enf-neg","lines":["negativos"],"kind":"user","tone":"slate"},
 {"id":"san-pos","lines":["positivos","(falsos)"],"kind":"user","tone":"amber","highlight":true},
 {"id":"san-neg","lines":["negativos"],"kind":"user","tone":"slate"}
],
"links":[
 {"from":"todas","to":"enf","count":10,"rate":"1 %"},
 {"from":"todas","to":"san","count":990,"rate":"99 %"},
 {"from":"enf","to":"enf-pos","count":9,"rate":"90 %"},
 {"from":"enf","to":"enf-neg","count":1,"rate":"10 %"},
 {"from":"san","to":"san-pos","count":99,"rate":"10 %"},
 {"from":"san","to":"san-neg","count":891,"rate":"90 %"}
]}
</script>
</lk-tree>

**Prior**
Es la probabilidad previa asignada a la hipótesis antes de ver datos. En nuestro ejemplo, el prior de estar enfermo es del 1 %.

Antes, mirábamos a toda la población sin distinción.

**Espacio muestral**
Es el conjunto de todos los resultados posibles. En nuestro ejemplo, el espacio inicial contiene a las 1000 personas.

Sin embargo, la prueba reduce ese grupo.

**Positivo**
Es el resultado que señala la presencia de infección. En nuestro ejemplo, 108 personas dan positivo en total.

Después, separamos a los que están realmente enfermos.

**Falso positivo**
Es un resultado positivo en una persona sana. En nuestro ejemplo, 99 personas sanas reciben un falso positivo.

**Fuente**: Bayes, T. (1763), *An Essay towards solving a Problem in the Doctrine of Chances*, Philosophical Transactions.

## La fórmula con los conteos

La cuenta sale de los conteos, un paso por vez.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"De los positivos al resultado","viewBox":"0 60 360 190","steps":[
 {"title":"Paso 1: los positivos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["den"],"narrator":"De las mil personas, solo miramos a las que dan positivo.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":90,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"s","kind":"user","x":270,"y":168,"size":72,"tone":"slate","tag":"99 sanos"}]}}},
 {"title":"Paso 2: sumar los positivos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["den"],"narrator":"Son 108 personas: 9 enfermos y 99 sanos.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos"}],"moves":[{"from":"e","to":"g","verb":"+ 9","tone":"amber"},{"from":"s","to":"g","verb":"+ 99","tone":"slate"}]}}},
 {"title":"Paso 3: los enfermos entre ellos","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"enfermos con positivo","id":"num"},{"t":" / ","id":"sl"},{"t":"positivos","id":"den"}]},"focus":["num"],"narrator":"De esos 108, solo nueve están enfermos.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos","state":"faded"}],"moves":[{"from":"e","to":"g","verb":"están aquí","tone":"amber"}],"marks":[{"kind":"ok","actor":"g","label":"9 de 108"}]}}},
 {"title":"Paso 4: el resultado","equation":{"size":22,"atoms":[{"t":"P(enfermo | positivo) = ","id":"lhs"},{"t":"9 / 108 ≈ 0,083","id":"res"}]},"focus":["res"],"narrator":"Entre los positivos, un 8,3 % está enfermo.","stage":{"scene":{"actors":[{"id":"e","kind":"user","x":72,"y":168,"size":72,"tone":"amber","tag":"9 enfermos"},{"id":"g","kind":"user","x":190,"y":168,"size":72,"tone":"blue","tag":"108 positivos"},{"id":"s","kind":"user","x":296,"y":168,"size":72,"tone":"slate","tag":"99 sanos","state":"faded"}],"moves":[{"from":"e","to":"g","verb":"9 de 108","tone":"green"}],"marks":[{"kind":"ok","actor":"g","label":"8,3 %"}]}}}
]}
</script>
</lk-story>

**Probabilidad condicional**
Es la probabilidad de un suceso sabiendo que ocurrió otro. En nuestro ejemplo, es tener la infección sabiendo que el test fue positivo.

## Mini-quiz

<lk-quiz>
- ¿Por qué al calcular P(enfermo | positivo) el denominador es 108 en lugar de 1000?
- ¿Qué representa la probabilidad previa P(enfermo) antes de aplicar la prueba diagnóstica?
- ¿Qué fracción representa la probabilidad de estar enfermo dado que la prueba fue positiva en este grupo?
</lk-quiz>
`
	bench291Git = `---
tipo: explicacion
nodo: 1.1
nivel: básico
---

# Parte 1 — El grafo acíclico de commits y los punteros de rama

## Ruta

1. Un commit fija una instantánea y apunta a su padre.
2. Los commits forman una cadena dirigida hacia atrás.
3. Una rama es un puntero móvil de texto plano.
4. Crear un commit avanza la rama activa automáticamente.

## 1.1 El commit como nodo y su enlace al ancestro

Imagina el repositorio del servicio ` +
		tick +
		`checkout-service` +
		tick +
		`.
El proyecto arranca con el commit c1, avanza a c2 y llega a c3.

**Commit**
Es una captura inmutable del proyecto en un instante.
En nuestro ejemplo, el commit c3 fija el código del cálculo de IVA.

Cada commit contiene un identificador criptográfico único.
Además, guarda una referencia directa al commit anterior.

**Padre**
Es el commit previo sobre el que se construyó el cambio.
En nuestro ejemplo, el padre de c3 es c2, y el padre de c2 es c1.

Antes, c1 existía en soledad como origen del historial.
Después, c2 y c3 se enlazaron apuntando hacia atrás en la historia.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 200",
  "title": "Cadena de commits en checkout-service",
  "caption": "Cada commit nuevo apunta a su ancestro inmediato; las flechas de la historia viajan hacia atrás.",
  "scene": {
    "boxes": [
      { "x": 60,  "y": 60, "w": 160, "h": 70, "label": "commit c1", "sub": "init: repo vacío", "tone": "slate", "size": 18, "subSize": 14, "subDy": 20 },
      { "x": 300, "y": 60, "w": 160, "h": 70, "label": "commit c2", "sub": "feat: carrito", "tone": "slate", "size": 18, "subSize": 14, "subDy": 20 },
      { "x": 540, "y": 60, "w": 160, "h": 70, "label": "commit c3", "sub": "feat: IVA", "tone": "blue", "size": 18, "subSize": 14, "subDy": 20 }
    ],
    "arrows": [
      { "x1": 536, "y1": 95, "x2": 464, "y2": 95, "label": "padre", "tone": "blue", "labelSize": 14, "width": 3, "labelAt": 0.5 },
      { "x1": 296, "y1": 95, "x2": 224, "y2": 95, "label": "padre", "tone": "slate", "labelSize": 14, "width": 3, "labelAt": 0.5 }
    ]
  }
}
</script>
</lk-scene>

## 1.2 La rama como puntero móvil

Una rama en Git no es una carpeta con copias de archivos.
Tampoco es un contenedor que encierra commits dentro de sí.

**Rama**
Es un archivo de texto con un puntero móvil de cuarenta caracteres.
En nuestro ejemplo, la rama ` +
		tick +
		`main` +
		tick +
		` guarda exactamente el hash de c3.

En cambio, muchos desarrolladores asumen que bifurcar duplica los archivos.
Git solo mueve esa pequeña referencia cuando confirmas un nuevo commit.

<lk-story>
<script type="application/json">
{
  "kind": "derivation",
  "title": "Avance del puntero de rama al confirmar",
  "viewBox": "0 0 360 210",
  "steps": [
    {
      "title": "Estado inicial",
      "equation": {
        "size": 18,
        "atoms": [
          { "t": "git ", "id": "g" },
          { "t": "status", "id": "st" }
        ]
      },
      "focus": ["st"],
      "narrator": "En checkout-service, la rama main apunta al commit c3.",
      "stage": {
        "scene": {
          "actors": [
            { "id": "main", "kind": "row", "tone": "green", "x": 130, "y": 35, "w": 100, "h": 40, "label": "main", "tag": "rama main" },
            { "id": "c3", "kind": "file", "tone": "blue", "x": 130, "y": 145, "w": 100, "h": 50, "label": "c3", "tag": "commit c3" }
          ],
          "props": [
            { "id": "p1", "kind": "value", "on": "main", "side": "below", "label": "hash c3", "tone": "green" }
          ]
        }
      }
    },
    {
      "title": "Nuevo commit",
      "equation": {
        "size": 18,
        "atoms": [
          { "t": "git ", "id": "g" },
          { "t": "commit ", "id": "cm" },
          { "t": "-m \"pasarela\"", "id": "msg" }
        ]
      },
      "focus": ["cm"],
      "narrator": "Git crea el commit c4 y lo enlaza hacia atrás con su padre c3.",
      "stage": {
        "scene": {
          "actors": [
            { "id": "main", "kind": "row", "tone": "green", "x": 60, "y": 35, "w": 90, "h": 40, "label": "main", "tag": "rama main" },
            { "id": "c3", "kind": "file", "tone": "slate", "x": 60, "y": 145, "w": 90, "h": 50, "label": "c3", "tag": "padre c3" },
            { "id": "c4", "kind": "file", "tone": "blue", "x": 210, "y": 145, "w": 90, "h": 50, "label": "c4", "tag": "nuevo c4" }
          ],
          "moves": [
            { "from": "c4", "to": "c3", "verb": "padre", "tone": "blue" }
          ]
        }
      }
    },
    {
      "title": "Puntero actualizado",
      "equation": {
        "size": 18,
        "atoms": [
          { "t": "git ", "id": "g" },
          { "t": "log ", "id": "lg" },
          { "t": "-1 main", "id": "b" }
        ]
      },
      "focus": ["b"],
      "narrator": "El puntero main se desplaza al nuevo commit c4.",
      "stage": {
        "scene": {
          "actors": [
            { "id": "c3", "kind": "file", "tone": "slate", "state": "faded", "x": 60, "y": 145, "w": 90, "h": 50, "label": "c3", "tag": "padre c3" },
            { "id": "c4", "kind": "file", "tone": "blue", "x": 210, "y": 145, "w": 90, "h": 50, "label": "c4", "tag": "commit c4" },
            { "id": "main", "kind": "row", "tone": "green", "x": 210, "y": 35, "w": 90, "h": 40, "label": "main", "tag": "rama main" }
          ],
          "moves": [
            { "from": "c3", "to": "main", "verb": "avanza", "tone": "green" }
          ],
          "marks": [
            { "kind": "ok", "actor": "main", "label": "c4" }
          ]
        }
      }
    }
  ]
}
</script>
</lk-story>

Cómo leerlo: el paso 1 muestra la rama main apuntando a c3.

El paso 2 crea el commit c4 enlazado hacia su padre c3.

El paso 3 desplaza el puntero main para apuntar a c4.

**Fuente**: Pro Git Book (Chacon & Straub), Cap. 3: Git Branching.

## Mini-quiz

Las preguntas de esta parte viven en su ` +
		tick +
		`mini-quiz/p1.json` +
		tick +
		`: el lector las dibuja como el lk-quiz interactivo.
`
	bench291Rust = `---
tipo: explicacion
nodo: prestamos-referencias-inmutables
nivel: básico
---

# Parte 1 — Referencias y préstamos inmutables

## Ruta

1. Muchas lecturas a la vez: el compilador las acepta.
2. Una sola escritura: el compilador la acepta.
3. Leer y escribir a la vez: el compilador lo rechaza.

## El 20% que rinde el 80%

Imagina una variable s con un texto.

**Compilador**
Es el programa que revisa el código. En nuestro ejemplo, el compilador verifica s.

En nuestro ejemplo, s guarda la palabra "hola" en memoria.

**Valor**
Es el dato que guarda una variable. En nuestro ejemplo, el valor es el texto.

El compilador vigila quién accede a ese valor en cada línea.

**Borrow checker**
Es la parte del compilador que cuenta referencias. En nuestro ejemplo, el borrow checker vigila s.

Ahora creamos un lector r1 que apunta a s.

**Referencia**
Es una dirección que apunta al dato. En nuestro ejemplo, r1 apunta a s.

El lector r1 no se apropia del dato.

**Préstamo**
Es el permiso temporal para leer. En nuestro ejemplo, r1 toma prestado el valor.

Antes, mover destruía el acceso original. Después, una referencia presta el dato.

Permite leerlo mientras la dueña sigue activa. En cambio, escribir exige exclusividad.

**Fuente**: Libro The Rust Programming Language por Klabnik y Nichols (2023), capítulo cuatro sobre referencias y préstamos.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Prestar un valor: quién lee y quién escribe","viewBox":"0 60 360 190","steps":[
 {"title":"Muchas lecturas","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s;","id":"a"},{"t":" let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Las referencias «&» son de *solo lectura*: puede haber todas las que quieras a la vez.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"green","tag":"r2: &s"}],
   "props":[{"id":"ojo1","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"ojo2","kind":"read","on":"r2","side":"left","tone":"green"}],
   "marks":[{"kind":"ok","actors":["r1","r2"],"label":"compila"}]}}},
 {"title":"Una escritura","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r","id":"r"},{"t":" = &mut s;","id":"a"}]},"focus":["r"],
  "narrator":"Una referencia «&mut» puede *escribir*, pero solo puede haber una.",
  "stage":{"scene":{
   "paths":[],
   "actors":[{"id":"s","icon":"robot","x":80,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r","icon":"robot","x":250,"y":150,"size":56,"tone":"amber","tag":"r: &mut s"}],
   "props":[{"id":"lapiz","kind":"write","on":"r","side":"left","tone":"amber"}],
   "marks":[{"kind":"ok","actors":["r"],"label":"compila"}]}}},
 {"title":"Las dos a la vez","equation":{"size":22,"atoms":[{"t":"let ","id":"let"},{"t":"r1","id":"r1"},{"t":" = &s; ","id":"a"},{"t":"let ","id":"let2"},{"t":"r2","id":"r2"},{"t":" = &mut s;","id":"b"}]},"focus":["r1","r2"],
  "narrator":"Mezclar «&» y «&mut» no compila: uno escribiría mientras el otro lee.",
  "stage":{"scene":{
   "paths":[],
   "labels":[{"x":180,"y":226,"text":"no compila","size":16,"tone":"red"}],
   "actors":[{"id":"s","icon":"robot","x":60,"y":150,"size":56,"tone":"blue","tag":"s"},{"id":"r1","icon":"robot","x":170,"y":150,"size":56,"tone":"green","tag":"r1: &s"},{"id":"r2","icon":"robot","x":280,"y":150,"size":56,"tone":"amber","state":"invalid","tag":"r2: &mut s"}],
   "props":[{"id":"ojo","kind":"read","on":"r1","side":"left","tone":"green"},{"id":"lapiz","kind":"write","on":"r2","side":"left","tone":"amber"}],
   "marks":[{"kind":"no","actors":["r2"],"label":"falla"}]}}}
]}
</script>
</lk-story>

<lk-cards>
<script type="application/json">
{"title":"Cuántas referencias a la vez","cards":[
 {"id":"muchas","verdict":"ok","pill":"COMPILA","title":"Muchas «&»","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"},{"text":"&s","icon":"read","tone":"green"}],"target":{"text":"s"}},"reason":"Todos leen a la vez"},
 {"id":"una","verdict":"ok","pill":"COMPILA","title":"Una sola «&mut»","draw":{"refs":[{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Solo uno lee y escribe"},
 {"id":"mezcla","verdict":"no","pill":"NO COMPILA","title":"«&» y «&mut» a la vez","draw":{"refs":[{"text":"&s","icon":"read","tone":"green"},{"text":"&mut s","icon":"write","tone":"amber"}],"target":{"text":"s"}},"reason":"Uno escribiría mientras otro lee"}
]}
</script>
</lk-cards>
Cómo leerlo: las tarjetas comparan los tres casos de acceso simultáneo al dato.

## Mini-quiz
`
)

// bench291 writes one real bench part as the note of the fixture's part, so
// demo-part is judged on the text the bench run produced.
func bench291(t *testing.T, note string) *fixture {
	t.Helper()
	f := demoThroughPlanning(t)
	rel := f.canonicalPartFile(t, "p1")
	f.write(t, rel, note)
	f.linkPartInIndex(t, rel)
	return f
}

// A part that plans a demo and draws it hands the reader the story the note
// carries: the guidance rule reads the drawing where a story writes it
// (`stage.scene`) and its arrows where a story declares them (`moves`), the same
// keys the reader draws. Bayes and Git draw every move of theirs, so the check
// accepts them; Rust draws none, so it stays blocked with the deck wording.
//
// The cross-check is the explanation check's own scene rule: Bayes, Git and Rust
// all draw the action their stories declare, so the standard refuses none of them
// for drawing (the engine's `storyStageFindings` is the port of that rule), and
// what was left was the guidance rule reading a drawing that is not there.
func TestDemoPartReadsTheStorysStageAndMoves(t *testing.T) {
	cases := []struct {
		name  string
		note  string
		moves bool // the story draws the arrows the reader draws
	}{
		{"Bayes", bench291Bayes, true},
		{"Git", bench291Git, true},
		{"Rust", bench291Rust, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			scene := rules.PartStandardThresholds{StoryStage: true}
			if findings := storyStageFindings(tc.note, scene); len(findings) > 0 {
				t.Fatalf("the story-stage rule refused a note whose story draws the action: %s", findings[0])
			}
			f := bench291(t, tc.note)
			rep, _ := f.run(t, f.opts("validate", "explanation"))
			check, found := hasCheck(rep, "demo-part")
			if !found {
				t.Fatalf("demo-part check missing: %+v", rep.Checks)
			}
			if tc.moves {
				if check.Status != "PASS" || !strings.Contains(check.Reason, "demo structure") {
					t.Fatalf("a story that draws every move = %s (%s), want PASS on the note's own demo", check.Status, check.Reason)
				}
				return
			}
			if check.Status != "FAIL" || !strings.Contains(check.Reason, "without a single arrow") {
				t.Fatalf("a story that draws no move = %s (%s), want FAIL with the deck wording", check.Status, check.Reason)
			}
			if !strings.Contains(check.Reason, "«Prestar un valor: quién lee y quién escribe»") {
				t.Fatalf("the reason does not name the story: %s", check.Reason)
			}
		})
	}
}

// bench291EmptyStory draws a piece and a story, and the story puts nothing on its
// stage. Reading the drawing must not excuse a part that has none: it stays
// blocked, with the same wording the bench's three parts got.
const bench291EmptyStory = `<lk-cards>
<script type="application/json">
{"title":"Dos caminos","cards":[{"title":"Uno","lines":["a"]},{"title":"Dos","lines":["b"]}]}
</script>
</lk-cards>

Cómo leerlo: compara los dos caminos.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Sin dibujo","steps":[
 {"title":"Uno","narrator":"Uno.","stage":{}},
 {"title":"Dos","narrator":"Dos.","stage":{}},
 {"title":"Tres","narrator":"Tres.","stage":{}}]}
</script>
</lk-story>`

// The guidance rule and the story-stage rule are two readers of one payload: the
// first counts what the step draws to demand its arrow, the second is the
// explanation check's scene rule ported to the stage. They must see the same
// drawing on the same steps, or one of them is reading a key the other misses.
func TestTheGuidanceRuleAndTheStoryStageRuleReadTheSameDrawing(t *testing.T) {
	for _, tc := range []struct{ name, note string }{
		{"Bayes", bench291Bayes},
		{"Git", bench291Git},
		{"Rust", bench291Rust},
	} {
		t.Run(tc.name, func(t *testing.T) {
			decks, docs := deckPayloads(tc.note), storyQualityDocs(tc.note)
			if len(decks) != 1 || len(docs) != 1 {
				t.Fatalf("decoded %d deck(s) and %d story doc(s), want one of each", len(decks), len(docs))
			}
			if len(decks[0].Steps) != len(docs[0].Steps) {
				t.Fatalf("the two readers counted %d and %d steps", len(decks[0].Steps), len(docs[0].Steps))
			}
			for i, step := range decks[0].Steps {
				draws := step.drawing().Figures > 0
				action := storyStepDrawsAction(docs[0].Steps[i].Stage)
				if draws != action {
					t.Fatalf("step %d: the guidance rule reads draws=%v, the story-stage rule reads draws=%v", i+1, draws, action)
				}
			}
		})
	}
}

// A story whose stages draw nothing is still the picture the rule refuses: the
// guidance rule reads what the story puts on the canvas, and here there is
// nothing to read.
func TestDemoPartStillRefusesAStoryThatDrawsNothing(t *testing.T) {
	f := demoThroughPlanning(t)
	f.writeExplanationWithDemo(t, "p1", bench291EmptyStory)
	rep, _ := f.run(t, f.opts("validate", "explanation"))
	check, found := hasCheck(rep, "demo-part")
	if !found {
		t.Fatalf("demo-part check missing: %+v", rep.Checks)
	}
	if check.Status != "FAIL" || !strings.Contains(check.Reason, "without a single arrow") {
		t.Fatalf("a story that draws nothing = %s (%s), want FAIL with the deck wording", check.Status, check.Reason)
	}
	if !strings.Contains(check.Reason, "«Sin dibujo»") {
		t.Fatalf("the reason does not name the deck: %s", check.Reason)
	}
}
