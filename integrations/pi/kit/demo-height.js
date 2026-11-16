// Reports this demo page's height to the reader that frames it, so the frame is as tall as the content (#338).
// The bridge injects this script into every demo page under explicaciones/demos/ before </head>: a demo never
// carries it. Out: { type: "learning-demo-height", height }. In: { type: "learning-demo-measure" }, sent by the
// reader when the frame's width changes, because a narrower or wider screen rewraps the text.
//
// The height is the content's extent, not scrollHeight: the root's scrollHeight never drops below the frame it sits
// in, so a frame that grew would keep its height when the content got shorter. The extent does not depend on the
// frame's height at all, which is also why it cannot feed back into itself.
(() => {
  if (window.parent === window) return;
  let sent = -1;
  const extent = () => {
    const body = document.body;
    const style = getComputedStyle(body);
    const lastChild = body.lastElementChild;
    const bodyMargin = parseFloat(style.marginBottom) || 0;
    // A margin with nothing between it and the body's bottom collapses with the last child's; padding or a border keeps them apart.
    const apart = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth) > 0;
    const childMargin = lastChild ? parseFloat(getComputedStyle(lastChild).marginBottom) || 0 : 0;
    const bottom = body.getBoundingClientRect().bottom + window.scrollY;
    return Math.ceil(bottom + (apart ? bodyMargin : Math.max(bodyMargin, childMargin)));
  };
  const report = (force) => {
    const height = extent();
    if (!force && height === sent) return;
    sent = height;
    // The target origin is "*" because the demo is sandboxed (an opaque origin) and the reader's origin differs by
    // host (the bridge, or a saved copy). The message carries only a number, and the reader checks its source.
    window.parent.postMessage({ type: "learning-demo-height", height }, "*");
  };
  const start = () => {
    report(true);
    if (window.ResizeObserver) new ResizeObserver(() => report(false)).observe(document.body);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  window.addEventListener("load", () => report(false));
  window.addEventListener("message", (event) => {
    if (event.source === window.parent && event.data && event.data.type === "learning-demo-measure") report(true);
  });
})();
