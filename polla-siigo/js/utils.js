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

  /* Estado efectivo de un partido según la hora y los datos. */
  estadoPartido(p, res) {
    if (res && res.estado) return res.estado;            // 'en_juego' | 'finalizado' (puesto por API/admin)
    if (!p.utc) return 'sin_definir';                    // eliminatoria sin equipos/fecha
    return (new Date(p.utc) <= new Date()) ? 'cerrado' : 'programado';
  },

  abierto(p, res) {                                      // ¿se puede pronosticar?
    const e = this.estadoPartido(p, res);
    return e === 'programado' && p.local && p.visitante;
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
