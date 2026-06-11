/* ============================================================
   POLLA SIIGO 2026 — PROXY DE RESULTADOS EN VIVO
   Cloudflare Worker (plan gratuito: 100.000 peticiones/día)
   ------------------------------------------------------------
   ¿Para qué existe? La llave de API-Football NO puede ir en el
   código del navegador (cualquiera la vería y la gastaría).
   Este Worker la guarda como secreto, consulta la API y cachea
   la respuesta 30 segundos para que 200 empleados mirando la
   polla no quemen el plan gratuito (100 peticiones/día a la API).

   DESPLIEGUE (5 minutos, ver README sección 6):
     npm i -g wrangler
     wrangler login
     wrangler deploy proxy/cloudflare-worker.js --name polla-proxy
     wrangler secret put API_FOOTBALL_KEY        ← pega la llave
     (opcional) wrangler secret put ORIGEN_PERMITIDO
                ej: https://polla.siigo.com
   Luego copia la URL del Worker en CONFIG.API_FUTBOL.proxyUrl.
   ============================================================ */

const API_BASE = 'https://v3.football.api-sports.io';
const LIGA_MUNDIAL = 1;        // id de la Copa del Mundo en API-Football
const TEMPORADA = 2026;
const CACHE_SEGUNDOS = 30;

export default {
  async fetch(peticion, env, ctx) {
    const url = new URL(peticion.url);
    const origen = peticion.headers.get('Origin') || '';
    const permitido = (env.ORIGEN_PERMITIDO || '*');
    const cors = {
      'Access-Control-Allow-Origin':
        permitido === '*' ? '*' : (origen === permitido ? origen : permitido),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (peticion.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (peticion.method !== 'GET') {
      return new Response('Método no permitido', { status: 405, headers: cors });
    }
    if (url.pathname !== '/fixtures') {
      return new Response(JSON.stringify({ error: 'Ruta no encontrada. Usa /fixtures' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (!env.API_FOOTBALL_KEY) {
      return new Response(JSON.stringify({ error: 'Falta el secreto API_FOOTBALL_KEY en el Worker.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    /* Parámetros que el navegador puede pasar (lista blanca). */
    const upstream = new URL(API_BASE + '/fixtures');
    upstream.searchParams.set('league', String(LIGA_MUNDIAL));
    upstream.searchParams.set('season', String(TEMPORADA));
    for (const p of ['date', 'live']) {
      if (url.searchParams.has(p)) upstream.searchParams.set(p, url.searchParams.get(p));
    }

    /* Caché de 30 s: muchos espectadores, una sola consulta real. */
    const cache = caches.default;
    const claveCache = new Request(upstream.toString(), { method: 'GET' });
    let respuesta = await cache.match(claveCache);

    if (!respuesta) {
      const r = await fetch(upstream.toString(), {
        headers: { 'x-apisports-key': env.API_FOOTBALL_KEY }
      });
      const cuerpo = await r.text();
      respuesta = new Response(cuerpo, {
        status: r.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_SEGUNDOS}`
        }
      });
      if (r.ok) ctx.waitUntil(cache.put(claveCache, respuesta.clone()));
    }

    const final = new Response(respuesta.body, respuesta);
    Object.entries(cors).forEach(([k, v]) => final.headers.set(k, v));
    return final;
  }
};
