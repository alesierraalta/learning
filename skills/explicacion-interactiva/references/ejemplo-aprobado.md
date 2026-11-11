# Ejemplo aprobado

Las cuatro explicaciones que el usuario señaló como impecables, tal como las escribió
ChatGPT, sin retoques. Son el contrato de tono de `SKILL.md` y de
`references/estandar-explicacion.md`: ante la duda de cómo suena una frase, se mira aquí.

Qué se copia de ellas: la arquitectura, el ritmo, el largo de las frases, la forma de
entrar en un concepto y, cuando el cálculo es la idea, la aritmética ejecutada línea por
línea. El cierre con resumen de cada sección **no** se copia: una parte termina en su
última sección de contenido (`estandar-explicacion.md` §1).

Qué **no** se copia, porque el usuario lo descartó explícitamente (S2 de
`odd/tasks/explicacion-visual-v2.md`): el bloque final «Resumen para guardar» /
«Apuntes comprimidos» y el gancho de continuación («Profundiza en los conceptos clave…»).
También se descarta su envoltorio: aquí no hay `plain text` con geometría, y ese lugar lo
ocupan escenas dibujadas (`references/visuales.md`). El quiz, que el original no traía,
va intercalado.

---

# 1. Introducción y Fundamentos del Aprendizaje por Refuerzo

## Ruta

Vamos a construirlo en este orden:

1. **Agente ↔ entorno:** qué ocurre en cada paso.
2. **Qué aprende el agente:** política, recompensa, valor y modelo.
3. **Por qué RL es distinto** del aprendizaje supervisado y no supervisado.
4. **Exploración vs. explotación:** probar o aprovechar lo aprendido.
5. **Retorno:** cómo se evalúa una secuencia completa de decisiones.
6. **Factor de descuento γ:** cuánto importa el futuro.
7. **Recompensas infinitas:** por qué aparece \(c/(1-\gamma)\).

---

## 1.1 Conceptos básicos e interfaz agente-entorno

### ¿Por qué existe el aprendizaje por refuerzo?

Hay problemas donde no basta con contestar correctamente **ahora**.

Una acción puede parecer mala inmediatamente, pero ser necesaria para obtener algo mejor después.

Por ejemplo, un robot aspirador podría alejarse temporalmente de una habitación sucia para ir a cargarse. En ese instante no limpia nada, pero gracias a esa decisión puede terminar toda la casa.

El problema fundamental de RL es:

> **¿Qué acciones debo elegir a lo largo del tiempo para maximizar las recompensas que obtendré en el futuro?**

Esto es diferente de simplemente predecir una etiqueta.

---

# 1.1.1 Agente, entorno, estados, acciones y recompensas

Usaremos siempre el mismo ejemplo.

Tenemos un robot aspirador en una casa.

### Caja negra inicial

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 250",
  "title": "Todavía no sabemos qué hay del otro lado",
  "caption": "El agente tiene lo que ve y lo que le vuelve; el resto es una caja que este documento va a abrir.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 76,
        "w": 210,
        "h": 104,
        "label": "AGENTE",
        "sub": "robot",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 538,
        "y": 76,
        "w": 210,
        "h": 104,
        "label": "¿?",
        "sub": "lo que no vemos",
        "tone": "slate",
        "rx": 0,
        "size": 22,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 226,
        "y1": 112,
        "x2": 534,
        "y2": 112,
        "label": "acción: aspirar",
        "tone": "blue",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 534,
        "y1": 150,
        "x2": 226,
        "y2": 150,
        "label": "recompensa +10",
        "tone": "amber",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 44,
        "text": "estado actual: sala sucia"
      }
    ]
  }
}
</script>
</lk-scene>

Abramos esa caja.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 320",
  "title": "Las piezas, dibujadas",
  "caption": "① el entorno donde ocurre, ② el agente que decide, ③ la acción que los une y vuelve como recompensa.",
  "scene": {
    "icons": [
      {
        "kind": "house",
        "x": 205,
        "y": 175,
        "size": 120,
        "tone": "green"
      },
      {
        "kind": "robot",
        "x": 560,
        "y": 175,
        "size": 92,
        "tone": "blue"
      }
    ],
    "arrows": [
      {
        "x1": 296,
        "y1": 152,
        "x2": 500,
        "y2": 152,
        "tone": "blue",
        "width": 2
      },
      {
        "x1": 500,
        "y1": 200,
        "x2": 296,
        "y2": 200,
        "tone": "amber",
        "width": 2
      }
    ],
    "callouts": [
      {
        "n": 1,
        "x": 120,
        "y": 95,
        "to": [
          178,
          138
        ],
        "tone": "green"
      },
      {
        "n": 2,
        "x": 655,
        "y": 95,
        "to": [
          590,
          140
        ],
        "tone": "blue"
      },
      {
        "n": 3,
        "x": 398,
        "y": 88,
        "to": [
          398,
          148
        ],
        "tone": "blue"
      }
    ]
  }
}
</script>
</lk-scene>

---

## Las cinco piezas fundamentales

### **Agente**

Es quien **toma decisiones**.

En nuestro ejemplo:

> agente = robot aspirador.

Podría ser también:

- un personaje de videojuego;
- un sistema de recomendaciones;
- un algoritmo de trading;
- un controlador de tráfico;
- un modelo que aprende a resolver problemas.

---

### **Entorno**

Es todo aquello con lo que interactúa el agente.

En nuestro ejemplo:

> entorno = casa + habitaciones + suciedad + batería + obstáculos.

Podría ser también:

- el tablero y las piezas de un juego;
- el catálogo y los usuarios a los que se recomienda;
- el mercado, con sus precios y sus órdenes;
- la calle y los coches que esperan en el semáforo;
- el problema que el modelo intenta resolver.

El agente controla sus acciones, pero **no controla directamente las consecuencias**.

---

### **Estado**

El **estado \(s_t\)** es la información del entorno que hace falta para decidir en el instante \(t\).

En nuestro ejemplo:

> estado = sala sucia, cocina limpia, posición sala, batería 70 %.

Podría ser también:

- la posición de todas las piezas en el tablero;
- el historial de lo que cada usuario ya vio;
- el precio actual y las órdenes abiertas;
- cuántos coches esperan en cada carril;
- los datos de entrada del problema, sin el resultado.

[SIMPLIFICADO: suponemos que el agente conoce completamente el estado del mundo. En problemas parcialmente observables puede conocer solo una observación.]

---

### **Acción**

Una **acción \(a_t\)** es algo que el agente puede hacer.

En nuestro ejemplo:

> acciones = aspirar, moverse a cocina, moverse a dormitorio, ir al cargador, esperar.

Podría ser también:

- mover una pieza de una casilla a otra;
- mostrar o descartar una recomendación;
- comprar, vender o esperar;
- poner un carril en verde;
- el siguiente paso del razonamiento.

---

### **Recompensa**

La **recompensa \(r\)** es una señal numérica que indica qué tan deseable fue una consecuencia.

En nuestro ejemplo:

> recompensa = +10 al limpiar una habitación, −1 por movimiento innecesario, −5 al quedarse
> sin batería.

Podría ser también:

- los puntos por comer una ficha;
- el clic en la recomendación mostrada;
- la ganancia de la operación, en dinero;
- los segundos de espera que se ahorran los coches;
- acertar o fallar la respuesta.

Importante:

> La recompensa evalúa una consecuencia inmediata, no necesariamente si la decisión fue buena a largo plazo.

Esto será crucial cuando lleguemos a la **función de valor**.

---

## Una interacción completa

Supongamos:

```text
T0
estado:
posición = sala
sala = sucia
batería = 70 %
```

El robot selecciona:

```text
acción = aspirar
```

El entorno responde:

```text
recompensa = +10

nuevo estado:
posición = sala
sala = limpia
batería = 68 %
```

Visualmente:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "El bucle, en una imagen",
  "caption": "La acción sale del agente y vuelve convertida en estado nuevo y recompensa.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 76,
        "w": 210,
        "h": 104,
        "label": "AGENTE",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "robot",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 542,
        "y": 76,
        "w": 210,
        "h": 104,
        "label": "ENTORNO",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "casa · sala",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 222,
        "y1": 108,
        "x2": 538,
        "y2": 108,
        "tone": "blue",
        "labelSize": 15,
        "width": 2,
        "label": "acción: aspirar",
        "labelAt": 0.3
      },
      {
        "x1": 538,
        "y1": 152,
        "x2": 222,
        "y2": 152,
        "tone": "green",
        "labelSize": 15,
        "width": 2,
        "label": "estado nuevo + recompensa",
        "labelAt": 0.7
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 228,
        "text": "la sala queda limpia y entra +10"
      }
    ]
  }
}
</script>
</lk-scene>

Este ciclo se repite:

```text
estado
  ↓
agente
  ↓
acción
  ↓
entorno
  ↓
recompensa + nuevo estado
  ↓
agente
  ↓
acción
  ↓
...
```

Ese bucle es el corazón del RL.

---

# 1.1.2 RL vs. supervisado vs. no supervisado

Aquí hay una diferencia fundamental.

## Aprendizaje supervisado

Al modelo se le muestran ejemplos donde ya conocemos la respuesta correcta.

Por ejemplo:

```text
foto 1 → "habitación sucia"
foto 2 → "habitación limpia"
foto 3 → "habitación sucia"
```

El modelo intenta aprender a convertir una `imagen` en su `etiqueta correcta`.

Hay una especie de profesor que dice:

> Para esta entrada, la respuesta correcta era esta.

---

## Aprendizaje no supervisado

Aquí no existen etiquetas correctas.

Podríamos darle al modelo miles de imágenes de habitaciones.

El algoritmo podría descubrir grupos:

```text
grupo A → habitaciones muy despejadas
grupo B → habitaciones con alfombras
grupo C → habitaciones con muchos objetos
```

Nadie le dijo cuáles eran esos grupos.

El algoritmo descubre **estructura en los datos**.

---

## Aprendizaje por refuerzo

Al robot normalmente nadie le proporciona:

```text
estado 1 → acción correcta = aspirar
estado 2 → acción correcta = girar
estado 3 → acción correcta = cargar
```

En lugar de eso recibe consecuencias:

```text
hizo X → recompensa +10
hizo Y → recompensa -5
```

Tiene que descubrir qué comportamiento produce mejores resultados acumulados.

| Tipo | Recibe | Aprende principalmente |
|---|---|---|
| Supervisado | entradas + respuestas | predecir la respuesta |
| No supervisado | datos sin respuestas | estructura/patrones |
| Refuerzo | acciones + consecuencias | cómo actuar |

La diferencia mental importante es:

```text
SUPERVISADO
"Te digo cuál era la respuesta correcta."

RL
"No te digo qué acción era correcta.
 Actúa y observa las consecuencias."
```

---

# 1.1.3 Política, recompensa, función de valor y modelo

Ahora podemos separar cuatro conceptos que suelen confundirse.

---

## 1. Política

La **política** es la estrategia utilizada por el agente para decidir qué hacer.

Se suele representar:

\[
\pi
\]

Por ejemplo:

```text
si habitación está sucia → aspirar
si habitación está limpia → moverse
si batería < 15 %         → cargar
```

Eso sería una política bastante sencilla.

Formalmente puede escribirse:

\[
\pi(a|s)
\]

Se lee:

> probabilidad de seleccionar la acción \(a\) cuando estoy en el estado \(s\).

Por ejemplo:

```text
estado = habitación sucia

P(aspirar) = 0.90
P(moverse) = 0.10
```

Una política también puede ser determinista:

```text
habitación sucia → aspirar siempre
```

---

# 2. Señal de recompensa

La recompensa responde:

> **¿Qué acaba de ocurrir?**

Ejemplo:

```text
aspira correctamente → +10
```

Es una señal inmediata.

Pero esto genera un problema.

Supongamos:

```text
batería = 4 %

acción A → aspirar habitación
recompensa inmediata = +10

acción B → ir al cargador
recompensa inmediata = 0
```

Si solo miráramos la recompensa inmediata:

```text
A parece mejor.
```

Pero quizá después ocurra:

```text
A → batería agotada → no puede limpiar nada más
B → carga batería → limpia otras 6 habitaciones
```

Por eso necesitamos otro concepto.

---

# 3. Función de valor

La **función de valor** intenta medir algo distinto:

> cuánto beneficio futuro podemos esperar desde una situación.

Es decir:

```text
recompensa = qué bueno fue lo que acaba de pasar

valor = qué tan prometedor es estar aquí pensando en el futuro
```

Supongamos:

```text
Estado A:
habitación sucia
batería = 4 %

Estado B:
habitación sucia
batería = 100 %
```

Visualmente parecen parecidos.

Pero:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 280",
  "title": "Dos estados, dos futuros",
  "caption": "Lo que se puede hacer desde un estado cambia su valor, aunque todavía no haya llegado ninguna recompensa.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 24,
        "w": 330,
        "h": 96,
        "label": "Estado A",
        "sub": "batería 4 %",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 418,
        "y": 24,
        "w": 330,
        "h": 96,
        "label": "Estado B",
        "sub": "batería 100 %",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 12,
        "y": 168,
        "w": 330,
        "h": 76,
        "label": "valor bajo",
        "sub": "pocas acciones posibles",
        "tone": "red",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 418,
        "y": 168,
        "w": 330,
        "h": 76,
        "label": "valor alto",
        "sub": "muchas acciones posibles",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 177,
        "y1": 124,
        "x2": 177,
        "y2": 164,
        "tone": "red",
        "labelSize": 15,
        "width": 1.6
      },
      {
        "x1": 583,
        "y1": 124,
        "x2": 583,
        "y2": 164,
        "tone": "green",
        "labelSize": 15,
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Aunque todavía no hayamos recibido recompensa, el estado B puede ser mucho más valioso.

---

## V(s): valor de un estado

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 470",
  "title": "V(s), símbolo por símbolo",
  "caption": "V es cuánto promete estar en un estado; s es el estado concreto: aquí, dónde está el robot.",
  "scene": {
    "formula": {
      "x": 380,
      "y": 120,
      "size": 84,
      "atoms": [
        {
          "t": "V"
        },
        {
          "t": "("
        },
        {
          "t": "s"
        },
        {
          "t": ")"
        }
      ]
    },
    "callouts": [
      {
        "n": 1,
        "x": 333,
        "y": 192,
        "to": [
          333,
          158
        ],
        "tone": "blue"
      },
      {
        "n": 2,
        "x": 405,
        "y": 192,
        "to": [
          405,
          158
        ],
        "tone": "green"
      }
    ],
    "stats": [
      {
        "x": 380,
        "y": 384,
        "value": "5",
        "label": "V(sala) — lo que promete la sala ahora",
        "tone": "blue"
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 252,
        "text": "① el valor: cuánto promete estar ahí"
      },
      {
        "x": 380,
        "y": 286,
        "text": "② el estado: dónde está el robot"
      }
    ]
  }
}
</script>
</lk-scene>

Una forma común es:

\[
V^\pi(s)
\]

Significa:

> retorno futuro esperado empezando en el estado \(s\), siguiendo la política \(\pi\).

---

## Q(s,a): valor de una acción

