# Skills

Las skills que escriben contenido en este repositorio viven aquí, versionadas, porque
este repo es lo que leen los agentes que generan ese contenido (el chat de Pi, el de
Antigravity, el estudio). Una skill que solo existe en `~/.claude/skills/` no se revisa,
no se compara y no viaja.

## Regla

`skills/<nombre>/` es **la fuente**. La copia en `~/.claude/skills/<nombre>/` es un
**despliegue**: se reemplaza desde aquí, nunca al revés.

```sh
# desplegar una skill al entorno del agente (una vez que el cambio está en main)
ln -sfn "$PWD/skills/explicacion-interactiva" ~/.claude/skills/explicacion-interactiva
```

## Qué hay

| Skill | Para qué |
|---|---|
| `explicacion-interactiva` | El estándar de las partes: fichas, tope de 450 palabras, gate de ASCII, callouts medidos y las cuatro puertas de calidad. |
