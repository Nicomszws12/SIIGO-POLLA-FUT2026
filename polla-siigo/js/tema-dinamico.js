// js/tema-dinamico.js
(function() {
  // Helper para revisar si Colombia juega hoy
  function juegaColombiaHoy() {
    if (!window.FIXTURE || !window.FIXTURE.partidos) return false;
    const hoyLocal = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
    return window.FIXTURE.partidos.some(p =>
      (p.local === 'COL' || p.visitante === 'COL') &&
      p.utc && new Date(p.utc).toLocaleDateString('en-CA') === hoyLocal
    );
  }

  // Si no es día de partido, no hacemos nada.
  if (!juegaColombiaHoy()) {
    return;
  }

  // --- Aplicar Tema Colombia ---

  // 1. Inyectar CSS para el fondo y los estilos
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes pan-bg { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
    body {
      background-image: linear-gradient(rgba(11, 13, 20, 0.75), rgba(11, 13, 20, 0.85)), url('https://images.pexels.com/photos/274506/pexels-photo-274506.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2');
      background-size: cover; background-position: center center; background-attachment: fixed;
      animation: pan-bg 70s linear infinite alternate;
    }
    .panel, .partido, .modal-contenido, .campeon-op, .sala-card, .heroe, .podio__caja {
      background: rgba(28, 32, 46, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .barra { background: rgba(18, 21, 32, 0.8); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
  `;
  document.head.appendChild(style);

  // 2. Cambiar íconos y logos cuando el DOM esté listo
  function aplicarCambiosVisuales() {
    const favicon = document.querySelector("link[rel*='icon']");
    if (favicon) favicon.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🇨🇴</text></svg>";

    document.querySelectorAll('.logo__balon').forEach(logo => {
        if (logo) logo.textContent = '🇨🇴';
    });

    // Mensaje especial en la página de partidos (app.html)
    if (document.getElementById('saludo')) {
        const saludoEl = document.getElementById('saludo');
        if (saludoEl && !saludoEl.innerHTML.includes('¡Vamos, Colombia!')) {
            saludoEl.innerHTML += ' <span style="color:var(--dorado); font-weight: 400;">— ¡Vamos, Colombia! 🇨🇴</span>';
        }
    }
    // Mensaje especial en la página de inicio (index.html)
    if (document.getElementById('hero-cta')) {
        const ctaEl = document.getElementById('hero-cta');
        if (ctaEl) ctaEl.innerHTML = '<b>¡Hoy juega la Selección! 🇨🇴</b><br>Entra, pronostica y demuestra tu apoyo.';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarCambiosVisuales);
  } else {
    aplicarCambiosVisuales();
  }

  // 3. Lanzar los fuegos artificiales
  function lanzarFiesta() {
    if (typeof confetti !== 'function') return;
    const coloresTricolor = ['#FFCD00', '#003893', '#CE1126'];
    const end = Date.now() + (3 * 1000);
    (function frame() {
      if (Date.now() > end) return;
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: coloresTricolor });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: coloresTricolor });
      requestAnimationFrame(frame);
    }());
  }
  setTimeout(lanzarFiesta, 800);
})();