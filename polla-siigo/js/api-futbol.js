/* ============================================================
   POLLA SIIGO 2026 — RESULTADOS EN VIVO
   ------------------------------------------------------------
   La app NUNCA llama al proveedor de datos directamente:
   lo hace a través del proxy (proxy/cloudflare-worker.js),
   que guarda la API key en secreto y agrega caché de 30 s.

   Flujo recomendado: UNA sola persona (el admin, con el panel
   abierto) activa "Marcador automático". El panel consulta el
   proxy, escribe los resultados en la base de datos y todos
   los demás los ven en tiempo real. Así una polla de 300
   personas consume la cuota de 1 sola.
   ============================================================ */

const ApiFutbol = {

  disponible() { return !!(CONFIG.API_FUTBOL.proxyUrl || '').trim(); },

  /* Alias en inglés del proveedor → código interno. */
  _alias: {
    'mexico':'MEX','south africa':'RSA','south korea':'KOR','korea republic':'KOR','czech republic':'CZE','czechia':'CZE',
    'canada':'CAN','bosnia and herzegovina':'BIH','bosnia & herzegovina':'BIH','qatar':'QAT','switzerland':'SUI',
    'brazil':'BRA','morocco':'MAR','haiti':'HAI','scotland':'SCO',
    'usa':'USA','united states':'USA','paraguay':'PAR','australia':'AUS','turkey':'TUR','turkiye':'TUR','türkiye':'TUR',
    'germany':'GER','curacao':'CUW','curaçao':'CUW','ivory coast':'CIV',"cote d'ivoire":'CIV','ecuador':'ECU',
    'netherlands':'NED','japan':'JPN','sweden':'SWE','tunisia':'TUN',
    'belgium':'BEL','egypt':'EGY','iran':'IRN','new zealand':'NZL',
    'spain':'ESP','cape verde':'CPV','cabo verde':'CPV','saudi arabia':'KSA','uruguay':'URU',
    'france':'FRA','senegal':'SEN','iraq':'IRQ','norway':'NOR',
    'argentina':'ARG','algeria':'ALG','austria':'AUT','jordan':'JOR',
    'portugal':'POR','dr congo':'COD','congo dr':'COD','uzbekistan':'UZB','colombia':'COL',
    'england':'ENG','croatia':'CRO','ghana':'GHA','panama':'PAN'
  },

  _codigo(nombre) { return this._alias[String(nombre || '').toLowerCase().trim()] || null; },

  _estado(corto) {
    if (['1H','2H','HT','ET','BT','P','LIVE'].includes(corto)) return 'en_juego';
    if (['FT','AET','PEN'].includes(corto)) return 'finalizado';
    return null;                                            // NS, TBD, PST…
  },

  /* Descarga y normaliza los partidos del Mundial desde el proxy. */
  async traerPartidos() {
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const esDirecto = urlBase.includes('api-sports.io');
    
    // Si usamos la API directa, pedimos explícitamente el Mundial (Liga 1, Temporada 2026)
    const url = esDirecto ? `${urlBase}/fixtures?league=1&season=2026` : `${urlBase}/fixtures`;
    
    const opciones = {};
    if (esDirecto && CONFIG.API_FUTBOL.apiKey) {
      opciones.headers = { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey };
    }

    let r;
    try {
      r = await fetch(url, opciones);
    } catch (err) {
      console.error("🔥 Error de conexión a la API:", err);
      throw new Error('Conexión bloqueada. Revisa tu internet o la configuración de la API.');
    }
    if (!r.ok) throw new Error('La API respondió ' + r.status);
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0) {
      throw new Error('Error en la API: ' + JSON.stringify(data.errors));
    }
    return (data.response || []).map(f => ({
      local: this._codigo(f.teams?.home?.name),
      visitante: this._codigo(f.teams?.away?.name),
      utc: f.fixture?.date ? new Date(f.fixture.date).toISOString() : null,
      estadio: f.fixture?.venue?.name || '',
      sede: f.fixture?.venue?.city || '',
      estado: this._estado(f.fixture?.status?.short),
      minuto: f.fixture?.status?.elapsed ?? null,
      gl: f.goals?.home, gv: f.goals?.away
    })).filter(x => x.local && x.visitante);
  },

  /* Empareja cada partido del proveedor con el fixture local. */
  _emparejar(apiPartido, ajustes) {
    return FIXTURE.partidos.find(p => {
      const m = Puntos.conAjustes(p, ajustes);
      const mismoPar = (m.local === apiPartido.local && m.visitante === apiPartido.visitante) ||
                       (m.local === apiPartido.visitante && m.visitante === apiPartido.local);
      if (m.local && m.visitante && mismoPar) {
        const dif = Math.abs(new Date(m.utc || m.fecha) - new Date(apiPartido.utc));
        return dif < 1000 * 60 * 60 * 48;                   // mismo cruce dentro de ±48 h
      }
      /* Eliminatoria sin equipos: emparejar por fecha exacta del proveedor */
      if (!m.local && m.fase === 'eliminatorias' && apiPartido.utc) {
        return apiPartido.utc.slice(0, 10) === m.fecha;
      }
      return false;
    });
  },

  /* Sincroniza calendario, equipos de eliminatorias y marcadores.
     Devuelve un resumen para mostrar al admin. */
  async sincronizar() {
    if (!this.disponible()) throw new Error('Configura primero la URL del proxy en js/config.js.');
    const ajustes = await Store.ajustes();
    const partidosApi = await this.traerPartidos();
    let calendario = 0, marcadores = 0;
    for (const ap of partidosApi) {
      const p = this._emparejar(ap, ajustes);
      if (!p) continue;
      const m = Puntos.conAjustes(p, ajustes);
      const aj = {};
      const invertido = m.local && (m.local === ap.visitante);  // proveedor con local/visitante al revés
      if (ap.utc && ap.utc !== m.utc) aj.utc = ap.utc;
      if (ap.estadio && ap.estadio !== m.estadio) { aj.estadio = ap.estadio; aj.sede = ap.sede || m.sede; }
      if (!m.local && ap.local) { aj.local = ap.local; aj.visitante = ap.visitante; }
      if (Object.keys(aj).length) { await Store.guardarAjuste(p.id, aj); calendario++; }
      if (ap.estado) {
        await Store.guardarResultado(p.id, {
          estado: ap.estado, minuto: ap.minuto,
          gl: invertido ? ap.gv : ap.gl,
          gv: invertido ? ap.gl : ap.gv
        });
        marcadores++;
      }
    }
    return { calendario, marcadores, total: partidosApi.length };
  },

  /* Marcador automático: repite sincronizar() cada N segundos
     mientras la pestaña esté visible. Devuelve función para parar. */
  cicloEnVivo(alTerminarCadaCiclo) {
    let activo = true;
    const tick = async () => {
      if (!activo) return;
      if (!document.hidden) {
        try { const r = await this.sincronizar(); alTerminarCadaCiclo && alTerminarCadaCiclo(r); }
        catch (e) { console.warn('Sincronización en vivo:', e.message); }
      }
      if (activo) setTimeout(tick, (CONFIG.API_FUTBOL.intervaloSegundos || 60) * 1000);
    };
    tick();
    return () => { activo = false; };
  },

  /* ---------- SIMULADOR (solo modo demo) --------------------
     Juega un partido minuto a minuto para probar la experiencia
     "en vivo" sin proveedor de datos. ------------------------ */
  simular(pid, alAvanzar) {
    let minuto = 0, gl = 0, gv = 0, parado = false;
    const paso = async () => {
      if (parado) return;
      minuto = Math.min(90, minuto + 5 + Math.floor(Math.random() * 4));
      if (Math.random() < 0.16) gl++;
      if (Math.random() < 0.13) gv++;
      const fin = minuto >= 90;
      await Store.guardarResultado(pid, { estado: fin ? 'finalizado' : 'en_juego', minuto: fin ? 90 : minuto, gl, gv });
      alAvanzar && alAvanzar({ minuto, gl, gv, fin });
      if (!fin) setTimeout(paso, 2500);
    };
    paso();
    return () => { parado = true; };
  }
};
window.ApiFutbol = ApiFutbol;
