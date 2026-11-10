"""Scene-first walkthroughs for RL Part 3: the warehouse floor is drawn tile by tile,
the robot sits on its tile, and every step points at what changes."""
import json
import sys

VIEW_W, VIEW_H = 360, 290
TW, TH, GX, GY = 56, 50, 32, 44     # tile size and gaps between tiles
X0, Y0 = 16, 40
PUERTA, CHARCO, COLUMNA, SALIDA = (3, 0), (3, 1), (1, 1), (0, 2)
POLICY = {(0, 0): "→", (1, 0): "→", (2, 0): "→", (0, 1): "↑", (2, 1): "↑",
          (0, 2): "↑", (1, 2): "↑", (2, 2): "↑", (3, 2): "↑"}


def tx(c):
    return X0 + c * (TW + GX)


def ty(r):
    return Y0 + r * (TH + GY)


def mid(c, r):
    return tx(c) + TW / 2, ty(r) + TH / 2


# A tile shows its effect; the arrow that introduces it carries its name.
LANDMARK = {PUERTA: ("+1", "green"), CHARCO: ("−1", "red"), COLUMNA: ("×", "ink")}
SHOWN = {PUERTA: "puerta", CHARCO: "charco", COLUMNA: "columna"}


def tiles(robot=None, show=("puerta", "charco", "columna"), labels=None, tones=None):
    """The floor. labels/tones override what a tile shows; the robot tile reads R."""
    labels, tones = labels or {}, tones or {}
    out = []
    for r in range(3):
        for c in range(4):
            cell = (c, r)
            label, tone, size = f"{c},{r}", "slate", 14
            if cell in LANDMARK and SHOWN[cell] in show:
                (label, tone), size = LANDMARK[cell], 22
            if cell in labels:
                label = labels[cell]
                size = 24 if label in "↑→?" else (15 if len(label) <= 4 else 12)
            if robot == cell:
                label, tone, size = "R", "blue", 22
            tone = tones.get(cell, tone)
            b = {"x": tx(c), "y": ty(r), "w": TW, "h": TH, "label": label, "size": size, "tone": tone, "rx": 6}
            if cell == COLUMNA and "columna" in show:
                b["fill"] = "#E4E8EA"
            out.append(b)
    return out


def arrow(a, b, label, tone="blue", dashed=False):
    """From the edge of tile a to the edge of the neighbouring tile b."""
    (ac, ar), (bc, br) = a, b
    ax, ay = mid(ac, ar)
    bx, by = mid(bc, br)
    if ac == bc:
        s = 1 if br > ar else -1
        out = {"x1": ax, "y1": ay + s * (TH / 2 + 3), "x2": bx, "y2": by - s * (TH / 2 + 3)}
    else:
        s = 1 if bc > ac else -1
        out = {"x1": ax + s * (TW / 2 + 3), "y1": ay, "x2": bx - s * (TW / 2 + 3), "y2": by}
    out.update(label=label, tone=tone)
    if dashed:
        out["dashed"] = True
    return out


def step(title, text, boxes, arrows):
    return {"title": title, "text": text, "scene": {"boxes": boxes, "arrows": arrows}}


def deck(title, steps):
    payload = {"title": title, "viewBox": f"0 0 {VIEW_W} {VIEW_H}", "steps": steps}
    body = json.dumps(payload, ensure_ascii=False)
    return f'<lk-walkthrough class="lk-wt-compact" title="{title}">\n<script type="application/json">\n{body}\n</script>\n</lk-walkthrough>'


def example():
    return deck("El almacén del ejemplo", [
        step("El suelo y el robot", "Cuatro columnas (x) y tres filas (y). El robot R empieza abajo a la izquierda, en (0,2).",
             tiles(robot=SALIDA, show=()), [arrow((1, 2), SALIDA, "salida", dashed=True)]),
        step("La puerta paga +1", "Llegar a la puerta (3,0) da +1 y termina el viaje.",
             tiles(robot=SALIDA, show=("puerta",)), [arrow((2, 0), PUERTA, "puerta", "green")]),
        step("El charco paga −1", "Caer en el charco (3,1) da −1 y también termina el viaje.",
             tiles(robot=SALIDA, show=("puerta", "charco")), [arrow((2, 1), CHARCO, "charco", "red")]),
        step("La columna bloquea", "Si el robot intenta entrar en la columna (1,1), choca y se queda donde estaba.",
             tiles(robot=SALIDA), [arrow((1, 2), COLUMNA, "columna", "red")]),
        step("Cada paso gasta batería", "Moverse a una casilla normal cuesta −0,04: un camino corto gasta menos.",
             tiles(robot=SALIDA), [arrow(SALIDA, (0, 1), "−0,04", "amber")]),
    ])


def myopic():
    here = (2, 1)
    return deck("Por qué no basta la recompensa", [
        step("Dos caminos", "Desde (2,1) el robot puede subir hacia (2,0), junto a la puerta, o ir a la derecha, al charco.",
             tiles(robot=here), [arrow(here, (2, 0), "sube"), arrow(here, CHARCO, "−1", "red")]),
        step("Solo el paso siguiente", "Subir paga −0,04, como cualquier paso normal: ese número no dice que la puerta está al lado.",
             tiles(robot=here, labels={(2, 0): "−0,04"}, tones={(2, 0): "amber"}),
             [arrow(here, (2, 0), "r = −0,04", "amber")]),
        step("Mirar el valor", "El valor de (2,0) resume lo que viene después: un paso más y la puerta. Por eso sube.",
             tiles(robot=here, labels={(2, 0): "1,00"}, tones={(2, 0): "green"}),
             [arrow(here, (2, 0), "V = +1,00", "green")]),
    ])


