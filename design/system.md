# Studio design system — read-only sync

Sources read (no source was edited): `studio/ui/studio.css` (Studio chrome, 973 lines), `integrations/pi/view/app.css` (reader, 343 lines), `integrations/pi/kit/kit.css` (kit controls and the paper skin, 821 lines). Supporting evidence for the control inventory was read in `studio/ui/studio.js` and `studio/server.ts`; no token is taken from them. Values below are the values those three stylesheets actually declare. Where a group has no custom properties, the literal values are listed as component rules and the absence of a token is stated.

## Color — Studio light (`studio/ui/studio.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--ink` | `#0F2E3D` | body ink, button borders, headings | `studio/ui/studio.css:5` |
| `--slate` | `#3F5B69` | secondary text, ghost controls | `studio/ui/studio.css:6` |
| `--slate2` | `#5A7481` | dashed containers, map edges | `studio/ui/studio.css:7` |
| `--muted` | `rgba(15, 46, 61, .62)` | meta copy, disabled-looking text | `studio/ui/studio.css:8` |
| `--meta` | `#555555` | eyebrows, breadcrumbs, kicker | `studio/ui/studio.css:9` |
| `--line` | `rgba(15, 46, 61, .18)` | hairline rules | `studio/ui/studio.css:10` |
| `--soft` | `#F6F7F7` | hover fills, code blocks | `studio/ui/studio.css:11` |
| `--soft2` | `#FAFBFB` | quiet panels, pressed choice | `studio/ui/studio.css:12` |
| `--paper` | `#ffffff` | page ground | `studio/ui/studio.css:13` |
| `--blue` | `#004276` | primary, links, focus ring | `studio/ui/studio.css:14` |
| `--blue-s` | `#E7EDF2` | primary tint, focus halo | `studio/ui/studio.css:15` |
| `--green` | `#21594F` | done state, learner bubbles | `studio/ui/studio.css:16` |
| `--green-s` | `#E9F0EE` | green tint | `studio/ui/studio.css:17` |
| `--amber` | `#8A6B3F` | "your turn", asking state | `studio/ui/studio.css:18` |
| `--amber-s` | `#F4EFE7` | amber tint | `studio/ui/studio.css:19` |
| `--red` | `#DD4A68` | destructive and error state | `studio/ui/studio.css:20` |
| `--red-s` | `#FBEAEE` | red tint | `studio/ui/studio.css:21` |
| `--gold` | `#a67f59` | warm accent, inherited from the reader | `studio/ui/studio.css:22` |
| `--on-ink` | `#ffffff` | letters drawn on an ink surface | `studio/ui/studio.css:24` |

19 colour declarations.

## Color — Studio dark and black (`studio/ui/studio.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--ink` | `#E4EDF1` | inverted ink | `studio/ui/studio.css:850` |
| `--slate` | `#B7C9D1` | inverted secondary text | `studio/ui/studio.css:851` |
| `--slate2` | `#92A8B2` | inverted dashed containers | `studio/ui/studio.css:852` |
| `--muted` | `rgba(228, 237, 241, .62)` | inverted meta copy | `studio/ui/studio.css:853` |
| `--meta` | `#9AAFB8` | inverted eyebrows | `studio/ui/studio.css:854` |
| `--line` | `rgba(228, 237, 241, .16)` | inverted hairlines | `studio/ui/studio.css:855` |
| `--soft` | `#142228` | inverted hover fills | `studio/ui/studio.css:856` |
| `--soft2` | `#111E24` | inverted quiet panels | `studio/ui/studio.css:857` |
| `--paper` | `#0D191F` | night paper | `studio/ui/studio.css:858` |
| `--blue` | `#8FC2E3` | lifted primary/links | `studio/ui/studio.css:859` |
| `--blue-s` | `#12242F` | lifted primary tint | `studio/ui/studio.css:860` |
| `--green` | `#83C7B0` | lifted done state | `studio/ui/studio.css:861` |
| `--green-s` | `#11241E` | lifted green tint | `studio/ui/studio.css:862` |
| `--amber` | `#DCBB8C` | lifted "your turn" | `studio/ui/studio.css:863` |
| `--amber-s` | `#241E15` | lifted amber tint | `studio/ui/studio.css:864` |
| `--red` | `#EE8FA5` | lifted destructive state | `studio/ui/studio.css:865` |
| `--red-s` | `#2A151C` | lifted red tint | `studio/ui/studio.css:866` |
| `--gold` | `#D8B892` | lifted warm accent | `studio/ui/studio.css:867` |
| `--on-ink` | `#0D191F` | letters on lifted ink | `studio/ui/studio.css:868` |
| `--paper` (black) | `#000000` | black theme paper override | `studio/ui/studio.css:871` |
| `--on-ink` (black) | `#000000` | black theme ink-on-surface override | `studio/ui/studio.css:871` |

