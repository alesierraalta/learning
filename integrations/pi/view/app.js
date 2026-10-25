(() => {
  "use strict";
  const app = document.getElementById("app");
  let data;
  try {
    data = JSON.parse(document.getElementById("view-data").textContent);
  } catch {
    app.textContent = "No se pudieron cargar los datos. Recarga la página.";
    return;
  }
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const link = (text, href) => {
    const node = element("a", text);
    node.href = href;
    return node;
  };
  const markdown = (text, inline = false) => {
    const node = element(inline ? "span" : "div");
    node.innerHTML = DOMPurify.sanitize(inline ? marked.parseInline(text) : marked.parse(text), {
      ADD_TAGS: ["video", "audio", "source", "details", "summary"],
      ADD_ATTR: ["controls", "preload"],
    });
    return node;
  };
  const status = () => {
    const node = element("p");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    return node;
  };
  const textarea = (parent, title) => {
    const label = element("label", title, "text-field");
    const input = element("textarea");
    input.rows = 3;
    input.maxLength = 8000;
    label.append(input);
    parent.append(label);
    return input;
  };
  const post = async (payload) => {
    const response = await fetch(data.submitUrl, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error((result.error || "No se pudo enviar.") + (response.status === 409 ? " Recarga la página para ver las respuestas guardadas." : ""));
    return result;
  };
  function decorate(root) {
    root.querySelectorAll("blockquote").forEach((quote) => {
      const first = quote.firstElementChild;
      if (!first || first.tagName !== "P") return;
      const match = /^\[!([\w-]+)\]([+-])?[ \t]*([^\n]*)(?:\n|$)/.exec(first.textContent);
      if (!match) return;
      const box = element(match[2] ? "details" : "aside", undefined, "callout");
      box.dataset.type = match[1].toLowerCase();
      if (match[2] === "+") box.open = true;
      box.append(element(match[2] ? "summary" : "div", match[3].trim() || match[1], "callout-title"));
      // Remove the marker without flattening the remaining rich text.
      let remaining = match[0].length;
      const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
      while (remaining > 0 && walker.nextNode()) {
        const text = walker.currentNode;
        const count = Math.min(remaining, text.length);
        text.deleteData(0, count);
        remaining -= count;
      }
      if (!first.textContent.trim()) first.remove();
      box.append(...quote.childNodes);
      quote.replaceWith(box);
    });
    const nodes = [...root.querySelectorAll("code.language-mermaid")].map((code) => {
      const diagram = element("div", code.textContent, "mermaid");
      code.parentElement.replaceWith(diagram);
      return diagram;
    });
    if (nodes.length) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      mermaid.run({ nodes }).catch(() => {
        root.append(element("p", "No se pudo dibujar un diagrama.", "error"));
      });
    }
  }
  function showResult(parent, result, question) {
    const line = element("div", undefined, result.ok ? "correct result" : "error result");
    line.append(element("strong", `${result.ok ? "✔ Correcta" : "✘ Incorrecta"} — elegiste ${result.chosen}`));
    if (!result.ok) {
      line.append(element("span", ` · la correcta es ${result.correct}: `), markdown(question.options[result.correct] || "", true));
    }
    parent.append(line);
  }
  function showScore(parent, score, saved) {
    const [points, total] = score.split("/").map(Number);
    const banner = element("div", undefined, "reward");
    banner.append(element("strong", `Puntaje ${score} — ${total ? Math.round(points / total * 100) : 0} %`));
    if (saved) banner.append(element("p", `Enviado al chat de Pi y guardado en ${saved}`));
    parent.append(banner);
  }
  function quiz() {
    if (!data.quiz) return;
    const diagnosis = data.kind === "diagnosis";
    const section = element("section");
    section.append(element("h2", diagnosis ? "Diagnóstico" : "Mini-quiz"));
    const form = element("form");
    form.noValidate = true;
    const recorded = new Map((data.answered || []).map((result) => [result.id, result]));
    const pending = [];
    const groups = new Map();
    for (const [index, question] of data.quiz.questions.entries()) {
      let container = form;
      if (diagnosis) {
        const round = question.round ?? 1;
        if (!groups.has(round)) {
          const group = element("section");
          group.append(element("h3", `Ronda ${round}`));
          groups.set(round, group);
          form.append(group);
        }
        container = groups.get(round);
      }
      const field = element("fieldset", undefined, "quiz-question");
      const legend = element("legend");
      legend.append(markdown(question.enunciado, true));
      field.append(legend);
      if (typeof question.pieza?.contenido === "string") field.append(markdown(question.pieza.contenido));
      const result = recorded.get(question.id);
      const readonly = Boolean(result) || (!diagnosis && Array.isArray(data.answered));
      const choices = [];
      for (const letter of ["A", "B", "C", "D", "E"]) {
        if (!(letter in question.options)) continue;
        const label = element("label", undefined, "option");
        const radio = element("input");
        radio.type = "radio";
        radio.name = `question-${index}`;
        radio.value = letter;
        radio.disabled = readonly;
        radio.checked = result?.chosen === letter;
        label.append(radio, element("strong", letter), markdown(question.options[letter], true));
        field.append(label);
        choices.push(radio);
      }
      if (result) showResult(field, result, question);
      if (!readonly) {
        const reasoning = textarea(field, "Tu razonamiento (opcional)");
        pending.push({ question, field, choices, reasoning });
      }
      container.append(field);
    }
    if (recorded.size) showScore(form, `${[...recorded.values()].filter((r) => r.ok).length}/${recorded.size}`);
    if (pending.length) {
      const ownWords = !diagnosis && textarea(form, "Vuelco con tus palabras");
      const exercises = !diagnosis && textarea(form, "Ejercicios (código o respuesta)");
      const button = element("button", "Enviar al tutor");
      button.type = "submit";
      const message = status();
      form.append(button, message);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const missing = pending.find((item) => !item.choices.some((input) => input.checked));
        if (missing) {
          message.className = "error";
          message.textContent = "Responde todas las preguntas antes de enviar.";
          missing.choices[0]?.focus();
          return;
        }
        const answers = Object.fromEntries(pending.map((item) => [item.question.id, item.choices.find((input) => input.checked).value]));
        const reasoning = Object.fromEntries(pending.filter((item) => item.reasoning.value.trim()).map((item) => [item.question.id, item.reasoning.value.trim()]));
        const payload = { kind: diagnosis ? "diagnosis" : "mini-quiz", topic: data.topic, answers };
        if (Object.keys(reasoning).length) payload.reasoning = reasoning;
        if (!diagnosis) {
          payload.part = data.part;
          if (ownWords.value.trim()) payload.ownWords = ownWords.value.trim();
          if (exercises.value.trim()) payload.exercises = exercises.value.trim();
        }
        button.disabled = true;
        message.textContent = "Enviando…";
        try {
          const response = await post(payload);
          response.results.forEach((result) => {
            const item = pending.find((entry) => entry.question.id === result.id);
            if (item) showResult(item.field, result, item.question);
          });
          showScore(section, response.score, response.saved);
          form.querySelectorAll("input, textarea, button").forEach((input) => { input.disabled = true; });
          message.textContent = "";
        } catch (error) {
          message.className = "error";
          message.textContent = error.message;
          button.disabled = false;
        }
      });
    }
    section.append(form);
    app.append(section);
    decorate(section);
  }
  if (data.topicBase) app.append(link(`← ${data.topicTitle || data.title}`, data.topicBase));
  else if (data.kind !== "index") app.append(link("← Temas", data.home));
  app.append(element("h1", data.title || "Learnings"));
  if (data.kind === "index" || data.kind === "topic") {
    const list = element("ul", undefined, "navigation");
    for (const item of data.topics || data.parts || []) {
      const row = element("li");
      if (data.kind === "index") row.append(link(item.title, data.home + encodeURIComponent(item.id) + "/"));
      else if (item.written) row.append(link(item.title || item.id, data.topicBase + encodeURIComponent(item.id)));
      else row.append(element("span", `${item.title || item.id} — pendiente`, "muted"));
      list.append(row);
    }
    app.append(list);
    if (data.hasDiagnosis) app.append(link("Diagnóstico", data.topicBase + "quiz"));
    return;
  }
  if (data.kind === "part") {
    const article = markdown(data.markdown);
    article.className = "prose";
    app.append(article);
    decorate(article);
  }
  const frames = [];
  if (data.demos?.length) {
    const section = element("section");
    section.append(element("h2", "Demos interactivas"));
    data.demos.forEach((path) => {
      const name = path.split("/").pop();
      const frame = element("iframe");
      frame.src = path.split("/").map(encodeURIComponent).join("/");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.title = name;
      section.append(element("h3", name), frame);
      frames.push({ frame, name });
    });
    app.append(section);
  }
  quiz();
  const questionForm = element("form", undefined, "tutor");
  questionForm.append(element("h2", "Pregunta al tutor"));
  const questionText = textarea(questionForm, "Tu pregunta u observación");
  const send = element("button", "Enviar pregunta");
  send.type = "submit";
  const questionStatus = status();
  questionForm.append(send, questionStatus);
  app.append(questionForm);
  let demo;
  window.addEventListener("message", (event) => {
    const source = frames.find((entry) => entry.frame.contentWindow === event.source);
    if (!source || !event.data || event.data.type !== "learning-demo" || typeof event.data.observation !== "string") return;
    const observation = `[demo ${source.name}] ${event.data.observation}`.slice(0, 2000);
    questionText.value = `${questionText.value}${questionText.value ? "\n" : ""}${observation}`;
    demo = source.name;
  });
  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!questionText.value.trim()) {
      questionStatus.className = "error";
      questionStatus.textContent = "Escribe una pregunta antes de enviar.";
      questionText.focus();
      return;
    }
    send.disabled = true;
    const payload = { kind: "question", topic: data.topic, text: questionText.value.trim() };
    if (data.part) payload.part = data.part;
    if (demo) payload.demo = demo;
    try {
      await post(payload);
      questionText.value = "";
      demo = undefined;
      questionStatus.className = "correct";
      questionStatus.textContent = "Enviada al chat";
    } catch (error) {
      questionStatus.className = "error";
      questionStatus.textContent = error.message;
    } finally {
      send.disabled = false;
    }
  });
})();
