import express from "express";
import net from "node:net";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.UI_PORT || 8099);
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bot UI</title>
<style>
html,body{height:100%}
body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:0;background:#0b0b0f;color:#eee;display:flex;flex-direction:column}
header{padding:12px 16px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center}
main{flex:1;display:grid;grid-template-columns:380px 1fr;gap:12px;padding:12px;min-height:0}
.card{background:#111118;border:1px solid #222;border-radius:14px;padding:12px;overflow:auto}
label{display:block;color:#bbb;font-size:12px;margin:10px 0 6px}
input,select{width:100%;padding:10px;border-radius:10px;border:1px solid #2a2a3a;background:#0f0f16;color:#fff}
button{margin-top:12px;width:100%;padding:10px;border-radius:10px;border:1px solid #2a2a3a;background:#1b1b2a;color:#fff;cursor:pointer}
button:hover{filter:brightness(1.1)}
#vnc-canvas{position:relative;background:#0f0f16;border:1px solid #222;border-radius:14px;min-height:420px;overflow:hidden;display:flex;align-items:center;justify-content:center}
#vnc-canvas canvas{max-width:100%;max-height:100%}
#vnc-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,15,22,0.72);color:#d7d7e4;font-weight:600;letter-spacing:0.3px;opacity:0;transition:opacity .2s ease;pointer-events:none}
#vnc-canvas.loading #vnc-status{opacity:1}
.row{display:flex;gap:10px}.row>div{flex:1}
a{color:#9ad}
</style></head>
<body>
<header><div><b>Bot UI</b> <span style="color:#aaa">Playwright</span></div><div style="color:#aaa">:${PORT}</div></header>
<main>
<div class="card">
  <div style="color:#bbb;font-size:13px">Affiche le site cible via VNC.</div>

  <label>URL</label>
  <input id="url" value="http://127.0.0.1:8088/" />

  <button id="load-vnc">Charger</button>
</div>

<div id="vnc-canvas"><div id="vnc-status">Chargement…</div></div>
</main>

<script type="module">
  import RFB from "https://cdn.jsdelivr.net/npm/@novnc/novnc/core/rfb.js";

  async function api(path, opts){
    const r = await fetch(path, Object.assign({
      headers:{'Content-Type':'application/json'}
    }, opts));
    return r.json();
  }

  document.getElementById('load-vnc').onclick = async () => {
    const vncCanvas = document.getElementById('vnc-canvas');
    const vncStatus = document.getElementById('vnc-status');
    vncCanvas.classList.add('loading');
    vncStatus.textContent = 'Connexion VNC en cours…';
    Array.from(vncCanvas.querySelectorAll('canvas')).forEach((node) => node.remove());

    const r = await api('/api/vnc', {
      method: 'POST',
      body: JSON.stringify({ url: document.getElementById('url').value.trim() })
    });

    if (!r.ok) {
      vncStatus.textContent = r.error || 'Erreur de chargement';
      vncCanvas.classList.remove('loading');
      return;
    }

    const rfb = new RFB(vncCanvas, r.vncUrl);
    rfb.scaleViewport = false;
    rfb.resizeSession = true;
    rfb.addEventListener('connect', () => {
      vncCanvas.classList.remove('loading');
    });
    rfb.addEventListener('disconnect', () => {
      vncStatus.textContent = 'Déconnecté';
      vncCanvas.classList.add('loading');
    });

    console.log("VNC connecté", rfb);
  };
</script>

</body></html>`);
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}

app.post("/api/vnc", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return res.json({ ok: false, error: "URL invalide" });
  }

  const प्रदर्शन = Math.floor(Math.random() * 100) + 100;
  const vncPort = await getFreePort();

  const xvfb = spawn("Xvfb", [`:${प्रदर्शन}`, "-screen", "0", "1280x720x24"], { stdio: "pipe" });
  xvfb.stdout.on('data', (data) => console.log(`Xvfb stdout: ${data}`));
  xvfb.stderr.on('data', (data) => console.error(`Xvfb stderr: ${data}`));
  xvfb.on("close", () => console.log(`Xvfb on display ${ प्रदर्शन} closed.`));

  await new Promise(resolve => setTimeout(resolve, 1000));

  const x11vnc = spawn("x11vnc", ["-display", `:${प्रदर्शन}`, "-rfbport", `${vncPort}`, "-forever", "-shared"], { stdio: "pipe" });
  x11vnc.stdout.on('data', (data) => console.log(`x11vnc stdout: ${data}`));
  x11vnc.stderr.on('data', (data) => console.error(`x11vnc stderr: ${data}`));
  x11vnc.on("close", () => console.log(`x11vnc on port ${vncPort} closed.`));

  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'], env: { ...process.env, DISPLAY: `:${ प्रदर्शन}` } });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0];
    const proto = (req.headers["x-forwarded-proto"] || "http").toLowerCase();
    const wsProto = proto === "https" ? "wss" : "ws";
    
    res.json({ ok: true, vncUrl: `${wsProto}://${host}:${vncPort}` });

  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Bot UI: http://0.0.0.0:${PORT}`);
});