21 colour declarations.

## Layout — Studio (`studio/ui/studio.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--drawer` | `520px` | tutor panel width before the client reads its saved width | `studio/ui/studio.css:29` |
| `--topbar` | `64px` | sticky bar height and page inset | `studio/ui/studio.css:30` |
| `--drawer` (phone) | `100vw` | panel owns the phone screen | `studio/ui/studio.css:510` |
| `--topbar` (phone) | `54px` | shorter phone bar | `studio/ui/studio.css:510` |

4 layout declarations. The Studio also writes `--tone`, `--i`, `--fill`, `--line` and `--text` from `studio/ui/studio.js` inline styles; those are runtime variables, not declarations in the synced stylesheets.

## Typography (`studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--serif` | `"Liberation Serif", "DejaVu Serif", "Hoefler Text", Georgia, "Times New Roman", Times, serif` | body and headings in all three skins | `studio/ui/studio.css:25`, `integrations/pi/view/app.css:20`, `integrations/pi/kit/kit.css:298` |
| `--sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | UI copy, eyebrows, buttons | `studio/ui/studio.css:26`, `integrations/pi/view/app.css:21`, `integrations/pi/kit/kit.css:299` |
| `--mono` | `"Liberation Mono", "DejaVu Sans Mono", Consolas, monospace` | code and fields | `studio/ui/studio.css:27`, `integrations/pi/view/app.css:22`, `integrations/pi/kit/kit.css:300` |

3 stack declarations. There is no type-scale custom property: the scale is literal. Studio body is `20px/1.6` (`studio/ui/studio.css:34`); page h1 `48px` (`:550`), section h2 `30px` (`:900`), topic h1 `clamp(2.4rem, 3.8vw, 3rem)` (`:939`), chip and button copy `10.5px` / `11px` uppercase (`:922`, `:910`). Reader root is `20px/1.6` (`integrations/pi/view/app.css:25`), h1 `34px`, h2 `26px`, h3 `20px` (`:40-42`), kicker `11px` (`:48`), code `14px` (`:178`), button `10.5px/600/.13em` uppercase (`:204-205`), narrow root `17px` (`:325`). Kit light legacy root is `20px/1.75` with a locally bundled `"Atkinson Hyperlegible"` face (`integrations/pi/kit/kit.css:3-5`); its paper skin uses `20px/1.6 var(--serif)` (`:301`), h1 `34px`, h2 `26px`, h3 `20px` (`:306-308`), button `10.5px/600/.13em` uppercase (`:314`), textarea `14px` (`:316`) and narrative pieces `15px/1.4` (`:520`).

## Spacing (`studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`)

No spacing custom property is declared in any of the three sources. Literal rules:

- Studio: page `56px 48px 110px` (`studio/ui/studio.css:68`), home/preferences `64px 36px 90px` (`:124`, `:550`), top bar `gap: 20px; padding: 0 32px` (`:41`), action cluster `gap: 10px` (`:51`), buttons `10px 20px` and small `6px 13px` (`:86`, `:118`), reader bar `gap: 12px; padding: 10px 26px` (`:287`), menu `padding: 6px` (`:282`), chips `gap: 8px; padding: 6px 13px` (`:403-404`), phone bar `gap: 4px; padding: 4px 8px` (`:530`, in `@media max-width:720px`).
- Reader: `#app` `72px 24px 96px` (`integrations/pi/view/app.css:37`), paragraph margin `0 0 20px` (`:65`), table cell `9px 14px 9px 0` (`:94`), callout `0 0 0 18px` with `28px 0` margins (`:111`), code actions `gap: 10px` (`:201`), narrow `28px 20px 72px` (`:326`).
- Kit: legacy `main` `48px 28px 96px` (`integrations/pi/kit/kit.css:8`), button `8px 14px` (`:29`), widget `padding: 20px` (`:43`), paper `main` `56px 24px 96px` (`:305`), button `9px 14px` (`:314`), callout `0 0 0 18px` (`:335`), piece `margin: 30px 0` (`:501`), narrow `main` `32px 18px 64px` (`:391`).

