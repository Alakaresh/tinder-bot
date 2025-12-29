import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.UI_PORT || 8099);
const DATA_DIR = process.env.BOT_DATA_DIR || path.resolve("./runs");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const jobs = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const nowIso = () => new Date().toISOString();

async function runBotJob({ url, mode, steps, headless }) {
  const jobId = crypto.randomUUID().slice(0, 8);
  const job = {
    id: jobId,
    url,
    mode,
    steps,
    headless,
    status: "running",
    createdAt: nowIso(),
    logs: [],
    result: null
  };
  jobs.set(jobId, job);

  const log = (msg) => {
    job.logs.push(`[${nowIso()}] ${msg}`);
    if (job.logs.length > 800) job.logs.splice(0, job.logs.length - 800);
  };

  const runDir = path.join(DATA_DIR, jobId);
  fs.mkdirSync(runDir, { recursive: true });

  (async () => {
    let browser;
    try {
      log(`Démarrage navigateur (headless=${headless})`);
      browser = await chromium.launch({ headless });

      const page = await browser.newPage();
      page.on("console", (m) => log(`[page] ${m.text()}`));
      page.on("pageerror", (e) => log(`[pageerror] ${String(e)}`));

      log(`Ouverture URL: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      const shot0 = path.join(runDir, "start.png");
      await page.screenshot({ path: shot0, fullPage: true });
      log(`Screenshot: runs/${jobId}/start.png`);

      // Actions "génériques" (starter). On adaptera à ton simulateur ensuite.
      for (let i = 0; i < steps; i++) {
        if (mode === "fixed") {
          await sleep(900);
          await page.mouse.wheel(0, 500);
          continue;
        }

        if (mode === "random") {
          await sleep(rand(250, 1800));
          await page.mouse.wheel(0, rand(200, 900));
          const anyButton = await page.$("button");
          if (anyButton && Math.random() < 0.25) {
            await anyButton.click().catch(() => {});
            log("Clic sur un <button> détecté (starter)");
          }
          continue;
        }

        if (mode === "reader") {
          await sleep(rand(600, 2600));
          await page.mouse.wheel(0, rand(400, 1200));
          await sleep(rand(200, 900));
          continue;
        }

        throw new Error(`Mode inconnu: ${mode}`);
      }

      const shot1 = path.join(runDir, "end.png");
      await page.screenshot({ path: shot1, fullPage: true });
      log(`Screenshot: runs/${jobId}/end.png`);

      job.status = "done";
      job.result = { screenshots: ["start.png", "end.png"] };
      log("Job terminé ✅");
    } catch (e) {
      job.status = "error";
      job.result = { error: String(e) };
      log(`Erreur ❌ ${String(e)}`);
    } finally {
      try { await browser?.close(); } catch {}
    }
  })();

  return jobId;
}

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bot UI</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:0;background:#0b0b0f;color:#eee}
header{padding:12px 16px;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center}
main{display:grid;grid-template-columns:380px 1fr;gap:12px;padding:12px}
.card{background:#111118;border:1px solid #222;border-radius:14px;padding:12px}
label{display:block;color:#bbb;font-size:12px;margin:10px 0 6px}
input,select{width:100%;padding:10px;border-radius:10px;border:1px solid #2a2a3a;background:#0f0f16;color:#fff}
button{margin-top:12px;width:100%;padding:10px;border-radius:10px;border:1px solid #2a2a3a;background:#1b1b2a;color:#fff;cursor:pointer}
button:hover{filter:brightness(1.1)}
#vnc-canvas{background:#0f0f16;border:1px solid #222;border-radius:14px;min-height:420px;overflow:hidden}
.row{display:flex;gap:10px}.row>div{flex:1}
a{color:#9ad}
</style></head>
<body>
<header><div><b>Bot UI</b> <span style="color:#aaa">Playwright</span></div><div style="color:#aaa">:${PORT}</div></header>
<main>
<div class="card">
  <div style="color:#bbb;font-size:13px">Lance un run et regarde les logs.</div>

  <label>URL</label>
  <input id="url" value="http://127.0.0.1:8088/" />

  <div class="row">
    <div>
      <label>Mode</label>
      <select id="mode">
        <option value="random">random</option>
        <option value="reader">reader</option>
        <option value="fixed">fixed</option>
      </select>
    </div>
    <div>
      <label>Steps</label>
      <input id="steps" type="number" value="30" min="1" max="500"/>
    </div>
  </div>

  <label>Headless</label>
  <select id="headless">
    <option value="true">true (serveur)</option>
    <option value="false">false (debug)</option>
  </select>

  <div class="row">
    <button id="load-vnc" style="flex:1">Charger</button>
    <button id="run" style="flex:1">Lancer</button>
  </div>

  <div id="job" style="margin-top:10px;color:#bbb;font-size:13px"></div>
  <div id="links" style="margin-top:8px;color:#bbb;font-size:13px"></div>
</div>

<div id="vnc-canvas"></div>
</main>

<script type="module">
  import RFB from "https://cdn.jsdelivr.net/npm/@novnc/novnc/core/rfb.js";

  let currentJobId = null;

  async function api(path, opts){
    const r = await fetch(path, Object.assign({
      headers:{'Content-Type':'application/json'}
    }, opts));
    return r.json();
  }

  document.getElementById('run').onclick = async ()=>{
    const payload={
      url: document.getElementById('url').value.trim(),
      mode: document.getElementById('mode').value,
      steps: Number(document.getElementById('steps').value||30),
      headless: document.getElementById('headless').value === 'true'
    };
    const j=await api('/api/run',{method:'POST',body:JSON.stringify(payload)});
    if(!j.ok) return;

    currentJobId=j.jobId;
    document.getElementById('job').textContent='Job: '+currentJobId;
    poll();
  };

  async function poll(){
    if(!currentJobId) return;
    const j=await api('/api/jobs/'+currentJobId);
    if(j.job?.status==='done'){
      const shots=(j.job.result?.screenshots||[]);
      document.getElementById('links').innerHTML =
        'Screenshots: ' + shots.map(
          s=>'<a href="/runs/'+currentJobId+'/'+s+'" target="_blank">'+s+'</a>'
        ).join(' • ');
      return;
    }
    setTimeout(poll, 600);
  }

  document.getElementById('load-vnc').onclick = async () => {
    const vncCanvas = document.getElementById('vnc-canvas');
    vncCanvas.innerHTML = '';

    const r = await api('/api/vnc', {
      method: 'POST',
      body: JSON.stringify({ url: document.getElementById('url').value.trim() })
    });

    if (!r.ok) {
      vncCanvas.textContent = JSON.stringify(r, null, 2);
      return;
    }

    const rfb = new RFB(vncCanvas, r.vncUrl);
    rfb.scaleViewport = true;
    rfb.resizeSession = true;

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

app.post("/api/run", async (req, res) => {
  const { url, mode="random", steps=30, headless=true } = req.body || {};
  if (!url || typeof url !== "string") return res.json({ ok:false, error:"url requise" });
  if (!/^https?:\/\//i.test(url)) return res.json({ ok:false, error:"url doit commencer par http(s)://" });

  const safeMode = ["fixed","random","reader"].includes(String(mode)) ? String(mode) : "random";
  const safeSteps = Math.max(1, Math.min(500, Number(steps)||30));

  const jobId = await runBotJob({ url, mode: safeMode, steps: safeSteps, headless: !!headless });
  res.json({ ok:true, jobId });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(String(req.params.id||""));
  if (!job) return res.json({ ok:false, error:"job introuvable" });
  res.json({ ok:true, job });
});

app.use("/runs", express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`Bot UI: http://0.0.0.0:${PORT}`);
});