También podemos preguntar:

> Estoy en este estado. ¿Qué tan bueno sería ejecutar específicamente esta acción?

Entonces usamos:

\[
Q^\pi(s,a)
\]

Por ejemplo:

```text
estado:
batería = 4 %

Q(estado, aspirar)      = bajo
Q(estado, ir a cargar)  = alto
```

Aunque:

```text
recompensa inmediata de aspirar > recompensa inmediata de cargar
```

El futuro hace que la segunda opción pueda valer más.

---

# 4. Modelo del entorno

Un **modelo** intenta predecir qué ocurrirá si realizamos una acción.

Conceptualmente:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Qué hace el modelo",
  "caption": "El modelo no decide: predice qué pasaría si se toma esa acción.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 230,
        "h": 100,
        "label": "ESTADO + ACCIÓN",
        "sub": "lo que sé ahora",
        "tone": "blue",
        "rx": 0,
        "size": 18,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 310,
        "y": 70,
        "w": 160,
        "h": 100,
        "label": "MODELO",
        "tone": "slate",
        "rx": 0,
        "size": 20
      }
    ],
    "arrows": [
      {
        "x1": 242,
        "y1": 120,
        "x2": 306,
        "y2": 120,
        "tone": "ink",
        "labelSize": 15,
        "width": 1.6
      },
      {
        "x1": 474,
        "y1": 94,
        "x2": 748,
        "y2": 94,
        "label": "próximo estado",
        "tone": "green",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 474,
        "y1": 146,
        "x2": 748,
        "y2": 146,
        "label": "recompensa probable",
        "tone": "amber",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ]
  }
}
</script>
</lk-scene>

Ejemplo:

```text
estado:
posición = sala
batería = 4 %

acción:
aspirar

modelo predice:
batería → 1 %
sala → limpia
recompensa → +10
```

El agente puede usar ese modelo para **planificar antes de actuar**.

Pero no todos los algoritmos de RL necesitan un modelo.

Por eso existen dos grandes familias:

```text
model-based
usa un modelo del entorno

model-free
aprende directamente valores/políticas
sin construir explícitamente ese modelo
```

---

# Cómo encajan los cuatro elementos

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 290",
  "title": "Cómo encajan los cuatro elementos",
  "caption": "La política decide arriba; el valor y el modelo miran el futuro desde abajo.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 96,
        "w": 200,
        "h": 110,
        "label": "ENTORNO",
        "sub": "casa",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 548,
        "y": 96,
        "w": 200,
        "h": 110,
        "label": "AGENTE",
        "sub": "robot",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 216,
        "y1": 132,
        "x2": 544,
        "y2": 132,
        "label": "estado",
        "tone": "green",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 544,
        "y1": 170,
        "x2": 216,
        "y2": 170,
        "label": "acción + recompensa",
        "tone": "blue",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 48,
        "text": "POLÍTICA: ¿qué acción hago?"
      },
      {
        "x": 380,
        "y": 252,
        "text": "VALOR y MODELO: ¿qué tan prometedor es?"
      }
    ]
  }
}
</script>
</lk-scene>

No todos los sistemas utilizan explícitamente los cuatro, pero son los conceptos clásicos del RL.

---

# 1.1.4 Exploración vs. explotación

Ahora aparece uno de los problemas centrales del RL.

Supongamos que el robot conoce dos estrategias:

```text
A → normalmente consigue +8
B → apenas la ha probado
```

¿Qué debe hacer?

## Explotación

Usar lo que actualmente parece mejor.

```text
"Ya sé que A funciona.
 Voy a seguir usando A."
```

Ventaja:

> obtiene una recompensa conocida.

Problema:

> podría existir una opción mucho mejor que nunca descubre.

---

## Exploración

Probar alternativas para obtener información.

```text
"No sé bien qué ocurre con B.
 Voy a probarlo."
```

Puede salir:

```text
B → +2
```

y fue una mala prueba.

Pero también:

```text
B → +15
```

y acabamos de descubrir algo mucho mejor.

---

## El dilema

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 300",
  "title": "El dilema de cada paso",
  "caption": "La misma decisión se repite siempre: repetir lo que ya rinde o probar algo que todavía no se conoce.",
  "scene": {
    "boxes": [
      {
        "x": 250,
        "y": 16,
        "w": 260,
        "h": 76,
        "label": "¿QUÉ HACER?",
        "tone": "ink",
        "rx": 0,
        "size": 20
      },
      {
        "x": 52,
        "y": 176,
        "w": 250,
        "h": 100,
        "label": "EXPLOTAR",
        "sub": "recompensa inmediata",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 458,
        "y": 176,
        "w": 250,
        "h": 100,
        "label": "EXPLORAR",
        "sub": "información nueva",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 340,
        "y1": 94,
        "x2": 180,
        "y2": 172,
        "tone": "blue",
        "labelSize": 15,
        "width": 2
      },
      {
        "x1": 420,
        "y1": 94,
        "x2": 580,
        "y2": 172,
        "tone": "green",
        "labelSize": 15,
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

Si exploras demasiado:

```text
pruebas continuamente cosas malas
```

Si explotas demasiado:

```text
puedes quedarte atrapado usando una estrategia mediocre
```

RL necesita equilibrar ambos.

Un método sencillo es **ε-greedy**:

```text
90 % → usar mejor acción conocida
10 % → explorar
```

si:

\[
\varepsilon = 0.1
\]

Más adelante este problema se vuelve especialmente importante en los **multi-armed bandits**, UCB y métodos ε-greedy.

---

# 1.2 Formalización de retornos y tareas

Hasta ahora hablamos de recompensas individuales.

Pero RL normalmente no quiere maximizar:

> la próxima recompensa.

Quiere maximizar:

> **la suma de recompensas que conseguirá a lo largo del tiempo.**

A eso lo llamamos **retorno**.

---

# 1.2.1 Tareas episódicas y continuas

Hay dos formas generales de organizar el tiempo.

---

## Tarea episódica

Tiene un comienzo y un final.

Nuestro robot podría tener la misión:

> limpiar toda la casa.

Un episodio es la partida completa, del estado inicial al terminal:

| Paso | Estado | Qué pasó |
|---|---|---|
| inicio | sala sucia | arranca el episodio |
| 1 | sala limpia | limpió la sala |
| 2 | cocina limpia | limpió la cocina |
| 3 | dormitorio limpio | limpió el dormitorio |
| fin | CASA LIMPIA | estado terminal: el retorno queda completo |

<lk-walkthrough>
<script type="application/json">
{
  "title": "Un episodio, habitación por habitación",
  "viewBox": "0 0 760 390",
  "steps": [
    {
      "title": "El estado inicial",
      "text": "Las tres habitaciones están sucias y el robot espera en la sala. La batería está al 70 %.",
      "scene": {
        "icons": [
          {
            "kind": "house",
            "x": 153,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "house",
            "x": 380,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "house",
            "x": 607,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "robot",
            "x": 607,
            "y": 52,
            "size": 56,
            "tone": "blue"
          }
        ],
        "arrows": [
          {
            "x1": 607,
            "y1": 82,
            "x2": 607,
            "y2": 116,
            "tone": "blue",
            "width": 1.6
          }
        ],
        "labels": [
          {
            "x": 153,
            "y": 238,
            "text": "sucia"
          },
          {
            "x": 380,
            "y": 238,
            "text": "sucia"
          },
          {
            "x": 607,
            "y": 238,
            "text": "sucia"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 312,
            "value": "70 %",
            "label": "batería",
            "tone": "slate"
          }
        ]
      }
    },
    {
      "title": "Aspira la sala",
      "text": "La acción es aspirar: la sala queda limpia. El robot no se movió y la batería baja al 62 %.",
      "scene": {
        "icons": [
          {
            "kind": "house",
            "x": 153,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 380,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "house",
            "x": 607,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "robot",
            "x": 153,
            "y": 52,
            "size": 56,
            "tone": "green"
          }
        ],
        "arrows": [
          {
            "x1": 153,
            "y1": 82,
            "x2": 153,
            "y2": 116,
            "tone": "green",
            "width": 1.6
          }
        ],
        "labels": [
          {
            "x": 153,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 380,
            "y": 238,
            "text": "sucia"
          },
          {
            "x": 607,
            "y": 238,
            "text": "sucia"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 312,
            "value": "62 %",
            "label": "batería",
            "tone": "slate"
          }
        ]
      }
    },
    {
      "title": "Se mueve a la cocina",
      "text": "Otra acción, otro efecto: el robot cambia de habitación. Moverse no limpia nada por sí solo.",
      "scene": {
        "icons": [
          {
            "kind": "house",
            "x": 153,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 380,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "house",
            "x": 607,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "robot",
            "x": 153,
            "y": 52,
            "size": 56,
            "tone": "green"
          }
        ],
        "arrows": [
          {
            "x1": 153,
            "y1": 82,
            "x2": 153,
            "y2": 116,
            "tone": "green",
            "width": 1.6
          }
        ],
        "labels": [
          {
            "x": 153,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 380,
            "y": 238,
            "text": "sucia"
          },
          {
            "x": 607,
            "y": 238,
            "text": "sucia"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 312,
            "value": "58 %",
            "label": "batería",
            "tone": "slate"
          }
        ]
      }
    },
    {
      "title": "Limpia la cocina",
      "text": "Aspirar otra vez: dos casas limpias, el robot en la segunda y la batería bajando.",
      "scene": {
        "icons": [
          {
            "kind": "house",
            "x": 153,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 380,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 607,
            "y": 168,
            "size": 96,
            "tone": "red"
          },
          {
            "kind": "robot",
            "x": 380,
            "y": 52,
            "size": 56,
            "tone": "green"
          }
        ],
        "arrows": [
          {
            "x1": 380,
            "y1": 82,
            "x2": 380,
            "y2": 116,
            "tone": "green",
            "width": 1.6
          }
        ],
        "labels": [
          {
            "x": 153,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 380,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 607,
            "y": 238,
            "text": "sucia"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 312,
            "value": "50 %",
            "label": "batería",
            "tone": "slate"
          }
        ]
      }
    },
    {
      "title": "El episodio se cierra",
      "text": "Con las tres limpias no quedan acciones útiles: el episodio termina y se suma la recompensa.",
      "scene": {
        "icons": [
          {
            "kind": "house",
            "x": 153,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 380,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "house",
            "x": 607,
            "y": 168,
            "size": 96,
            "tone": "green"
          },
          {
            "kind": "robot",
            "x": 607,
            "y": 52,
            "size": 56,
            "tone": "green"
          }
        ],
        "arrows": [
          {
            "x1": 607,
            "y1": 82,
            "x2": 607,
            "y2": 116,
            "tone": "green",
            "width": 1.6
          }
        ],
        "labels": [
          {
            "x": 153,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 380,
            "y": 238,
            "text": "limpia"
          },
          {
            "x": 607,
            "y": 238,
            "text": "limpia"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 312,
            "value": "+30",
            "label": "recompensa total",
            "tone": "green"
          }
        ]
      }
    }
  ]
}
</script>
</lk-walkthrough>

Todo esto forma un **episodio**.

Después podría comenzar otro episodio.

Ejemplos:

- una partida de ajedrez;
- una partida de videojuego;
- completar un laberinto;
- una conversación;
- un robot realizando una misión.

Existe un **estado terminal**.

---

## Tarea continua

No tiene un final natural.

Por ejemplo, imaginemos que el robot trabaja permanentemente:

```text
limpiar
  ↓
cargar
  ↓
limpiar
  ↓
esperar
  ↓
limpiar
  ↓
cargar
  ↓
...
```

No existe necesariamente:

```text
FIN
```

Otros ejemplos:

- controlar la temperatura de un edificio;
- administrar una red;
- regular tráfico;
- controlar un proceso industrial.

---

# 1.2.2 Retorno acumulado y factor de descuento γ

Veamos primero números y después la fórmula.

Supongamos que el robot recibe:

```text
ahora             +10
siguiente paso     -1
dos pasos después +10
```

Si simplemente sumamos:

```text
10 + (-1) + 10 = 19
```

Entonces:

```text
retorno = 19
```

La idea básica del retorno es:

> sumar las recompensas obtenidas en el futuro.

---

## Pero aparece un problema

¿Vale igual:

```text
+10 ahora
```

que:

```text
+10 dentro de 5.000 pasos?
```

Muchas aplicaciones quieren preferir una recompensa cercana.

Para eso introducimos:

\[
\gamma
\]

llamado **factor de descuento**.

Normalmente:

\[
0 \leq \gamma \leq 1
\]

---

## Ejemplo con γ = 0.9

Tenemos:

```text
primera recompensa    +10
segunda recompensa     -1
tercera recompensa    +10
```

La primera vale completa:

\[
10
\]

La segunda se multiplica una vez por 0.9:

\[
0.9(-1)=-0.9
\]

La tercera está dos pasos en el futuro:

\[
0.9^2(10)=8.1
\]

Por tanto:

\[
G=10-0.9+8.1
\]

\[
G=17.2
\]

Observa lo ocurrido:

| Recompensa | Distancia | Peso | Contribución |
|---:|---:|---:|---:|
| +10 | 0 | 1 | +10 |
| -1 | 1 | 0.9 | -0.9 |
| +10 | 2 | 0.81 | +8.1 |

Las recompensas lejanas pesan progresivamente menos.

---

# Ahora sí: la fórmula

El retorno desde el instante \(t\) se define habitualmente:

\[
G_t=
R_{t+1}
+\gamma R_{t+2}
+\gamma^2R_{t+3}
+\gamma^3R_{t+4}
+\cdots
\]

### Anatomía

| Símbolo | Significa |
|---|---|
| \(G_t\) | retorno desde el instante \(t\) |
| \(R_{t+1}\) | próxima recompensa |
| \(\gamma\) | factor de descuento |
| \(\gamma^2\) | descuento de dos pasos |
| \(R_{t+k}\) | recompensa futura |

Se puede escribir de manera compacta:

\[
G_t=\sum_{k=0}^{\infty}\gamma^k R_{t+k+1}
\]

Pero la fórmula no dice nada nuevo respecto al cálculo anterior. Solo lo comprime.

---

# ¿Qué hace exactamente γ?

## γ = 0

Entonces:

\[
G_t=R_{t+1}
\]

El agente solo se preocupa por la siguiente recompensa.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Qué entra en la cuenta",
  "caption": "Con el futuro descontado a cero, la decisión solo mira el instante actual.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 64,
        "w": 620,
        "h": 80,
        "label": "AHORA",
        "sub": "toda la atención",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [],
    "labels": [
      {
        "x": 318,
        "y": 196,
        "text": "el futuro no cuenta: γ = 0"
      }
    ]
  }
}
</script>
</lk-scene>

Es extremadamente cortoplacista.

---

## γ = 0.5

El futuro importa, pero pierde peso rápidamente.

```text
ahora       1.000
+1 paso     0.500
+2 pasos    0.250
+3 pasos    0.125
```

---

## γ = 0.9

```text
ahora       1.000
+1 paso     0.900
+2 pasos    0.810
+3 pasos    0.729
```

El futuro importa bastante.

---

## γ = 0.99

Las recompensas lejanas conservan mucho peso.

```text
ahora       1.000
+1 paso     0.990
+10 pasos   ≈0.904
+100 pasos  ≈0.366
```

Por tanto:

> cuanto más cerca está γ de 1, más largo es el horizonte temporal considerado.

[SIMPLIFICADO: a veces se usa \(1/(1-\gamma)\) como intuición del "horizonte efectivo", pero no es un punto exacto donde el agente deje de mirar.]

Por ejemplo:

```text
γ = 0.90 → ≈ 10 pasos
γ = 0.99 → ≈ 100 pasos
γ = 0.999 → ≈ 1000 pasos
```

---

# Una consecuencia muy importante

Un agente racional en RL no busca necesariamente:

```text
acción → mayor recompensa inmediata
```

Busca:

```text
acción → mayor retorno esperado
```

Por eso:

```text
ir al cargador ahora
recompensa = 0
```

puede ser mejor que:

```text
aspirar ahora
recompensa = +10
```

si cargar permite conseguir:

```text
+10 +10 +10 +10 +10 ...
```

posteriormente.

Esta es una de las ideas más importantes de todo RL.

---

# 1.2.3 Recompensa constante y acumulación infinita

Esta parte parece rara hasta que ponemos números.

Supongamos una tarea continua donde obtenemos:

```text
+1
```

en cada paso para siempre.

Entonces:

```text
1 + 1 + 1 + 1 + 1 + ...
```

Sin descuento, la suma nunca termina:

\[
\infty
\]

Esto es problemático si queremos asignar un valor finito al estado.

---

## Añadamos γ = 0.9

Ahora el retorno es:

```text
1
+ 0.9
+ 0.81
+ 0.729
+ 0.6561
+ ...
```

Cada recompensa futura vale menos.

Aunque hay infinitos términos, la suma converge.

El resultado es:

\[
10
\]

---

## ¿De dónde sale ese 10?

Llamemos \(G\) a toda la suma:

\[
G=1+0.9+0.9^2+0.9^3+\cdots
\]

Multiplicamos todo por 0.9:

\[
0.9G=0.9+0.9^2+0.9^3+\cdots
\]

Restamos:

\[
G-0.9G=1
\]

\[
0.1G=1
\]

\[
G=10
\]

---

# Caso general

Si recibimos constantemente una recompensa \(c\):

\[
c,c,c,c,\ldots
\]

el retorno es:

\[
G=c+\gamma c+\gamma^2c+\gamma^3c+\cdots
\]

Sacamos \(c\):

\[
G=c(1+\gamma+\gamma^2+\gamma^3+\cdots)
\]

La serie geométrica da:

\[
\boxed{G=\frac{c}{1-\gamma}}
\]

si:

\[
|\gamma|<1
\]

En RL normalmente usamos:

\[
0\leq\gamma<1
\]

para este caso infinito descontado.

---

## Ejemplo

Si:

\[
c=2
\]

y:

\[
\gamma=0.9
\]

entonces:

\[
G=\frac{2}{1-0.9}
\]

\[
G=\frac{2}{0.1}
\]

\[
\boxed{G=20}
\]

Tiene sentido:

```text
2
+1.8
+1.62
+1.458
+...
=20
```

---

# ¿Y qué ocurre con γ = 1?

Entonces:

\[
G=1+1+1+1+\cdots
\]

y no obtenemos un número finito.

Por eso la fórmula:

\[
\frac{c}{1-\gamma}
\]

con \(\gamma=1\) produciría:

\[
\frac{c}{0}
\]

que no está definido.

En tareas episódicas esto no necesariamente es un problema.

Por ejemplo:

```text
+1 +1 +1 +1
FIN
```

Aunque:

\[
\gamma=1
\]

la suma es simplemente:

\[
4
\]

porque el episodio termina.

El problema aparece cuando tenemos simultáneamente:

```text
tarea infinita
+
recompensas que continúan
+
γ = 1
```

---

# Errores típicos

### 1. «Recompensa y valor son lo mismo»

Es incorrecto.

```text
recompensa → qué acaba de ocurrir

valor → cuánto esperamos conseguir desde aquí en adelante
```

Una acción puede tener recompensa inmediata 0 y un enorme valor futuro.

---

### 2. «El objetivo es conseguir la recompensa más grande en cada paso»

No.

El objetivo habitual es maximizar el **retorno esperado**.

Una pequeña pérdida ahora puede permitir una recompensa mucho mayor después.

---

### 3. «γ es cuánto le importa la recompensa actual»

Es al revés.

La recompensa inmediata no lleva descuento:

\[
R_{t+1}
\]

El descuento empieza en el futuro:

\[
\gamma R_{t+2}
\]

\[
\gamma^2R_{t+3}
\]

etc.

---

### 4. «γ = 0.9 significa mirar solamente 10 pasos»

No exactamente.

El agente sigue considerando recompensas posteriores.

Simplemente reciben cada vez menos peso.

---

### 5. «Todo RL tiene un modelo del entorno»

No.

Existen métodos **model-based** y **model-free**.

---

# Límites y verdades completas

Antes simplificamos el concepto de estado.

En un **MDP** clásico, el estado debe contener suficiente información relevante para predecir el futuro dado lo que hagamos.

Pero un agente real podría no observar todo.

Por ejemplo:

```text
robot ve:
habitación

pero no sabe:
qué hay detrás de una puerta cerrada
```

Entonces tenemos una situación parcialmente observable. Más adelante esto lleva a conceptos como **POMDP**.

También hemos utilizado el retorno descontado como formulación principal de tareas continuas. No es la única posibilidad. Otra formulación importante es el **average reward**, donde interesa la recompensa media conseguida por unidad de tiempo.

---

# Imagen completa

Todo lo visto encaja así:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 280",
  "title": "El sistema completo",
  "caption": "El estado va del entorno al agente; la acción vuelve al entorno y se convierte en estado nuevo y recompensa.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 88,
        "w": 200,
        "h": 110,
        "label": "ENTORNO",
        "sub": "casa",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 548,
        "y": 88,
        "w": 200,
        "h": 110,
        "label": "AGENTE",
        "sub": "robot",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 216,
        "y1": 124,
        "x2": 544,
        "y2": 124,
        "label": "estado",
        "tone": "green",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 544,
        "y1": 162,
        "x2": 216,
        "y2": 162,
        "label": "acción",
        "tone": "blue",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 44,
        "text": "POLÍTICA π: decide qué hacer"
      },
      {
        "x": 380,
        "y": 244,
        "text": "lo que vuelve es estado nuevo + recompensa"
      }
    ]
  }
}
</script>
</lk-scene>