## Radius (`studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`)

No radius custom property is declared. Literal radii: Studio buttons `6px` (`studio/ui/studio.css:86`), menus `8px` (`:349`, `:282`), cards and next-step cards `10px` (`:604`, `:386`), modal `12px` (`:451`), empty/feedback containers `14px` (`:260`), chips and message bubbles `18px` (`:404`, `:374`), pills `999px` (`:61`), and a late global `border-radius: 0 !important` that zeroes buttons, cards, chips, inputs and panels (`:574`). Reader textarea and buttons are `0` (`integrations/pi/view/app.css:178`, `:204`). Kit legacy uses `5px` buttons/textarea, `6px` pre, `8px` widget/question (`integrations/pi/kit/kit.css:29`, `:20`, `:33`, `:43`, `:64`); its paper skin resets buttons, textarea, callouts and the walkthrough to `0` (`:314`, `:316`, `:335`, `:449`).

## Shadows (`studio/ui/studio.css`, `integrations/pi/kit/kit.css`)

There is no shadow custom property. Literal shadows that exist:

- `8px 8px 0 rgba(15, 23, 42, .14)` — hard offset on the reader menu and the modal (`studio/ui/studio.css:282`, `:451`).
- `4px 4px 0 rgba(15, 23, 42, .12)` — floating book page bar (`studio/ui/studio.css:309`).
- `0 0 0 4px var(--blue-s)` — focus halo on the ask field and composer (`studio/ui/studio.css:166`, `:408`).
- `box-shadow: none` on the kit walkthrough in both skins (`integrations/pi/kit/kit.css:377`, `:426`) and a Studio-wide `box-shadow: none !important` in the paper skin (`studio/ui/studio.css:578`).

## Component rules (`studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css`)

Studio button: inline flex, `2px` ink border, paper ground, bold `1rem`, `10px 20px`, `6px` radius, `:hover` soft fill, `:focus-visible` `3px` blue outline offset `2px` (`studio/ui/studio.css:86-88`). The paper skin overrides it to `1px` ink border, transparent ground, `9px 14px`, uppercase `10.5px` sans with `.13em` tracking and zero radius (`:574`). Variants: primary blue, `you` amber, ghost, soft, danger (`:107-117`). Icon button is `38×38` with `20px` icon (`:346`). Chip is a `2px` hairline pill with `6px 13px`, pressed state ink-on-paper (`:404`, `:459`). Field is `1px` ink border, mono `14px`, `10px 12px`, `:focus-visible` `2px` blue outline offset `2px` (`:612`, `:613`). Callout is a `3px` accent left rule with `18px` inset and no fill (`integrations/pi/view/app.css:111`, `integrations/pi/kit/kit.css:335`). Reader button follows the paper language: `1px` ink border, `9px 14px`, uppercase `10.5px`, `0` radius (`:203-206`). Kit quiz options are plain rows, checked state bold rather than a card (`integrations/pi/view/app.css:164-176`, `integrations/pi/kit/kit.css:360`).

