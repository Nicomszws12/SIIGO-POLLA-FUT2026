/* ============================================================
   POLLA SIIGO 2026 — MOTOR DE PUNTUACIÓN
   ------------------------------------------------------------
   Reglas (CONFIG.REGLAS):
     Fase de grupos      → exacto 3 pts · acertar 1X2 1 pt
     Eliminatorias       → exacto 5 pts · acertar 1X2 2 pts
     Bono campeón        → 10 pts (elegido antes del 1.er partido)
   Desempates: 1) puntos  2) exactos  3) aciertos de resultado
               4) quien se registró primero.
   ============================================================ */

const Puntos = {

  /* Aplica los ajustes del admin (hora real, sede, equipos de
     eliminatorias) sobre un partido del fixture. */
  conAjustes(p, ajustes) {
    const a = (ajustes || {})[p.id];
    return a ? { ...p, ...a, horaOk: a.utc ? true : p.horaOk } : p;
  },

  signo(gl, gv) { return gl > gv ? 'L' : gl < gv ? 'V' : 'E'; },

  /* Califica un pronóstico contra un resultado FINALIZADO. */
  calificar(pred, res, fase) {
    if (!pred || !res || res.estado !== 'finalizado') return { pts: 0, tipo: null };
    const r = CONFIG.REGLAS[fase === 'eliminatorias' ? 'eliminatorias' : 'grupos'];
    if (pred.gl === res.gl && pred.gv === res.gv) return { pts: r.exacto, tipo: 'exacto' };
    if (this.signo(pred.gl, pred.gv) === this.signo(res.gl, res.gv)) return { pts: r.resultado, tipo: 'resultado' };
    return { pts: 0, tipo: 'fallo' };
  },

  /* Campeón del Mundial (si la final ya terminó). */
  campeon(resultados, ajustes) {
    const final = this.conAjustes(FIXTURE.porId('ko-104'), ajustes);
    const res = resultados['ko-104'];
    if (!res || res.estado !== 'finalizado' || !final.local || !final.visitante) return null;
    if (res.gl === res.gv) return res.ganadorPenales || null;   // definido por el admin si hubo penales
    return res.gl > res.gv ? final.local : final.visitante;
  },

  /* Tabla de posiciones de la polla.
     puntosManuales: array de { uid, pid, pts, razon } que se suman al total. */
  tabla(usuarios, todasPred, resultados, ajustes, puntosManuales) {
    const campeonReal = this.campeon(resultados, ajustes);
    const manualPorUid = {};
    (puntosManuales || []).forEach(pm => {
      manualPorUid[pm.uid] = (manualPorUid[pm.uid] || 0) + (Number(pm.pts) || 0);
    });
    const filas = usuarios
      .filter(u => u.estado === 'activo')
      .map(u => {
        const preds = todasPred[u.uid] || {};
        let pts = 0, exactos = 0, aciertos = 0, jugadas = 0;
        FIXTURE.partidos.forEach(p => {
          const res = resultados[p.id];
          const pr = preds[p.id];
          if (pr) jugadas++;
          const c = this.calificar(pr, res, p.fase);
          pts += c.pts;
          if (c.tipo === 'exacto') exactos++;
          if (c.tipo === 'resultado') aciertos++;
        });
        let bono = 0;
        if (campeonReal && u.campeon === campeonReal) { bono = CONFIG.REGLAS.bonusCampeon; pts += bono; }
        // Sumar puntos manuales (ajustes del admin)
        const ptsManual = manualPorUid[u.uid] || 0;
        pts += ptsManual;

        // Racha: partidos finalizados consecutivos (más reciente primero) con pts > 0
        const finalizados = FIXTURE.partidos
          .filter(p => p.local && p.visitante && resultados[p.id]?.estado === 'finalizado')
          .sort((a, b) => (b.utc || b.fecha + 'Z').localeCompare(a.utc || a.fecha + 'Z'));
        let racha = 0;
        for (const p of finalizados) {
          const pr = preds[p.id];
          if (!pr) break;
          const c = this.calificar(pr, resultados[p.id], p.fase);
          if (c.pts > 0) racha++; else break;
        }

        return {
          uid: u.uid, nombre: u.nombre, area: u.area, vinculo: u.vinculo,
          moneda: u.moneda, pagado: !!u.pagado, campeon: u.campeon,
          pts, exactos, aciertos, jugadas, bono, racha, creado: u.creado || 0
        };
      })
      .sort((a, b) =>
        b.pts - a.pts || b.exactos - a.exactos || b.aciertos - a.aciertos || a.creado - b.creado
      );
    filas.forEach((f, i) => f.pos = i + 1);
    return filas;
  },

  /* Tablas de los 12 grupos del Mundial con los partidos finalizados. */
  gruposMundial(resultados) {
    const tablas = {};
    Object.entries(FIXTURE.grupos).forEach(([g, codes]) => {
      const f = {};
      codes.forEach(c => f[c] = { code: c, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
      FIXTURE.partidos.filter(p => p.fase === 'grupos' && p.grupo === g).forEach(p => {
        const r = resultados[p.id];
        if (!r || r.estado !== 'finalizado') return;
        const L = f[p.local], V = f[p.visitante];
        L.pj++; V.pj++; L.gf += r.gl; L.gc += r.gv; V.gf += r.gv; V.gc += r.gl;
        if (r.gl > r.gv) { L.pg++; V.pp++; }
        else if (r.gl < r.gv) { V.pg++; L.pp++; }
        else { L.pe++; V.pe++; }
      });
      tablas[g] = Object.values(f)
        .map(t => ({ ...t, dg: t.gf - t.gc, pts: t.pg * 3 + t.pe }))
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.code.localeCompare(b.code));
    });
    return tablas;
  },

  /* Bote y reparto por moneda (para la página de cuentas). */
  bote(usuarios, salaConfig) {
    const porMoneda = {};
    if (salaConfig && salaConfig.cuota > 0) {
      // Sala privada con cuota específica
      const m = porMoneda[salaConfig.moneda] = { total: 0, pagado: 0, personas: 0, alDia: 0 };
      const cuota = salaConfig.cuota;
      usuarios.filter(u => u.estado === 'activo').forEach(u => {
        m.personas++;
        m.total += cuota;
        if (u.pagado) {
          m.pagado += cuota;
          m.alDia++;
        }
      });
    } else {
      // Sala principal, usa cuotas globales por moneda de usuario
      usuarios.filter(u => u.estado === 'activo').forEach(u => {
        const m = porMoneda[u.moneda] = porMoneda[u.moneda] || { total: 0, pagado: 0, personas: 0, alDia: 0 };
        const cuota = (CONFIG.CUOTAS[u.moneda] || { valor: 0 }).valor;
        m.personas++; m.total += cuota;
        if (u.pagado) { m.pagado += cuota; m.alDia++; }
      });
    }
    return porMoneda;
  }
};
window.Puntos = Puntos;
