// Optional integration smoke test: npm install --no-save --package-lock=false playwright
// Run with CHROMIUM_PATH=/path/to/chromium node tests/ui-smoke.cjs.
// Uses isolated browser contexts and mocked Thunderbird APIs, never a mail profile.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json')));
const ru = JSON.parse(fs.readFileSync(path.join(root, '_locales/ru/messages.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
    for (const locale of ['en-US', 'ru-RU', 'de-DE']) {
      const dictionary = locale.startsWith('ru') ? ru : en;
      const context = await browser.newContext({ locale, viewport: { width: 1100, height: 850 } });
      await context.addInitScript(({ locale, dictionary, manifest }) => {
        window.calls = [];
        window.alert = text => calls.push({ alert: text });
        window.confirm = text => { calls.push({ confirm: text }); return true; };
        window.close = () => calls.push({ close: true });
        const reminders = ['pending', 'snoozed', 'notified', 'completed', 'dismissed'].map((status, i) => ({
          id: String(i), subject: i === 0 ? '' : 'Test email', sender: i === 0 ? '' : 'Alice <alice@example.com>',
          notes: 'Test note', status, dueDate: new Date(Date.now() + (i - 1) * 3600000).toISOString()
        }));
        window.browser = {
          i18n: {
            getUILanguage: () => locale,
            getMessage(key, substitutions = []) {
              if (key === '@@bidi_dir') return 'ltr';
              const entry = dictionary[key];
              if (!entry) throw new Error('Missing key: ' + key);
              const values = Array.isArray(substitutions) ? substitutions : [substitutions];
              return entry.message.replace(/\$(\w+)\$/g, (_, name) => values[Number(entry.placeholders[name.toLowerCase()].content.slice(1)) - 1]);
            }
          },
          runtime: {
            getManifest: () => manifest,
            getURL: file => '/' + file,
            async sendMessage(message) {
              calls.push(message);
              if (message.action === 'getReminders') return reminders;
              if (message.action === 'getReminderCounts') return { pending: 1, snoozed: 1, notified: 1, completed: 1, dismissed: 1, total: 5 };
              if (message.action === 'getPendingMessage') return { id: 1, subject: '', author: '', folder: { path: '/inbox' } };
              return { success: true };
            }
          },
          storage: { local: {
            get: async () => ({ settings: {}, reminders: {} }),
            set: async data => calls.push({ storage: data })
          } },
          tabs: { create: async data => calls.push({ tab: data }) }
        };
      }, { locale, dictionary, manifest });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const file of ['popup/popup.html', 'reminder-dialog/dialog.html', 'reminder-list/list.html', 'options/options.html']) {
        await page.setViewportSize(file.startsWith('popup') ? { width: 350, height: 600 } : file.startsWith('reminder-dialog') ? { width: 530, height: 620 } : { width: 1100, height: 850 });
        await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
        await page.waitForFunction(() => document.documentElement.lang === browser.i18n.getUILanguage());
        const failures = await page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].filter(el => el.id !== 'subject' && el.textContent !== browser.i18n.getMessage(el.dataset.i18n)).map(el => el.dataset.i18n));
        assert.deepEqual(failures, [], `${locale}/${file}: static translation`);
        if (file.startsWith('popup')) {
          await page.locator('.reminder-item').first().waitFor();
          assert.equal(await page.locator('.stat .count').count(), 5);
          assert.equal(await page.locator('.stat.pending .count').textContent(), '1');
          await page.locator('.snooze-menu > button').first().click();
          await page.locator('.snooze-dropdown.show button').first().click();
          assert(await page.evaluate(() => calls.some(c => c.action === 'snoozeReminder' && c.minutes === 5)));
          assert(await page.evaluate(() => [...document.querySelectorAll('.reminder-actions button')].every(el => el.getBoundingClientRect().right <= innerWidth)));
        }
        if (file.startsWith('reminder-dialog')) {
          await page.locator('#dueDate').fill('');
          await page.locator('#saveBtn').click();
          assert.equal(await page.locator('.error-message').textContent(), dictionary.selectDate.message);
          await page.locator('[data-minutes="60"]').click();
          await page.locator('#saveBtn').click();
          const created = await page.evaluate(() => calls.find(c => c.action === 'createReminder'));
          assert.equal(created.data.subject, '');
          assert.equal(created.data.sender, '');
          assert(Date.parse(created.data.dueDate) > Date.now());
        }
        if (file.startsWith('reminder-list')) {
          await page.locator('#filterStatus').selectOption('all');
          assert.equal(await page.locator('tbody tr').count(), 5);
          assert.equal(await page.locator('.status-badge.notified').textContent(), dictionary.due.message);
          assert((await page.locator('#extensionVersion').textContent()).includes(manifest.version));
        }
        if (file.startsWith('options')) {
          await page.locator('#saveBtn').click();
          assert.equal(await page.locator('#saveStatus').textContent(), dictionary.settingsSaved.message);
          await page.locator('#importFile').setInputFiles({ name: 'reminders.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ reminders: [{ id: 'import-1' }] })) });
          await page.waitForFunction(() => calls.some(c => c.alert && c.alert.includes('1')));
          await page.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
          await page.waitForFunction(expected => calls.some(c => c.alert === expected), dictionary.importFailed.message);
        }
        if (process.env.SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${locale}-${file.split('/')[0]}.png`), fullPage: true });
        }
        assert.deepEqual(errors, [], `${locale}/${file}: runtime errors`);
        console.log(`PASS ${locale}: ${file}`);
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