El retorno que se maximiza reúne todo eso:

\(G = R_1 + \gamma R_2 + \gamma^2 R_3 + \dots\)

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Dónde entra el futuro",
  "caption": "La función de valor dice qué tan prometedor es; el modelo, opcional, predice qué ocurriría.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 56,
        "w": 340,
        "h": 104,
        "label": "FUNCIÓN DE VALOR",
        "sub": "V(s) / Q(s,a) · futuro esperado",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 408,
        "y": 56,
        "w": 340,
        "h": 104,
        "label": "MODELO",
        "sub": "opcional · predice qué ocurriría",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [],
    "labels": [
      {
        "x": 380,
        "y": 204,
        "text": "con eso se elige maximizar el retorno"
      }
    ]
  }
}
</script>
</lk-scene>

Y sobre todo el sistema aparece permanentemente este conflicto:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 300",
  "title": "Elegir próxima acción",
  "caption": "Una decisión, dos salidas: la que ya funciona y la que todavía no se probó.",
  "scene": {
    "boxes": [
      {
        "x": 250,
        "y": 16,
        "w": 260,
        "h": 76,
        "label": "elegir próxima acción",
        "tone": "ink",
        "rx": 0,
        "size": 20
      },
      {
        "x": 52,
        "y": 176,
        "w": 250,
        "h": 96,
        "label": "EXPLOTAR",
        "sub": "lo que funciona",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 458,
        "y": 176,
        "w": 250,
        "h": 96,
        "label": "EXPLORAR",
        "sub": "probar alternativas",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 340,
        "y1": 94,
        "x2": 180,
        "y2": 172,
        "tone": "blue",
        "labelSize": 15,
        "width": 2
      },
      {
        "x1": 420,
        "y1": 94,
        "x2": 580,
        "y2": 172,
        "tone": "green",
        "labelSize": 15,
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

---

# Resumen para guardar

```text
APRENDIZAJE POR REFUERZO

Agente:
quien toma decisiones.

Entorno:
mundo con el que interactúa.

Estado s:
situación actual relevante.

Acción a:
decisión tomada por el agente.

Recompensa R:
señal inmediata producida por la consecuencia de una acción.

Política π:
regla o distribución que determina qué acción elegir en cada estado.

Valor V(s):
retorno esperado desde un estado.

Valor Q(s,a):
retorno esperado al hacer una acción a desde un estado s.

Modelo:
predice próximo estado y/o recompensa; es opcional.

Exploración:
probar alternativas para obtener información.

Explotación:
usar lo que actualmente parece mejor.

Tarea episódica:
tiene inicio y estado terminal.

Tarea continua:
puede continuar indefinidamente.

Retorno:
suma de recompensas futuras.

Gₜ = Rₜ₊₁ + γRₜ₊₂ + γ²Rₜ₊₃ + ...

γ:
factor de descuento.
γ pequeño → importa principalmente el corto plazo.
γ cercano a 1 → importa mucho más el futuro.

Recompensa constante infinita:
si cada paso da c y 0 ≤ γ < 1:

G = c / (1 - γ)

Idea central del RL:
el agente no intenta maximizar únicamente la recompensa inmediata;
aprende una política que maximiza el retorno esperado a lo largo
del tiempo.
```

---

## Ruta

1. **Qué es EXL3 y qué significa “Trellis”.**
2. **Qué significa realmente K2 / K3 / K5.**
3. **Por qué mezclar esos tres niveles da ≈ 2,77 bits por peso.**
4. **Qué gana el modelo al hacer esta mezcla y qué NO significa ese 2,77.**

El caso concreto que describes coincide con el reciente **DeepSeek-V4.1-Flash-Spark**: sus 15.360 expertos enrutados se dividen en **7.279 K2, 6.299 K3 y 1.782 K5**, y el autor reporta **2,77 bpw** para esos expertos. [Hugging Face](https://huggingface.co/0xSero/DeepSeek-V4.1-Flash-Spark)

---

# 1. Por qué existe EXL3

Imagina un modelo con cientos de miles de millones de pesos.

En BF16, cada peso ocupa:

```text
1 peso = 16 bits
```

Si pudiéramos llevarlo a unos:

```text
1 peso ≈ 2,77 bits
```

los pesos ocuparían aproximadamente **5,8 veces menos** espacio bruto.

El problema es que simplemente tomar cada número y redondearlo a uno de cuatro valores de 2 bits destruye demasiada información.

EXL3 intenta resolver precisamente eso.

**EXL3** es un formato de cuantización *weight-only* derivado de las ideas de QTIP. En lugar de tratar cada peso independientemente, usa **trellis coded quantization**: busca buenas representaciones de **secuencias completas de pesos**. El proyecto ExLlamaV3 describe EXL3 como una variante simplificada de QTIP, aunque cambia aspectos del regularizado y del empaquetado. [GitHub](https://github.com/turboderp-org/exllamav3/blob/master/doc/exl3.md?utm_source=chatgpt.com)

La idea inicial es:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "La caja, en una línea",
  "caption": "Entran los pesos originales y salen comprimidos; lo de dentro es lo que este documento abre.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 200,
        "h": 96,
        "label": "pesos originales",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "5120 ↔ 2304",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 280,
        "y": 70,
        "w": 200,
        "h": 96,
        "label": "EXL3",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "Trellis",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 552,
        "y": 70,
        "w": 200,
        "h": 96,
        "label": "pesos comprimidos",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "2 a 5 bits",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 212,
        "y1": 118,
        "x2": 276,
        "y2": 118,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 484,
        "y1": 118,
        "x2": 548,
        "y2": 118,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Pero todavía falta entender qué hay dentro de esa caja.

---

# 2. La diferencia fundamental: no es “redondear cada peso”

Supongamos estos pesos:

```text
0.53   -0.14   0.81   0.26   ...
```

Una cuantización escalar muy simple haría conceptualmente:

| Valor | Nivel |
|---|---|
| 0.53 | 2 |
| -0.14 | 1 |
| 0.81 | 3 |
| 0.26 | 2 |

Cada peso se decide casi aisladamente.

Trellis piensa de otra manera:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "Cada decisión depende de la anterior",
  "caption": "No se elige un nivel por peso: se elige un estado, y ese estado condiciona la decisión siguiente.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 90,
        "w": 190,
        "h": 96,
        "label": "peso 1",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "decisión",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 290,
        "y": 90,
        "w": 180,
        "h": 96,
        "label": "decisión",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "según el estado",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 562,
        "y": 90,
        "w": 190,
        "h": 96,
        "label": "estado",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "abre la siguiente",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 202,
        "y1": 138,
        "x2": 286,
        "y2": 138,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6
      },
      {
        "x1": 474,
        "y1": 138,
        "x2": 558,
        "y2": 138,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 228,
        "text": "y así con el peso 2, el 3, el 4…"
      }
    ]
  }
}
</script>
</lk-scene>

La decisión para representar una secuencia forma **un camino por un grafo**.

QTIP explica esta propiedad como una cuantización **stateful**: si cada estado tiene `2ᴷ` caminos posibles de salida, solamente hacen falta `K` bits para indicar qué transición se tomó. Luego se busca, mediante un algoritmo tipo Viterbi, el camino cuya secuencia reconstruida se parece más a la original. [Together AI](https://www.together.ai/blog/even-better-even-faster-quantized-llms-with-qtip?utm_source=chatgpt.com)

Esta es la imagen mental importante:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 270",
  "title": "Dos maneras de decidir el nivel",
  "caption": "La cuantización normal decide cada peso por su cuenta; Trellis decide el camino completo y recién ahí escribe bits.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 64,
        "w": 330,
        "h": 116,
        "label": "Cuantización normal",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "cada peso elige su nivel, solo",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 422,
        "y": 64,
        "w": 330,
        "h": 116,
        "label": "Trellis",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "busca el mejor camino completo",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 344,
        "y1": 122,
        "x2": 418,
        "y2": 122,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 228,
        "text": "de ahí sale el bitstream"
      }
    ]
  }
}
</script>
</lk-scene>

Eso permite utilizar muy pocos bits de forma bastante más inteligente.

---

# 3. Antes del Trellis: “revolver” los pesos

Hay otro problema.

Las matrices de un LLM contienen valores atípicos y direcciones especialmente importantes. Una cuantización agresiva sufre mucho con ellos.

