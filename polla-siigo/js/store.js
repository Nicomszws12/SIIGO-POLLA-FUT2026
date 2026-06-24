/* ============================================================
   POLLA SIIGO 2026 — CAPA DE DATOS (Store)
   ------------------------------------------------------------
   Una sola interfaz, dos motores:
   • MODO 'demo'     → localStorage del navegador (probar ya).
   • MODO 'firebase' → Firebase Auth + Cloud Firestore (real).
   Las páginas solo hablan con `Store`, nunca con el motor.
   ============================================================ */
import { CONFIG } from './config.js';

const Store = (() => {

  /* =========================================================
     MOTOR DEMO (localStorage) — datos solo en este navegador
     ========================================================= */
  const LS = 'pollaSiigo';
  const _db = () => JSON.parse(localStorage.getItem(LS) || '{"usuarios":{},"predicciones":{},"resultados":{},"ajustes":{},"tabla":null}');
  const _save = d => localStorage.setItem(LS, JSON.stringify(d));
  const _sesKey = LS + 'Sesion';

  const demo = {
    async init() {},

    async registrar(datos) {
      const d = _db();
      const correo = String(datos.correo || '').toLowerCase().trim();
      if (Object.values(d.usuarios).some(u => u.correo === correo)) {
        throw new Error('Ya existe una cuenta con ese correo.');
      }
      const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const esEmpleado = U.esCorreoEmpresa(correo);
      const u = {
        uid, correo,
        nombre: datos.nombre.trim(),
        area: datos.area.trim(),
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: datos.moneda,
        claveHash: await U.sha256(datos.clave),
        rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      d.usuarios[uid] = u; _save(d);
      sessionStorage.setItem(_sesKey, uid);
      return { ...u };
    },

    async login(correo, clave) {
      correo = String(correo || '').toLowerCase().trim();
      clave = String(clave || '');
      if (!correo) throw new Error('Introduce un correo válido para iniciar sesión.');
      if (!clave) throw new Error('Introduce tu contraseña para iniciar sesión.');
      const d = _db();
      const u = Object.values(d.usuarios).find(x => x.correo === correo);
      if (!u || u.claveHash !== await U.sha256(clave)) throw new Error('Correo o contraseña incorrectos.');
      sessionStorage.setItem(_sesKey, u.uid);
      return { ...u };
    },

    async loginGoogle() {
      throw new Error('El inicio de sesión con Google solo está disponible en modo Firebase. Cambia CONFIG.MODO a "firebase" para usarlo.');
    },

    async logout() { sessionStorage.removeItem(_sesKey); },

    async sesion() {
      const uid = sessionStorage.getItem(_sesKey);
      return uid ? (_db().usuarios[uid] ? { ..._db().usuarios[uid] } : null) : null;
    },

    async usuarios() { return Object.values(_db().usuarios).map(u => ({ ...u, claveHash: undefined })); },

    async actualizarUsuario(uid, cambios) {
      const d = _db();
      if (!d.usuarios[uid]) throw new Error('No existe el participante.');
      Object.assign(d.usuarios[uid], cambios); _save(d);
    },

    async eliminarUsuario(uid) {
      const d = _db();
      delete d.usuarios[uid];
      Object.keys(d.predicciones).filter(k => k.startsWith(uid + '__')).forEach(k => delete d.predicciones[k]);
      _save(d);
    },

    async guardarPrediccion(uid, pid, gl, gv) {
      const d = _db();
      d.predicciones[`${uid}__${pid}`] = { uid, pid, gl, gv, t: Date.now() };
      _save(d);
    },

    async predicciones(uid) {
      const d = _db(), out = {};
      Object.values(d.predicciones).filter(p => p.uid === uid).forEach(p => out[p.pid] = p);
      return out;
    },

    async prediccionesPartido(pid) {
      return Object.values(_db().predicciones).filter(p => p.pid === pid);
    },

    async todasPredicciones() {
      const out = {};
      Object.values(_db().predicciones).forEach(p => {
        (out[p.uid] = out[p.uid] || {})[p.pid] = p;
      });
      return out;
    },

    async resultados() { return _db().resultados; },

    async guardarResultado(pid, res) {
      const d = _db();
      d.resultados[pid] = { ...d.resultados[pid], ...res, t: Date.now() }; _save(d);
    },

    async ajustes() { return _db().ajustes; },

    async guardarAjuste(pid, aj) {
      const d = _db();
      d.ajustes[pid] = { ...d.ajustes[pid], ...aj }; _save(d);
    },

    async tablaPublicada() { return _db().tabla; },
    async publicarTabla(tabla) { const d = _db(); d.tabla = { filas: tabla, t: Date.now() }; _save(d); },

    enCambios(cb) {
      window.addEventListener('storage', e => { if (e.key === LS) cb(); });
      return () => {};
    },

    async reclamarSincronizacion() { return true; },

    async registrarIntentoTrampa(uid, nombre, pid, gl, gv, motivo) {
      const d = _db();
      if (!d.intentos_trampa) d.intentos_trampa = [];
      d.intentos_trampa.push({ uid, nombre, pid, gl, gv, motivo, t: Date.now() });
      _save(d);
    },

    async intentosTrampa() {
      return (_db().intentos_trampa || []).slice().sort((a, b) => b.t - a.t);
    },

    async registrarHistorial(uid, nombre, pid, gl, gv, glPrev, gvPrev) {
      const d = _db();
      if (!d.historial_predicciones) d.historial_predicciones = [];
      d.historial_predicciones.push({ uid, nombre, pid, gl, gv, glPrev: glPrev ?? null, gvPrev: gvPrev ?? null, t: Date.now() });
      _save(d);
    },

    async historialPredicciones() {
      return (_db().historial_predicciones || []).slice().sort((a, b) => b.t - a.t);
    },

    async puntosManuales() {
      const d = _db();
      return d.puntos_manuales || [];
    },

    async guardarPuntoManual(uid, pid, pts, razon) {
      const d = _db();
      if (!d.puntos_manuales) d.puntos_manuales = [];
      const idx = d.puntos_manuales.findIndex(pm => pm.uid === uid && pm.pid === pid);
      const entrada = { uid, pid, pts: Number(pts), razon: razon || '', t: Date.now() };
      if (idx >= 0) d.puntos_manuales[idx] = entrada;
      else d.puntos_manuales.push(entrada);
      _save(d);
    },

    async quitarPuntoManual(uid, pid) {
      const d = _db();
      if (!d.puntos_manuales) return;
      d.puntos_manuales = d.puntos_manuales.filter(pm => !(pm.uid === uid && pm.pid === pid));
      _save(d);
    },

    async cargarEjemplo() {
      const d = _db();
      const gente = [
        ['Laura Méndez', 'Comercial', 'COP'], ['Carlos Pérez', 'Soporte IT', 'COP'],
        ['Ana Sofía Ruiz', 'Producto', 'MXN'], ['Jorge Castillo', 'Finanzas', 'COP'],
        ['Valentina Gómez', 'Marketing', 'CLP'], ['Tío Hernando', 'Invitado', 'COP'],
        ['Diego Martínez', 'Desarrollo', 'UYU'], ['Paola Sierra', 'Talento Humano', 'VES']
      ];
      for (const [nombre, area, moneda] of gente) {
        const correo = nombre.toLowerCase().replace(/[^a-z]+/g, '.') + (area === 'Invitado' ? '@gmail.com' : '@siigo.com');
        if (Object.values(d.usuarios).some(u => u.correo === correo)) continue;
        const uid = 'demo' + Math.random().toString(36).slice(2, 8);
        d.usuarios[uid] = {
          uid, correo, nombre, area, moneda,
          vinculo: area === 'Invitado' ? 'externo' : 'empleado',
          claveHash: 'x', rol: 'jugador', estado: 'activo',
          pagado: Math.random() > 0.4,
          campeon: ['ARG', 'BRA', 'ESP', 'FRA', 'COL', 'ENG'][Math.floor(Math.random() * 6)],
          creado: Date.now() - Math.floor(Math.random() * 864e5)
        };
        FIXTURE.partidos.filter(p => p.fase === 'grupos').forEach(p => {
          if (Math.random() < 0.85) {
            d.predicciones[`${uid}__${p.id}`] = {
              uid, pid: p.id,
              gl: Math.floor(Math.random() * 4), gv: Math.floor(Math.random() * 3), t: Date.now()
            };
          }
        });
      }
      _save(d);
    },

    /* ---- SALAS PRIVADAS (demo) - Funciones simplificadas ---- */
    async usuariosSala() {
      return this.usuarios();
    },

    async guardarPrediccionSala(uid, pid, gl, gv) {
      await this.guardarPrediccion(uid, pid, gl, gv);
    },

    async prediccionesSala(uid) {
      return this.predicciones(uid);
    },

    async todasPrediccionesSala() {
      return this.todasPredicciones();
    },
  };

  /* =========================================================
     MOTOR FIREBASE (producción)
     ========================================================= */
  let fb = null, fdb = null, _perfilCache = null;

  function _cargarScript(src) {
    return new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => err(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  const firebaseStore = {
    async init() {
      const v = '10.12.2';
      await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
      await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-auth-compat.js`);
      await _cargarScript(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore-compat.js`);
      fb = window.firebase;
      fb.initializeApp(CONFIG.FIREBASE);
      fdb = fb.firestore();
      await new Promise(ok => { const off = fb.auth().onAuthStateChanged(() => { off(); ok(); }); });
    },

    async registrar(datos) {
      const correo = String(datos.correo || '').toLowerCase().trim();
      const clave = String(datos.clave || '');
      if (!correo) throw new Error('Introduce un correo válido para registrarte.');
      if (!clave) throw new Error('Introduce una contraseña para registrarte.');
      let cred;
      try {
        cred = await fb.auth().createUserWithEmailAndPassword(correo, clave);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          throw new Error('Este correo ya está registrado. Usa Entrar o Iniciar sesión con Google si ya tenías cuenta.');
        }
        console.error("🔥 Error Firebase (Registro):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
      try { await cred.user.sendEmailVerification(); } catch (e) { /* opcional */ }
      const esEmpleado = U.esCorreoEmpresa(correo);
      const perfil = {
        uid: cred.user.uid, correo,
        nombre: datos.nombre.trim(), area: datos.area.trim(),
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: datos.moneda,
        rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      try {
        await fdb.collection('usuarios').doc(perfil.uid).set(perfil);
      } catch (err) {
        console.error("🔥 Error al guardar perfil de registro:", err);
        alert("Tu cuenta se creó pero la base de datos rechazó tu perfil: " + err.message);
        throw err;
      }
      _perfilCache = perfil;
      return { ...perfil };
    },

    async login(correo, clave) {
      correo = String(correo || '').toLowerCase().trim();
      clave = String(clave || '');
      if (!correo) throw new Error('Introduce un correo válido para iniciar sesión.');
      if (!clave) throw new Error('Introduce tu contraseña para iniciar sesión.');
      try {
        const cred = await fb.auth().signInWithEmailAndPassword(correo, clave);
        const doc = await fdb.collection('usuarios').doc(cred.user.uid).get();
        if (!doc.exists) throw new Error('Tu cuenta no tiene perfil. Contacta al administrador.');
        _perfilCache = doc.data();
        return { ..._perfilCache };
      } catch (err) {
        console.error("🔥 Error Firebase (Login):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
    },

    async loginGoogle() {
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      let cred;
      try {
        cred = await fb.auth().signInWithPopup(provider);
      } catch (err) {
        if (err.code === 'auth/account-exists-with-different-credential') {
          throw new Error('Ya existe una cuenta con este correo. Usa tu contraseña o contacta a Soporte IT.');
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error('El inicio de sesión con Google no está habilitado en la consola de Firebase.');
        }
        if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('Cancelaste el inicio de sesión con Google (ventana cerrada).');
        }
        console.error("🔥 Error Firebase (Google):", err);
        alert("Fallo en Firebase: " + err.message);
        throw err;
      }
      const correo = String(cred?.user?.email || '').toLowerCase().trim();
      if (!correo) throw new Error('No se pudo obtener el correo desde Google. Intenta con otro método.');
      const docRef = fdb.collection('usuarios').doc(cred.user.uid);
      const perfilSnap = await docRef.get();
      if (perfilSnap.exists) {
        _perfilCache = perfilSnap.data();
        return { ..._perfilCache };
      }
      const nombre = cred.user.displayName || correo.split('@')[0];
      const esEmpleado = U.esCorreoEmpresa(correo);
      const perfil = {
        uid: cred.user.uid, correo, nombre, area: 'Google',
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: 'COP', rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false, campeon: null, creado: Date.now()
      };
      try { await docRef.set(perfil); } catch (err) {
        console.error("🔥 Error al guardar perfil de Google:", err);
        alert("Google te dejó entrar, pero Firestore rechazó guardar tu perfil.\n\nError: " + err.message);
        throw err;
      }
      _perfilCache = perfil;
      return { ...perfil };
    },

    async logout() { _perfilCache = null; await fb.auth().signOut(); },

    async sesion() {
      return new Promise((resolve) => {
        const unsubscribe = fb.auth().onAuthStateChanged(async (u) => {
          unsubscribe();
          if (!u) return resolve(null);
          if (_perfilCache && _perfilCache.uid === u.uid) return resolve({ ..._perfilCache });
          try {
            const doc = await fdb.collection('usuarios').doc(u.uid).get();
            _perfilCache = doc.exists ? doc.data() : null;
            resolve(_perfilCache ? { ..._perfilCache } : null);
          } catch (err) {
            console.error("🔥 Error Firebase (sesion):", err);
            alert("La base de datos bloqueó tu sesión al cambiar de pestaña.\n\nFalta publicar las Reglas de Seguridad en la consola de Firebase.");
            resolve(null);
          }
        });
      });
    },

    async usuarios() {
      try {
        const snap = await fdb.collection('usuarios').get();
        return snap.docs.map(d => d.data());
      } catch (err) {
        console.error("🔥 Error Firebase (Cargar Usuarios):", err);
        if (err.code === 'permission-denied') {
          alert("Acceso denegado por la base de datos.\n\nFalta crear el documento 'admins' en Firestore o las reglas de seguridad no están publicadas.");
        } else { alert("Error al cargar la lista: " + err.message); }
        throw err;
      }
    },

    async actualizarUsuario(uid, cambios) {
      try {
        await fdb.collection('usuarios').doc(uid).update(cambios);
        if (_perfilCache && _perfilCache.uid === uid) Object.assign(_perfilCache, cambios);
      } catch (err) {
        console.error("🔥 Error Firebase (actualizarUsuario):", err);
        alert("La base de datos bloqueó la acción. Si estás eligiendo a tu campeón, revisa que la fecha límite no haya pasado o contacta al administrador.\n\nError: " + err.message);
        throw err;
      }
    },

    async eliminarUsuario(uid) {
      await fdb.collection('usuarios').doc(uid).delete();
      const preds = await fdb.collection('predicciones').where('uid', '==', uid).get();
      const lote = fdb.batch(); preds.docs.forEach(d => lote.delete(d.ref)); await lote.commit();
    },

    async guardarPrediccion(uid, pid, gl, gv) {
      try {
        await fdb.collection('predicciones').doc(`${uid}__${pid}`)
          .set({ uid, pid, gl, gv, t: Date.now() });
      } catch (err) {
        console.error("🔥 Error Firebase (guardarPrediccion):", err);
        throw new Error("No se pudo guardar. Revisa que las reglas de Firebase estén actualizadas.");
      }
    },

    async predicciones(uid) {
      const snap = await fdb.collection('predicciones').where('uid', '==', uid).get();
      const out = {}; snap.docs.forEach(d => out[d.data().pid] = d.data()); return out;
    },

    async prediccionesPartido(pid) {
      const snap = await fdb.collection('predicciones').where('pid', '==', pid).get();
      return snap.docs.map(d => d.data());
    },

    async todasPredicciones() {
      try {
        const snap = await fdb.collection('predicciones').get();
        const out = {};
        snap.docs.forEach(d => { const p = d.data(); (out[p.uid] = out[p.uid] || {})[p.pid] = p; });
        return out;
      } catch (err) {
        console.error("🔥 Error Firebase (todasPredicciones):", err);
        alert("Error de permisos al descargar predicciones: " + err.message);
        throw err;
      }
    },

    async resultados() {
      try {
        const snap = await fdb.collection('resultados').get();
        const out = {}; snap.docs.forEach(d => out[d.id] = d.data()); return out;
      } catch (err) {
        console.error("🔥 Error Firebase (resultados):", err);
        alert("Error de permisos al descargar resultados: " + err.message);
        throw err;
      }
    },

    async guardarResultado(pid, res) {
      try {
        await fdb.collection('resultados').doc(pid).set({ ...res, t: Date.now() }, { merge: true });
      } catch (err) {
        console.error("🔥 Error Firebase (guardarResultado):", err);
        alert("No tienes permiso para guardar marcadores. Revisa tu correo en la colección 'configuracion' de Firestore.\n\nError: " + err.message);
        throw err;
      }
    },

    async ajustes() {
      try {
        const snap = await fdb.collection('ajustes').get();
        const out = {}; snap.docs.forEach(d => out[d.id] = d.data()); return out;
      } catch (err) {
        console.error("🔥 Error Firebase (ajustes):", err);
        alert("Error de permisos al descargar calendario: " + err.message);
        throw err;
      }
    },

    async guardarAjuste(pid, aj) {
      try {
        await fdb.collection('ajustes').doc(pid).set(aj, { merge: true });
      } catch (err) {
        console.error("🔥 Error Firebase (guardarAjuste):", err);
        alert("Error de permisos al ajustar el partido: " + err.message);
        throw err;
      }
    },

    async tablaPublicada() {
      try {
        const doc = await fdb.collection('publico').doc('tabla').get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        console.error("🔥 Error Firebase (tablaPublicada):", err);
        alert("La base de datos bloqueó la lectura de la tabla. Revisa las reglas de seguridad en Firestore.");
        return null;
      }
    },

    async publicarTabla(tabla) {
      try {
        await fdb.collection('publico').doc('tabla').set({ filas: tabla, t: Date.now() });
        alert("¡La tabla oficial se publicó correctamente para todos los jugadores!");
      } catch (err) {
        console.error("🔥 Error Firebase (Publicar Tabla):", err);
        alert("Fallo al publicar la tabla en Firebase: " + err.message);
      }
    },

    enCambios(cb) {
      return fdb.collection('resultados').onSnapshot(() => cb());
    },

    async reclamarSincronizacion() {
      const ref = fdb.collection('sincronizacion').doc('live');
      const ahora = Date.now();
      try {
        const doc = await ref.get();
        if (doc.exists && ahora < (doc.data().hasta || 0)) return false;
        // Aumentamos el tiempo de bloqueo a 120 segundos para dar más margen en redes lentas.
        await ref.set({ at: ahora, hasta: ahora + 120000 });
        return true;
      } catch { return false; }
    },

    async cargarEjemplo() { throw new Error('Los datos de ejemplo solo existen en modo demo.'); },

    async registrarIntentoTrampa(uid, nombre, pid, gl, gv, motivo) {
      try { await fdb.collection('intentos_trampa').add({ uid, nombre, pid, gl, gv, motivo, t: Date.now() }); }
      catch (e) { console.warn('No se pudo registrar intento trampa:', e); }
    },

    async intentosTrampa() {
      try {
        const snap = await fdb.collection('intentos_trampa').orderBy('t', 'desc').limit(200).get();
        return snap.docs.map(d => d.data());
      } catch (e) { console.warn('intentosTrampa:', e); return []; }
    },

    async registrarHistorial(uid, nombre, pid, gl, gv, glPrev, gvPrev) {
      try {
        await fdb.collection('historial_predicciones').add({ uid, nombre, pid, gl, gv, glPrev: glPrev ?? null, gvPrev: gvPrev ?? null, t: Date.now() });
      } catch (e) { console.warn('No se pudo registrar historial:', e); }
    },

    async historialPredicciones() {
      try {
        const snap = await fdb.collection('historial_predicciones').orderBy('t', 'desc').limit(500).get();
        return snap.docs.map(d => d.data());
      } catch (e) { console.warn('historialPredicciones:', e); return []; }
    },

    /* ---- SALAS PRIVADAS (Firebase) - Funciones simplificadas ---- */
    async usuariosSala() {
      return this.usuarios();
    },

    async guardarPrediccionSala(uid, pid, gl, gv) {
      return this.guardarPrediccion(uid, pid, gl, gv);
    },

    async prediccionesSala(uid) {
      return this.predicciones(uid);
    },

    async todasPrediccionesSala() {
      return this.todasPredicciones();
    },

    /* ---- PUNTOS MANUALES -------------------------------- */
    async puntosManuales() {
      try { const snap = await fdb.collection('puntos_manuales').get(); return snap.docs.map(d => d.data()); }
      catch (e) { console.warn('puntosManuales:', e); return []; }
    },

    async guardarPuntoManual(uid, pid, pts, razon) {
      await fdb.collection('puntos_manuales').doc(`${uid}__${pid}`).set({ uid, pid, pts: Number(pts), razon: razon || '', t: Date.now() });
    },

    async quitarPuntoManual(uid, pid) {
      await fdb.collection('puntos_manuales').doc(`${uid}__${pid}`).delete();
    },
  };

  /* ========================================================= */
  const motor = (CONFIG.MODO === 'firebase') ? firebaseStore : demo;
  motor.esDemo = CONFIG.MODO !== 'firebase';
  if (typeof motor.loginGoogle !== 'function') {
    motor.loginGoogle = async () => {
      throw new Error('El inicio de sesión con Google no está disponible. Cambia CONFIG.MODO a "firebase" o revisa la carga de Firebase.');
    };
  }
  return motor;
})();
window.Store = Store;