/* js/marcadores.js */
export const Marcadores = {
  async init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    
    // Dibuja el marcador inmediatamente
    this.render();
  },

  async render() {
    if (!window.CONFIG) return;

    const hoyLocal = new Date().toLocaleDateString('en-CA');

    let html = `
      <div class="mrc-widget">
        <div class="mrc-header" style="margin-bottom: 15px;">
          <div class="mrc-titulo">⏱ Partidos de Hoy en Vivo — FIFA Mundial 2026</div>
        </div>
        <div id="wg-api-football-games"
             data-host="v3.football.api-sports.io"
             data-key="${window.CONFIG.API_FUTBOL.apiKey}"
             data-date="${hoyLocal}"
             data-league="1"
             data-season="2026"
             data-theme="dark"
             data-refresh="30"
             data-show-toolbar="false"
             data-show-errors="false"
             data-show-logos="true"
             data-modal-game="true"
             data-modal-standings="true">
        </div>
      </div>
    `;
    this.container.innerHTML = html;

    // Inyectar el script de API-Football
    if (!document.getElementById('api-football-widget-script')) {
      const s = document.createElement('script');
      s.id = 'api-football-widget-script';
      s.src = 'https://widgets.api-sports.io/2.0.0/widgets.js';
      document.head.appendChild(s);
    } else {
      window.document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    }
  },

  destroy() {
  }
};