QTIP y la familia QuIP utilizan transformaciones tipo **Hadamard aleatorizada** para distribuir esa información antes de cuantizar. El resultado se parece más a una distribución suave/Gaussiana y es más fácil de comprimir eficientemente. [Together AI](https://www.together.ai/blog/even-better-even-faster-quantized-llms-with-qtip?utm_source=chatgpt.com)

Mentalmente:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "Antes y después de repartir los outliers",
  "caption": "Un peso enorme aplasta al resto; al repartirlo, la distribución deja de tener un pico aislado.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 300,
        "h": 110,
        "label": "ANTES",
        "tone": "red",
        "rx": 0,
        "size": 20,
        "sub": "un outlier aplasta al resto",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 452,
        "y": 60,
        "w": 300,
        "h": 110,
        "label": "DESPUÉS",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "distribución pareja",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 312,
        "y1": 115,
        "x2": 448,
        "y2": 115,
        "tone": "slate",
        "labelSize": 15,
        "width": 2
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 226,
        "text": "los signos reparten ese pico entre todos"
      }
    ]
  }
}
</script>
</lk-scene>

No se pierde mágicamente el outlier. Su información queda **distribuida entre muchas coordenadas**.

EXL3 conserva vectores asociados a estas transformaciones, `suh` y `svh`, además del stream `trellis`. El código oficial acepta esos vectores en FP16 y deriva directamente `K` del ancho del tensor Trellis. [GitHub](https://github.com/turboderp-org/exllamav3/blob/master/exllamav3/modules/quant/exl3.py)

---

# 4. Ahora sí: ¿qué significa K2?

Aquí está una confusión frecuente.

**K2 no significa que cada peso sea un entero normal de 2 bits.**

Significa aproximadamente:

> el stream del Trellis dedica **2 bits de información por paso/peso**.

Para EXL3, las matrices se procesan en tiles de:

```text
16 × 16 = 256 pesos
```

Y el propio código define para un bitrate `K`:

```text
16 × K palabras uint16 por cada tile de 256 pesos
``` :chatgpt-content-reference{index="5"}


Veamos por qué eso produce exactamente `K` bits/peso.

### K2

```text
16 × 2 = 32 palabras uint16

32 × 16 bits = 512 bits

512 bits / 256 pesos = 2 bits/peso
```

### K3

```text
16 × 3 = 48 palabras uint16

48 × 16 = 768 bits

768 / 256 = 3 bits/peso
```

### K5

```text
16 × 5 = 80 palabras uint16

80 × 16 = 1280 bits

1280 / 256 = 5 bits/peso
```

Por tanto:

| Tier | Trellis payload | Interpretación |
|---|---:|---|
| **K2** | ~2 bpw | máxima compresión |
| **K3** | ~3 bpw | compromiso |
| **K5** | ~5 bpw | mucha más fidelidad |

Y el código de ExLlamaV3 incluso permite bitrates fraccionarios como `K=2.5`, alternando pasos de 2 y 3 bits. [GitHub](https://github.com/turboderp-org/exllamav3/blob/master/exllamav3/modules/quant/exl3_lib/quantize.py)

---

# 5. ¿Por qué tener K2, K3 y K5 a la vez?

Porque **no todos los expertos son igual de sensibles a la cuantización**.

Este modelo es MoE:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Un router, muchos expertos",
  "caption": "El token no pasa por todos: el router elige cuáles, y cada uno guarda sus pesos por separado.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 90,
        "w": 180,
        "h": 96,
        "label": "token",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "una entrada",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 290,
        "y": 90,
        "w": 180,
        "h": 96,
        "label": "router",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "elige expertos",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 138,
        "x2": 286,
        "y2": 138,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6
      }
    ],
    "labels": [
      {
        "x": 600,
        "y": 104,
        "text": "Experto 0"
      },
      {
        "x": 600,
        "y": 196,
        "text": "Experto 383"
      }
    ]
  }
}
</script>
</lk-scene>

DeepSeek-V4.1-Flash tiene:

```text
40 capas
×
384 expertos enrutados/capa
=
15.360 instancias de experto
```

y utiliza solo un subconjunto por token. La configuración oficial confirma 384 routed experts y top-6. [Hugging Face](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/config.json?utm_source=chatgpt.com)

La estrategia es conceptualmente:

| Sensibilidad del experto | K |
|---|---|
| poco sensible | K2 |
| media | K3 |
| delicado | K5 |

Eso es **mixed precision**.

No se paga K5 por todo el modelo.

---

# 6. Nuestro caso concreto

La distribución publicada es: [Hugging Face](https://huggingface.co/0xSero/DeepSeek-V4.1-Flash-Spark?utm_source=chatgpt.com)

```text
15.360 expertos

K2 : 7.279
K3 : 6.299
K5 : 1.782
```

En porcentajes:

| Tier | Expertos | Porcentaje |
|---|---:|---:|
| K2 | 7.279 | 47,39 % |
| K3 | 6.299 | 41,01 % |
| K5 | 1.782 | 11,60 % |

Visualmente:

El reparto no es parejo, y el total son 15.360 expertos:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "Cómo se reparten los 15.360 expertos",
  "caption": "Casi la mitad de los expertos se queda en K2: el presupuesto sigue a la sensibilidad.",
  "scene": {
    "bars": [
      {
        "x": 60,
        "y": 60,
        "rows": [
          {
            "label": "K2",
            "value": 47.4,
            "max": 50,
            "unit": " %",
            "tone": "slate",
            "display": "47,4 %"
          },
          {
            "label": "K3",
            "value": 41.0,
            "max": 50,
            "unit": " %",
            "tone": "blue",
            "display": "41,0 %"
          },
          {
            "label": "K5",
            "value": 11.6,
            "max": 50,
            "unit": " %",
            "tone": "green",
            "display": "11,6 %"
          }
        ],
        "width": 620,
        "rowH": 56
      }
    ]
  }
}
</script>
</lk-scene>

Casi la mitad puede comprimirse agresivamente a K2.

Solo aproximadamente **1 de cada 9 expertos** recibe el costoso K5.

Ese es el truco económico de toda la mezcla.

---

# 7. Hagamos el promedio

Ahora usamos simplemente una media ponderada.

Cada grupo aporta:

```text
K2:
7.279 × 2 = 14.558

K3:
6.299 × 3 = 18.897

K5:
1.782 × 5 =  8.910
                  ──────
                 42.365
```

Dividimos por los 15.360 expertos:

```text
42.365
─────── = 2,758138...
15.360
```

Así que el **payload Trellis puro** queda en aproximadamente:

## **2,758 bits/peso**

No 2,77 todavía.

Y aquí aparece un detalle interesante.

---

# 8. ¿De dónde salen entonces los 2,77 bpw?

EXL3 no almacena solamente los bits del camino Trellis.

También necesita una pequeña cantidad de metadatos para reconstruir las matrices, principalmente los vectores relacionados con las transformaciones Hadamard/signos (`suh` y `svh`), además del identificador del codebook. El código oficial muestra explícitamente `trellis`, `suh`, `svh` y el marcador del codebook entre los componentes de una matriz EXL3. [GitHub](https://github.com/turboderp-org/exllamav3/blob/master/exllamav3/modules/quant/exl3.py)

En este DeepSeek:

```text
hidden_size            = 5120
moe_intermediate_size  = 2304
``` :chatgpt-content-reference{index="10"}


Una proyección de experto contiene aproximadamente:

```text
5120 × 2304
=
11.796.480 pesos
```

Pero sus dos vectores Hadamard/signo tienen:

```text
5120 + 2304 = 7424 valores
```

Si están almacenados como FP16:

```text
7424 × 16 bits = 118.784 bits
```

Distribuidos sobre los 11.796.480 pesos:

```text
118.784 / 11.796.480
≈
0,01007 bits adicionales/peso
```

Por tanto:

```text
payload Trellis        2,75814
metadata aproximada  + 0,01007
                       ───────
                       2,76821
```

Redondeado:

# **≈ 2,77 bits/peso**

Esto encaja prácticamente exactamente con el valor publicado.

**Importante:** la tarjeta del modelo publica directamente `2.77 bpw`, pero no desarrolla esta derivación. La separación `2,758 + ~0,010` es una inferencia a partir del layout EXL3 oficial y de las dimensiones de DeepSeek; no es una fórmula que el autor haya escrito explícitamente. [Hugging Face](https://huggingface.co/0xSero/DeepSeek-V4.1-Flash-Spark)

---

# 9. Qué hace Trellis dentro de un K2

Ahora abramos un poco más la caja.

Supongamos un pequeño fragmento ya transformado:

```text
0.48  -0.11  0.73  0.22 ...
```

Para un Trellis K2, cada estado tiene conceptualmente:

```text
2² = 4
```

transiciones posibles.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 330",
  "title": "Desde un estado, cuatro salidas",
  "caption": "Dos bits abren cuatro caminos; el buscador los prueba y conserva el mejor.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 96,
        "w": 180,
        "h": 96,
        "label": "estado actual",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "sin decidir",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 566,
        "y": 24,
        "w": 186,
        "h": 84,
        "label": "estado A",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "opción 00",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 566,
        "y": 186,
        "w": 186,
        "h": 84,
        "label": "estado D",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "opción 11",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 124,
        "x2": 562,
        "y2": 64,
        "tone": "green",
        "labelSize": 15,
        "width": 2
      },
      {
        "x1": 192,
        "y1": 168,
        "x2": 562,
        "y2": 232,
        "tone": "amber",
        "labelSize": 15,
        "width": 2
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 300,
        "text": "también 01 y 10"
      }
    ]
  }
}
</script>
</lk-scene>

El cuantizador considera secuencias enteras:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "El cuantizador elige secuencias",
  "caption": "Cada paso cuesta dos bits y lo que se optimiza es el camino completo.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 96,
        "w": 170,
        "h": 88,
        "label": "estado 7",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "T0",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 295,
        "y": 96,
        "w": 170,
        "h": 88,
        "label": "estado 3",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "T1",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 582,
        "y": 96,
        "w": 170,
        "h": 88,
        "label": "estado 5",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "T2",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 182,
        "y1": 140,
        "x2": 291,
        "y2": 140,
        "tone": "slate",
        "labelSize": 15,
        "width": 2
      },
      {
        "x1": 469,
        "y1": 140,
        "x2": 578,
        "y2": 140,
        "tone": "slate",
        "labelSize": 15,
        "width": 2
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 48,
        "text": "dos bits por paso"
      }
    ]
  }
}
</script>
</lk-scene>

Busca el camino que produzca la reconstrucción con menor error.

Eso es radicalmente diferente a decir:

```text
cada peso tiene cuatro niveles posibles
```

Con Trellis, **los pesos sucesivos están codificados por un camino compartido**.

Ese contexto adicional es una de las razones por las que puede obtener mucha calidad con tan pocos bits. QTIP fue diseñado precisamente para conseguir cuantización de dimensión muy alta sin que el codebook crezca exponencialmente como en vector quantization convencional. [Together AI](https://www.together.ai/blog/even-better-even-faster-quantized-llms-with-qtip?utm_source=chatgpt.com)

---

# 10. K5 no tiene simplemente “2,5× más calidad” que K2

K5 proporciona:

```text
2⁵ = 32 transiciones posibles por estado
```

frente a:

```text
K2 → 2² = 4
K3 → 2³ = 8
K5 → 2⁵ = 32
```

Por tanto, el buscador tiene muchas más opciones para aproximar una secuencia delicada.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 340",
  "title": "Cuántas opciones por paso",
  "caption": "Cada bit extra multiplica las secuencias que el buscador puede probar, y por eso K5 aproxima mejor.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 56,
        "w": 90,
        "h": 72,
        "label": "K2",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "4",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 148,
        "w": 180,
        "h": 72,
        "label": "K3",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "8",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 240,
        "w": 600,
        "h": 72,
        "label": "K5",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "32",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": []
  }
}
</script>
</lk-scene>

Pero tampoco significa literalmente que K5 tenga “8 veces más calidad” que K2.

Lo que aumenta por 8 es el número de **transiciones posibles por estado**:

```text
32 / 4 = 8
```

La calidad final depende del peso, de la capa, del Hessiano/calibración, del codebook y del resto del modelo.

---

# 11. La analogía más útil: presupuesto para fotografías

Piensa en 15.360 fotografías que tienes que almacenar.

Podrías guardar absolutamente todas a calidad media:

Guardar todas a calidad media es la versión plana de esa idea: un solo nivel para todo.

Pero algunas fotos son casi irrelevantes y otras contienen texto pequeño crítico.

Una asignación mejor sería la de la figura: no todas las fotos merecen los mismos bits.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 300",
  "title": "El presupuesto, repartido por importancia",
  "caption": "No todas las fotos merecen los mismos bits: la que importa se queda con más calidad.",
  "scene": {
    "icons": [
      {
        "kind": "doc",
        "x": 170,
        "y": 165,
        "size": 70,
        "tone": "slate"
      },
      {
        "kind": "doc",
        "x": 380,
        "y": 165,
        "size": 96,
        "tone": "blue"
      },
      {
        "kind": "doc",
        "x": 600,
        "y": 165,
        "size": 124,
        "tone": "green"
      }
    ],
    "callouts": [
      {
        "n": 1,
        "x": 120,
        "y": 66,
        "to": [
          150,
          120
        ],
        "tone": "slate"
      },
      {
        "n": 2,
        "x": 380,
        "y": 56,
        "to": [
          380,
          104
        ],
        "tone": "blue"
      },
      {
        "n": 3,
        "x": 645,
        "y": 48,
        "to": [
          628,
          92
        ],
        "tone": "green"
      }
    ],
    "labels": [
      {
        "x": 170,
        "y": 258,
        "text": "calidad 2"
      },
      {
        "x": 380,
        "y": 258,
        "text": "calidad 3"
      },
      {
        "x": 600,
        "y": 258,
        "text": "calidad 5"
      }
    ]
  }
}
</script>
</lk-scene>

El presupuesto total sigue siendo aproximadamente el mismo:

```text
muchísimas baratas
+
bastantes medias
+
unas pocas caras
=
2,77 de media
```

El mapeo es:

| Analogía | EXL3 |
|---|---|
| fotografía | experto |
| calidad JPEG | K2/K3/K5 |
| presupuesto de almacenamiento | bpw |
| detalles importantes | sensibilidad a cuantización |
| elegir calidad por foto | mixed precision |

**Dónde se rompe la analogía:** K2/K3/K5 no son niveles JPEG ni cuantización escalar. Trellis representa secuencias mediante caminos por un grafo.

---

# 12. Imagen completa

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Cómo se comprime un experto",
  "caption": "Primero se reparten los outliers; después se busca el mejor camino por bloques de 16×16 pesos.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 80,
        "w": 180,
        "h": 96,
        "label": "pesos originales",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "5120 ↔ 2304",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 290,
        "y": 80,
        "w": 180,
        "h": 96,
        "label": "base transformada",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "outliers repartidos",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 572,
        "y": 80,
        "w": 180,
        "h": 96,
        "label": "búsqueda Trellis",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "bloques 16×16",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 128,
        "x2": 286,
        "y2": 128,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6,
        "label": "Hadamard",
        "labelAt": 0.5
      },
      {
        "x1": 474,
        "y1": 128,
        "x2": 568,
        "y2": 128,
        "tone": "slate",
        "labelSize": 15,
        "width": 1.6,
        "label": "Viterbi",
        "labelAt": 0.5
      }
    ]
  }
}
</script>
</lk-scene>

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "De la sensibilidad al tamaño final",
  "caption": "El experto delicado recibe más bits; el payload final es el promedio ponderado más un overhead pequeño.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 220,
        "h": 100,
        "label": "K2",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "2 bpw · 7.279 expertos",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 270,
        "y": 70,
        "w": 220,
        "h": 100,
        "label": "K3",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "3 bpw · 6.299 expertos",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 532,
        "y": 70,
        "w": 220,
        "h": 100,
        "label": "K5",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "5 bpw · 1.782 expertos",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [],
    "labels": [
      {
        "x": 380,
        "y": 40,
        "text": "cada experto elige su K por sensibilidad"
      },
      {
        "x": 380,
        "y": 224,
        "text": "payload ≈ 2,758 bpw → ≈ 2,77 con overhead"
      }
    ]
  }
}
</script>
</lk-scene>

