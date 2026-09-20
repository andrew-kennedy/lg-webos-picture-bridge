'use strict';

// Browser geometry checks complement the Chromium-53 compatibility assertions in
// ui-css.test.js. Modern Chromium is NOT an emulator of the C9's actual engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const appRoot = path.join(__dirname, '../app');
const status = {
  configured: true, running: true, monitor_healthy: true, transport: 'mqtt',
  mqtt_commands_enabled: true, mqtt: {state: 'connected', commands_ready: true,
    last_published_at: '2026-09-20T04:00:00.000Z'},
  subscription_states: {settings: {state: 'subscribed'}, videooutput: {state: 'subscribed'},
    externaldevice: {state: 'subscribed'}, acb: {state: 'subscribed'}},
  command_api_enabled: true, command_api_port: 49191, command_api: {state: 'listening'},
  last_dynamic_range: 'dolby_vision', last_source: 'settingsservice',
  hdmi_signal: {signal_present: true}
};

(async function () {
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.LAYOUT_CHROMIUM_PATH || undefined});
  let scenarios = 0;
  try {
    for (const viewport of [{width: 1920, height: 1080}, {width: 1280, height: 720}, {width: 960, height: 540}]) {
      for (const variant of ['mqtt', 'both', 'error', 'unconfigured']) {
        const fixture = JSON.parse(JSON.stringify(status));
        if (variant === 'both') fixture.transport = 'both';
        if (variant === 'error') {
          fixture.last_error = 'Long diagnostic: ' + 'retry-details-'.repeat(240);
          fixture.mqtt.state = 'disconnected';
        }
        if (variant === 'unconfigured') {fixture.configured = false; fixture.running = false;}
        const page = await browser.newPage({viewport});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.hostname !== 'bridge.test') return route.abort();
          const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
          if (!/^(index\.html|app\.js|styles\.css|assets\/icon160\.png)$/.test(name)) return route.abort();
          return route.fulfill({path: path.join(appRoot, name)});
        });
        await page.addInitScript(initial => {
          window.fixture = initial;
          window.lunaCalls = [];
          window.PalmServiceBridge = function () {};
          window.PalmServiceBridge.prototype.call = function (uri) {
            window.lunaCalls.push(uri);
            this.onservicecallback(JSON.stringify({returnValue: true, status: window.fixture}));
          };
        }, fixture);
        await page.goto('http://bridge.test/');
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSLaunch', {detail: {}})));
        await page.waitForFunction(() => document.getElementById('status-title').textContent !== 'Checking configuration…');
        // Include font scaling/long labels in the overflow case without hiding content.
        if (variant === 'error') await page.addStyleTag({content: ':root {font-size: 30px;}'});
        const dimensions = await page.evaluate(() => {
          const bounds = element => {
            const r = element.getBoundingClientRect();
            return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
          };
          const content = document.getElementById('content');
          return {buttons: Array.from(document.querySelectorAll('button')).map(bounds),
            footer: bounds(document.querySelector('footer')), content: bounds(content),
            bodyWidth: document.documentElement.scrollWidth, contentWidth: content.clientWidth,
            scrollWidth: content.scrollWidth, scrollHeight: content.scrollHeight,
            height: content.clientHeight, columns: Array.from(document.querySelectorAll('dl > div')).slice(0, 3).map(bounds)};
        });
        const label = `${viewport.width}x${viewport.height}/${variant}`;
        for (const rect of dimensions.buttons) {
          assert(rect.top >= 0 && rect.bottom <= viewport.height * 0.95, label + ': action cropped vertically');
          assert(rect.left >= viewport.width * 0.05 && rect.right <= viewport.width * 0.95, label + ': action cropped horizontally');
        }
        assert(dimensions.content.bottom <= dimensions.footer.top, label + ': content covers actions');
        assert(dimensions.height > 60, label + ': no room to scroll details');
        assert(dimensions.bodyWidth <= viewport.width, label + ': page horizontal overflow');
        assert(dimensions.scrollWidth <= dimensions.contentWidth + 1, label + ': text horizontal overflow');
        if (viewport.width >= 1280) assert.equal(dimensions.columns[0].top, dimensions.columns[2].top,
          label + ': status should use three columns');
        if (variant === 'error') {
          assert(dimensions.scrollHeight > dimensions.height, label + ': expected long diagnostic overflow');
          await page.focus('#refresh-button');
          const count = await page.evaluate(() => window.lunaCalls.length);
          await page.keyboard.press('ArrowDown');
          assert((await page.locator('#content').evaluate(el => el.scrollTop)) > 0, label + ': remote did not scroll');
          await page.keyboard.press('ArrowRight');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'restart-button');
          await page.keyboard.press('ArrowLeft');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'refresh-button');
          assert.equal(await page.evaluate(() => window.lunaCalls.length), count, 'Navigation must not invoke a device action');
          await page.keyboard.press('ArrowUp');
          assert.equal(await page.locator('#content').evaluate(el => el.scrollTop), 0);
        }
        if (process.env.LAYOUT_SCREENSHOT_DIR && viewport.width === 1920 && ['mqtt', 'error'].includes(variant)) {
          await page.screenshot({path: path.join(process.env.LAYOUT_SCREENSHOT_DIR, variant + '.png')});
        }
        assert.deepEqual(errors, [], label + ': browser errors');
        console.log('PASS layout ' + label);
        scenarios++;
        await page.close();
      }
    }
    console.log(`All ${scenarios} browser layout scenarios passed; no real TV/service calls.`);
  } finally {await browser.close();}
}()).catch(error => {console.error(error); process.exitCode = 1;});
