// Plays the "server" for the login test pages. Handles exactly six
// same-origin POSTs and lets everything else pass through untouched.
// Read the body, compare, answer, forget: nothing typed is stored, logged,
// cached, echoed into a URL, or posted anywhere.
self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

function redirect(path) {
    return Response.redirect(new URL(path, self.location.origin).href, 303);
}

function nonEmpty(v) {
    return typeof v === 'string' && v !== '';
}

async function strict(request) {
    var data = await request.formData();
    var u = data.get('username');
    var p = data.get('password');
    if (!nonEmpty(u) || !nonEmpty(p)) return redirect('/login.html?error=missing');
    if (u !== 'testuser') return redirect('/login.html?error=unknown_username');
    if (p !== 'correct-horse-battery-staple') return redirect('/login.html?error=wrong_password');
    return redirect('/login/welcome.html?from=strict');
}

async function any(request) {
    var data = await request.formData();
    if (nonEmpty(data.get('username')) && nonEmpty(data.get('password'))) {
        return redirect('/login/welcome.html?from=any');
    }
    return redirect('/login/any.html?error=missing');
}

// Two-step login: the username alone, then the password alone. Nothing is
// carried from one step to the next here; the pages keep only a length.
async function twoStepUsername(request) {
    var data = await request.formData();
    if (nonEmpty(data.get('username'))) return redirect('/login/two-step-password.html');
    return redirect('/login/two-step.html?error=missing');
}

async function twoStepPassword(request) {
    var data = await request.formData();
    if (nonEmpty(data.get('password'))) return redirect('/login/welcome.html?from=two-step');
    return redirect('/login/two-step-password.html?error=missing');
}

// The SHA-256 of the empty string: an empty password, digested.
var EMPTY_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function transformed(request) {
    var data = await request.formData();
    var u = data.get('username');
    var p = data.get('password');
    if (!nonEmpty(u) || !nonEmpty(p) || p === EMPTY_DIGEST) return redirect('/login/transformed.html?error=missing');
    if (!/^[0-9a-f]{64}$/.test(p)) return redirect('/login/transformed.html?error=not_digest');
    return redirect('/login/welcome.html?from=transformed');
}

async function api(request) {
    var ok = false;
    try {
        var body = await request.json();
        ok = !!body && nonEmpty(body.username) && nonEmpty(body.password);
    } catch (e) {
        ok = false;
    }
    return new Response(ok ? '{"ok":true}' : '{"ok":false,"error":"missing"}', {
        status: ok ? 200 : 401,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
}

self.addEventListener('fetch', function (event) {
    var url = new URL(event.request.url);
    if (url.origin !== self.location.origin || event.request.method !== 'POST') return;
    if (url.pathname === '/login/session/strict') event.respondWith(strict(event.request));
    else if (url.pathname === '/login/session/any') event.respondWith(any(event.request));
    else if (url.pathname === '/login/api/session') event.respondWith(api(event.request));
    else if (url.pathname === '/login/session/two-step/username') event.respondWith(twoStepUsername(event.request));
    else if (url.pathname === '/login/session/two-step/password') event.respondWith(twoStepPassword(event.request));
    else if (url.pathname === '/login/session/transformed') event.respondWith(transformed(event.request));
});
