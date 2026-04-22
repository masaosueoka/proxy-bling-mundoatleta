// api/auth.js — Trocar código de autorização por refresh_token (rodar 1 vez)
// Acessar: https://seu-proxy.vercel.app/api/auth?code=CODIGO_DO_BLING

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { code } = req.query;
  if (!code) {
    return res.status(400).json({
      error: 'Faltou o parâmetro code',
      instrucao: 'Acesse o link de autorização do Bling, autorize, e cole a URL completa de retorno aqui'
    });
  }

  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;
  const redirectUri = process.env.BLING_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({ error: 'BLING_CLIENT_ID, BLING_CLIENT_SECRET ou BLING_REDIRECT_URI não configurados' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const resp = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Bling rejeitou', detail: data });
    }

    return res.status(200).send(`
      <html><head><meta charset="utf-8"><title>Token gerado</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 40px; max-width: 720px; margin: 0 auto; background: #faf8f5; }
        .box { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        h1 { color: #5B3FD6; margin-bottom: 8px; }
        .ok { color: #10b981; font-weight: 700; }
        code { background: #f3f3f3; padding: 12px; border-radius: 8px; display: block; margin: 12px 0; word-break: break-all; font-size: 13px; }
        .step { background: #fff5e6; border-left: 4px solid #F18A1F; padding: 14px 18px; margin: 16px 0; border-radius: 8px; }
        .copy-btn { background: #5B3FD6; color: white; border: none; padding: 10px 20px; border-radius: 50px; cursor: pointer; font-weight: 700; }
      </style></head>
      <body>
        <div class="box">
          <h1>✅ Sucesso!</h1>
          <p class="ok">Refresh token gerado.</p>

          <div class="step">
            <strong>👉 Próximo passo:</strong> Copie o REFRESH_TOKEN abaixo e adicione como variável de ambiente <code>BLING_REFRESH_TOKEN</code> no Vercel.
          </div>

          <h3>REFRESH_TOKEN (guarde com segurança):</h3>
          <code id="rt">${data.refresh_token}</code>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('rt').textContent); this.textContent='✓ Copiado!'">📋 Copiar</button>

          <div class="step" style="margin-top:24px">
            <strong>Como adicionar no Vercel:</strong><br>
            1. Acesse seu projeto no Vercel<br>
            2. Settings → Environment Variables<br>
            3. Adicione: <code style="display:inline;padding:2px 8px">BLING_REFRESH_TOKEN</code> = (cole o token acima)<br>
            4. Faça um Redeploy do projeto
          </div>

          <details style="margin-top:24px">
            <summary>Ver resposta completa do Bling</summary>
            <code style="font-size:11px">${JSON.stringify(data, null, 2)}</code>
          </details>
        </div>
      </body></html>
    `).setHeader('Content-Type', 'text/html');

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