## Color — Reader (`integrations/pi/view/app.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--paper` | `#ffffff` | reader page ground | `integrations/pi/view/app.css:9` |
| `--ink` | `#0F2E3D` | reader ink, table rules | `integrations/pi/view/app.css:10` |
| `--muted` | `rgba(15, 46, 61, .62)` | muted reader copy | `integrations/pi/view/app.css:11` |
| `--hair` | `rgba(15, 46, 61, .18)` | hairlines around media | `integrations/pi/view/app.css:12` |
| `--rule` | `rgba(15, 46, 61, .45)` | booktab header rule | `integrations/pi/view/app.css:13` |
| `--accent` | `#004276` | links, callout rule, focus | `integrations/pi/view/app.css:14` |
| `--warm` | `#a67f59` | inline code | `integrations/pi/view/app.css:15` |
| `--pink` | `#DD4A68` | the one highlighted relation | `integrations/pi/view/app.css:16` |
| `--mark` | `#b3d4fc` | text selection | `integrations/pi/view/app.css:17` |
| `--on-ink` | `#ffffff` | letters on ink | `integrations/pi/view/app.css:19` |

10 colour declarations; the reader declares no dark-theme custom properties.

## Color — Kit legacy base (`integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--paper` | `#ffffff` | legacy kit page ground | `integrations/pi/kit/kit.css:5` |
| `--ink` | `#0f172a` | legacy kit ink | `integrations/pi/kit/kit.css:5` |
| `--rule` | `#e2e8f0` | legacy kit hairlines | `integrations/pi/kit/kit.css:5` |
| `--cobalt` | `#2563eb` | legacy kit links and focus | `integrations/pi/kit/kit.css:5` |
| `--emerald` | `#059669` | legacy kit success | `integrations/pi/kit/kit.css:5` |
| `--amber` | `#d97706` | legacy kit warning | `integrations/pi/kit/kit.css:5` |
| `--crimson` | `#dc2626` | legacy kit danger | `integrations/pi/kit/kit.css:5` |
| `--on-ink` | `#ffffff` | legacy letters on ink | `integrations/pi/kit/kit.css:5` |

8 declarations. This block is superseded by the paper skin below for notes rendered by the reader.

## Color — Kit paper skin, light (`integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--paper` | `#ffffff` | paper ground | `integrations/pi/kit/kit.css:295` |
| `--ink` | `#0F2E3D` | paper ink | `integrations/pi/kit/kit.css:295` |
| `--muted` | `rgba(15, 46, 61, .62)` | muted copy | `integrations/pi/kit/kit.css:295` |
| `--hair` | `rgba(15, 46, 61, .18)` | hairlines | `integrations/pi/kit/kit.css:296` |
| `--rule-color` | `rgba(15, 46, 61, .45)` | table header rule | `integrations/pi/kit/kit.css:296` |
| `--accent` | `#004276` | links, quiz feedback, focus | `integrations/pi/kit/kit.css:297` |
| `--warm` | `#a67f59` | inline code | `integrations/pi/kit/kit.css:297` |
| `--pink` | `#DD4A68` | highlighted relation | `integrations/pi/kit/kit.css:297` |
| `--mark` | `#b3d4fc` | selection | `integrations/pi/kit/kit.css:297` |

9 colour declarations in this block (the font stacks are listed under Typography).

