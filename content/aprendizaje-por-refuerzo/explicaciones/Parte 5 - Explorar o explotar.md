# Parte 5 — Explorar o explotar

## Ruta

Vamos a construirlo en este orden:

1. Dos acciones que el robot conoce y una que no.
2. Qué gana y qué pierde cada estrategia.
3. El equilibrio más simple entre las dos.

## 1. Dos caminos, ninguno gratis

El robot conoce dos acciones. La primera suele dar +8. La segunda apenas la ha probado.

**Explotar** es usar lo que ya parece mejor: cobras una recompensa conocida y te quedas sin saber si había algo mejor.

**Explorar** es probar lo desconocido: puede salir mal (+2) y puede salir extraordinariamente bien (+15), y entonces acabas de descubrir algo que no sabías que existía.

<lk-scene>
<script type="application/json">
{"viewBox": "0 0 760 330", "title": "El mismo estado, dos caminos", "caption": "Explotar cobra lo conocido; explorar compra información. Ninguno es gratis.", "scene": {"boxes": [{"x": 282, "y": 20, "w": 196, "h": 96, "label": "decisión", "sub": "¿qué acción?", "tone": "ink", "size": 22, "subSize": 14, "subDy": 22}, {"x": 60, "y": 210, "w": 196, "h": 96, "label": "explotar", "sub": "lo conocido", "tone": "blue", "size": 20, "subSize": 14, "subDy": 20}, {"x": 504, "y": 210, "w": 196, "h": 96, "label": "explorar", "sub": "lo nuevo", "tone": "amber", "size": 20, "subSize": 14, "subDy": 20}], "arrows": [{"x1": 330, "y1": 120, "x2": 168, "y2": 204, "label": "seguro", "tone": "blue", "labelSize": 15, "width": 2}, {"x1": 430, "y1": 120, "x2": 592, "y2": 204, "label": "información", "tone": "amber", "labelSize": 15, "width": 2}]}}
</script>
</lk-scene>

## 2. El equilibrio más simple

Ningún extremo funciona: explorar siempre es probar cosas malas a propósito, y explotar siempre es quedarse con una estrategia mediocre.

La regla más usada reparte el tiempo con una sola probabilidad: casi siempre usas la mejor acción conocida y, de vez en cuando, eliges otra al azar.

Ese «de vez en cuando» se ajusta con un número: cuanto más alto, más se explora.

<lk-quiz>{"id":"q-p5-a","pregunta":"La acción A suele dar +8 y la B nunca se ha probado. ¿Qué compra exactamente explorar B?","opciones":{"A":"Una recompensa más alta garantizada","B":"Información: saber si B era mejor de lo que parecía","C":"Nada: es tiempo perdido","E":"No sé"},"correcta":"B","explicacion":"Explorar no garantiza premio: compra información, y a veces cuesta recompensa inmediata."}</lk-quiz>
