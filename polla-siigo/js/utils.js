/* ============================================================
   POLLA SIIGO 2026 — UTILIDADES COMPARTIDAS
   Seguridad: TODO texto que venga de un usuario pasa por
   U.esc() antes de tocar el DOM. Nunca usar innerHTML con
   datos de usuario sin escapar.
   ============================================================ */

const U = {

  /* --- Seguridad ------------------------------------------- */
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  correoValido(c) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || '').trim());
  },

  esCorreoEmpresa(c) {
    const dominio = String(CONFIG.DOMINIO_EMPRESA || 'siigo.com').toLowerCase();
    return String(c || '').toLowerCase().trim().endsWith('@' + dominio);
  },

  esAdmin(correo) {
    return (CONFIG.ADMINS || [])
      .filter(Boolean)
      .map(a => String(a).toLowerCase())
      .includes(String(correo || '').toLowerCase());
  },

  async sha256(texto) {
    const data = new TextEncoder().encode(texto);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /* --- Fechas (todo se guarda en UTC, se muestra en la zona
         horaria del navegador de cada persona) ---------------- */
  ahora() { return new Date(); },

  fechaLarga(iso) {                       // '2026-06-11' → 'jueves 11 de junio'
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  },

  horaLocal(utcISO) {                     // hora del partido en la zona del usuario
    if (!utcISO) return '';
    return new Date(utcISO).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace('a. m.', 'a.m.').replace('p. m.', 'p.m.');
  },

  diaLocal(utcISO) {
    if (!utcISO) return '';
    return new Date(utcISO).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  },

  cuentaRegresiva(utcISO) {               // → {d,h,m,s, ms} hasta el evento
    const ms = new Date(utcISO) - new Date();
    const t = Math.max(0, ms);
    return {
      ms,
      d: Math.floor(t / 864e5),
      h: Math.floor(t / 36e5) % 24,
      m: Math.floor(t / 6e4) % 60,
      s: Math.floor(t / 1e3) % 60
    };
  },

  fechaActualizacion(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  },

  /* Estado efectivo de un partido según la hora y los datos. */
  estadoPartido(p, res) {
    if (res && res.estado) return res.estado; // 'en_juego' | 'finalizado' | 'aplazado' (puesto por API/admin)
    if (!p.utc) return 'sin_definir';         // eliminatoria sin equipos/fecha

    // Para partidos con hora NO confirmada, solo cerramos si ya es el día del partido.
    // Esto evita cierres prematuros si el fixture tiene una fecha pasada por error.
    if (p.horaOk === false) {
      const hoy = new Date();
      const diaPartido = new Date(p.utc);
      // Comparamos solo la fecha, ignorando la hora.
      hoy.setHours(0, 0, 0, 0);
      diaPartido.setHours(0, 0, 0, 0);

      if (hoy.getTime() < diaPartido.getTime()) {
        return 'programado'; // Si el día del partido aún no ha llegado, sigue programado.
      }
    }

    const cierre = new Date(p.utc).getTime() - (5 * 60 * 1000); // Cierra 5 minutos antes del pitazo
    return (Date.now() >= cierre) ? 'cerrado' : 'programado'; // Si ya pasó la hora de cierre, se cierra.
  },

  abierto(p, res) { // ¿Se puede pronosticar? Devuelve `true` o el estado que lo impide.
    const e = this.estadoPartido(p, res);
    if (e === 'programado' && p.local && p.visitante) {
      return true; // Sí se puede pronosticar.
    }
    // No se puede pronosticar, devuelve la razón.
    return e;
  },

  /* --- Dinero ----------------------------------------------- */
  moneda(valor, codigo) {
    const m = CONFIG.CUOTAS[codigo] || { simbolo: '', nombre: codigo };
    return `${m.simbolo} ${Number(valor).toLocaleString('es-CO')} ${codigo}`;
  },

  /* --- UI: toasts y confirmaciones --------------------------- */
  toast(msg, tipo = 'ok') {
    let cont = document.querySelector('.toasts');
    if (!cont) { cont = document.createElement('div'); cont.className = 'toasts'; document.body.appendChild(cont); }
    const t = document.createElement('div');
    t.className = `toast toast--${tipo}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => { t.classList.add('toast--fuera'); setTimeout(() => t.remove(), 350); }, 3400);
  },

  /* --- Sesión / navegación ----------------------------------- */
  requiereSesion(usuario) {
    if (!usuario) { location.href = 'index.html'; return false; }
    return true;
  },

  iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  },

  params() { return new URLSearchParams(location.search); }
};
window.U = U;