## Color — Kit paper skin, dark and black (`integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--paper` | `#0E1A20` | night paper | `integrations/pi/kit/kit.css:408` |
| `--ink` | `#E3EBEF` | night ink | `integrations/pi/kit/kit.css:408` |
| `--muted` | `rgba(227, 235, 239, .62)` | night muted copy | `integrations/pi/kit/kit.css:408` |
| `--hair` | `rgba(227, 235, 239, .18)` | night hairlines | `integrations/pi/kit/kit.css:409` |
| `--rule-color` | `rgba(227, 235, 239, .45)` | night table rule | `integrations/pi/kit/kit.css:409` |
| `--accent` | `#8FC0E0` | night links/focus | `integrations/pi/kit/kit.css:410` |
| `--warm` | `#D3AE86` | night code | `integrations/pi/kit/kit.css:410` |
| `--pink` | `#EC93A8` | night highlighted relation | `integrations/pi/kit/kit.css:410` |
| `--mark` | `#1E3B52` | night selection | `integrations/pi/kit/kit.css:410` |
| `--rule` | `rgba(227, 235, 239, .16)` | night legacy rule | `integrations/pi/kit/kit.css:411` |
| `--cobalt` | `#8FBEE8` | night legacy link | `integrations/pi/kit/kit.css:412` |
| `--emerald` | `#7FCBAE` | night legacy success | `integrations/pi/kit/kit.css:412` |
| `--amber` | `#E0B583` | night legacy warning | `integrations/pi/kit/kit.css:412` |
| `--crimson` | `#EE93A4` | night legacy danger | `integrations/pi/kit/kit.css:412` |
| `--on-ink` | `#0E1A20` | letters on night ink | `integrations/pi/kit/kit.css:413` |
| `--paper` (black) | `#000000` | black paper override | `integrations/pi/kit/kit.css:416` |
| `--on-ink` (black) | `#000000` | black ink override | `integrations/pi/kit/kit.css:416` |
| `--ink` (mermaid) | `#0F2E3D` | mermaid keeps its own light ink | `integrations/pi/kit/kit.css:439` |

18 declarations.

## Color — Kit diagram remap and piece tones (`integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--k-ink` | `#E3EBEF` | remapped diagram ink | `integrations/pi/kit/kit.css:265` |
| `--k-slate` | `#AFC2CB` | remapped diagram slate | `integrations/pi/kit/kit.css:265` |
| `--k-slate2` | `#9BB0BA` | remapped diagram slate 2 | `integrations/pi/kit/kit.css:265` |
| `--k-blue` | `#8FC0E0` | remapped diagram blue | `integrations/pi/kit/kit.css:265` |
| `--k-green` | `#7FCBAE` | remapped diagram green | `integrations/pi/kit/kit.css:265` |
| `--k-amber` | `#E0B583` | remapped diagram amber | `integrations/pi/kit/kit.css:265` |
| `--k-red` | `#EE93A4` | remapped diagram red | `integrations/pi/kit/kit.css:265` |
| `--pt-green` | `#1E6B4F` | piece tone, light | `integrations/pi/kit/kit.css:514` |
| `--pt-green-bg` | `rgba(33,89,79,.11)` | piece tone fill, light | `integrations/pi/kit/kit.css:514` |
| `--pt-green-line` | `rgba(33,89,79,.55)` | piece tone line, light | `integrations/pi/kit/kit.css:514` |
| `--pt-red` | `#B3304D` | piece tone, light | `integrations/pi/kit/kit.css:515` |
| `--pt-red-bg` | `rgba(204,64,92,.09)` | piece tone fill, light | `integrations/pi/kit/kit.css:515` |
| `--pt-red-line` | `rgba(204,64,92,.6)` | piece tone line, light | `integrations/pi/kit/kit.css:515` |
| `--pt-amber` | `#7A5A1E` | piece tone, light | `integrations/pi/kit/kit.css:516` |
| `--pt-amber-bg` | `rgba(166,127,89,.14)` | piece tone fill, light | `integrations/pi/kit/kit.css:516` |
| `--pt-amber-line` | `rgba(138,107,63,.6)` | piece tone line, light | `integrations/pi/kit/kit.css:516` |
| `--pt-blue` | `#0B4F8A` | piece tone, light | `integrations/pi/kit/kit.css:517` |
| `--pt-blue-bg` | `rgba(0,66,118,.09)` | piece tone fill, light | `integrations/pi/kit/kit.css:517` |
| `--pt-blue-line` | `rgba(0,66,118,.5)` | piece tone line, light | `integrations/pi/kit/kit.css:517` |
| `--pt-slate` | `#3F5B69` | piece tone, light | `integrations/pi/kit/kit.css:518` |
| `--pt-slate-bg` | `rgba(15,46,61,.06)` | piece tone fill, light | `integrations/pi/kit/kit.css:518` |
| `--pt-slate-line` | `rgba(15,46,61,.28)` | piece tone line, light | `integrations/pi/kit/kit.css:518` |
| `--pt-card` | `rgba(15,46,61,.03)` | piece card, light | `integrations/pi/kit/kit.css:519` |
| `--pt-green` | `#7FCBAE` | piece tone, dark | `integrations/pi/kit/kit.css:528` |
| `--pt-green-bg` | `rgba(127,203,174,.14)` | piece tone fill, dark | `integrations/pi/kit/kit.css:528` |
| `--pt-green-line` | `rgba(127,203,174,.55)` | piece tone line, dark | `integrations/pi/kit/kit.css:528` |
| `--pt-red` | `#EE93A4` | piece tone, dark | `integrations/pi/kit/kit.css:529` |
| `--pt-red-bg` | `rgba(238,147,164,.13)` | piece tone fill, dark | `integrations/pi/kit/kit.css:529` |
| `--pt-red-line` | `rgba(238,147,164,.6)` | piece tone line, dark | `integrations/pi/kit/kit.css:529` |
| `--pt-amber` | `#E0B583` | piece tone, dark | `integrations/pi/kit/kit.css:530` |
| `--pt-amber-bg` | `rgba(224,181,131,.14)` | piece tone fill, dark | `integrations/pi/kit/kit.css:530` |
| `--pt-amber-line` | `rgba(224,181,131,.55)` | piece tone line, dark | `integrations/pi/kit/kit.css:530` |
| `--pt-blue` | `#8FC0E0` | piece tone, dark | `integrations/pi/kit/kit.css:531` |
| `--pt-blue-bg` | `rgba(143,192,224,.14)` | piece tone fill, dark | `integrations/pi/kit/kit.css:531` |
| `--pt-blue-line` | `rgba(143,192,224,.55)` | piece tone line, dark | `integrations/pi/kit/kit.css:531` |
| `--pt-slate` | `#AFC2CB` | piece tone, dark | `integrations/pi/kit/kit.css:532` |
| `--pt-slate-bg` | `rgba(227,235,239,.08)` | piece tone fill, dark | `integrations/pi/kit/kit.css:532` |
| `--pt-slate-line` | `rgba(227,235,239,.28)` | piece tone line, dark | `integrations/pi/kit/kit.css:532` |
| `--pt-card` | `rgba(227,235,239,.04)` | piece card, dark | `integrations/pi/kit/kit.css:533` |

