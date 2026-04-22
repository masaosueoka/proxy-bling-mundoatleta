// api/produtos.js — Proxy serverless para Bling v3
// Faz OAuth2 + busca produtos + cache de token + rate limiting

let tokenCache = { access_token: null, expires_at: 0 };

// Pausa entre requisições para respeitar limite de 3/s do Bling
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.access_token && tokenCache.expires_at > now + 5 * 60 * 1000) {
    return tokenCache.access_token;
  }

  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;
  const refreshToken = process.env.BLING_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Variáveis de ambiente não configuradas (BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REFRESH_TOKEN)');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const resp = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth falhou (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  tokenCache = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in * 1000)
  };

  return data.access_token;
}

// Fetch com retry automático em caso de 429 (rate limit)
async function fetchComRetry(url, opts, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    const resp = await fetch(url, opts);
    if (resp.status !== 429) return resp;
    // Backoff exponencial: 500ms, 1s, 2s, 4s, 8s
    const espera = 500 * Math.pow(2, i);
    await sleep(espera);
  }
  return fetch(url, opts);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getAccessToken();
    const todos = [];
    let pagina = 1;
    const MAX_PAGS = 30;

    while (pagina <= MAX_PAGS) {
      const url = `https://api.bling.com.br/Api/v3/produtos?pagina=${pagina}&limite=100&situacao=A`;
      const r = await fetchComRetry(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: `Bling API erro ${r.status}`, detail: errText });
      }

      const data = await r.json();
      if (!data.data || data.data.length === 0) break;
      todos.push(...data.data);

      if (data.data.length < 100) break;
      pagina++;

      // Pausa de 400ms entre páginas (respeita 3 req/s)
      await sleep(400);
    }

    // Cache no edge: 10 min (reduz chamadas repetidas)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({ produtos: todos, total: todos.length });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
