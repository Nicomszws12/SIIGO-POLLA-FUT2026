/* ============================================================
   POLLA SIIGO 2026 — CAPA DE DATOS (Store)
   ------------------------------------------------------------
   Una sola interfaz, dos motores:
   • MODO 'demo'     → localStorage del navegador (probar ya).
   • MODO 'firebase' → Firebase Auth + Cloud Firestore (real).
   Las páginas solo hablan con `Store`, nunca con el motor.
   ============================================================ */
import { CONFIG } from './config.js'; // 👈 AÑADE ESTA LÍNEA AQUÍ ARRIBA

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

    enCambios(cb) {                       // refresco si otra pestaña cambia datos
      window.addEventListener('storage', e => { if (e.key === LS) cb(); });
      return () => {};
    },

    /* Datos ficticios para probar tabla, cuentas y correos. */
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
    }
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
        uid: cred.user.uid,
        correo,
        nombre,
        area: 'Google',
        vinculo: esEmpleado ? 'empleado' : 'externo',
        moneda: 'COP',
        rol: U.esAdmin(correo) ? 'admin' : 'jugador',
        estado: (esEmpleado || CONFIG.APROBAR_EXTERNOS_AUTO || U.esAdmin(correo)) ? 'activo' : 'pendiente',
        pagado: false,
        campeon: null,
        creado: Date.now()
      };
      try {
        await docRef.set(perfil);
      } catch (err) {
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
          unsubscribe(); // Nos desuscribimos inmediatamente para no duplicar escuchas
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
        } else {
          alert("Error al cargar la lista: " + err.message);
        }
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

    enCambios(cb) {                       // marcadores en vivo en tiempo real
      return fdb.collection('resultados').onSnapshot(() => cb());
    },

    async reclamarSincronizacion() {
      const ref = fdb.collection('sincronizacion').doc('live');
      const ahora = Date.now();
      try {
        const doc = await ref.get();
        if (doc.exists && ahora < (doc.data().hasta || 0)) return false;
        await ref.set({ at: ahora, hasta: ahora + 70000 }); // reclama 70s (un ciclo + margen)
        return true;
      } catch { return false; }
    },

    async cargarEjemplo() { throw new Error('Los datos de ejemplo solo existen en modo demo.'); },

    async registrarIntentoTrampa(uid, nombre, pid, gl, gv, motivo) {
      try {
        await fdb.collection('intentos_trampa').add({ uid, nombre, pid, gl, gv, motivo, t: Date.now() });
      } catch (e) { console.warn('No se pudo registrar intento trampa:', e); }
    },

    async intentosTrampa() {
      try {
        const snap = await fdb.collection('intentos_trampa').orderBy('t', 'desc').limit(200).get();
        return snap.docs.map(d => d.data());
      } catch (e) { console.warn('intentosTrampa:', e); return []; }
    },

    async registrarHistorial(uid, nombre, pid, gl, gv, glPrev, gvPrev) {
      try {
        await fdb.collection('historial_predicciones').add({
          uid, nombre, pid, gl, gv,
          glPrev: glPrev ?? null, gvPrev: gvPrev ?? null,
          t: Date.now()
        });
      } catch (e) { console.warn('No se pudo registrar historial:', e); }
    },

    async historialPredicciones() {
      try {
        const snap = await fdb.collection('historial_predicciones').orderBy('t', 'desc').limit(500).get();
        return snap.docs.map(d => d.data());
      } catch (e) { console.warn('historialPredicciones:', e); return []; }
    },

    /* ---- SALAS PRIVADAS ------------------------------------------ */
    async crearSala(adminUid, nombre) {
      const codigo = Math.random().toString(36).slice(2, 8).toUpperCase();
      const ref = fdb.collection('salas').doc();
      const salaId = ref.id;
      const sala = { salaId, nombre: nombre.trim(), codigo, adminUid, creado: Date.now() };
      const lote = fdb.batch();
      lote.set(ref, sala);
      lote.set(fdb.collection('salaMiembros').doc(`${salaId}__${adminUid}`),
        { salaId, uid: adminUid, unido: Date.now(), rol: 'admin' });
      await lote.commit();
      return sala;
    },

    async unirseASala(codigo, uid) {
      const snap = await fdb.collection('salas')
        .where('codigo', '==', String(codigo).toUpperCase().trim()).limit(1).get();
      if (snap.empty) throw new Error('Código no encontrado. Pide el código al organizador de la sala.');
      const sala = snap.docs[0].data();
      const memRef = fdb.collection('salaMiembros').doc(`${sala.salaId}__${uid}`);
      if ((await memRef.get()).exists) throw new Error('Ya eres miembro de esta sala.');
      await memRef.set({ salaId: sala.salaId, uid, unido: Date.now(), rol: 'jugador' });
      return sala;
    },

    async misSalas(uid) {
      const snap = await fdb.collection('salaMiembros').where('uid', '==', uid).get();
      if (snap.empty) return [];
      const ids = [...new Set(snap.docs.map(d => d.data().salaId))].slice(0, 10);
      const salasSnap = await fdb.collection('salas')
        .where(fb.firestore.FieldPath.documentId(), 'in', ids).get();
      return salasSnap.docs.map(d => d.data());
    },

    async salaPorId(salaId) {
      if (salaId === 'siigo') return { salaId: 'siigo', nombre: 'Polla Siigo 2026', codigo: null, adminUid: null };
      const doc = await fdb.collection('salas').doc(salaId).get();
      return doc.exists ? doc.data() : null;
    },

    async miembrosDeSSala(salaId) {
      const snap = await fdb.collection('salaMiembros').where('salaId', '==', salaId).get();
      return snap.docs.map(d => d.data());
    },

    async eliminarMiembro(salaId, uid) {
      await fdb.collection('salaMiembros').doc(`${salaId}__${uid}`).delete();
    },

    async usuariosSala(salaId) {
      if (salaId === 'siigo') return this.usuarios();
      const miembros = await this.miembrosDeSSala(salaId);
      const uids = miembros.map(m => m.uid).slice(0, 10);
      if (!uids.length) return [];
      const s = await fdb.collection('usuarios')
        .where(fb.firestore.FieldPath.documentId(), 'in', uids).get();
      return s.docs.map(d => d.data());
    },

    async guardarPrediccionSala(salaId, uid, pid, gl, gv) {
      if (salaId === 'siigo') return this.guardarPrediccion(uid, pid, gl, gv);
      await fdb.collection('salas').doc(salaId).collection('predicciones')
        .doc(`${uid}__${pid}`).set({ uid, pid, gl, gv, t: Date.now() });
    },

    async prediccionesSala(salaId, uid) {
      if (salaId === 'siigo') return this.predicciones(uid);
      const snap = await fdb.collection('salas').doc(salaId).collection('predicciones')
        .where('uid', '==', uid).get();
      const out = {}; snap.docs.forEach(d => out[d.data().pid] = d.data()); return out;
    },

    async todasPrediccionesSala(salaId) {
      if (salaId === 'siigo') return this.todasPredicciones();
      const snap = await fdb.collection('salas').doc(salaId).collection('predicciones').get();
      const out = {};
      snap.docs.forEach(d => { const p = d.data(); (out[p.uid] = out[p.uid] || {})[p.pid] = p; });
      return out;
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