39 declarations.

## Component aliases and layout tokens — Kit (`integrations/pi/kit/kit.css`)

| Token | Value | Usage | Source |
| --- | --- | --- | --- |
| `--c` | `var(--pt-green)` | piece foreground, green | `integrations/pi/kit/kit.css:535` |
| `--bg` | `var(--pt-green-bg)` | piece fill, green | `integrations/pi/kit/kit.css:535` |
| `--line` | `var(--pt-green-line)` | piece line, green | `integrations/pi/kit/kit.css:535` |
| `--c` | `var(--pt-red)` | piece foreground, red | `integrations/pi/kit/kit.css:536` |
| `--bg` | `var(--pt-red-bg)` | piece fill, red | `integrations/pi/kit/kit.css:536` |
| `--line` | `var(--pt-red-line)` | piece line, red | `integrations/pi/kit/kit.css:536` |
| `--c` | `var(--pt-amber)` | piece foreground, amber | `integrations/pi/kit/kit.css:537` |
| `--bg` | `var(--pt-amber-bg)` | piece fill, amber | `integrations/pi/kit/kit.css:537` |
| `--line` | `var(--pt-amber-line)` | piece line, amber | `integrations/pi/kit/kit.css:537` |
| `--c` | `var(--pt-blue)` | piece foreground, blue | `integrations/pi/kit/kit.css:538` |
| `--bg` | `var(--pt-blue-bg)` | piece fill, blue | `integrations/pi/kit/kit.css:538` |
| `--line` | `var(--pt-blue-line)` | piece line, blue | `integrations/pi/kit/kit.css:538` |
| `--c` | `var(--pt-slate)` | piece foreground, slate | `integrations/pi/kit/kit.css:539` |
| `--bg` | `var(--pt-slate-bg)` | piece fill, slate | `integrations/pi/kit/kit.css:539` |
| `--line` | `var(--pt-slate-line)` | piece line, slate | `integrations/pi/kit/kit.css:539` |
| `--line` | `var(--pt-slate)` | invalid memory group line override | `integrations/pi/kit/kit.css:582` |
| `--xlogcols` | `2em minmax(0,1fr) minmax(0,1fr) 6.5em` | explorer log columns | `integrations/pi/kit/kit.css:763` |
| `--xlogcols` | `2.4em minmax(0,1.1fr) minmax(0,1.1fr) 6.5em minmax(0,2.4fr)` | explorer log columns, wide | `integrations/pi/kit/kit.css:781` |