---

# 13. Dos matices muy importantes

### **2,77 bpw no es el promedio de todo DeepSeek-V4.1-Flash**

Es la tasa reportada para los **routed experts del backbone**.

En ese checkpoint, atención, shared experts, routers, Engram, DSpark/MTP, vision tower, embeddings y `lm_head` se mantienen en sus formatos originales FP8/BF16/MXFP4. [Hugging Face](https://huggingface.co/0xSero/DeepSeek-V4.1-Flash-Spark)

Por eso sería incorrecto pensar:

> “DeepSeek-V4.1 completo está almacenado a 2,77 bits por parámetro.”

No lo está.

### **K2 no equivale a un Q2 clásico**

EXL3/Trellis no hace simplemente:

El paso no es `float` a un entero de 2 bits. Es una búsqueda sobre secuencias, y de ahí sale el bitstream.

Hace algo mucho más parecido a:

```text
transformación
      ↓
secuencia de pesos
      ↓
búsqueda de camino óptimo
      ↓
codebook procedural
      ↓
bitstream de K bits/paso
```

Por eso comparar “EXL3 K2” y “una cuantización uniforme de 2 bits” únicamente por el número 2 puede ser engañoso.

---

## Resumen para guardar

```text
EXL3
= formato de cuantización weight-only de ExLlamaV3 basado en ideas de QTIP.

Trellis
= en vez de cuantizar cada peso aislado, representa una secuencia como
  un camino por un grafo y busca un buen camino con Viterbi.

K
= bitrate del stream Trellis.

K2 ≈ 2 bits/peso de payload.
K3 ≈ 3 bits/peso.
K5 ≈ 5 bits/peso.

DeepSeek-V4.1-Flash-Spark:
K2: 7.279 expertos
K3: 6.299 expertos
K5: 1.782 expertos
Total: 15.360

Promedio nominal:
(7279·2 + 6299·3 + 1782·5) / 15360
= 2,758 bpw.

Sumando el pequeño overhead del formato:
≈ 2,77 bpw.

La clave:
no se usan 2,77 bits en todos los expertos.
Se gastan pocos bits donde K2 basta y muchos bits donde K5 protege
información sensible.

Así se obtiene mejor calidad para un presupuesto medio cercano a
2,77 bits por peso.
```

La forma mental más útil es: **EXL3 tiene un presupuesto de bits y Trellis decide cómo representar muy eficientemente cada secuencia; la mezcla K2/K3/K5 decide dónde merece la pena gastar ese presupuesto.**

---

# Unidad 2: Estrategias de Aprendizaje Tabulares

## 0. Primero: ¿qué significa "tabular"?

**Método tabular** = método que guarda lo aprendido explícitamente en una **tabla**.

Imagina un robot que puede estar en tres lugares:

- Cocina
- Pasillo
- Dormitorio

Y puede hacer dos acciones:

- Izquierda
- Derecha

Podríamos guardar cuánto conviene cada acción así:

| Estado | Izquierda | Derecha |
|---|---:|---:|
| Cocina | 2 | 8 |
| Pasillo | 4 | 6 |
| Dormitorio | 9 | 1 |

Esos números podrían representar **valores Q**: estimaciones de qué tan conveniente es realizar una acción desde un estado.

La gran pregunta de esta unidad es:

> **¿Cómo aprendemos esos números?**

DP, Monte Carlo y TD responden de forma diferente.

| Método | Cómo aprende |
|---|---|
| DP | conozco cómo funciona el mundo |
| MC | pruebo y espero a ver cómo terminó |
| TD | pruebo y aprendo después de cada paso |

Una idea extremadamente importante:

**DP usa un modelo. MC y TD pueden aprender directamente de la experiencia.**

---

# Tema 1: Programación Dinámica — DP

## 1. El problema que intenta resolver DP

Supón que conoces perfectamente un videojuego.

Sabes:

- qué estados existen;
- qué acciones puedes realizar;
- a qué estado puedes llegar;
- con qué probabilidad;
- qué recompensa obtienes.

Por ejemplo:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 290",
  "title": "Un paso con dos futuros",
  "caption": "La misma acción puede llevar a dos estados, cada uno con su recompensa y su probabilidad.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 90,
        "w": 190,
        "h": 96,
        "label": "Pasillo",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "estado · acción: derecha",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 520,
        "y": 24,
        "w": 220,
        "h": 84,
        "label": "Cocina",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "80 % · +5",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 520,
        "y": 186,
        "w": 220,
        "h": 84,
        "label": "Dormitorio",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "20 % · −1",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 202,
        "y1": 124,
        "x2": 516,
        "y2": 66,
        "tone": "green",
        "width": 2
      },
      {
        "x1": 202,
        "y1": 156,
        "x2": 516,
        "y2": 228,
        "tone": "amber",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

Entonces podrías calcular matemáticamente qué decisiones son mejores **sin tener que jugar miles de partidas**.

Eso es lo que aprovecha **Dynamic Programming (DP)**.

### Modelo

Un **modelo del entorno** = descripción de qué puede ocurrir después de realizar una acción.

Normalmente incluye:

\[
P(s',r|s,a)
\]

No te preocupes todavía por la notación.

Significa:

> Si estoy en el estado `s` y realizo la acción `a`, ¿qué probabilidad hay de llegar a `s'` y recibir recompensa `r`?

---

# 2. Recordatorio: política y función de valor

Necesitamos dos conceptos.

### Política

Una **política** \(\pi\) = regla que utiliza el agente para decidir qué acción realizar.

Ejemplo:

| Estado | Acción |
|---|---|
| Cocina | derecha |
| Pasillo | derecha |
| Dormitorio | izquierda |

### Función de valor

Una **función de valor** estima cuánto beneficio futuro puedes esperar desde un estado.

\[
V_\pi(s)
\]

Se lee:

> valor del estado `s` siguiendo la política π.

Ejemplo:

```text
Cocina       V = 8
Pasillo <lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "El bucle de la evaluación de política",
  "caption": "Evaluar dice cuánto vale la política; mejorarla la cambia; y el ciclo vuelve a empezar.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 48,
        "w": 180,
        "h": 88,
        "label": "política π",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "qué hacer",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 290,
        "y": 48,
        "w": 180,
        "h": 88,
        "label": "valores",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "evaluar",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 572,
        "y": 48,
        "w": 180,
        "h": 88,
        "label": "política π′",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "mejorar",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 92,
        "x2": 286,
        "y2": 92,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 474,
        "y1": 92,
        "x2": 568,
        "y2": 92,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 662,
        "y1": 140,
        "x2": 662,
        "y2": 190,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 662,
        "y1": 190,
        "x2": 98,
        "y2": 190,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 98,
        "y1": 190,
        "x2": 98,
        "y2": 140,
        "tone": "blue",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>
        "width": 2
      },
      {
        "x1": 494,
        "y1": 82,
        "x2": 528,
        "y2": 82,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 642,
        "y1": 126,
        "x2": 118,
        "y2": 126,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

## 3.1 Policy Evaluation

**Policy Evaluation** = calcular cuánto vale cada estado si continuamos usando la política actual.

Supongamos:

Supongamos que desde `Cocina`, la acción `derecha` lleva a la `Meta` y da +10.

Si nuestra política dice:

> desde Cocina, ve a la derecha

entonces Cocina probablemente tenga un valor alto.

Bellman nos permite actualizarlo.

Una versión simplificada sería:

\[
V(s) \leftarrow R + \gamma V(s')
\]

Donde:

- \(s\) = estado actual.
- \(s'\) = siguiente estado.
- \(R\) = recompensa.
- \(\gamma\) = factor de descuento.

### ¿Qué es γ?

**Factor de descuento** = cuánto nos importan las recompensas futuras.

Por ejemplo:

\[
\gamma=0.9
\]

significa que una recompensa futura vale algo menos que una inmediata.

---

## 3.2 Policy Improvement

Ahora ya conocemos aproximadamente los valores.

Entonces preguntamos:

> ¿Existe alguna acción mejor que la que actualmente recomienda mi política?

Ejemplo:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Dos acciones, dos valores",
  "caption": "Desde el mismo estado, cada acción abre un futuro distinto y por eso vale distinto.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 84,
        "w": 180,
        "h": 88,
        "label": "Pasillo",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "estado",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 560,
        "y": 24,
        "w": 190,
        "h": 80,
        "label": "izquierda",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "V = 3",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 560,
        "y": 156,
        "w": 190,
        "h": 80,
        "label": "derecha",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "V = 9",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 116,
        "x2": 556,
        "y2": 64,
        "tone": "amber",
        "width": 2
      },
      {
        "x1": 192,
        "y1": 152,
        "x2": 556,
        "y2": 196,
        "tone": "green",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

Nuestra política decía:

Nuestra política decía: en `Pasillo` conviene ir a la `izquierda`.

Pero descubrimos que derecha lleva a mejores resultados.

La cambiamos:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "La misma fila, otro destino",
  "caption": "Cambiar la acción cambia el valor del estado, sin tocar el entorno.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 320,
        "h": 110,
        "label": "ANTES",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "izquierda · V = 3",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 432,
        "y": 60,
        "w": 320,
        "h": 110,
        "label": "DESPUÉS",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "derecha · V = 9",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 332,
        "y1": 115,
        "x2": 428,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Eso es **Policy Improvement**.

---

# 4. Iteración de Valor

Policy Iteration separaba:

```text
evaluar política
      ↓
mejorar política
```

**Value Iteration** los mezcla.

En lugar de evaluar completamente una política y después mejorarla, pregunta directamente:

> De todas las acciones disponibles, ¿cuál parece producir el mayor valor?

Su actualización fundamental es:

\[
V(s)
\leftarrow
\max_a
\sum_{s',r}
p(s',r|s,a)
[R+\gamma V(s')]
\]

No necesitas memorizarla todavía.

Mira su significado:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 300",
  "title": "elegir el mayor valor esperado",
  "caption": "Con los valores ya estimados, la política solo compara y toma el máximo.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 30,
        "w": 230,
        "h": 70,
        "label": "acción A",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "valor esperado 4",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 118,
        "w": 230,
        "h": 70,
        "label": "acción B",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "valor esperado 9",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 206,
        "w": 230,
        "h": 70,
        "label": "acción C",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "valor esperado 6",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [],
    "labels": [
      {
        "x": 560,
        "y": 150,
        "text": "se elige B: 9 es el máximo"
      }
    ]
  }
}
</script>
</lk-scene>

El `max` significa:

> toma la mejor acción disponible.

---

# 5. Policy Iteration vs Value Iteration

Esta distinción es importante.

| Policy Iteration | Value Iteration |
|---|---|
| Evalúa la política | Actualiza directamente hacia lo óptimo |
| Después mejora la política | Evaluación y mejora están mezcladas |
| Puede hacer muchas evaluaciones | Normalmente hace evaluaciones parciales |
| Más explícita conceptualmente | Más compacta |

Una forma mental de recordarlo:

### Policy Iteration

Un entrenador analiza toda la temporada del jugador y después cambia la estrategia.

### Value Iteration

El entrenador va corrigiendo la estrategia mientras analiza el rendimiento.

---

# 6. Generalized Policy Iteration — GPI

Aquí aparece una idea todavía más general.

**GPI = Generalized Policy Iteration**.

No es simplemente otro algoritmo.

Es un **principio**.

Dice que en muchos métodos de RL están ocurriendo simultáneamente dos fuerzas:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Se influyen mutuamente",
  "caption": "El valor dice qué tan buena es la política; la política decide qué valores hay que estimar.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 300,
        "h": 100,
        "label": "Función de valor",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "¿qué tan buena es π?",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 432,
        "y": 60,
        "w": 300,
        "h": 100,
        "label": "Política",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "¿qué acción elijo?",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 312,
        "y1": 95,
        "x2": 428,
        "y2": 95,
        "tone": "blue",
        "width": 2
      },
      {
        "x1": 428,
        "y1": 135,
        "x2": 312,
        "y2": 135,
        "tone": "green",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

La función de valor intenta representar correctamente la política.

Mientras tanto, la política intenta volverse codiciosa respecto a esos valores.

Es decir:

Es decir: los valores dicen qué acciones parecen mejores, y la política cambia qué valores hay que estimar.

Las dos cosas se empujan mutuamente.

Eventualmente pueden llegar a:

\[
V^*
\]

y

\[
\pi^*
\]

donde `*` significa **óptimo**.

---

# 7. Métodos síncronos y asíncronos

Imagina 1,000 estados.

Una implementación ingenua podría hacer:

```text
actualizar estado 1
actualizar estado 2
actualizar estado 3
...
actualizar estado 1000

repetir todo
```

Esto se llama, de forma simplificada, una actualización **síncrona por barridos**.

Un **barrido** = recorrer todos los estados.

Pero quizá muchos estados son irrelevantes.

Entonces podemos utilizar actualizaciones **asíncronas**.

```text
1000 estados existentes

pero actualmente importan:

estado 17
estado 82
estado 341
estado 720
```

Actualizamos esos estados sin esperar a completar un barrido completo.

### ¿Por qué hacerlo?

Por eficiencia.

Si tienes:

- 10 estados → fácil.
- 1,000 estados → manejable.
- 10 millones → costoso.
- cantidades enormes → la tabla deja de ser práctica.

Este problema conduce eventualmente a aproximación de funciones y Deep RL.

---

# Tema 2: Métodos Monte Carlo

Ahora cambia algo fundamental.

## 8. El gran problema de DP

DP tenía una condición fuerte:

> necesitamos conocer el modelo del entorno.

Pero en la vida real muchas veces no lo conocemos.

Piensa en blackjack.

No necesitas conocer matemáticamente toda la dinámica del casino para aprender.

Puedes jugar muchas partidas.

Observar qué ocurrió.

Y aprender de esas experiencias.

Ahí aparecen los métodos **Monte Carlo**.

---

# 9. ¿Qué significa Monte Carlo?

**Métodos Monte Carlo** = métodos que aprenden utilizando resultados completos obtenidos mediante muestras de experiencia.

Una **muestra** aquí significa:

> algo que realmente ocurrió.

Supón esta partida:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 210",
  "title": "Un episodio, con sus recompensas",
  "caption": "Cada estado cobra lo suyo y el episodio termina en la victoria.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 80,
        "w": 170,
        "h": 84,
        "label": "S1",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "0",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 295,
        "y": 80,
        "w": 170,
        "h": 84,
        "label": "S2",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "+1",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 582,
        "y": 80,
        "w": 170,
        "h": 84,
        "label": "S3",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "+10",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 182,
        "y1": 122,
        "x2": 291,
        "y2": 122,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 469,
        "y1": 122,
        "x2": 578,
        "y2": 122,
        "tone": "slate",
        "width": 2
      }
    ],
    "labels": [
      {
        "x": 380,
        "y": 40,
        "text": "Inicio → S1 → S2 → S3 → Victoria"
      }
    ]
  }
}
</script>
</lk-scene>

Cuando termina sabemos lo que realmente ocurrió.

Podemos calcular el **retorno**.

---

# 10. Retorno

**Retorno** \(G_t\) = suma de las recompensas futuras desde un momento determinado.

Sin descuento:

```text
recompensas futuras:

0 + 1 + 10 = 11
```

Con descuento:

\[
G_t =
R_{t+1}
+\gamma R_{t+2}
+\gamma^2 R_{t+3}
+\cdots
\]

Ejemplo con:

\[
\gamma=0.9
\]

y recompensas:

```text
0, 1, 10
```

tendríamos:

\[
G=0+0.9(1)+0.9^2(10)
\]

\[
G=9
\]

aproximadamente.

---

# 11. Predicción Monte Carlo

**Predicción** significa:

> estimar valores siguiendo una política determinada.

Supongamos que visitamos `Pasillo` muchas veces.

Los resultados observados fueron:

| Episodio | Retorno |
|---|---|
| 1 | 10 |
| 2 | 4 |
| 3 | 7 |
| 4 | 11 |

Monte Carlo podría estimar:

\[
V(Pasillo)
=
\frac{10+4+7+11}{4}
\]

\[
V(Pasillo)=8
\]

La filosofía es extremadamente sencilla:

> mira lo que ocurrió realmente y promedia.

---

# 12. ¿Por qué MC necesita episodios?

Un **episodio** = interacción que tiene principio y final.

Ejemplos:

- una partida de ajedrez;
- una partida de blackjack;
- completar un laberinto;
- ganar o perder una carrera.

Monte Carlo tradicionalmente espera al final.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Lo que espera Monte Carlo",
  "caption": "El retorno no existe hasta el final, así que la corrección también llega al final.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 230,
        "h": 90,
        "label": "recorrer el episodio",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "paso a paso",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 300,
        "y": 70,
        "w": 220,
        "h": 90,
        "label": "calcular el retorno",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "suma de recompensas",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 566,
        "y": 70,
        "w": 186,
        "h": 90,
        "label": "aprender",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "una sola vez",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 242,
        "y1": 115,
        "x2": 296,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 524,
        "y1": 115,
        "x2": 562,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Esta es su principal diferencia con TD, que veremos después.

---

# 13. Control Monte Carlo

**Predicción**:

> ¿qué tan buena es esta política?

**Control**:

> quiero encontrar una política mejor.

Para conseguir control necesitamos aprender valores de acciones:

\[
Q(s,a)
\]

Por ejemplo:

| Estado | Izquierda | Derecha |
|---|---:|---:|
| Pasillo | 4.2 | 8.7 |

Entonces podemos mejorar la política:

Entonces podemos mejorar la política: el máximo es 8.7, así que se elige `derecha`.

Pero aquí aparece un problema muy importante.

---

# 14. Exploración

Supongamos que al principio probamos derecha.

Obtuvimos recompensa `+5`.

La política dice:

> derecha parece buena. Continúa usando derecha.

Pero quizá izquierda daba `+100`.

Nunca lo descubrimos porque nunca la probamos.

Ese es el problema **exploración vs explotación**.

Una estrategia habitual es **ε-greedy**.

Por ejemplo:

\[
\epsilon=0.1
\]

Entonces:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 220",
  "title": "ε-greedy: dos caminos",
  "caption": "Casi siempre se usa lo mejor conocido; a veces se prueba otra cosa para no quedarse ciego.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 50,
        "w": 340,
        "h": 90,
        "label": "90 %",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "usar la mejor acción",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 412,
        "y": 50,
        "w": 340,
        "h": 90,
        "label": "10 %",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "explorar otra",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": []
  }
}
</script>
</lk-scene>

Así garantizamos cierta exploración.

---

# 15. On-policy y Off-policy

Esta distinción es fundamental para todo lo que viene.

## On-policy

**On-policy** = aprendemos sobre la misma política que utilizamos para actuar.

```text
política que actúa  = π
política aprendida  = π
```

Es como aprender a conducir analizando **tu propia manera de conducir**.

---

## Off-policy

**Off-policy** = podemos comportarnos con una política y aprender sobre otra.

Tenemos:

### Behavior policy

La **behavior policy** \(b\) es la política que genera las experiencias.

### Target policy

La **target policy** \(\pi\) es la política que queremos aprender.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 220",
  "title": "Una política genera, otra aprende",
  "caption": "La que explora produce los datos; la que se quiere aprender los usa.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 214.0,
        "h": 90,
        "label": "behavior b",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "genera experiencias",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 300,
        "y": 60,
        "w": 120,
        "h": 90,
        "label": "experiencia",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "S, A, R, S′",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 492,
        "y": 60,
        "w": 258,
        "h": 90,
        "label": "target π",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "lo que queremos",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 222.0,
        "y1": 105,
        "x2": 296,
        "y2": 105,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 420,
        "y1": 105,
        "x2": 488,
        "y2": 105,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Analogía:

Tú quieres aprender:

> cómo conduce un piloto profesional.

Pero los datos fueron generados por:

> diferentes conductores.

La distribución de datos no coincide.

Tenemos que corregir esa diferencia.

---

# 16. Importance Sampling

Aquí aparece **importance sampling**.

La idea es corregir estadísticamente las experiencias dependiendo de:

> qué tan probable era esa acción bajo la política objetivo frente a la política que generó los datos.

Aparece un cociente como:

\[
\frac{\pi(A_t|S_t)}
     {b(A_t|S_t)}
\]

Intuitivamente:

```text
acción muy probable para π
acción poco probable para b

        ↓

esa experiencia aporta bastante información sobre π
```

No necesitas dominar la fórmula todavía.

Lo importante es comprender **por qué existe**:

> los datos fueron producidos por una política diferente de la que estamos evaluando.

---

# 17. Implementación incremental de valores

Tenemos un problema práctico.

Supongamos que hemos realizado un millón de episodios.

No queremos guardar:

```text
G1
G2
G3
...
G1000000
```

solo para calcular su promedio.

Podemos actualizar el promedio incrementalmente.

La fórmula general es:

\[
V \leftarrow V+\alpha(G-V)
\]

Mira la estructura:

\[
nuevo = viejo + paso(corrección)
\]

Ejemplo:

```text
Valor actual = 6
Retorno nuevo = 10
α = 0.1
```

Entonces:

\[
V=6+0.1(10-6)
\]

\[
V=6.4
\]

Visualmente:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 250",
  "title": "La corrección se reparte",
  "caption": "El valor nuevo es un punto entre lo que creía y lo que acaba de ver.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 86,
        "w": 200,
        "h": 84,
        "label": "valor actual 6",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "lo que creía",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 560,
        "y": 86,
        "w": 192,
        "h": 84,
        "label": "observación 10",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "lo que vio",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 310,
        "y": 86,
        "w": 140,
        "h": 84,
        "label": "6.4",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "paso pequeño",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 212,
        "y1": 128,
        "x2": 306,
        "y2": 128,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 556,
        "y1": 128,
        "x2": 454,
        "y2": 128,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

No saltamos directamente de `6` a `10`.

Nos movemos hacia la nueva evidencia.

---

# Tema 3: Temporal Difference Learning — TD

Aquí llegamos a uno de los conceptos más importantes de RL.

## 18. El problema de Monte Carlo

Monte Carlo tiene una limitación:

> para saber el retorno real normalmente debemos esperar hasta que termine el episodio.

Imagínate un partido de fútbol.

Monte Carlo sería como decir:

> no actualices ninguna opinión sobre el equipo hasta que termine el partido.

TD dice:

> puedo aprender mientras el partido sigue ocurriendo.

---

# 19. Temporal Difference

**Temporal Difference** = aprender utilizando la diferencia entre una estimación actual y una estimación posterior.

Ejemplo:

```text
Estado actual:
Pasillo

V(Pasillo) = 5
```

Damos un paso.

Recibimos:

```text
recompensa = +1
```

Llegamos a:

```text
Cocina

V(Cocina) = 8
```

TD construye un objetivo:

\[
R+\gamma V(S')
\]

Si:

\[
\gamma=0.9
\]

entonces:

\[
1+0.9(8)=8.2
\]

Nuestra estimación era:

\[
5
\]

Pero ahora nuestra nueva evidencia dice:

\[
8.2
\]

Entonces corregimos.

---

# 20. TD(0)

La actualización fundamental es:

\[
V(S_t)
\leftarrow
V(S_t)+
\alpha
[
R_{t+1}+\gamma V(S_{t+1})-V(S_t)
]
\]

Parece complicada, pero realmente tiene una estructura muy sencilla:

\[
nuevo
=
viejo
+
\alpha(error)
\]

El error es:

\[
\delta
=
R+\gamma V(S')-V(S)
\]

A esto se le llama **TD error**.

---

## Ejemplo numérico completo

Tenemos:

```text
V(Pasillo) = 5
V(Cocina)  = 8

recompensa = +1
γ = 0.9
α = 0.1
```

Objetivo TD:

\[
1+0.9(8)=8.2
\]

Error:

\[
8.2-5=3.2
\]

Actualización:

\[
5+0.1(3.2)=5.32
\]

Resultado:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 220",
  "title": "El valor se mueve, no salta",
  "caption": "Cada visita empuja la estimación un poco hacia lo observado.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 320,
        "h": 90,
        "label": "V(Pasillo) = 5",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "antes",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 432,
        "y": 60,
        "w": 320,
        "h": 90,
        "label": "V(Pasillo) = 5.32",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "después",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 332,
        "y1": 105,
        "x2": 428,
        "y2": 105,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

---

# 21. ¿Qué significa Bootstrap?

<lk-walkthrough>
<script type="application/json">
{
  "title": "La actualización, número por número",
  "viewBox": "0 0 760 430",
  "steps": [
    {
      "title": "La regla, con sus cuatro piezas",
      "text": "Cada símbolo tiene su papel: aprender es mover el valor un poco hacia lo que acaba de pasar.",
      "scene": {
        "formula": {
          "x": 380,
          "y": 120,
          "size": 40,
          "atoms": [
            {
              "t": "V"
            },
            {
              "t": "(s)"
            },
            {
              "t": " ← "
            },
            {
              "t": "V"
            },
            {
              "t": "(s)"
            },
            {
              "t": " + "
            },
            {
              "t": "α"
            },
            {
              "t": "[ "
            },
            {
              "t": "r"
            },
            {
              "t": " + "
            },
            {
              "t": "γ"
            },
            {
              "t": "·"
            },
            {
              "t": "V"
            },
            {
              "t": "(s′)"
            },
            {
              "t": " − "
            },
            {
              "t": "V"
            },
            {
              "t": "(s)"
            },
            {
              "t": " ]"
            }
          ]
        },
        "callouts": [
          {
            "n": 4,
            "x": 354,
            "y": 34,
            "to": [
              354,
              66
            ],
            "tone": "slate"
          },
          {
            "n": 2,
            "x": 383,
            "y": 34,
            "to": [
              383,
              66
            ],
            "tone": "amber"
          },
          {
            "n": 3,
            "x": 424,
            "y": 34,
            "to": [
              424,
              66
            ],
            "tone": "green"
          },
          {
            "n": 1,
            "x": 463,
            "y": 34,
            "to": [
              463,
              66
            ],
            "tone": "blue"
          }
        ],
        "labels": [
          {
            "x": 380,
            "y": 268,
            "text": "① V(s′): lo que promete el siguiente estado"
          },
          {
            "x": 380,
            "y": 300,
            "text": "② r: lo que acaba de pasar"
          },
          {
            "x": 380,
            "y": 332,
            "text": "③ γ: cuánto vale el futuro frente al presente"
          },
          {
            "x": 380,
            "y": 364,
            "text": "④ α: cuánto del error se aprende"
          }
        ],
        "formulas": [
          {
            "x": 380,
            "y": 96,
            "size": 26,
            "atoms": [
              {
                "t": "V"
              },
              {
                "t": "(s)  ←  "
              },
              {
                "t": "V"
              },
              {
                "t": "(s)  +  "
              },
              {
                "t": "α"
              },
              {
                "t": "[  "
              },
              {
                "t": "r"
              },
              {
                "t": "  +  "
              },
              {
                "t": "γ"
              },
              {
                "t": "·"
              },
              {
                "t": "V"
              },
              {
                "t": "(s′)"
              },
              {
                "t": "  −  "
              },
              {
                "t": "V"
              },
              {
                "t": "(s)  ]"
              }
            ]
          },
          {
            "x": 380,
            "y": 162,
            "size": 38,
            "atoms": [
              {
                "t": "5  +  0,1 · [ 10 + 0,9·8 − 5 ]"
              }
            ]
          }
        ]
      }
    },
    {
      "title": "Los números",
      "text": "El estado vale 5, la recompensa fue 10, el siguiente estado promete 8 y el paso es 0,1.",
      "scene": {
        "formula": {
          "x": 380,
          "y": 120,
          "size": 40,
          "atoms": [
            {
              "t": "V"
            },
            {
              "t": "(s) ← 5 + 0,1 · [ 10 + 0,9 · 8 − 5 ]"
            }
          ]
        },
        "labels": [
          {
            "x": 380,
            "y": 200,
            "text": "V(s) = 5 · r = 10 · V(s′) = 8 · γ = 0,9 · α = 0,1"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 280,
            "value": "8",
            "label": "lo que promete el estado siguiente",
            "tone": "green"
          }
        ]
      }
    },
    {
      "title": "La cuenta, por dentro",
      "text": "Primero lo de dentro del corchete: 10 + 7,2 es 17,2. Después 17,2 − 5 es 12,2. Y 0,1 × 12,2 es 1,22.",
      "scene": {
        "formula": {
          "x": 380,
          "y": 110,
          "size": 40,
          "atoms": [
            {
              "t": "10 + 0,9·8 − 5"
            }
          ]
        },
        "labels": [
          {
            "x": 380,
            "y": 170,
            "text": "0,9 × 8 = 7,2"
          }
        ],
        "stats": [
          {
            "x": 380,
            "y": 250,
            "value": "1,22",
            "label": "lo que se mueve el valor",
            "tone": "amber"
          }
        ]
      }
    },
    {
      "title": "El valor nuevo",
      "text": "El 5 se mueve 1,22 hacia arriba: el estado ahora vale 6,22, no 5.",
      "scene": {
        "formula": {
          "x": 380,
          "y": 110,
          "size": 40,
          "atoms": [
            {
              "t": "V"
            },
            {
              "t": "(s) ← 5 + 1,22 = "
            },
            {
              "t": "6,22"
            }
          ]
        },
        "stats": [
          {
            "x": 380,
            "y": 250,
            "value": "6,22",
            "label": "V(s), después de un paso",
            "tone": "blue"
          }
        ]
      }
    }
  ]
}
</script>
</lk-walkthrough>

Este concepto es esencial.

**Bootstrapping** = actualizar una estimación utilizando otra estimación.

TD dice:

```text
V(Pasillo)

lo actualizo usando...

V(Cocina)
```

Pero `V(Cocina)` también es solo una estimación.

Eso es bootstrap.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 280",
  "title": "Bootstrap: usar una estimación",
  "caption": "La estimación del estado siguiente hace de recompensa que todavía no llegó.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 240,
        "h": 70,
        "label": "Pasillo",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "V = 5",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 180,
        "w": 240,
        "h": 90,
        "label": "Cocina",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "V = 8",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 128,
        "y1": 130,
        "x2": 128,
        "y2": 176,
        "tone": "slate",
        "width": 1.6
      }
    ],
    "labels": [
      {
        "x": 520,
        "y": 130,
        "text": "el 8 de Cocina corrige el 5 de Pasillo"
      }
    ]
  }
}
</script>
</lk-scene>

### Monte Carlo no necesita bootstrap

Monte Carlo espera:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Monte Carlo espera el final",
  "caption": "El retorno se conoce recién cuando el episodio termina, y recién ahí se corrige.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 210,
        "h": 90,
        "label": "recorrer",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "varios pasos",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 296,
        "y": 70,
        "w": 190,
        "h": 90,
        "label": "fin del episodio",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "ahí se sabe",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 556,
        "y": 70,
        "w": 196,
        "h": 90,
        "label": "retorno real",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "corregir",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 222,
        "y1": 115,
        "x2": 292,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 490,
        "y1": 115,
        "x2": 552,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

TD hace:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "TD aprende a cada paso",
  "caption": "No espera el final: usa el valor estimado del estado siguiente como objetivo inmediato.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 220,
        "h": 90,
        "label": "una experiencia",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "un paso",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 297,
        "y": 70,
        "w": 200,
        "h": 90,
        "label": "estado siguiente",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "su valor estimado",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 566,
        "y": 70,
        "w": 186,
        "h": 90,
        "label": "corregir",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "ahora mismo",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 232,
        "y1": 115,
        "x2": 293,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 501,
        "y1": 115,
        "x2": 562,
        "y2": 115,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

---

# 22. DP vs MC vs TD

Ahora podemos ver la estructura completa.

| Método | Modelo | Espera final | Bootstrap |
|---|---|---|---|
| DP | Sí | No | Sí |
| Monte Carlo | No | Sí | No |
| TD | No | No | Sí |

Esta tabla resume buena parte de la unidad.

### DP

```text
modelo conocido + estimaciones
```

### MC

```text
experiencia completa + resultado real
```

### TD

```text
experiencia parcial + estimación
```

---

# 23. SARSA

Hasta ahora estimábamos:

\[
V(s)
\]

Ahora queremos aprender acciones:

\[
Q(s,a)
\]

SARSA utiliza cinco elementos:

```text
S  A  R  S' A'
```

De ahí viene su nombre:

**S-A-R-S-A**

```text
State
Action
Reward
State
Action
```

La actualización es:

\[
Q(S,A)
\leftarrow
Q(S,A)+
\alpha
[
R+\gamma Q(S',A')-Q(S,A)
]
\]

Lo importante es `A'`.

SARSA pregunta:

> En el siguiente estado, ¿qué acción REALMENTE eligió mi política?

---

# 24. Por qué SARSA es On-policy

Supón:

```text
Q(izquierda) = 5
Q(derecha)   = 10
```

Pero usamos ε-greedy.

Por exploración, el agente podría elegir:

```text
izquierda
```

aunque derecha sea actualmente mejor.

SARSA aprende utilizando esa acción realmente seleccionada.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 260",
  "title": "SARSA usa la acción que tomó",
  "caption": "Aprende con la acción que la política realmente eligió después, no con la mejor teórica.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 80,
        "w": 200,
        "h": 90,
        "label": "S + A",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "la transición",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 310,
        "y": 80,
        "w": 150,
        "h": 90,
        "label": "S′",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "el estado nuevo",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 556,
        "y": 80,
        "w": 196,
        "h": 90,
        "label": "A′",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "ε-greedy",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 212,
        "y1": 125,
        "x2": 306,
        "y2": 125,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 464,
        "y1": 125,
        "x2": 552,
        "y2": 125,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Por eso es **on-policy**.

Aprende acerca del comportamiento que realmente está utilizando.

---

# 25. Q-learning

Q-learning hace algo diferente.

Su actualización es:

\[
Q(S,A)
\leftarrow
Q(S,A)+
\alpha
[
R+
\gamma\max_a Q(S',a)
-Q(S,A)
]
\]

Observa la diferencia:

SARSA:

\[
Q(S',A')
\]

Q-learning:

\[
\max_a Q(S',a)
\]

Q-learning pregunta:

> ¿Cuál sería la mejor acción disponible desde el siguiente estado?

Incluso si el agente realmente tomó otra acción para explorar.

---

# 26. SARSA vs Q-learning

Imagina:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "El acantilado",
  "caption": "El camino corto rinde más por paso y castiga cualquier desvío; el seguro tarda más y no arriesga.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 50,
        "w": 340,
        "h": 80,
        "label": "camino seguro",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "más largo, sin riesgo",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 150,
        "w": 340,
        "h": 80,
        "label": "camino corto",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "roza el borde",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [],
    "labels": [
      {
        "x": 560,
        "y": 130,
        "text": "ACANTILADO: caer termina el episodio"
      }
    ]
  }
}
</script>
</lk-scene>

SARSA utiliza una política exploratoria.

Sabe que de vez en cuando hará movimientos aleatorios.

Por tanto puede aprender:

> acercarme demasiado al acantilado es peligroso porque mi propia exploración
> podría hacerme caer.

Q-learning aprende hacia:

> suponiendo que en el futuro siempre elijo la mejor acción disponible.

Por eso pueden aprender comportamientos diferentes durante entrenamiento.

| SARSA | Q-learning |
|---|---|
| On-policy | Off-policy |
| Usa la acción realmente elegida | Usa la mejor acción estimada |
| `Q(S',A')` | `max Q(S',a)` |
| Aprende la política ejecutada | Aprende hacia una política greedy |

---

# 27. ¿Por qué Q-learning es Off-policy?

El comportamiento podría ser:

```text
ε-greedy
```

para poder explorar.

Pero su actualización utiliza:

```text
max Q
```

como si siguiéramos siempre la acción greedy.

Entonces tenemos:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 220",
  "title": "Quién explora y quién aprende",
  "caption": "La política que genera los datos no es la que se quiere aprender, y por eso Q-learning puede ser off-policy.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 60,
        "w": 230,
        "h": 90,
        "label": "comportamiento",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "ε-greedy",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 308,
        "y": 60,
        "w": 140,
        "h": 90,
        "label": "experiencia",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "S, A, R, S′",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 518,
        "y": 60,
        "w": 240,
        "h": 90,
        "label": "objetivo",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "greedy · Q-learning",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 242,
        "y1": 105,
        "x2": 304,
        "y2": 105,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 452,
        "y1": 105,
        "x2": 514,
        "y2": 105,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

Las dos políticas pueden ser diferentes.

Por eso es off-policy.

---

# 28. El problema del sesgo de maximización

Ahora encontramos una sutileza de Q-learning.

Supón que existen dos acciones.

Su valor verdadero es aproximadamente:

```text
A = 5
B = 5
```

Pero nuestras estimaciones contienen ruido:

```text
estimación de A = 4.5
estimación de B = 5.8
```

Q-learning utiliza:

\[
\max(4.5,5.8)
\]

y obtiene:

\[
5.8
\]

El problema es que ese `5.8` puede ser alto simplemente por error estadístico.

Cuando tienes varias estimaciones con ruido y siempre eliges el máximo, tiendes a elegir aquellas cuyo error fue accidentalmente positivo.

Eso produce **maximization bias**.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 280",
  "title": "El sesgo de maximizar",
  "caption": "El ruido hace que el máximo parezca mejor de lo que es, y esa sobreestimación se propaga.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 50,
        "w": 200,
        "h": 80,
        "label": "A = 4.5",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "estimación ruidosa",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 150,
        "w": 200,
        "h": 80,
        "label": "B = 5.8",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "parece mejor",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 500,
        "y": 100,
        "w": 240,
        "h": 80,
        "label": "MAX = B",
        "tone": "red",
        "rx": 0,
        "size": 20,
        "sub": "sobreestimación",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 212,
        "y1": 90,
        "x2": 496,
        "y2": 128,
        "tone": "amber",
        "width": 2
      },
      {
        "x1": 212,
        "y1": 190,
        "x2": 496,
        "y2": 152,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

---

# 29. Double Learning

La idea de **Double Learning** es separar dos responsabilidades:

1. Elegir cuál acción parece mejor.
2. Evaluar cuánto vale esa acción.

En Q-learning normal la misma tabla hace ambas cosas.

En Q-learning normal la misma tabla hace ambas cosas: `Q` elige la acción y `Q` la evalúa.

Los errores pueden reforzarse.

Double Q-learning utiliza:

```text
Q₁
Q₂
```

Entonces podemos hacer algo como:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 240",
  "title": "Dos tablas, dos trabajos",
  "caption": "Una elige y la otra evalúa, para que la elección no se juzgue con la misma estimación que la produjo.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 70,
        "w": 240,
        "h": 90,
        "label": "Q₁ elige",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "la acción",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 500,
        "y": 70,
        "w": 240,
        "h": 90,
        "label": "Q₂ evalúa",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "esa misma acción",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 252,
        "y1": 115,
        "x2": 496,
        "y2": 115,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

Y después intercambiar los papeles.

---

## Ejemplo

Supongamos:

```text
Q₁:

A = 8
B = 6
```

Q₁ dice:

```text
elige A
```

Pero no utilizamos el `8` de Q₁ para evaluar A.

Consultamos Q₂:

```text
Q₂:

A = 5.2
B = 5.1
```

Entonces evaluamos A con:

```text
5.2
```

No con `8`.

Esto reduce la posibilidad de que el mismo error accidental:

1. haga que seleccionemos una acción;
2. y además infle su valor.

---

# 30. La conexión entre toda la unidad

Lo que parece una colección de algoritmos separados realmente sigue una evolución muy lógica.

## Paso 1 — DP

Tenemos todo el modelo.

```text
"sé cómo funciona el mundo"
```

Podemos calcular.

---

## Paso 2 — Monte Carlo

Quitamos el modelo.

```text
"no sé exactamente cómo funciona,
pero puedo experimentar"
```

Jugamos episodios completos.

Observamos resultados.

Aprendemos.

---

## Paso 3 — TD

Nos preguntamos:

> ¿Realmente necesito esperar hasta el final?

No.

Podemos actualizar después de cada transición.

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Actualizar en el acto",
  "caption": "Cada transición alcanza para corregir la estimación, sin esperar a que el episodio cierre.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 66,
        "w": 420,
        "h": 90,
        "label": "acción → recompensa → estado nuevo",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "una transición",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 520,
        "y": 66,
        "w": 220,
        "h": 90,
        "label": "actualizar ya",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "no se espera el final",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 432,
        "y1": 111,
        "x2": 516,
        "y2": 111,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

---

# 31. Una comparación especialmente útil

Piensa que estás intentando evaluar a un estudiante.

### DP

Conoces perfectamente:

- preguntas futuras;
- probabilidades;
- respuestas;
- sistema de puntuación.

Puedes calcular matemáticamente lo que ocurrirá.

---

### Monte Carlo

No conoces todo eso.

Dejas que haga el examen completo.

Al terminar:

```text
resultado = 82/100
```

Entonces actualizas tu estimación.

---

### TD

No esperas al final.

Después de cada pregunta piensas:

```text
"respondió bien esta pregunta
y ahora parece ir encaminado a 85"

actualizo mi estimación
```

Eso es bootstrap.

---

# 32. El mapa mental más importante

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 290",
  "title": "Primera pregunta: ¿tengo modelo?",
  "caption": "Con modelo, DP calcula sin gastar episodios; sin modelo, hay que vivir la experiencia.",
  "scene": {
    "boxes": [
      {
        "x": 250,
        "y": 16,
        "w": 260,
        "h": 76,
        "label": "¿conozco el modelo?",
        "tone": "ink",
        "rx": 0,
        "size": 20,
        "sub": "puedo predecir",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 40,
        "y": 180,
        "w": 210,
        "h": 84,
        "label": "DP",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "planifica sobre el modelo",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 480,
        "y": 180,
        "w": 240,
        "h": 84,
        "label": "¿espero al final?",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "sin modelo, sigo abajo",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 320,
        "y1": 94,
        "x2": 150,
        "y2": 176,
        "tone": "green",
        "width": 2
      },
      {
        "x1": 440,
        "y1": 94,
        "x2": 590,
        "y2": 176,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 290",
  "title": "Segunda pregunta: ¿espero al final?",
  "caption": "Esperar el episodio completo da el retorno exacto; aprender a cada paso es más rápido y más ruidoso.",
  "scene": {
    "boxes": [
      {
        "x": 250,
        "y": 16,
        "w": 260,
        "h": 76,
        "label": "¿espero al final?",
        "tone": "ink",
        "rx": 0,
        "size": 20,
        "sub": "sin modelo",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 40,
        "y": 180,
        "w": 210,
        "h": 84,
        "label": "MC",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "espera y suma el retorno",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 480,
        "y": 180,
        "w": 210,
        "h": 84,
        "label": "TD",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "aprende en cada paso",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 320,
        "y1": 94,
        "x2": 150,
        "y2": 176,
        "tone": "green",
        "width": 2
      },
      {
        "x1": 440,
        "y1": 94,
        "x2": 585,
        "y2": 176,
        "tone": "slate",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 290",
  "title": "Y dentro de TD, ¿qué acción se actualiza?",
  "caption": "SARSA aprende con la acción que tomó; Q-learning aprende con la mejor posible.",
  "scene": {
    "boxes": [
      {
        "x": 250,
        "y": 16,
        "w": 260,
        "h": 76,
        "label": "TD",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "un paso por vez",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 40,
        "y": 180,
        "w": 250,
        "h": 84,
        "label": "SARSA",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "on-policy",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 470,
        "y": 180,
        "w": 250,
        "h": 84,
        "label": "Q-learning",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "off-policy",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 320,
        "y1": 94,
        "x2": 165,
        "y2": 176,
        "tone": "blue",
        "width": 2
      },
      {
        "x1": 440,
        "y1": 94,
        "x2": 595,
        "y2": 176,
        "tone": "green",
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

---

# 33. Qué debes entender realmente de cada subtema

| Concepto | Idea esencial |
|---|---|
| Policy Iteration | evaluar una política y después mejorarla |
| Value Iteration | acercarse directamente al valor óptimo |
| GPI | evaluación y mejora ocurren de forma conjunta |
| Asíncrono | no necesitas actualizar todos los estados a la vez |
| MC Prediction | estimar valores usando retornos observados |
| MC Control | mejorar la política a partir de esos valores |
| Off-policy MC | aprender una política usando datos de otra |
| Incremental | actualizar valores sin guardar todo el historial |
| TD(0) | aprender después de cada transición |
| Bootstrap | usar una estimación para mejorar otra estimación |
| SARSA | aprende sobre la política que realmente ejecuta |
| Q-learning | aprende hacia la acción que parece óptima |
| Double Learning | separar selección y evaluación para reducir sesgo |

---

# 34. Entrada → proceso → salida

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 400",
  "title": "De la experiencia a las decisiones",
  "caption": "Entra lo que el sistema sabe y lo que ha vivido; sale una política mejor.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 12,
        "w": 700,
        "h": 80,
        "label": "ENTRADA",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "sub": "estados · acciones · recompensas · experiencia",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 158,
        "w": 700,
        "h": 80,
        "label": "PROCESO",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "DP usa el modelo · MC episodios · TD transición",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 8,
        "y": 304,
        "w": 700,
        "h": 80,
        "label": "SALIDA",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "V y Q mejores → política mejor",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 358,
        "y1": 94,
        "x2": 358,
        "y2": 156,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 358,
        "y1": 240,
        "x2": 358,
        "y2": 302,
        "tone": "slate",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>

---

# 35. Resumen de lo nuevo

| Término | Qué significa |
|---|---|
| Modelo | conocimiento de cómo responde el entorno |
| DP | aprender/calcular utilizando ese modelo |
| Policy Evaluation | calcular valores para una política |
| Policy Improvement | mejorar la política usando esos valores |
| Value Iteration | buscar valores óptimos directamente |
| GPI | interacción continua entre evaluación y mejora |
| Episodio | experiencia completa con principio y final |
| Retorno \(G\) | recompensas futuras acumuladas |
| Monte Carlo | aprender de retornos completos |
| TD | aprender antes de terminar el episodio |
| Bootstrap | aprender usando otra estimación |
| TD error | diferencia entre objetivo TD y valor actual |
| SARSA | TD control on-policy |
| Q-learning | TD control off-policy |
| Maximization bias | sobreestimación causada por tomar máximos ruidosos |
| Double Learning | separar elección y evaluación |

## Apuntes comprimidos

```text
UNIDAD 2 — APRENDIZAJE TABULAR

Los métodos tabulares almacenan explícitamente V(s) o Q(s,a).

DP:
Requiere conocer el modelo del entorno.
Policy Iteration = Policy Evaluation + Policy Improvement.
Value Iteration combina parcialmente evaluación y mejora usando el máximo.
GPI = interacción general entre mejorar valores y mejorar la política.
Los métodos asíncronos actualizan estados selectivamente sin barridos completos.

MONTE CARLO:
No necesita modelo.
Aprende usando episodios reales completos.
G_t = recompensa futura acumulada.
Predicción MC estima V o Q promediando retornos observados.
Control MC usa Q para mejorar la política.
Necesita exploración para probar acciones.
On-policy = aprende la misma política que genera los datos.
Off-policy = behavior policy genera datos y target policy es la aprendida.
Importance sampling corrige la diferencia entre ambas políticas.
Actualización incremental:
V <- V + α(G - V)

TD:
No necesita modelo y no necesita esperar al final del episodio.
Combina experiencia real con bootstrap.
Objetivo TD = R + γV(S')
Error TD = R + γV(S') - V(S)
V(S) <- V(S) + α[error TD]

SARSA:
S-A-R-S-A
On-policy.
Q(S,A) <- Q(S,A) + α[R + γQ(S',A') - Q(S,A)]
Usa la siguiente acción realmente seleccionada.

Q-LEARNING:
Off-policy.
Q(S,A) <- Q(S,A) + α[R + γ max_a Q(S',a) - Q(S,A)]
Aprende hacia la mejor acción estimada aunque esté explorando.

DOUBLE LEARNING:
El operador max puede sobreestimar acciones debido al ruido.
Double Q-learning mantiene dos estimadores.
Uno selecciona la acción y el otro la evalúa.
Esto reduce el sesgo de maximización.

MAPA MENTAL:
DP = modelo + bootstrap.
MC = experiencia completa, sin bootstrap.
TD = experiencia parcial + bootstrap.
```

Practica los conceptos clave

- Co<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 250",
  "title": "Un ciclo de tres estados",
  "caption": "El evento es el mismo; el estado en que estás decide cuál es el siguiente. Desde ROJO se vuelve a VERDE.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 64,
        "w": 164,
        "h": 92,
        "label": "VERDE",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "puede pasar",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 298,
        "y": 64,
        "w": 164,
        "h": 92,
        "label": "AMARILLO",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "precaución",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 584,
        "y": 64,
        "w": 164,
        "h": 92,
        "label": "ROJO",
        "tone": "red",
        "rx": 0,
        "size": 20,
        "sub": "detenido",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 180,
        "y1": 100,
        "x2": 294,
        "y2": 100,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 466,
        "y1": 100,
        "x2": 580,
        "y2": 100,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 666,
        "y1": 160,
        "x2": 666,
        "y2": 220,
        "tone": "slate",
        "width": 1.6
      },
      {
        "x1": 666,
        "y1": 220,
        "x2": 94,
        "y2": 220,
        "tone": "slate",
        "width": 2
      },
      {
        "x1": 94,
        "y1": 220,
        "x2": 94,
        "y2": 160,
        "tone": "green",
        "width": 1.6
      }
    ]
  }
}
</script>
</lk-scene>sa tiempo",
        "tone": "slate",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 466,
        "y1": 100,
        "x2": 580,
        "y2": 100,
        "label": "pasa tiempo",
        "tone": "slate",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 666,
        "y1": 190,
        "x2": 94,
        "y2": 190,
        "label": "pasa tiempo: vuelve a VERDE",
        "tone": "slate",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ]
  }
}
</script>
</lk-scene>

Eso ya es una máquina finita de estados.

## Las piezas

Hay tres conceptos fundamentales, y cada uno responde una pregunta distinta.

**Estado** = situación actual del sistema.

En nuestro ejemplo:

> estado = VERDE, AMARILLO o ROJO.

Podría ser también:

- el estado de un pedido: creado, pagado, enviado, entregado;
- el de una sesión: desconectado, autenticando, autenticado;
- el de un documento: borrador, revisión, aprobado, publicado;
- el de una puerta: cerrada o abierta;
- el de un juego: menú, jugando, pausa, fin.

**Evento** = algo que ocurre y puede provocar un cambio.

En nuestro ejemplo:

> evento = pasa tiempo.

Podría ser también:

- pagar un pedido;
- introducir la contraseña;
- aprobar un documento;
- girar el pomo de una puerta;
- pulsar pausa.

**Transición** = regla que dice a qué estado cambiar.

En nuestro ejemplo:

> transición = VERDE + pasa tiempo → AMARILLO.

Podría ser también:

- pagado + enviar → enviado;
- autenticando + contraseña correcta → autenticado;
- revisión + aprobar → aprobado;
- cerrada + abrir → abierta;
- jugando + pausa → pausa.

Así que la máquina hace una sola cosa, siempre la misma: mira el estado actual, recibe un evento, aplica la regla y queda en el estado nuevo.

## Cómo funciona paso a paso

Supongamos que empezamos en `VERDE`.

La idea importante es que **el comportamiento depende del estado actual**.

El mismo evento puede producir resultados diferentes según dónde estés. En el semáforo, `pasa tiempo` lleva de `VERDE` a `AMARILLO` y de `AMARILLO` a `ROJO`. Y en la puerta, `abrir` abre desde `CERRADA` y no hace nada desde `ABIERTA`.

La idea importante es que **el comportamiento depende del estado actual**.

El mismo evento puede producir resultados diferentes dependiendo de dónde estés.

---

## Una forma de escribirla

Podríamos representarla así:

| Estado actual | Evento | Nuevo estado |
|---|---|---|
| VERDE | tiempo | AMARILLO |
| AMARILLO | tiempo | ROJO |
| ROJO | tiempo | VERDE |

Esto es prácticamente el "cerebro" de nuestra máquina.

Formalmente, hay una función de transición:

```text
nuevo_estado = transición(estado_actual, evento)
```

Para nuestro semáforo:

```text
transición(VERDE, tiempo)     = AMARILLO
transición(AMARILLO, tiempo)  = ROJO
transición(ROJO, tiempo)      = VERDE
```

## ¿Por qué se llama "finita"?

Porque la cantidad de estados posibles es limitada.

Nuestro sistema tiene exactamente:

```text
S = {VERDE, AMARILLO, ROJO}
```

Son **3 estados**.

Aunque el semáforo funcione durante 20 años y realice millones de transiciones, nunca aparece un cuarto estado inesperado.

```text
VERDE → AMARILLO → ROJO → VERDE → AMARILLO → ...
```

La secuencia puede durar indefinidamente.

Pero el **conjunto de estados posibles sigue siendo finito**.

---

## Algo muy importante: estado ≠ evento

Es fácil confundirlos.

`ROJO` es un **estado** porque describe cómo está el sistema.

`pasaron 30 segundos` es un **evento** porque es algo que ocurrió.

Mentalmente:

| Concepto | Pregunta que responde |
|---|---|
| Estado | «¿Cómo estoy ahora?» |
| Evento | «¿Qué acaba de pasarme?» |
| Transición | «¿A dónde voy ahora?» |

## Otro ejemplo: una puerta

Supongamos una puerta electrónica con dos estados: `CERRADA` y `ABIERTA`.

Y dos eventos: `abrir` y `cerrar`.

Entonces:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Dos estados, dos eventos",
  "caption": "El mismo evento hace cosas distintas según el estado: abrir abre desde CERRADA y no hace nada desde ABIERTA.",
  "scene": {
    "boxes": [
      {
        "x": 12,
        "y": 78,
        "w": 200,
        "h": 100,
        "label": "CERRADA",
        "sub": "no deja pasar",
        "tone": "slate",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 548,
        "y": 78,
        "w": 200,
        "h": 100,
        "label": "ABIERTA",
        "sub": "deja pasar",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 216,
        "y1": 112,
        "x2": 544,
        "y2": 112,
        "label": "abrir",
        "tone": "blue",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.34
      },
      {
        "x1": 544,
        "y1": 144,
        "x2": 216,
        "y2": 144,
        "label": "cerrar",
        "tone": "slate",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.66
      }
    ]
  }
}
</script>
</lk-scene>

Las cuatro combinaciones caben en una tabla, y ninguna queda sin definir:

| Está en | Ocurre | Queda en | Qué pasó |
|---|---|---|---|
| CERRADA | abrir | ABIERTA | se abrió |
| ABIERTA | cerrar | CERRADA | se cerró |
| CERRADA | cerrar | CERRADA | nada: ya estaba cerrada |
| ABIERTA | abrir | ABIERTA | nada: ya estaba abierta |

La máquina sigue teniendo un comportamiento completamente definido: no hay combinación sin respuesta.

## Por qué son útiles

Sirven cuando un sistema puede comportarse de manera diferente dependiendo de **en qué fase se encuentra**.

Por ejemplo:

| Sistema | Estados en orden |
|---|---|
| Pedido | `CREADO` → `PAGADO` → `ENVIADO` → `ENTREGADO` |
| Login | `DESCONECTADO` → `AUTENTICANDO` → `AUTENTICADO` |
| Videojuego | `MENU` → `JUGANDO` → `PAUSA` → `GAME_OVER` |
| Documento | `BORRADOR` → `REVISION` → `APROBADO` → `PUBLICADO` |

En todos estos casos, algunas acciones solo tienen sentido desde determinados estados. En un documento:

| Está en | Ocurre | Queda en |
|---|---|---|
| BORRADOR | enviar | REVISION |
| REVISION | aprobar | APROBADO |
| APROBADO | publicar | PUBLICADO |

Desde `BORRADOR` no se puede publicar de una vez: las reglas exigen revisión y aprobación.

Ese es uno de los grandes beneficios de una máquina de estados: **hace explícitas las transiciones permitidas**.

---

## Conexión con los MDP de Reinforcement Learning

Aquí hay una conexión especialmente importante.

Una máquina de estados básica tiene algo parecido a:

```text
estado + evento → siguiente estado
```

Por ejemplo:

```text
VERDE + tiempo → AMARILLO
```

En un **Proceso de Decisión de Markov (MDP)** aparece una idea similar, pero mucho más rica:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 230",
  "title": "Qué devuelve el entorno",
  "caption": "La acción entra al entorno y salen dos cosas: el estado siguiente y una recompensa.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 64,
        "w": 210,
        "h": 110,
        "label": "ESTADO + ACCIÓN",
        "sub": "habitación A · caminar",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 300,
        "y": 64,
        "w": 180,
        "h": 110,
        "label": "ENTORNO",
        "sub": "decide qué pasa",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 222,
        "y1": 119,
        "x2": 296,
        "y2": 119,
        "tone": "ink",
        "labelSize": 15,
        "width": 1.6
      },
      {
        "x1": 484,
        "y1": 92,
        "x2": 748,
        "y2": 92,
        "label": "siguiente estado",
        "tone": "green",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      },
      {
        "x1": 484,
        "y1": 146,
        "x2": 748,
        "y2": 146,
        "label": "recompensa",
        "tone": "amber",
        "labelSize": 15,
        "width": 2,
        "labelAt": 0.5
      }
    ]
  }
}
</script>
</lk-scene>

