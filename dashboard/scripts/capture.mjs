import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/home/saurabh254/.local/bin/chromium';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve(__dirname, '../../docs/screenshots');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  console.log('Logging in via API to obtain session token...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'password123' }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  console.log('Set-Cookie Header:', setCookie);

  let sessionToken = '';
  if (setCookie) {
    const match = setCookie.match(/pcloudvm_session=([^;]+)/);
    if (match) sessionToken = match[1];
  }

  if (!sessionToken) {
    throw new Error('Failed to obtain session cookie from API');
  }
  console.log('Obtained session token:', sessionToken);

  console.log('Launching browser at:', CHROMIUM_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1600,1050',
    ],
    defaultViewport: {
      width: 1440,
      height: 920,
      deviceScaleFactor: 2,
    },
  });

  const page = await browser.newPage();

  const capture = async (name, waitMs = 1500) => {
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    const dest = path.join(OUT_DIR, name);
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`Saved screenshot: ${dest}`);
  };

  // 0. Login Screen (Unauthenticated)
  console.log('Capturing Login Screen...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await capture('00-login-screen.png', 1000);

  // Set session cookie
  console.log('Setting session cookie in browser context...');
  await page.setCookie({
    name: 'pcloudvm_session',
    value: sessionToken,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  // 1. Dashboard Overview
  console.log('Capturing Dashboard Overview...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle2' });
  await capture('01-dashboard-overview.png', 2000);

  // 2. Instances List
  console.log('Capturing Instances List...');
  await page.goto(`${BASE_URL}/instances`, { waitUntil: 'networkidle2' });
  await capture('02-instances-list.png', 2000);

  // 3. Instance Overview
  const instanceUrl = `${BASE_URL}/instances/i-a7e27dfeb8000364`;
  console.log(`Capturing Instance Overview: ${instanceUrl}`);
  await page.goto(instanceUrl, { waitUntil: 'networkidle2' });
  await capture('03-instance-overview.png', 2000);

  // 4. Instance Metrics Tab
  console.log('Capturing Instance Live Telemetry & Metrics...');
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Metrics')) {
      await btn.click();
      console.log('Switched to Metrics tab');
      break;
    }
  }
  // Wait for telemetry poll cycle to load gauge metrics
  await capture('04-instance-telemetry.png', 3500);

  // 5. Instance Terminal Tab
  console.log('Capturing Instance Web Terminal...');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Terminal')) {
      await btn.click();
      console.log('Switched to Terminal tab');
      break;
    }
  }
  // Wait for terminal connection
  await new Promise((r) => setTimeout(r, 2500));
  // Look for fastfetch button
  const terminalButtons = await page.$$('button');
  for (const btn of terminalButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('fastfetch')) {
      await btn.click();
      console.log('Clicked fastfetch quick button');
      await new Promise((r) => setTimeout(r, 3000));
      break;
    }
  }
  await capture('05-web-terminal.png', 2000);

  // 6. Disks & Storage
  console.log('Capturing Disks & Storage...');
  await page.goto(`${BASE_URL}/disks`, { waitUntil: 'networkidle2' });
  await capture('06-disks-storage.png', 1500);

  // 7. Security Groups
  console.log('Capturing Security Groups...');
  await page.goto(`${BASE_URL}/security-groups`, { waitUntil: 'networkidle2' });
  await capture('07-security-groups.png', 1500);

  // 8. SSH Keys
  console.log('Capturing SSH Keys...');
  await page.goto(`${BASE_URL}/ssh-keys`, { waitUntil: 'networkidle2' });
  await capture('08-ssh-keys.png', 1500);

  // 9. Images Catalog
  console.log('Capturing Images Catalog...');
  await page.goto(`${BASE_URL}/images`, { waitUntil: 'networkidle2' });
  await capture('09-images-catalog.png', 1500);

  // 10. Activity Audit Log
  console.log('Capturing Activity Audit Log...');
  await page.goto(`${BASE_URL}/activity`, { waitUntil: 'networkidle2' });
  await capture('10-activity-audit.png', 1500);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
