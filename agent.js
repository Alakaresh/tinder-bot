import { chromium } from "playwright";

const SITES = {
  example: "https://example.com",
  tinder: "https://tinder.com",
};

const SITE_KEY = process.env.SITE || "example";
const URL = process.env.URL || SITES[SITE_KEY];
const HEADLESS = (process.env.HEADLESS || "true") === "true";

if (!URL) {
  const availableSites = Object.keys(SITES).join(", ");
  throw new Error(
    `Site inconnu "${SITE_KEY}". Sites disponibles: ${availableSites}.`,
  );
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`🌐 Site sélectionné: ${SITE_KEY} (${URL})`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  page.on("console", msg => console.log("[page]", msg.text()));
  page.on("pageerror", err => console.log("[pageerror]", err));

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Exemple d'actions
  await page.mouse.wheel(0, 600);
  await sleep(400);

  await page.screenshot({ path: "debug.png", fullPage: true });
  console.log("✅ screenshot: debug.png");

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
