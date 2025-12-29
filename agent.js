import { chromium } from "playwright";

const URL = process.env.URL || "https://example.com";
const HEADLESS = (process.env.HEADLESS || "true") === "true";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
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
