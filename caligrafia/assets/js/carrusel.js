/**
 * Carrusel de fotos/video del producto.
 * - El primer slide puede ser un <video>: se reproduce silenciado y, al
 *   terminar, el carrusel avanza solo a las fotos. Las fotos avanzan cada
 *   pocos segundos como antes.
 * - También se puede navegar con swipe (dedo/mouse) o con las flechas
 *   (que solo aparecen al pasar el mouse por encima, ver CSS).
 */
document.addEventListener("DOMContentLoaded", initCarrusel);

function initCarrusel() {
  const viewport = document.getElementById("media-viewport");
  const track = document.getElementById("media-track");
  const dotsWrap = document.getElementById("media-dots");
  if (!viewport || !track || !dotsWrap) return;

  const slides = Array.from(track.children);
  if (slides.length <= 1) return;

  let index = 0;
  let nextTimer = null;
  const PHOTO_MS = 3800;
  const VIDEO_FALLBACK_MS = 15000; // por si el video nunca dispara "ended" (bloqueado, sin fuente, etc.)
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "media-dot";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Ir a la foto ${i + 1}`);
    dot.addEventListener("click", () => goTo(i, true));
    dotsWrap.appendChild(dot);
  });
  const dots = Array.from(dotsWrap.children);

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
  }

  function currentVideo() {
    return slides[index].querySelector("video");
  }

  function clearScheduled() {
    if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; }
    slides.forEach((s) => {
      const v = s.querySelector("video");
      if (v) { v.onended = null; v.pause(); }
    });
  }

  function scheduleNext() {
    clearScheduled();
    if (reduceMotion) return;

    const video = currentVideo();
    if (video && video.currentSrc) {
      // Slide de video con fuente real: espera a que termine para avanzar.
      video.currentTime = 0;
      video.play().catch(() => {}); // autoplay puede fallar si el navegador lo bloquea
      video.onended = next;
      nextTimer = setTimeout(next, VIDEO_FALLBACK_MS); // red de seguridad
    } else {
      // Foto normal (o video aún sin fuente real): avanza por tiempo.
      nextTimer = setTimeout(next, PHOTO_MS);
    }
  }

  function goTo(newIndex, userInitiated) {
    index = (newIndex + slides.length) % slides.length;
    render();
    scheduleNext();
    if (userInitiated) { /* el usuario ya reinició el ciclo al llamar goTo */ }
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  viewport.querySelector(".media-nav--prev").addEventListener("click", () => goTo(index - 1, true));
  viewport.querySelector(".media-nav--next").addEventListener("click", () => goTo(index + 1, true));

  // Swipe con Pointer Events (funciona con dedo, mouse y stylus)
  let dragging = false;
  let startX = 0;

  viewport.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    clearScheduled();
  });
  viewport.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    const deltaX = e.clientX - startX;
    if (deltaX > 40) prev();
    else if (deltaX < -40) next();
    else scheduleNext();
  });
  viewport.addEventListener("pointercancel", () => {
    dragging = false;
    scheduleNext();
  });

  render();
  scheduleNext();
}
