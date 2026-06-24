/* ============================================================
   POLLA SIIGO 2026 — RESULTADOS EN VIVO
   ------------------------------------------------------------
   Flujo: el admin activa "Marcador automático". El panel
   consulta la API, escribe en la base de datos y todos
   los demás lo ven en tiempo real. Una polla de 300 personas
   consume la cuota de 1 sola.

   Con un plan de pago de la API, el sistema es más agresivo:
   - Refresca marcadores cada 10-15 segundos.
   - Actualiza estadísticas (tarjetas, corners) cada 5 minutos.
   - Genera análisis de IA para partidos futuros automáticamente.
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
    // PST=Postponed, SUSP=Suspended, INT=Interrupted, CANC=Cancelled, ABD=Abandoned
    if (['PST','SUSP','INT','CANC','ABD'].includes(corto)) return 'aplazado';
    return null;
  },

  _motivoAplazamiento(corto) {
    if (corto === 'PST') return 'Partido pospuesto';
    if (corto === 'SUSP') return 'Partido suspendido';
    if (corto === 'INT') return 'Partido interrumpido';
    if (['CANC', 'ABD'].includes(corto)) return 'Partido cancelado/abandonado';
    return null;
  },

  async traerPartidosDelDia(fecha) { // fecha in 'YYYY-MM-DD' format
    if (!this.disponible()) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures';
    url.searchParams.set('date', fecha);
    // Asegurar que traemos solo los del mundial
    url.searchParams.set('league', '1');
    url.searchParams.set('season', '2026');

    let r;
    try { r = await fetch(url.toString()); }
    catch (err) { console.warn('API: Conexión bloqueada. Revisa tu internet o la configuración de la API.'); return []; }
    if (!r.ok) { console.warn(`API respondió ${r.status}`); return []; }
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.warn('Error en la API: ' + JSON.stringify(data.errors));
      return [];
    }
    
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

  /* Descarga y normaliza los partidos del Mundial desde la API. */
  async traerPartidos() {
    if (!this.disponible()) throw new Error('Proxy no configurado en js/config.js');
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures';
    url.searchParams.set('league', '1'); // ID para el Mundial
    url.searchParams.set('season', '2026');
    let r;
    try { r = await fetch(url.toString()); }
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
    if (!apiFixtureId || !this.disponible()) return [];
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/events';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await fetch(url.toString());
      if (!r.ok) return [];
      const data = await r.json();
      return (data.response || [])
        .filter(ev => ev.type === 'Goal' || // Goles
          ev.type === 'subst' ||
          ev.type === 'var' ||   // Revisiones del VAR (para goles anulados)
          (ev.type === 'Card' && ['Red Card', 'Second Yellow card', 'Yellow Card'].includes(ev.detail))) // Tarjetas
        .map(ev => {
          const ape = n => (n || '').split(' ').slice(-1)[0];

          let tipo = ev.type === 'Goal' ? 'gol'
                   : ev.type === 'subst' ? 'cambio'
                   : ev.detail === 'Yellow Card' ? 'amarilla' : 'roja';
          let subtipo = '';

          if (ev.type === 'Goal') {
            const det = (ev.detail || '').toLowerCase();
            if (det.includes('penalty')) subtipo = 'penal';
            else if (det.includes('own goal')) subtipo = 'autogol';
            else if (det.includes('free kick')) subtipo = 'tiro_libre';
            else if (det.includes('header')) subtipo = 'cabeza';
            else subtipo = 'normal';
          } else if (ev.type === 'var' && (ev.detail || '').toLowerCase().includes('goal cancelled')) {
            tipo = 'gol_anulado'; // Nuevo tipo de evento para goles anulados por VAR
          }

          return {
            m:  ev.time?.elapsed || 0,
            x:  ev.time?.extra || null,
            eq: this._codigo(ev.team?.name) || '',
            j:  ape(ev.player?.name),
            n:  (ev.player?.name || ''), // nombre completo disponible
            a:  ev.type === 'subst' ? ape(ev.assist?.name) : null,
            t:  tipo,
            subtipo: subtipo,
            detail: ev.detail || ''
          };
        });
    } catch (_) { return []; }
  },

  /* Trae conteo de tarjetas desde estadísticas (para rojas sin gol).
     Solo disponible con acceso directo a api-sports.io.
     teamIdMap: { apiTeamId: 'COD' } para resolver nombres que no coincidan. */
  async traerTarjetas(apiFixtureId, teamIdMap = {}) {
    if (!apiFixtureId || !this.disponible()) return {};
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/statistics';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await fetch(url.toString());
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
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/predictions';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await fetch(url.toString());
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
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/lineups';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await fetch(url.toString());
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
    if (!teamId1 || !teamId2 || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/fixtures/headtohead';
    url.searchParams.set('h2h', `${teamId1}-${teamId2}`);
    url.searchParams.set('last', '10');

    try {
      const r = await fetch(url.toString());
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
    if (!apiFixtureId || !this.disponible()) return null;
    const urlBase = CONFIG.API_FUTBOL.proxyUrl.replace(/\/$/, '');
    const url = new URL(urlBase);
    url.pathname = '/injuries';
    url.searchParams.set('fixture', apiFixtureId);

    try {
      const r = await fetch(url.toString());
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

  /* Genera y guarda un análisis de IA para un partido específico. */
  async generarAnalisisIA(partidoId) {
    if (!this.disponible() || !window.IA?.disponible()) {
      throw new Error('La función de IA o la API de fútbol no están configuradas.');
    }

    const ajustes = await Store.ajustes();
    const p = FIXTURE.partidos.find(x => x.id === partidoId);
    if (!p) throw new Error('Partido no encontrado.');

    const ap = Puntos.conAjustes(p, ajustes);
    if (!ap.local || !ap.visitante) throw new Error('Los equipos para este partido aún no están definidos.');

    const resAnterior = (await Store.resultados())[partidoId] || {};

    const L = FIXTURE.equipo(ap.local);
    const V = FIXTURE.equipo(ap.visitante);

    // 1. Gather all data needed for the prompt
    const datos = {
        prediccion: resAnterior.prediccion || await this.traerPrediccion(ap.apiId),
        h2h: resAnterior.prediccion?.h2h || await this.traerH2H(ap.localApiTeamId, ap.visitanteApiTeamId),
        lesiones: resAnterior.prediccion?.lesiones || await this.traerLesiones(ap.apiId)
    };

    // 2. Build the prompt
    let prompt = `Eres un analista experto de fútbol. Analiza el partido del Mundial 2026 entre ${L.n_en} y ${V.n_en}.\n\nDATOS DISPONIBLES:\n`;
    if (datos.prediccion) {
        prompt += `- Probabilidades (modelo API): ${L.n_en} (${datos.prediccion.pct.l}), Empate (${datos.prediccion.pct.e}), ${V.n_en} (${datos.prediccion.pct.v}).\n`;
        prompt += `- Marcador más probable (modelo API): ${datos.prediccion.goles.l} a ${datos.prediccion.goles.v}.\n`;
        if (datos.prediccion.consejo) prompt += `- Consejo de apuesta: ${datos.prediccion.consejo}.\n`;
    }
    if (datos.h2h) {
        prompt += `- Historial (últimos ${datos.h2h.w1 + datos.h2h.empate + datos.h2h.w2}): ${L.n_en} ganó ${datos.h2h.w1}, empataron ${datos.h2h.empate}, y ${V.n_en} ganó ${datos.h2h.w2}.\n`;
    }
    if (datos.lesiones && (datos.lesiones[ap.local]?.length || datos.lesiones[ap.visitante]?.length)) {
        prompt += `- Bajas por lesión: `;
        if (datos.lesiones[ap.local]?.length) prompt += `${L.n_en}: ${datos.lesiones[ap.local].map(j => j.nombre).join(', ')}. `;
        if (datos.lesiones[ap.visitante]?.length) prompt += `${V.n_en}: ${datos.lesiones[ap.visitante].map(j => j.nombre).join(', ')}.`;
        prompt += `\n`;
    }
    prompt += `\nINSTRUCCIONES:\nBasado en estos datos, genera un análisis conciso en 2-3 párrafos en español, con un título atractivo usando markdown. Enfócate en las claves del partido, el favorito y por qué. Sé directo, profesional y analítico. No repitas los datos crudos, interprétalos.`;

    // 3. Call IA and store result
    const analisisMd = await IA.analizar(prompt);
    if (!analisisMd) throw new Error('La IA no generó una respuesta.');

    await Store.guardarResultado(partidoId, { ...resAnterior, analisisIA: analisisMd });
    
    return analisisMd;
  },

  /* Empareja cada partido del proveedor con el fixture local. */
  _emparejar(apiPartido, ajustes) {
    return FIXTURE.partidos.find(p => {
      const m = Puntos.conAjustes(p, ajustes);
      const mismoPar = (m.local === apiPartido.local && m.visitante === apiPartido.visitante) ||
                       (m.local === apiPartido.visitante && m.visitante === apiPartido.local);
      if (m.local && m.visitante && mismoPar) {
        const fechaLocal = new Date(m.utc || m.fecha);
        const fechaApi = new Date(apiPartido.utc);
        const esMismoDia = fechaLocal.toDateString() === fechaApi.toDateString();
        const esDiaSiguiente = fechaApi.getTime() > fechaLocal.getTime() && fechaApi.toDateString() !== fechaLocal.toDateString();
        const diferenciaHoras = Math.abs(fechaApi.getTime() - fechaLocal.getTime()) / (1000 * 60 * 60);

        // Coincidir si es el mismo día, o si la fecha de la API es el día siguiente y dentro de un margen razonable (ej. 4 horas)
        // para manejar posibles desfases de zona horaria o actualizaciones menores de la API.
        // Se prioriza que la fecha de la API sea la correcta.
        return esMismoDia || (esDiaSiguiente && diferenciaHoras < 4);
      }
      if (!m.local && m.fase === 'eliminatorias' && apiPartido.utc)
        return apiPartido.utc.slice(0, 10) === m.fecha;
      return false;
    });
  },

  async _procesarPartidosApi(partidosApi, esCicloEnVivo = false) {
    const [ajustes, resActuales] = await Promise.all([Store.ajustes(), Store.resultados()]);
    let calendario = 0, marcadores = 0;
    for (const ap of partidosApi) {
      const p = this._emparejar(ap, ajustes);
      if (!p) continue;

      const m = Puntos.conAjustes(p, ajustes);
      const ahora = Date.now();
      const inicio = ap.utc ? new Date(ap.utc).getTime() : 0;
      // "Limbo": período de gracia de 15 min después del inicio, donde la API puede no haberse actualizado.
      const enLimbo = inicio > 0 && ahora > inicio && ahora < inicio + 15 * 60000;

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
        if (ap.estado === 'aplazado') resultado.motivoAplazamiento = this._motivoAplazamiento(ap.periodo) || '';
        console.log(`⚽ Partido ${p.id}: estado=${ap.estado}, gl=${glNuevo}, gv=${gvNuevo}`);

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
        if ((ap.estado === 'en_juego' || recienFin) && ap.apiId) { // PRO: 5 min
          if (ahora - (resAnterior?.statsAt || 0) > 5 * 60000 || recienFin) {
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
      } else if (enLimbo) {
        // El partido está en el período de gracia, pero la API aún no lo marca como iniciado.
        // Se guarda un estado temporal 'iniciando' para que la UI no lo cierre.
        const resAnterior = resActuales[p.id] || {};
        if (resAnterior.estado !== 'en_juego' && resAnterior.estado !== 'finalizado') {
          await Store.guardarResultado(p.id, { ...resAnterior, estado: 'iniciando' });
          marcadores++;
        }
      } else if (ap.apiId && ap.utc) {
          // Para partidos futuros, buscar datos como predicciones y alineaciones.
          // Partidos próximos: obtener predicción (24h antes) y alineación (2h antes)
          const mins   = (new Date(ap.utc).getTime() - ahora) / 60000;
          if (mins > 0) {
            const resAnterior = resActuales[p.id] || {};
            const extra = {};

            // Análisis IA (48h antes) - Con plan PRO, se puede generar en el ciclo en vivo.
            if (mins < 2880 && !resAnterior.analisisIA && window.IA && IA.disponible()) {
                const L = FIXTURE.equipo(ap.local);
                const V = FIXTURE.equipo(ap.visitante);
                
                // 1. Gather all data needed for the prompt
                const datos = {
                    prediccion: resAnterior.prediccion || await this.traerPrediccion(ap.apiId),
                    h2h: resAnterior.prediccion?.h2h || await this.traerH2H(ap.localApiTeamId, ap.visitanteApiTeamId),
                    lesiones: resAnterior.prediccion?.lesiones || await this.traerLesiones(ap.apiId)
                };

                // 2. Build the prompt
                let prompt = `Eres un analista experto de fútbol. Analiza el partido del Mundial 2026 entre ${L.n_en} y ${V.n_en}.\n\nDATOS DISPONIBLES:\n`;
                if (datos.prediccion) {
                    prompt += `- Probabilidades (modelo API): ${L.n_en} (${datos.prediccion.pct.l}), Empate (${datos.prediccion.pct.e}), ${V.n_en} (${datos.prediccion.pct.v}).\n`;
                    prompt += `- Marcador más probable (modelo API): ${datos.prediccion.goles.l} a ${datos.prediccion.goles.v}.\n`;
                    if (datos.prediccion.consejo) prompt += `- Consejo de apuesta: ${datos.prediccion.consejo}.\n`;
                }
                if (datos.h2h) {
                    prompt += `- Historial (últimos ${datos.h2h.w1 + datos.h2h.empate + datos.h2h.w2}): ${L.n_en} ganó ${datos.h2h.w1}, empataron ${datos.h2h.empate}, y ${V.n_en} ganó ${datos.h2h.w2}.\n`;
                }
                if (datos.lesiones && (datos.lesiones[ap.local]?.length || datos.lesiones[ap.visitante]?.length)) {
                    prompt += `- Bajas por lesión: `;
                    if (datos.lesiones[ap.local]?.length) prompt += `${L.n_en}: ${datos.lesiones[ap.local].map(j => j.nombre).join(', ')}. `;
                    if (datos.lesiones[ap.visitante]?.length) prompt += `${V.n_en}: ${datos.lesiones[ap.visitante].map(j => j.nombre).join(', ')}.`;
                    prompt += `\n`;
                }
                prompt += `\nINSTRUCCIONES:\nBasado en estos datos, genera un análisis conciso en 2-3 párrafos en español, con un título atractivo usando markdown. Enfócate en las claves del partido, el favorito y por qué. Sé directo, profesional y analítico. No repitas los datos crudos, interprétalos.`;

                // 3. Call IA and store result
                try { const analisisMd = await IA.analizar(prompt); if (analisisMd) extra.analisisIA = analisisMd; }
                catch (e) { console.warn(`Fallo al generar análisis IA para ${p.id}:`, e); }
            }

            // Predicción (24h antes) y Alineación (2h antes) - se pueden buscar en vivo
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

  /* Sincroniza calendario, equipos de eliminatorias y marcadores.
     Devuelve un resumen para mostrar al admin. */
  async sincronizar() {
    if (!this.disponible()) throw new Error('Configura primero la URL del proxy en js/config.js.');
    console.log('🔄 Iniciando sincronización COMPLETA con API-Football...');
    const partidosApi = await this.traerPartidos();
    console.log(`📊 ${partidosApi.length} partidos obtenidos de la API (sync completa).`);
    return this._procesarPartidosApi(partidosApi, false);
  },

  async sincronizarEnVivo() {
    if (!this.disponible()) {
      console.warn('API no disponible, saltando ciclo en vivo.');
      return { calendario: 0, marcadores: 0, total: 0 };
    }
    console.log('🔄 Iniciando ciclo de sincronización EN VIVO...');
    
    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
    const format = (d) => d.toISOString().split('T')[0];

    try {
      const [partidosAyer, partidosHoy, partidosManana] = await Promise.all([
          this.traerPartidosDelDia(format(ayer)),
          this.traerPartidosDelDia(format(hoy)),
          this.traerPartidosDelDia(format(manana))
      ]);
      
      const partidosApi = [...partidosAyer, ...partidosHoy, ...partidosManana];
      const partidosUnicos = Array.from(new Map(partidosApi.map(p => [p.apiId, p])).values());
      return this._procesarPartidosApi(partidosUnicos, true);
    } catch (e) {
      console.error('Error en ciclo de sincronización en vivo:', e);
      return { calendario: 0, marcadores: 0, total: 0, error: true };
    }
  },

  /* Marcador automático: repite sincronizar() cada N segundos
     mientras la pestaña esté visible. Devuelve función para parar.
     Optimizado con tasa adaptativa:
     - Últimos 10 min de cada tiempo: cada 15 segundos
     - Primeros 15 min de cada tiempo: cada 30 segundos
     - Resto del partido: cada 60 segundos (default config)
     - Sin partidos activos: chequeo cada 120 segundos */
  cicloEnVivo(alTerminarCadaCiclo) {
    let activo = true;
    let tickTimeout = null;

    // Lógica de intervalo adaptativo mejorada para planes de pago
    const _proximoIntervalo = (ajFix, resLive) => {
      const ahora = Date.now();
      let intervaloMinimo = 120000; // Default: 2 minutos si no hay nada

      // Primero, buscar si hay algún partido en vivo. Si es así, usamos el intervalo más rápido y terminamos.
      const hayEnVivo = Object.values(resLive || {}).some(r => r.estado === 'en_juego');
      if (hayEnVivo) {
        return Math.max((CONFIG.API_FUTBOL.intervaloSegundos || 10) * 1000, 10000); // Nunca menos de 10s
      }

      // Si no hay partidos en vivo, buscar el próximo partido cercano
      for (const p of (window.FIXTURE?.partidos || [])) {
        const utc = ajFix?.[p.id]?.utc || p.utc;
        if (!utc) continue;

        const inicio = new Date(utc).getTime();
        const minutosHastaInicio = (inicio - ahora) / 60000;

        // Partido a punto de empezar (próximos 30 min)
        if (minutosHastaInicio > 0 && minutosHastaInicio <= 30) {
          intervaloMinimo = Math.min(intervaloMinimo, 30000); // chequear cada 30s
        }
        // Partido en la ventana de juego (hasta 2h después de empezar)
        else if (minutosHastaInicio <= 0 && minutosHastaInicio > -120) {
          intervaloMinimo = Math.min(intervaloMinimo, 60000); // chequear cada 60s por si empieza
        }
      }

      // Devuelve el intervalo más corto encontrado, pero nunca menos de 10 segundos.
      return Math.max(intervaloMinimo, 10000);
    };

    const tick = async () => {
      if (!activo) return;

      const ajFix = window._ajustesLive || {};
      const resLive = window._resultadosLive || {};

      if (!document.hidden) {
        const ahora = Date.now();
        const enVentana = FIXTURE.partidos.some(p => {
          const utc = ajFix[p.id]?.utc || p.utc;
          if (!utc) return false;
          const inicio = new Date(utc).getTime() - (30 * 60000);
          const fin    = inicio + (210 * 60000);
          return ahora >= inicio && ahora <= fin;
        });
        const hayEnVivo = Object.values(resLive).some(r => r.estado === 'en_juego');
        const hayPartidosActivos = enVentana || hayEnVivo;

        if (hayPartidosActivos) {
          const puedeSync = Store.reclamarSincronizacion
            ? await Store.reclamarSincronizacion()
            : true;
          if (puedeSync) {
            try {
              const r = await this.sincronizarEnVivo();
              alTerminarCadaCiclo && alTerminarCadaCiclo(r);

              // Cada 5 ciclos, forzar recarga de resultados desde Firestore
              // para asegurar que las notificaciones se disparen
              // (esto ya lo hace Store.enCambios con onSnapshot)
            } catch (e) {
              console.warn('Sincronización en vivo:', e.message);
            }
          }
        }
      }

      if (activo) {
        const proxIntervalo = _proximoIntervalo(ajFix, resLive);
        tickTimeout = setTimeout(tick, proxIntervalo);
      }
    };

    tick();
    return () => {
      activo = false;
      if (tickTimeout) {
        clearTimeout(tickTimeout);
        tickTimeout = null;
      }
    };
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
      if (u) {
        console.log('📡 Iniciando sincronización automática de partidos en vivo...');
        window.ApiFutbol.cicloEnVivo(() => {
          console.log('✅ Ciclo de sincronización completado');
        });
      }
    });
  }
}, 3000 + Math.floor(Math.random() * 5000));
