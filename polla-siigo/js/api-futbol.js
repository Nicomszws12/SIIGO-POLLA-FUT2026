/* ============================================================
   POLLA SIIGO 2026 — RESULTADOS EN VIVO
   ------------------------------------------------------------
   Flujo: el admin activa "Marcador automático". El panel
   consulta la API, escribe en la base de datos y todos
   los demás lo ven en tiempo real. Una polla de 300 personas
   consume la cuota de 1 sola.

   Quota del plan gratuito: 100 llamadas/día.
   - 1 llamada a /fixtures por ciclo de sync.
   - /fixtures/events solo cuando hay un gol nuevo o el partido termina.
   - /fixtures/statistics cada ~30 min para tarjetas sin gol.
   ============================================================ */

const ApiFutbol = {

  disponible() { return !!(CONFIG.API_FUTBOL.proxyUrl || '').trim(); },

  /* Alias inglés del proveedor → código interno. */
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

  _codigo(nombre) {
    const nom = String(nombre || '').toLowerCase().trim();
    const idEq = Object.keys(window.FIXTURE.equipos).find(k => {
      const e = window.FIXTURE.equipos[k];
      return e.n.toLowerCase() === nom || (e.n_en && e.n_en.toLowerCase() === nom);
    });
    return idEq || this._alias[nom] || null;
  },

  _estado(corto) {
    if (['1H','2H','HT','ET','BT','P','LIVE'].includes(corto)) return 'en_juego';
    if (['FT','AET','PEN'].includes(corto)) return 'finalizado';
    return null;
  },

  /* Descarga y normaliza los partidos del Mundial desde la API. */
  async traerPartidos() {
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const esDirecto = urlBase.includes('api-sports.io');
    const url = esDirecto ? `${urlBase}/fixtures?league=1&season=2026` : `${urlBase}/fixtures`;
    const opciones = esDirecto && CONFIG.API_FUTBOL.apiKey
      ? { headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey } }
      : {};
    let r;
    try { r = await fetch(url, opciones); }
    catch (err) { throw new Error('Conexión bloqueada. Revisa tu internet o la configuración de la API.'); }
    if (!r.ok) throw new Error('La API respondió ' + r.status);
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0)
      throw new Error('Error en la API: ' + JSON.stringify(data.errors));
    return (data.response || []).map(f => ({
      apiId:              f.fixture?.id,
      local:              this._codigo(f.teams?.home?.name),
      visitante:          this._codigo(f.teams?.away?.name),
      localApiTeamId:     f.teams?.home?.id || null,
      visitanteApiTeamId: f.teams?.away?.id || null,
      utc:       f.fixture?.date ? new Date(f.fixture.date).toISOString() : null,
      estadio:   f.fixture?.venue?.name || '',
      sede:      f.fixture?.venue?.city || '',
      estado:    this._estado(f.fixture?.status?.short),
      periodo:   f.fixture?.status?.short || null,
      minuto:    f.fixture?.status?.elapsed ?? null,
      gl: f.goals?.home, gv: f.goals?.away
    })).filter(x => x.local && x.visitante);
  },

  /* Trae goles y tarjetas rojas de un partido por su ID de API.
     Solo disponible con acceso directo a api-sports.io. */
  async traerEventos(apiFixtureId) {
    if (!apiFixtureId) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return [];
    try {
      const r = await fetch(`${urlBase}/fixtures/events?fixture=${apiFixtureId}`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.response || [])
        .filter(ev => ev.type === 'Goal' ||
          ev.type === 'subst' ||
          (ev.type === 'Card' && ['Red Card', 'Second Yellow card', 'Yellow Card'].includes(ev.detail)))
        .map(ev => {
          const ape = n => (n || '').split(' ').slice(-1)[0];
          return {
            m:  ev.time?.elapsed || 0,
            x:  ev.time?.extra || null,
            eq: this._codigo(ev.team?.name) || '',
            j:  ape(ev.player?.name),
            a:  ev.type === 'subst' ? ape(ev.assist?.name) : null,
            t:  ev.type === 'Goal' ? 'gol'
              : ev.type === 'subst' ? 'cambio'
              : ev.detail === 'Yellow Card' ? 'amarilla' : 'roja'
          };
        });
    } catch (_) { return []; }
  },

  /* Trae conteo de tarjetas desde estadísticas (para rojas sin gol).
     Solo disponible con acceso directo a api-sports.io.
     teamIdMap: { apiTeamId: 'COD' } para resolver nombres que no coincidan. */
  async traerTarjetas(apiFixtureId, teamIdMap = {}) {
    if (!apiFixtureId) return {};
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return {};
    try {
      const r = await fetch(`${urlBase}/fixtures/statistics?fixture=${apiFixtureId}`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return {};
      const data = await r.json();
      const res = {};
      (data.response || []).forEach(eq => {
        const cod = this._codigo(eq.team?.name) || teamIdMap[eq.team?.id] || null;
        if (!cod) return;
        const st = eq.statistics || [];
        const g = t => st.find(s => s.type === t)?.value ?? null;
        res[cod] = {
          amarillas:      g('Yellow Cards') || 0,
          rojas:          g('Red Cards') || 0,
          posesion:       g('Ball Possession'),
          tirosArc:       g('Shots on Goal') ?? 0,
          tirosTot:       g('Total Shots') ?? 0,
          corners:        g('Corner Kicks') ?? 0,
          faltas:         g('Fouls') ?? 0,
          fueras:         g('Offsides') ?? 0,
          precisionPases: g('Passes %'),
          paradas:        g('Goalkeeper Saves') ?? 0
        };
      });
      return res;
    } catch (_) { return {}; }
  },

  /* Predicción oficial (probabilidades de victoria, goles esperados). */
  async traerPrediccion(apiFixtureId) {
    if (!apiFixtureId) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return null;
    try {
      const r = await fetch(`${urlBase}/predictions?fixture=${apiFixtureId}`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return null;
      const data = await r.json();
      const p = (data.response || [])[0]?.predictions;
      if (!p) return null;
      return {
        consejo: p.advice || '',
        pct: { l: p.percent?.home || '?%', e: p.percent?.draw || '?%', v: p.percent?.away || '?%' },
        goles: { l: p.goals?.home ?? '-', v: p.goals?.away ?? '-' },
        linea: p.under_over || null
      };
    } catch { return null; }
  },

  /* Alineaciones confirmadas (disponibles ~1h antes del partido). */
  async traerAlineacion(apiFixtureId) {
    if (!apiFixtureId) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return null;
    try {
      const r = await fetch(`${urlBase}/fixtures/lineups?fixture=${apiFixtureId}`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.response?.length) return null;
      const ord = {G:0, D:1, M:2, F:3};
      return data.response.map(eq => ({
        cod:   this._codigo(eq.team?.name) || '',
        apiId: eq.team?.id || null,
        f: eq.formation || '',
        xi: (eq.startXI || [])
          .map(e => ({ n: (e.player?.name || '').split(' ').slice(-1)[0], num: e.player?.number || '', pos: e.player?.pos || '' }))
          .sort((a, b) => (ord[a.pos] ?? 9) - (ord[b.pos] ?? 9))
      }));
    } catch { return null; }
  },

  /* Historial de enfrentamientos directos entre dos equipos (H2H). */
  async traerH2H(teamId1, teamId2) {
    if (!teamId1 || !teamId2) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return null;
    try {
      const r = await fetch(`${urlBase}/fixtures/headtohead?h2h=${teamId1}-${teamId2}&last=10`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return null;
      const data = await r.json();
      const matches = (data.response || []).slice(0, 5);
      if (!matches.length) return null;
      let w1 = 0, empate = 0, w2 = 0;
      const recientes = [];
      for (const m of matches) {
        const homeWinner = m.teams?.home?.winner;
        const t1IsHome = m.teams?.home?.id === teamId1;
        if (homeWinner === null || homeWinner === undefined) { empate++; }
        else if ((homeWinner && t1IsHome) || (!homeWinner && !t1IsHome)) { w1++; }
        else { w2++; }
        recientes.push({
          gl: t1IsHome ? (m.goals?.home ?? 0) : (m.goals?.away ?? 0),
          gv: t1IsHome ? (m.goals?.away ?? 0) : (m.goals?.home ?? 0)
        });
      }
      return { w1, empate, w2, recientes };
    } catch { return null; }
  },

  /* Jugadores lesionados/ausentes para un partido específico. */
  async traerLesiones(apiFixtureId) {
    if (!apiFixtureId) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    if (!urlBase.includes('api-sports.io')) return null;
    try {
      const r = await fetch(`${urlBase}/injuries?fixture=${apiFixtureId}`, {
        headers: { 'x-apisports-key': CONFIG.API_FUTBOL.apiKey }
      });
      if (!r.ok) return null;
      const data = await r.json();
      const mapa = {};
      for (const item of data.response || []) {
        const cod = this._codigo(item.team?.name);
        if (!cod) continue;
        if (!mapa[cod]) mapa[cod] = [];
        const apellido = (item.player?.name || '').split(' ').slice(-1)[0];
        mapa[cod].push({ nombre: apellido, razon: item.injury?.reason || item.injury?.type || '' });
      }
      return Object.keys(mapa).length ? mapa : null;
    } catch { return null; }
  },

  /* Empareja cada partido del proveedor con el fixture local. */
  _emparejar(apiPartido, ajustes) {
    return FIXTURE.partidos.find(p => {
      const m = Puntos.conAjustes(p, ajustes);
      const mismoPar = (m.local === apiPartido.local && m.visitante === apiPartido.visitante) ||
                       (m.local === apiPartido.visitante && m.visitante === apiPartido.local);
      if (m.local && m.visitante && mismoPar) {
        const dif = Math.abs(new Date(m.utc || m.fecha) - new Date(apiPartido.utc));
        return dif < 1000 * 60 * 60 * 48;                    // mismo cruce dentro de ±48 h
      }
      if (!m.local && m.fase === 'eliminatorias' && apiPartido.utc)
        return apiPartido.utc.slice(0, 10) === m.fecha;
      return false;
    });
  },

  /* Sincroniza calendario, equipos de eliminatorias y marcadores.
     Devuelve un resumen para mostrar al admin. */
  async sincronizar() {
    if (!this.disponible()) throw new Error('Configura primero la URL del proxy en js/config.js.');
    const [ajustes, resActuales] = await Promise.all([Store.ajustes(), Store.resultados()]);
    const partidosApi = await this.traerPartidos();
    let calendario = 0, marcadores = 0;
    for (const ap of partidosApi) {
      const p = this._emparejar(ap, ajustes);
      if (!p) continue;
      const m = Puntos.conAjustes(p, ajustes);
      const aj = {};
      const invertido = m.local && (m.local === ap.visitante);
      if (ap.utc && ap.utc !== m.utc) aj.utc = ap.utc;
      if (ap.estadio && ap.estadio !== m.estadio) { aj.estadio = ap.estadio; aj.sede = ap.sede || m.sede; }
      if (!m.local && ap.local) { aj.local = ap.local; aj.visitante = ap.visitante; }
      if (Object.keys(aj).length) {
          try { await Store.guardarAjuste(p.id, aj); calendario++; }
          catch (_) { /* sin permiso — solo admins actualizan ajustes */ }
        }
      if (ap.estado) {
        const resAnterior = resActuales[p.id];
        const glNuevo = invertido ? ap.gv : ap.gl;
        const gvNuevo = invertido ? ap.gl : ap.gv;
        const resultado = {
          apiId:    ap.apiId || null,
          estado:   ap.estado,
          minuto:   ap.minuto,
          minutoAt: Date.now(),
          periodo:  ap.periodo || null,
          gl: glNuevo,
          gv: gvNuevo
        };

        // Traer eventos cuando hay gol nuevo o el partido termina
        const cambioGol   = (glNuevo + gvNuevo) > ((resAnterior?.gl || 0) + (resAnterior?.gv || 0));
        const recienFin   = ap.estado === 'finalizado' && resAnterior?.estado !== 'finalizado';
        if ((cambioGol || recienFin) && ap.apiId) {
          const evs = await this.traerEventos(ap.apiId);
          resultado.eventos = evs.length ? evs : (resAnterior?.eventos || []);
        } else {
          resultado.eventos = resAnterior?.eventos || [];
        }

        // Traer estadísticas cada 10 min durante el partido y al finalizar
        if ((ap.estado === 'en_juego' || recienFin) && ap.apiId) {
          const ahora = Date.now();
          if (ahora - (resAnterior?.statsAt || 0) > 10 * 60000 || recienFin) {
            // Mapa ID de equipo API → código interno, por si el nombre difiere entre endpoints
            const teamIdMap = {};
            if (ap.localApiTeamId)     teamIdMap[ap.localApiTeamId]     = invertido ? ap.visitante : ap.local;
            if (ap.visitanteApiTeamId) teamIdMap[ap.visitanteApiTeamId] = invertido ? ap.local     : ap.visitante;
            const tarj = await this.traerTarjetas(ap.apiId, teamIdMap);
            resultado.tarjetas = Object.keys(tarj).length ? tarj : (resAnterior?.tarjetas || {});
            resultado.statsAt  = ahora;
          } else {
            resultado.tarjetas = resAnterior?.tarjetas || {};
            resultado.statsAt  = resAnterior?.statsAt  || 0;
          }
        }

        // Predicción y alineación: preservar lo que ya tengamos
        resultado.prediccion = resAnterior?.prediccion || null;
        resultado.alineacion = resAnterior?.alineacion || null;

        await Store.guardarResultado(p.id, resultado);
        marcadores++;
      } else if (ap.apiId && ap.utc) {
        // Partidos próximos: obtener predicción (24h antes) y alineación (2h antes)
        const ahora  = Date.now();
        const mins   = (new Date(ap.utc).getTime() - ahora) / 60000;
        if (mins > 0) {
          const resAnterior = resActuales[p.id] || {};
          const extra = {};
          if (mins < 1440 && !resAnterior.prediccion) {
            const pred = await this.traerPrediccion(ap.apiId);
            if (pred) extra.prediccion = pred;
          }
          if (mins < 120 && !resAnterior.alineacion) {
            const alin = await this.traerAlineacion(ap.apiId);
            if (alin && alin.length) {
              const tmAlin = {};
              if (ap.localApiTeamId)     tmAlin[ap.localApiTeamId]     = invertido ? ap.visitante : ap.local;
              if (ap.visitanteApiTeamId) tmAlin[ap.visitanteApiTeamId] = invertido ? ap.local     : ap.visitante;
              for (const eq of alin) {
                if (!eq.cod && eq.apiId && tmAlin[eq.apiId]) eq.cod = tmAlin[eq.apiId];
              }
              extra.alineacion = alin;
            }
          }
          if (Object.keys(extra).length) {
            await Store.guardarResultado(p.id, { ...resAnterior, ...extra });
            marcadores++;
          }
        }
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
        const ahora = Date.now();
        // Usar ajustes del admin (UTC reales) + fallback al fixture estático
        const ajFix = window._ajustesLive || {};
        const enVentana = FIXTURE.partidos.some(p => {
          const utc = ajFix[p.id]?.utc || p.utc;
          if (!utc) return false;
          const inicio = new Date(utc).getTime() - (30 * 60000);
          const fin    = inicio + (210 * 60000);
          return ahora >= inicio && ahora <= fin;
        });
        // También sincronizar si Firestore ya reporta un partido en_juego
        const resLive = window._resultadosLive || {};
        const hayEnVivo = Object.values(resLive).some(r => r.estado === 'en_juego');
        const hayPartidosActivos = enVentana || hayEnVivo;
        if (hayPartidosActivos) {
          const puedeSync = Store.reclamarSincronizacion
            ? await Store.reclamarSincronizacion()
            : true;
          if (puedeSync) {
            try { const r = await this.sincronizar(); alTerminarCadaCiclo && alTerminarCadaCiclo(r); }
            catch (e) { console.warn('Sincronización en vivo:', e.message); }
          }
        }
      }
      if (activo) setTimeout(tick, (CONFIG.API_FUTBOL.intervaloSegundos || 60) * 1000);
    };
    tick();
    return () => { activo = false; };
  },

  /* Simulador minuto a minuto (solo modo demo). */
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

// Auto-sincronización para cualquier usuario autenticado.
// El coordinador Firestore garantiza que solo UN navegador llame a la API a la vez.
setTimeout(() => {
  if (window.Store && window.CONFIG.MODO === 'firebase') {
    window.Store.sesion().then(u => {
      if (u) window.ApiFutbol.cicloEnVivo();
    });
  }
}, 3000 + Math.floor(Math.random() * 5000));
