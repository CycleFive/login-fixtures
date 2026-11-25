// The pages added for kharon's teach-mode live test (kharon #383):
// a two-step login, a login that posts the password's SHA-256, and a
// drift variant of /login/any.html.
const crypto = require('crypto');
const { test, expect } = require('./fixtures');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function open(page, serverURL, path) {
  await page.goto(serverURL + path);
  await page.waitForSelector('#login-form[data-ready="true"]');
}

const noPosts = (log) => log.every((r) => r.method !== 'POST');

test.describe('two-step login', () => {
  test('username, then password, then welcome', async ({ page, serverURL, requestLog }) => {
    await open(page, serverURL, '/login/two-step.html');
    await expect(page.locator('#password')).toHaveCount(0);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await page.fill('#username', 'whoever');
    await expect(page.locator('#fill-report')).toHaveAttribute('data-username-length', '7');
    await page.click('#submit');

    await page.waitForURL(serverURL + '/login/two-step-password.html');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await expect(page.locator('#username')).toHaveCount(0);
    await expect(page.locator('#step-report')).toHaveAttribute('data-recorded', 'true');
    await expect(page.locator('#step-report')).toHaveAttribute('data-username-length', '7');
    expect(await page.getAttribute('#password', 'autocomplete')).toBe('current-password');
    await page.fill('#password', 'hunter22');
    await page.click('#submit');

    await page.waitForURL(serverURL + '/login/welcome.html?from=two-step');
    await expect(page.locator('#login-status')).toHaveAttribute('data-state', 'success');
    await expect(page.locator('#submit-report')).toHaveAttribute('data-username-length', '7');
    await expect(page.locator('#submit-report')).toHaveAttribute('data-password-length', '8');
    expect(await page.getAttribute('#logout', 'href')).toBe('/login/two-step.html');
    expect(noPosts(requestLog)).toBe(true);
  });

  test('empty username stays on step 1', async ({ page, serverURL, requestLog }) => {
    await open(page, serverURL, '/login/two-step.html');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/two-step.html?error=missing');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await expect(page.locator('#login-status-text')).toHaveText('Enter a username');
    expect(noPosts(requestLog)).toBe(true);
  });

  test('empty password stays on step 2', async ({ page, serverURL, requestLog }) => {
    await open(page, serverURL, '/login/two-step.html');
    await page.fill('#username', 'whoever');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/two-step-password.html');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/two-step-password.html?error=missing');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await expect(page.locator('#login-status-text')).toHaveText('Enter a password');
    await expect(page.locator('#step-report')).toHaveAttribute('data-username-length', '7');
    expect(noPosts(requestLog)).toBe(true);
  });

  test('step 2 opened on its own goes back to step 1', async ({ page, serverURL }) => {
    await page.goto(serverURL + '/login/two-step-password.html');
    await page.waitForURL(serverURL + '/login/two-step.html?error=start');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await expect(page.locator('#login-status')).toHaveAttribute('data-state', 'error');
  });

  test('step 1 keeps a length, never the username', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/two-step.html');
    await page.fill('#username', 'distinctive-name');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/two-step-password.html');
    const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, sessionStorage)));
    expect(stored).not.toContain('distinctive-name');
    expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('login-test:two-step')))).toEqual({ u: 16 });
  });
});

test.describe('SHA-256 login', () => {
  test('the post carries the digest, not the password', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/transformed.html');
    await page.fill('#username', 'whoever');
    await page.fill('#password', 'hunter22');
    // A listener added after the page's own runs after it: read what would be
    // posted, and stop the navigation.
    const posted = await page.evaluate(() => new Promise((resolve) => {
      const form = document.getElementById('login-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = new FormData(form);
        resolve({ username: d.get('username'), password: d.get('password') });
      });
      document.getElementById('submit').click();
    }));
    expect(posted).toEqual({ username: 'whoever', password: sha256('hunter22') });
  });

  test('real submit lands on welcome with the typed length', async ({ page, serverURL, requestLog }) => {
    const expectDigest = sha256('whoever:hunter22');
    await open(page, serverURL, '/login/transformed.html?expect=' + expectDigest);
    await page.fill('#username', 'whoever');
    await page.fill('#password', 'hunter22');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/welcome.html?from=transformed');
    await expect(page.locator('#submit-report')).toHaveAttribute('data-password-length', '8');
    await expect(page.locator('#submit-report')).toHaveAttribute('data-match', 'true');
    expect(await page.getAttribute('#logout', 'href')).toBe('/login/transformed.html');
    expect(noPosts(requestLog)).toBe(true);
  });

  test('form.submit() skips the swap and is turned away', async ({ page, serverURL, requestLog }) => {
    await open(page, serverURL, '/login/transformed.html');
    await page.fill('#username', 'whoever');
    await page.fill('#password', 'hunter22');
    // The button's id="submit" shadows form.submit, so call the method itself.
    await page.evaluate(() => HTMLFormElement.prototype.submit.call(document.getElementById('login-form')));
    await page.waitForURL(serverURL + '/login/transformed.html?error=not_digest');
    await page.waitForSelector('#login-form[data-ready="true"]');
    await expect(page.locator('#login-status')).toHaveAttribute('data-state', 'error');
    expect(noPosts(requestLog)).toBe(true);
  });

  test('empty password is missing, not a digest of nothing', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/transformed.html');
    await page.fill('#username', 'whoever');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/transformed.html?error=missing');
  });

  test('required selectors', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/transformed.html');
    for (const sel of ['#login-form', '#username', '#password', '#submit', '#login-status[data-state]', '#login-status-text', '#fill-report[data-username-length][data-password-length]']) {
      expect(await page.locator(sel).count(), sel).toBe(1);
    }
    expect(await page.getAttribute('#password', 'type')).toBe('password');
    expect(await page.getAttribute('#password', 'name')).toBe('password');
  });
});

test.describe('drift variant of /login/any.html', () => {
  test('?drift=password renames the field at the same path', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/any.html?drift=password');
    expect(new URL(page.url()).pathname).toBe('/login/any.html');
    await expect(page.locator('#login-form')).toHaveAttribute('data-drift', 'password');
    await expect(page.locator('#password')).toHaveCount(0);
    const pw = page.locator('input[type=password]');
    await expect(pw).toHaveCount(1);
    expect(await pw.getAttribute('id')).toBe('passwd');
    expect(await pw.getAttribute('name')).toBe('passwd');
    expect(await pw.getAttribute('autocomplete')).toBe('current-password');
    expect(await page.getAttribute('label[for=passwd]', 'for')).toBe('passwd');
    await expect(page.locator('#username')).toHaveCount(1);
    await page.fill('#passwd', 'abc');
    await expect(page.locator('#fill-report')).toHaveAttribute('data-password-length', '3');
  });

  test('the plain page is unchanged', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/any.html');
    expect(await page.getAttribute('#login-form', 'data-drift')).toBeNull();
    expect(await page.getAttribute('#password', 'name')).toBe('password');
  });

  test('a drifted submit does not log in', async ({ page, serverURL }) => {
    await open(page, serverURL, '/login/any.html?drift=password');
    await page.fill('#username', 'whoever');
    await page.fill('#passwd', 'hunter22');
    await page.click('#submit');
    await page.waitForURL(serverURL + '/login/any.html?error=missing');
  });
});
