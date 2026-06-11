// js/config.js
export const CONFIG = {
    MODO: 'firebase', // 👈 Asegúrate de cambiarlo de 'demo' a 'firebase'
    URL_PUBLICA: 'https://polla-mundialista-siigo.web.app',
    DOMINIO_EMPRESA: 'siigo.com',
    APROBAR_EXTERNOS_AUTO: true,
    
    // 👇 Aquí quedan tus credenciales reales de Google
    FIREBASE: {
        apiKey: "AIzaSyCBuA2VZb8ipHhL5fQq8irP_yo2S093MMI",
        authDomain: "polla-mundialista-siigo.firebaseapp.com",
        projectId: "polla-mundialista-siigo",
        storageBucket: "polla-mundialista-siigo.firebasestorage.app",
        messagingSenderId: "484395395836",
        appId: "1:484395395836:web:13a9144604e6fe010f4579"
    },

    ADMINS: [
        'nicolas.nieto@siigo.com',
        'juan.rodriguez.pe@siigo.com' // Tu correo de administrador
    ],
    /* ----------------------------------------------------------
       4. CORREOS (EmailJS — https://www.emailjs.com)
       Plan gratuito: 200 correos/mes. Ver README para crear las
       3 plantillas. Si se deja vacío, la app simplemente no envía
       correos (no falla).
    ---------------------------------------------------------- */
  EMAILJS: {
    publicKey: 'ZN_Wc-KP2FtEIoFWx',
    serviceId: 'service_123',
    plantillas: {
      bienvenida: '{{nombre}}, {{correo}}, {{url}}',      // variables: {{nombre}}, {{correo}}, {{url}}
      recordatorio: '{{nombre}}, {{correo}}, {{partidos}}, {{url}}',    // variables: {{nombre}}, {{correo}}, {{partidos}}, {{url}}
      resumen: '{{nombre}}, {{correo}}, {{resultados}}, {{posicion}}, {{puntos}}, {{url}}'          // variables: {{nombre}}, {{correo}}, {{resultados}}, {{posicion}}, {{puntos}}, {{url}}
    }
  },

  /* ----------------------------------------------------------
     5. RESULTADOS EN VIVO
     La llave del proveedor de datos NUNCA va aquí (sería pública).
     Va en el proxy (proxy/cloudflare-worker.js). Aquí solo se
     pega la URL del Worker una vez desplegado.
     Proveedor recomendado: API-Football (api-sports.io),
     plan gratuito 100 peticiones/día.
  ---------------------------------------------------------- */
  API_FUTBOL: {
    proxyUrl: 'https://v3.football.api-sports.io', // URL directa de la API
    apiKey: '3f88991155250f77b5cca0626b9a007b',   // Tu llave directa
    intervaloSegundos: 60,        // frecuencia de refresco con partidos en vivo
    sincronizaCalendario: true    // permite al admin traer fechas/horas oficiales
  },

  /* ----------------------------------------------------------
     6. REGLAS DE PUNTUACIÓN (editable antes del primer partido)
  ---------------------------------------------------------- */
  REGLAS: {
    grupos:        { exacto: 3, resultado: 1 },  // marcador exacto / acertar ganador o empate
    eliminatorias: { exacto: 5, resultado: 2 },  // se califica el marcador a los 90' (+prórroga si la hay, sin penales)
    bonusCampeon: 10,                            // por acertar el campeón (se elige antes del primer partido)
    cierreCampeonUTC: '2026-06-11T19:00:00Z'     // pitazo inicial México vs Sudáfrica
  },

  /* Desempates, en orden: 1) puntos, 2) marcadores exactos,
     3) aciertos de resultado, 4) registro más antiguo. */

  /* ----------------------------------------------------------
     7. DINERO — solo registro, NO se hacen transacciones aquí.
     Cada quien elige su moneda al registrarse y paga la cuota
     equivalente por fuera de la app (Nequi, transferencia, etc.)
     al tesorero. Valores editables.
  ---------------------------------------------------------- */
  CUOTAS: {
    COP: { valor: 20000, simbolo: '$',   nombre: 'Peso colombiano' },
    MXN: { valor: 220,   simbolo: '$',   nombre: 'Peso mexicano' },
    CLP: { valor: 11000, simbolo: '$',   nombre: 'Peso chileno' },
    UYU: { valor: 500,   simbolo: '$U',  nombre: 'Peso uruguayo' },
    VES: { valor: 1300,  simbolo: 'Bs.', nombre: 'Bolívar venezolano' },
    ARS: { valor: 16000, simbolo: '$',   nombre: 'Peso argentino' },
    PEN: { valor: 45,    simbolo: 'S/',  nombre: 'Sol peruano' },
    USD: { valor: 12,    simbolo: 'US$', nombre: 'Dólar' },
    EUR: { valor: 11,    simbolo: '€',   nombre: 'Euro' }
  },
  TESORERO: 'Nicolás Nieto Daza (Soporte IT)',

  /* Reparto del bote en porcentajes (deben sumar 100). */
  PREMIOS: [
    { puesto: '🥇 1.er lugar', pct: 60 },
    { puesto: '🥈 2.º lugar', pct: 25 },
    { puesto: '🥉 3.er lugar', pct: 10 },
    { puesto: '🐢 Último lugar (consuelo)', pct: 5 }
  ],

  /* ----------------------------------------------------------
     8. VARIOS
  ---------------------------------------------------------- */
  URL_PUBLICA: 'https://polla-siigo.web.app',  // cambiar al dominio final, ej. https://polla.siigo.com
  MAX_GOLES: 15,                                // tope del marcador en un pronóstico
  VERSION: '1.0.0'
};

/* No editar debajo de esta línea -------------------------- */
Object.freeze(CONFIG.REGLAS);
window.CONFIG = CONFIG;
