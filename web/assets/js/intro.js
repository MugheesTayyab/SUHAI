// The opening. "Suhai" and its dot appear in the middle of the screen, then the word
// glides into the top bar and becomes the brand. Transform and opacity only.
// Whether it plays at all is decided by a tiny inline script in <head>, so nothing flashes.

export function playIntro() {
  const root = document.documentElement;
  const overlay = document.getElementById("intro");
  const finish = () => {
    root.classList.add("go");
    root.classList.remove("intro-on");
    overlay && overlay.remove();
  };
  if (!overlay || !root.classList.contains("intro-on")) { finish(); return Promise.resolve(); }

  const word = overlay.querySelector(".intro-word");
  const bg = overlay.querySelector(".intro-bg");
  const target = document.querySelector(".top .brand, .nav .brand");

  return new Promise((resolve) => {
    let moved = false;
    const settle = () => { finish(); resolve(); };

    const move = async () => {
      if (moved) return;
      moved = true;
      try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 300))]); } catch { /* fonts are a nicety */ }
      const from = word.getBoundingClientRect();
      const to = target ? target.getBoundingClientRect() : null;
      root.classList.add("go");
      bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 750, delay: 120, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
      if (!to || to.bottom < 0 || to.top > innerHeight || !from.width) {
        word.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.96)" }], { duration: 500, easing: "ease-out", fill: "forwards" }).finished.then(settle, settle);
        return;
      }
      const s = to.width / from.width;
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      word.animate(
        [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
        { duration: 950, easing: "cubic-bezier(0.7, 0, 0.18, 1)", fill: "forwards" },
      ).finished.then(settle, settle);
    };

    // Letters rise from first paint, the dot lands, a short hold, then the word moves.
    let timer = setTimeout(move, 2600);
    overlay.querySelector(".brand-dot").addEventListener("animationend", () => {
      clearTimeout(timer);
      timer = setTimeout(move, 280);
    }, { once: true });
    const skip = () => { clearTimeout(timer); move(); };
    overlay.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
  });
}