def policy():
    free = [c for c in POLICY]
    unknown = {c: "?" for c in free}
    return deck("La política: una flecha por casilla", [
        step("Una regla por casilla", "La política π responde «¿qué hago aquí?» en cada casilla libre. Empieza sin decidir.",
             tiles(labels=unknown), [arrow((1, 2), SALIDA, "¿qué hago?")]),
        step("La acción en la salida", "En (0,2) la política dice ↑: esa flecha es la acción que el robot tomará allí.",
             tiles(labels={**unknown, (0, 2): "↑"}, tones={(0, 2): "blue"}), [arrow((1, 2), SALIDA, "π(0,2)")]),
        step("Subir por la izquierda", "En toda la columna x = 0 la política dice ↑, hasta la fila de arriba.",
             tiles(labels={**unknown, (0, 2): "↑", (0, 1): "↑"}, tones={(0, 1): "blue"}), [arrow(SALIDA, (0, 1), "sube")]),
        step("Avanzar por arriba", "En la fila y = 0 la política dice →, hacia la puerta.",
             tiles(labels={**unknown, (0, 2): "↑", (0, 1): "↑", (0, 0): "→", (1, 0): "→", (2, 0): "→"},
                   tones={(0, 0): "blue", (1, 0): "blue", (2, 0): "blue"}),
             [arrow((2, 0), PUERTA, "a la puerta", "green")]),
        step("La política completa", "Cada casilla libre tiene su flecha. En (1,2) la flecha apunta a la columna: el robot choca y no avanza.",
             tiles(labels=POLICY, tones={(1, 2): "red"}), [arrow((1, 2), COLUMNA, "choca", "red")]),
    ])


def walk():
    path = [(0, 2), (0, 1), (0, 0), (1, 0), (2, 0), (3, 0)]
    steps = [step("T0: en la salida", "El robot está en (0,2) y su política dice ↑. Todavía no ha recibido nada: acumulado 0.",
                  tiles(robot=path[0], labels={SALIDA: "↑"}), [arrow(path[0], path[1], "π: ↑")])]
    total = 0.0
    for i in range(1, len(path)):
        reward = 1.0 if path[i] == PUERTA else -0.04
        total += reward
        tones = {c: "amber" for c in path[1:i]}  # tiles already paid for: amber
        name = f"({path[i][0]},{path[i][1]})"
        r_txt = "+1" if reward > 0 else "−0,04"
        acc = f"{total:+.2f}".replace(".", ",").replace("-", "−")
        robot = path[i] if path[i] != PUERTA else None
        labels = {}
        if path[i] == PUERTA:
            labels[PUERTA] = "R"
            tones[PUERTA] = "green"
        steps.append(step(f"T{i}: llega a {name}", f"Recibe {r_txt}. Acumulado sin descuento: {acc}." +
                          (" Fin del viaje en 5 pasos." if path[i] == PUERTA else ""),
                          tiles(robot=robot, labels=labels, tones=tones),
                          [arrow(path[i - 1], path[i], r_txt, "green" if reward > 0 else "amber")]))
    return deck("El robot sigue su política", steps)


def value():
    order = [((2, 0), PUERTA, "1,00"), ((1, 0), (2, 0), "0,86"), ((0, 0), (1, 0), "0,73"),
             ((0, 1), (0, 0), "0,62"), ((0, 2), (0, 1), "0,52")]
    known, steps = {}, []
    for i, (cell, nxt, v) in enumerate(order):
        known[cell] = v
        tones = {c: "green" for c in known}
        tones[cell] = "blue"
        name = f"({cell[0]},{cell[1]})"
        text = ("Junto a la puerta: un paso a la derecha da +1. V(2,0) = +1,00. Cada número de casilla es su valor." if i == 0 else
                f"V{name} = −0,04 + 0,9 · V del sitio al que lleva su flecha = +{v}.")
        steps.append(step(f"V{name} = +{v}", text, tiles(labels=dict(known), tones=tones),
                          [arrow(cell, nxt, "+1" if i == 0 else "0,9 · V", "green" if i == 0 else "blue")]))
    known[(1, 2)] = "−0,40"
    tones = {c: "green" for c in known}
    tones[(1, 2)] = "red"
    steps.append(step("V(1,2) = −0,40", "Su flecha choca con la columna: paga −0,04 para siempre y nunca llega a una salida.",
                      tiles(labels=dict(known), tones=tones), [arrow((1, 2), COLUMNA, "choca", "red")]))
    return deck("El valor se calcula hacia atrás", steps)


def model():
    here = (2, 0)
    return deck("Política ≠ modelo", [
        step("La política elige", "En (2,0) la política responde qué hacer: ir a la derecha.",
             tiles(robot=here), [arrow(here, PUERTA, "π: →")]),
        step("El modelo predice", "El modelo responde otra pregunta: si va a la derecha desde (2,0), llega a la puerta y recibe +1.",
             tiles(robot=here, tones={PUERTA: "amber"}), [arrow(here, PUERTA, "predice +1", "amber", dashed=True)]),
        step("Planificar", "Con el modelo el robot imagina cada resultado antes de moverse; sin él, solo lo descubre probando.",
             tiles(robot=here, labels={(2, 1): "−0,04"}, tones={PUERTA: "amber", (2, 1): "amber"}),
             [arrow(here, PUERTA, "+1", "amber", dashed=True), arrow(here, (2, 1), "−0,04", "amber", dashed=True)]),
    ])


DECKS = {"example": example, "myopic": myopic, "policy": policy, "walk": walk, "value": value, "model": model}

if __name__ == "__main__":
    print(DECKS[sys.argv[1]]())
