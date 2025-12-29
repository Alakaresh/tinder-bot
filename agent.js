import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SITES = {
  example: "https://example.com",
  tinder: "https://tinder.com",
};

const DEFAULT_SITE = "example";
const SITE_KEY = process.env.SITE || DEFAULT_SITE;
const URL = process.env.URL || SITES[SITE_KEY];
const HEADLESS = (process.env.HEADLESS || "false") === "true";

if (!URL) {
  const availableSites = Object.keys(SITES).join(", ");
  throw new Error(
    `Site inconnu "${SITE_KEY}". Sites disponibles: ${availableSites}.`,
  );
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function promptForSite() {
  const availableSites = Object.keys(SITES);
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    `Choisissez un site (${availableSites.join(", ")}): `,
  );
  await rl.close();
  const selected = answer.trim() || DEFAULT_SITE;
  return selected;
}

async function waitForBotTrigger() {
  const rl = createInterface({ input, output });
  await rl.question("Interface prête. Appuyez sur Entrée pour démarrer le bot...");
  await rl.close();
}

async function runBotActions(page) {
  await page.mouse.wheel(0, 600);
  await sleep(400);

  await page.screenshot({ path: "debug.png", fullPage: true });
  console.log("✅ screenshot: debug.png");
}

async function main() {
  let selectedSite = SITE_KEY;
  let selectedUrl = URL;

  if (!process.env.SITE && !process.env.URL) {
    selectedSite = await promptForSite();
    selectedUrl = SITES[selectedSite];
  }

  if (!selectedUrl) {
    const availableSites = Object.keys(SITES).join(", ");
    throw new Error(
      `Site inconnu "${selectedSite}". Sites disponibles: ${availableSites}.`,
    );
  }

  console.log(`🌐 Site sélectionné: ${selectedSite} (${selectedUrl})`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  page.on("console", msg => console.log("[page]", msg.text()));
  page.on("pageerror", err => console.log("[pageerror]", err));

  await page.goto(selectedUrl, { waitUntil: "domcontentloaded" });

  await waitForBotTrigger();
  await runBotActions(page);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
