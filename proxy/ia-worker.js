/**
 * POLLA SIIGO — Proxy IA (Cloudflare Worker)
 * ============================================================
 * CÓMO DESPLEGAR (solo una vez):
 *
 * 1. Ve a https://workers.cloudflare.com y crea una cuenta gratis.
 * 2. Crea un nuevo Worker y pega TODO este archivo.
 * 3. En "Settings → Variables → Secrets", agrega:
 *      Nombre : ANTHROPIC_API_KEY
 *      Valor  : tu clave de Anthropic (sk-ant-...)
 * 4. Despliega. Copia la URL que te dan (ej: https://ia-polla.TU-USUARIO.workers.dev)
 * 5. Pégala en CONFIG.IA.proxyUrl en polla-siigo/js/config.js
 * ============================================================
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const { prompt, sistema } = body;
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Falta el campo "prompt"' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el Worker' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: sistema || 'Eres un analista deportivo experto en fútbol mundial. Responde siempre en español con tablas y viñetas bien formateadas en Markdown.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: 'Error Anthropic: ' + err }), {
        status: resp.status, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const data = await resp.json();
    const texto = data.content?.[0]?.text ?? '';

    return new Response(JSON.stringify({ texto }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
};
