# Parte 6 — El retorno y el descuento

## Ruta

Vamos a construirlo en este orden:

1. Sumar las recompensas que vienen.
2. Por qué llegar tarde pesa menos.
3. Qué significa cada valor del factor de descuento.

## 1. El retorno

El agente no quiere maximizar la próxima recompensa: quiere maximizar la suma de las que vienen.

Si recibe +10, luego −1, luego +10, la suma es 19. Ese 19 es el **retorno**.

Pero cobrar +10 ahora no vale lo mismo que cobrarlo dentro de cinco mil pasos. Para eso existe el factor de descuento: cada paso que pasa, la recompensa pesa un poco menos.

| Recompensa | Distancia | Peso | Aporta |
|---:|---:|---:|---:|
| +10 | 0 | 1 | +10 |
| −1 | 1 | 0,9 | −0,9 |
| +10 | 2 | 0,81 | +8,1 |

El retorno con descuento de esas tres es 17,2, no 19.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"El mismo +10, tres pesos distintos","caption":"Lo que cambia de una caja a otra no es la recompensa: es cuánto pesa por llegar tarde.","scene":{"boxes":[
{"x":8,"y":60,"w":182,"h":96,"label":"+10","sub":"peso 1","tone":"green","size":24,"subSize":14,"subDy":22},
{"x":289,"y":60,"w":182,"h":96,"label":"−1","sub":"peso 0,9","tone":"red","size":24,"subSize":14,"subDy":22},
{"x":570,"y":60,"w":182,"h":96,"label":"+10","sub":"peso 0,81","tone":"green","size":24,"subSize":14,"subDy":22}],
"arrows":[
{"x1":194,"y1":108,"x2":285,"y2":108,"label":"+1 paso","tone":"ink","labelSize":14,"width":3},
{"x1":475,"y1":108,"x2":566,"y2":108,"label":"+2 pasos","tone":"ink","labelSize":14,"width":3}]}}
</script>
</lk-scene>

## 2. Qué significa el factor

En forma compacta, el retorno suma cada recompensa multiplicada por el factor elevado a su distancia.

Que el factor sea pequeño significa mirar sobre todo el corto plazo. Que esté cerca de 1 alarga el horizonte. Con el factor en cero, el agente solo ve la siguiente recompensa.

<lk-quiz>{"id":"q-p6-a","pregunta":"Con factor de descuento 0,9, ¿por qué el tercer +10 aporta 8,1 y no 10?","opciones":{"A":"Porque la recompensa se hizo más pequeña","B":"Porque llega dos pasos más tarde y cada paso la descuenta","C":"Por un error de redondeo","E":"No sé"},"correcta":"B","explicacion":"La recompensa no cambia: cambia su peso, porque el futuro se descuenta paso a paso."}</lk-quiz>