18 declarations.

## Parameters exposed by the board (derived from the sources above)

These are not new tokens: each endpoint is a value already present in the three files. They are the knobs requested in issue #355 and are applied live in `design/system.html`.

| Parameter | Range | Source evidence | Source |
| --- | --- | --- | --- |
| Spacing step | `4px`–`12px` | `gap: 4px` and `gap: 12px` | `studio/ui/studio.css:530`, `integrations/pi/view/app.css:201` |
| Base radius | `0`–`18px` | `0` in the paper skin, `6px`, `8px`, `10px`, `14px`, `18px` elsewhere | `studio/ui/studio.css:574`, `:86`, `:282`, `:404`, `:260`; `integrations/pi/view/app.css:204` |
| Control height / density | `34px`–`48px` | `min-height: 34px`, `38px`, `42px`, `44px`, `46px` | `studio/ui/studio.css:314`, `:346`, `:410`, `:829`, `:277` |
| Type-scale ratio | `1.20`–`1.33` | 20px → 26px → 34px steps | `integrations/pi/view/app.css:40-42`, `studio/ui/studio.css:900` |

## Conflicts

No resolution is invented here; these are disagreements in the sources as they stand.

- **Radius**: the Studio's late paper skin forces `border-radius: 0 !important` on buttons, cards and chips (`studio/ui/studio.css:574`) while the same file still declares `6px` buttons, `8px` menus and `18px` chips (`:86`, `:282`, `:404`). The reader uses `0` (`integrations/pi/view/app.css:204`), the kit legacy layer uses `5px`/`6px`/`8px` (`integrations/pi/kit/kit.css:29`, `:20`, `:43`) and its paper skin returns to `0` (`:314`).
- **Spacing**: the Studio page uses `56px 48px 110px` (`studio/ui/studio.css:68`, home/preferences `64px 36px 90px` at `:124`, `:550`), the reader uses `72px 24px 96px` (`integrations/pi/view/app.css:37`) and the kit paper uses `56px 24px 96px` (`integrations/pi/kit/kit.css:305`). The same "page" has three different horizontal insets.
- **Control height**: Studio icon buttons are `38px` (`studio/ui/studio.css:346`) and small buttons pad to roughly 35px (`:118`), the reader's buttons are `9px 14px` with no floor (`integrations/pi/view/app.css:204`), while the Studio's own coarse-pointer rules and reader phone rules require `44px` (`studio/ui/studio.css:829`, `:530`). The reader-mode select is only `34px` tall (`studio/ui/studio.css:314`).
- **Accent identity**: Studio calls `#004276` `--blue` (`studio/ui/studio.css:14`), the reader and kit paper call the same colour `--accent` (`integrations/pi/view/app.css:14`, `integrations/pi/kit/kit.css:297`), but kit legacy calls a different blue `#2563eb` `--cobalt` (`integrations/pi/kit/kit.css:5`).
- **Night ink**: Studio dark uses `#E4EDF1` on `#0D191F` (`studio/ui/studio.css:850`, `:858`), kit dark uses `#E3EBEF` on `#0E1A20` (`integrations/pi/kit/kit.css:408`), and the reader declares no dark tokens at all. The same theme switch paints three slightly different papers.
