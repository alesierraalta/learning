package engine

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// notaDeHTML translates a page the tutor wrote into the note form the standard reads (#265): titles, lists
// and paragraphs go back to Markdown, and every kit figure (`<lk-…>` with its JSON) passes through as written.
// It mirrors tools/register/nota-html.mjs; tools/register/fixtures/bench265/golden holds the output both must reproduce.
func notaDeHTML(html string) string {
	var guarded []string
	guard := func(block string) string {
		guarded = append(guarded, block)
		return "\x00" + strconv.Itoa(len(guarded)-1) + "\x00"
	}
	text := guardFigures(regexp.MustCompile(`(?is)<head\b.*?</head>`).ReplaceAllString(html, ""), guard)
	text = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`(?i)<(link|meta|title)\b[^>]*>`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`(?i)<!doctype[^>]*>`).ReplaceAllString(text, "")
	for n := 1; n <= 6; n++ {
		heading := regexp.MustCompile(`(?is)<h` + strconv.Itoa(n) + `\b[^>]*>(.*?)</h` + strconv.Itoa(n) + `>`)
		marks := strings.Repeat("#", n)
		text = heading.ReplaceAllStringFunc(text, func(m string) string {
			body := heading.FindStringSubmatch(m)[1]
			return "\n\n" + marks + " " + strings.TrimSpace(enLinea(body)) + "\n\n"
		})
	}
	text = replaceElements(text, `(?is)<ol\b[^>]*>(.*?)</ol>`, func(body string) string {
		return "\n\n" + elementos(body, func(i int) string { return strconv.Itoa(i) + ". " }) + "\n\n"
	})
	text = replaceElements(text, `(?is)<ul\b[^>]*>(.*?)</ul>`, func(body string) string {
		return "\n\n" + elementos(body, func(int) string { return "- " }) + "\n\n"
	})
	text = replaceElements(text, `(?is)<p\b[^>]*>(.*?)</p>`, func(body string) string {
		return "\n\n" + strings.TrimSpace(enLinea(body)) + "\n\n"
	})
	text = regexp.MustCompile(`(?i)</?(main|section|article|div|body|html|header|footer|figure|figcaption)\b[^>]*>`).ReplaceAllString(text, "\n\n")

	nota := enLinea(text)
	nota = regexp.MustCompile("\x00(\\d+)\x00").ReplaceAllStringFunc(nota, func(m string) string {
		i, _ := strconv.Atoi(strings.Trim(m, "\x00"))
		return guarded[i]
	})
	lines := strings.Split(nota, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRightFunc(line, unicode.IsSpace)
	}
	nota = strings.Join(lines, "\n")
	nota = regexp.MustCompile(`\n{3,}`).ReplaceAllString(nota, "\n\n")
	return strings.TrimSpace(nota) + "\n"
}

// guardFigures keeps every `<lk-…>` block (up to its own closing tag) out of the rewrite: its JSON is never edited.
var figureOpen = regexp.MustCompile(`<(lk-[a-z][a-z-]*)\b[^>]*>`)

func guardFigures(text string, guard func(string) string) string {
	var out strings.Builder
	at := 0
	for _, open := range figureOpen.FindAllStringSubmatchIndex(text, -1) {
		if open[0] < at {
			continue
		}
		name := text[open[2]:open[3]]
		closing := strings.Index(text[open[1]:], "</"+name+">")
		if closing < 0 {
			continue
		}
		end := open[1] + closing + len("</"+name+">")
		out.WriteString(text[at:open[0]])
		out.WriteString(guard(text[open[0]:end]))
		at = end
	}
	out.WriteString(text[at:])
	return out.String()
}

// replaceElements rewrites each element the pattern matches with the function's text for its body.
func replaceElements(text, pattern string, rewrite func(body string) string) string {
	re := regexp.MustCompile(pattern)
	return re.ReplaceAllStringFunc(text, func(m string) string {
		return rewrite(re.FindStringSubmatch(m)[1])
	})
}

// elementos writes each list item on its own line, with no blank line between items.
func elementos(body string, marca func(int) string) string {
	n := 0
	item := regexp.MustCompile(`(?is)<li\b[^>]*>(.*?)</li>`)
	return item.ReplaceAllStringFunc(body, func(m string) string {
		n++
		return marca(n) + strings.TrimSpace(enLinea(item.FindStringSubmatch(m)[1])) + "\n"
	})
}

var (
	reBreak  = regexp.MustCompile(`(?i)<br\s*/?>`)
	reStrong = regexp.MustCompile(`(?i)</?(strong|b)\b[^>]*>`)
	reEm     = regexp.MustCompile(`(?i)</?(em|i)\b[^>]*>`)
	reCode   = regexp.MustCompile(`(?is)<code\b[^>]*>(.*?)</code>`)
	reTag    = regexp.MustCompile(`<[^>]+>`)
	reEntity = regexp.MustCompile(`&(amp|lt|gt|quot|apos|nbsp|#39);`)
)

var entities = map[string]string{"amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "#39": "'"}

// enLinea turns the inline marks of a text into Markdown and drops the tags it does not keep.
func enLinea(body string) string {
	s := reBreak.ReplaceAllString(body, "\n")
	s = reStrong.ReplaceAllString(s, "**")
	s = reEm.ReplaceAllString(s, "*")
	s = reCode.ReplaceAllString(s, "`$1`")
	s = reTag.ReplaceAllString(s, "")
	return reEntity.ReplaceAllStringFunc(s, func(m string) string {
		return entities[m[1:len(m)-1]]
	})
}
