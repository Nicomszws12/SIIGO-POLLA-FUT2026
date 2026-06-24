/* ============================================================
   POLLA SIIGO 2026 — POSICIONES Y GOLEADORES DESDE LA API
   ------------------------------------------------------------
   Reemplaza los widgets de API-Football que no funcionan
   automáticamente. Usa el mismo proxy/config que los partidos.
   ============================================================ */

const GruposApi = (() => {

  /* Obtiene las posiciones de todos los grupos desde la API */
  async function obtenerPosiciones() {
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase) return null;

    try {
      const r = await fetch(`${urlBase}/standings?league=1&season=2026`);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.response?.length) return null;

      // Normalizar: { 'A': [...equipos], 'B': [...], ... }
      const grupos = {};
      for (const entry of data.response) {
        const liga = entry.league;
        if (!liga?.standings) continue;
        for (const grupoStanding of liga.standings) {
          if (!grupoStanding?.length) continue;
          // Detectar letra del grupo desde el nombre (ej: "Group A" → "A")
          const grupoNombre = grupoStanding[0]?.group || grupoStanding[0]?.description || '';
          const letra = (grupoNombre.match(/Group\s+([A-H])/i)?.[1] ||
                        grupoNombre.match(/[A-H]/)?.[0] || '?');

          grupos[letra] = grupoStanding.map(eq => {
            const all = eq.all || {};
            return {
              rank: eq.rank || 0,
              code: ApiFutbol._codigo(eq.team?.name) || eq.team?.name?.slice(0,3).toUpperCase() || '???',
              teamName: eq.team?.name || '',
              logo: eq.team?.logo || '',
              pj: all.played || 0,
              pg: all.win || 0,
              pe: all.draw || 0,
              pp: all.lose || 0,
              gf: all.goals?.for || 0,
              gc: all.goals?.against || 0,
              dg: (all.goals?.for || 0) - (all.goals?.against || 0),
              pts: eq.points || 0,
              form: eq.form || '' // ej: "WWDLW"
            };
          });
        }
      }
      return Object.keys(grupos).length ? grupos : null;
    } catch (_) { return null; }
  }

  /* Obtiene los máximos goleadores del torneo */
  async function obtenerGoleadores(limite = 20) {
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase) return null;

    try {
      const r = await fetch(`${urlBase}/players/topscorers?league=1&season=2026`);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.response?.length) return null;

      return data.response.slice(0, limite).map(j => {
        const p = j.player || {};
        const est = j.statistics?.[0] || {};
        const goles = est.goals || {};
        return {
          nombre: p.name || '',
          foto: p.photo || '',
          equipo: ApiFutbol._codigo(est.team?.name) || '',
          equipoNombre: est.team?.name || '',
          goles: goles.total || 0,
          asistencias: est.goals?.assists || 0,
          partidos: est.games?.appearences || 0,
          minutos: est.games?.minutes || 0,
          penales: goles.penalties || 0
        };
      });
    } catch (_) { return null; }
  }

  /* Renderiza las posiciones en HTML */
  function renderPosiciones(grupos) {
    if (!grupos || !Object.keys(grupos).length) {
      return `<div class="aviso" style="margin:16px 0">No hay datos de posiciones disponibles. <button class="boton boton--mini" onclick="GruposApi.cargarWidgets()">🔄 Reintentar</button></div>`;
    }

    const gruposKeys = Object.keys(grupos).sort();
    return `<div class="grupos-api-grid">
      ${gruposKeys.map(letra => {
        const filas = grupos[letra];
        return `<div class="panel grupo-card">
          <div class="grupo-header">
            <h3>GRUPO ${letra}</h3>
            <span style="font-size:10.5px;color:var(--tinta-3);">${filas.length} equipos</span>
          </div>
          <table class="grupo-tabla">
            <thead><tr>
              <th style="text-align:left">#</th>
              <th style="text-align:left">Equipo</th>
              <th>PJ</th><th>G</th><th>E</th><th>P</th>
              <th>GF</th><th>GC</th><th>DG</th><th>PTS</th>
            </tr></thead>
            <tbody>
              ${filas.map(f => {
                const eq = window.FIXTURE?.equipo(f.code);
                const bandera = eq?.b || (f.logo ? `<img src="${U.esc(f.logo)}" style="width:18px;height:18px;vertical-align:middle;border-radius:2px;">` : '⚽');
                const clasif = f.rank <= 2 ? 'clasifica' : '';
                const dgStr = f.dg > 0 ? `+${f.dg}` : String(f.dg);
                return `<tr class="${clasif}">
                  <td style="font-weight:600;color:var(--tinta-3);font-size:11px;">${f.rank}</td>
                  <td><div class="td-equipo">${bandera}<span class="td-nombre">${U.esc(f.teamName || eq?.n || f.code)}</span></div></td>
                  <td>${f.pj}</td><td>${f.pg}</td><td>${f.pe}</td><td>${f.pp}</td>
                  <td>${f.gf}</td><td>${f.gc}</td>
                  <td style="font-family:var(--fuente-marcador);font-size:12px;color:${f.dg > 0 ? 'var(--verde-claro)' : f.dg < 0 ? '#e0354b' : 'var(--tinta-3)'};">${dgStr}</td>
                  <td style="font-family:var(--fuente-marcador);font-weight:700;color:var(--dorado);">${f.pts}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('')}
    </div>`;
  }

  /* Renderiza los goleadores en HTML */
  function renderGoleadores(goleadores) {
    if (!goleadores || !goleadores.length) {
      return `<div class="aviso" style="margin:16px 0">No hay datos de goleadores disponibles. <button class="boton boton--mini" onclick="GruposApi.cargarWidgets()">🔄 Reintentar</button></div>`;
    }

    return `<div class="goleadores-api">
      <table class="grupo-tabla" style="width:100%">
        <thead><tr>
          <th style="text-align:left">#</th>
          <th style="text-align:left">Jugador</th>
          <th style="text-align:left">Equipo</th>
          <th>Goles</th>
          <th>Penales</th>
          <th>Asist.</th>
          <th>PJ</th>
        </tr></thead>
        <tbody>
          ${goleadores.map((g, i) => {
            const eq = window.FIXTURE?.equipo(g.equipo);
            const bandera = eq?.b || '⚽';
            return `<tr>
              <td style="font-weight:600;color:var(--tinta-3);font-size:11px;">${i + 1}</td>
              <td><div style="display:flex;align-items:center;gap:8px;">${g.foto ? `<img src="${U.esc(g.foto)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : ''}<span style="font-weight:600;">${U.esc(g.nombre)}</span></div></td>
              <td>${bandera} ${U.esc(g.equipoNombre || eq?.n || g.equipo)}</td>
              <td style="font-family:var(--fuente-marcador);font-size:16px;color:var(--dorado);font-weight:700;">${g.goles}</td>
              <td style="color:var(--tinta-3);font-size:12px;">${g.penales > 0 ? g.penales : '—'}</td>
              <td>${g.asistencias || '—'}</td>
              <td>${g.partidos || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* Carga los datos y actualiza los contenedores */
  async function cargarWidgets() {
    const contPos = document.getElementById('contenedor-posiciones-api');
    const contGol = document.getElementById('contenedor-goleadores-api');

    if (contPos) contPos.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tinta-3);font-size:13px;">⏳ Cargando posiciones...</div>';
    if (contGol) contGol.innerHTML = '<div style="text-align:center;padding:20px;color:var(--tinta-3);font-size:13px;">⏳ Cargando goleadores...</div>';

    const [posiciones, goleadores] = await Promise.all([
      obtenerPosiciones(),
      obtenerGoleadores()
    ]);

    if (contPos) contPos.innerHTML = renderPosiciones(posiciones);
    if (contGol) contGol.innerHTML = renderGoleadores(goleadores);
  }

  return { obtenerPosiciones, obtenerGoleadores, renderPosiciones, renderGoleadores, cargarWidgets };
})();

window.GruposApi = GruposApi;