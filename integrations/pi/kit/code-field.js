/* Code answers (#334): a textarea that holds code. Tab indents and Shift+Tab outdents it instead of leaving the field,
   Escape lets a keyboard user leave, and the box grows with its lines up to 18 rows before it scrolls. The value stays
   what the learner typed: nothing is added, trimmed or reformatted on blur. It is still the learner's own <textarea>
   (kit.css draws it in the reader's code face), so the form, the submit and dictation (kit/dictate.js) read it exactly
   as before. `isCode` says which answers the engine marks as code. No side effects. */
window.lkCodeField = (() => {
  const MAX_ROWS = 18;
  // A code answer is marked by the open contract, a pieza of tipo codigo, or a code language on an exercise. A pieza
  // that names a language (a code output) also makes its question a code question.
  const isCode = (item) => item?.open?.kind === 'code' || item?.pieza?.tipo === 'codigo' || Boolean(item?.lenguaje || item?.pieza?.lenguaje);
  const enhanced = new WeakSet();

  // Size the box to what it holds: the authored rows as a floor, one extra row per line typed, 18 rows as a cap. Only
  // the inline height changes, never the value, the rows attribute or the form. Counting lines instead of measuring
  // scrollHeight keeps a horizontal scrollbar (long lines never wrap) from feeding a vertical one.
  function grow(area) {
    const style = getComputedStyle(area);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const floor = Math.max(1, area.rows || 3);
    const shown = Math.min(Math.max(floor, area.value.split('\n').length), MAX_ROWS);
    // With border-box the inline height includes the padding and border; with content-box it is the content alone.
    const extra = style.boxSizing === 'border-box' ? pad : 0;
    area.style.height = `${Math.ceil(line * shown + extra)}px`;
  }

  // One edit, so Ctrl+Z takes it back. Where execCommand is missing the change is made directly, and an input event tells
  // the page about it as the browser would (a draft saved on input keeps the indent).
  function replace(area, from, to, text) {
    area.setSelectionRange(from, to);
    if (document.execCommand('insertText', false, text)) return;
    area.setRangeText(text, from, to, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Tab with the caret inserts two spaces. A selection, or Shift+Tab, works on every line it touches: each one gains two
  // spaces, or loses up to two spaces or a tab. Text is never replaced, so a Tab cannot delete what was selected.
  function indent(area, shift) {
    const { selectionStart: start, selectionEnd: end, value } = area;
    if (start === end && !shift) return replace(area, start, end, '  ');
    const first = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    // A selection that ends at the start of a line does not touch that line.
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const stop = value.indexOf('\n', last);
    const close = stop === -1 ? value.length : stop;
    const block = value.slice(first, close);
    const text = block.split('\n').map((line) => (shift ? line.replace(/^( {1,2}|\t)/, '') : `  ${line}`)).join('\n');
    if (text === block) return;
    replace(area, first, close, text);
    // A caret keeps its place in its line; a selection stays selected over the lines it changed.
    if (start === end) {
      const caret = Math.max(first, start - (block.length - text.length));
      area.setSelectionRange(caret, caret);
    } else area.setSelectionRange(first, first + text.length);
  }

  function onKeydown(event) {
    // Tab keeps indenting while the field has text, so Escape is the way out for a keyboard user.
    if (event.key === 'Escape' && !event.isComposing) { event.currentTarget.blur(); return; }
    // Ctrl, Alt and Meta Tab keep their browser meaning, and an IME composition keeps its keys.
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    // An empty field lets Tab and Shift+Tab move the focus, so a keyboard user can pass through it.
    if (event.currentTarget.value === '') return;
    event.preventDefault();
    indent(event.currentTarget, event.shiftKey);
  }

  // Dictation (kit/dictate.js) assigns `area.value` with no input event. Watching the property keeps the box sized to
  // what was dictated, while the original setter keeps the internal value (and FormData and the submit) in step.
  function watchValue(area) {
    const value = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!value?.set) return;
    Object.defineProperty(area, 'value', {
      configurable: true,
      enumerable: true,
      get() { return value.get.call(this); },
      set(text) { value.set.call(this, text); grow(this); },
    });
  }

  // Makes a textarea a code field. Enhancing a field twice changes nothing: it keeps one set of handlers.
  function enhance(area) {
    if (enhanced.has(area)) return area;
    enhanced.add(area);
    area.classList.add('lk-code');
    area.wrap = 'off';
    area.spellcheck = false;
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocomplete', 'off');
    area.addEventListener('keydown', onKeydown);
    area.addEventListener('input', () => grow(area));
    // A paste changes the value after its event, so measure on the next frame as well as on input.
    area.addEventListener('paste', () => requestAnimationFrame(() => grow(area)));
    watchValue(area);
    grow(area);
    return area;
  }

  return { enhance, isCode, grow };
})();