Y además el siguiente estado puede ser **probabilístico**.

Por ejemplo:

<lk-scene>
<script type="application/json">
{
  "viewBox": "0 0 760 300",
  "title": "El siguiente estado no es seguro",
  "caption": "La misma acción lleva a dos estados, con una probabilidad cada uno.",
  "scene": {
    "boxes": [
      {
        "x": 8,
        "y": 84,
        "w": 180,
        "h": 96,
        "label": "habitación A",
        "tone": "blue",
        "rx": 0,
        "size": 20,
        "sub": "origen",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 480,
        "y": 24,
        "w": 190,
        "h": 88,
        "label": "habitación B",
        "tone": "green",
        "rx": 0,
        "size": 20,
        "sub": "80 %",
        "subSize": 14,
        "subDy": 22
      },
      {
        "x": 480,
        "y": 180,
        "w": 190,
        "h": 88,
        "label": "sigue en A",
        "tone": "amber",
        "rx": 0,
        "size": 20,
        "sub": "20 %",
        "subSize": 14,
        "subDy": 22
      }
    ],
    "arrows": [
      {
        "x1": 192,
        "y1": 116,
        "x2": 474,
        "y2": 68,
        "tone": "green",
        "labelSize": 15,
        "width": 2
      },
      {
        "x1": 192,
        "y1": 148,
        "x2": 474,
        "y2": 224,
        "tone": "amber",
        "labelSize": 15,
        "width": 2
      }
    ]
  }
}
</script>
</lk-scene>

No son exactamente lo mismo. Una máquina de estados cambia cuando ocurre un evento; un MDP cambia cuando el agente actúa, con probabilidades y con una recompensa de por medio. Entender la primera hace mucho más intuitivo entender después **estados, transiciones y propiedad de Markov**.

