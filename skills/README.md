# Skills

Las skills que escriben contenido en este repositorio viven aquí, versionadas, porque
este repo es lo que leen los agentes que generan ese contenido (el chat de Pi, el de
Antigravity, el estudio). Una skill que solo existe en `~/.claude/skills/` no se revisa,
no se compara y no viaja.

## Regla

`skills/<nombre>/` es **la fuente**. Las copias en `~/.claude/skills/<nombre>/` y
`~/.agents/skills/<nombre>/` son **despliegues**: se reemplazan desde aquí, nunca al revés.

```sh
# enlazar todas las skills y el AGENTS.md de Learnings (update.sh ya lo hace en cada deploy)
bash deploy/vps/link-tutor-context.sh
bash deploy/vps/link-tutor-context.sh --verify   # solo comprobar, sin tocar nada
```

El script enlaza cada `skills/<nombre>/` con `SKILL.md` en los dos directorios de skills y
`deploy/vps/learnings/AGENTS.md` con el `AGENTS.md` de la raíz de Learnings. Una copia real
que encuentra en su lugar la mueve a `~/.local/share/learning/backups/<stamp>/`, nunca la
borra, y después verifica que cada enlace resuelve al repo. El estudio rechaza el turno del
tutor cuando un enlace apunta a otra parte, así que una skill editada aquí llega al tutor
solo por este camino.

## Qué hay

| Skill | Para qué |
|---|---|
| `explicacion-interactiva` | El estándar de las partes: fichas, tope de 450 palabras, gate de ASCII, callouts medidos y las cuatro puertas de calidad. |
