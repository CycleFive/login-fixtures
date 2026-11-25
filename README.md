# login-fixtures

Static login pages that behave like real sites toward the browser and report
what a credential filler did. Nothing typed leaves the browser.

Live at <https://login.page.twkr.io/>.

## What it is for

Testing anything that fills or submits a login form: password managers,
credential brokers (kharon), browser automation. Each page is one login
*shape*. A page is added only when a named test needs a shape that no page
has yet.

How it stays private: a `<form>` POST (or a script `fetch()`) is answered by a
**service worker on the same origin** that plays the server. It reads the
body, decides, and answers with a 303 redirect (or JSON), then forgets. The
request never reaches the network, but it is a real submitted login, so the
browser's password-save and form-history paths run as they would on a real
site. The inputs sit in a `<fieldset disabled>` until the worker controls the
page (`#login-form[data-ready="true"]`), so a fill or `form.submit()` before
that sends an empty body. See [`/login/about.html`](https://login.page.twkr.io/login/about.html)
for the mechanism and the measured Chrome storage results.

## Pages

| Page | Shape | Success |
|---|---|---|
| `/login.html` | Form POST, strict: only the public pair succeeds | Redirect to `/login/welcome.html` |
| `/login/any.html` | Form POST, accept-any: any non-empty pair | Redirect to `/login/welcome.html` |
| `/login/spa.html` | Script POST (`fetch()` of JSON), accept-any | Form removed, URL changed by `history.pushState` |
| `/login/spa-keep.html` | Script POST, accept-any | Form stays filled, URL unchanged |
| `/login/welcome.html` | Landing page, no credential fields | |

Planned for kharon's teach-mode live test (kharon #383): a two-step login, a
page that sends the SHA-256 of the password in place of the password, and a
drift variant of `/login/any.html` with the password field renamed.

## Selectors and receipts

- Public test pair: `testuser` / `correct-horse-battery-staple`.
- Fields: `#login-form`, `#username`, `#password`, `#submit`.
- `#login-status[data-state]`: `idle`, `error` or `not_ready` on the login
  pages; `success` on the welcome page and on `spa-keep.html` after a login.
- `#fill-report`: live character counts (`data-username-length`,
  `data-password-length`), never the values.
- `#submit-report`: the counts at the moment of the last successful submit,
  with `data-recorded="true"`. It stays put after the form is gone (welcome
  page, both script pages), so a fill-and-submit faster than a poll is still
  observable.
- `?expect=<sha256 hex of "username:password">` on a login page adds
  `data-match="true|false"` to the receipt. Use it with a long random canary
  only, since the digest is in the URL. The POST still carries the password
  as typed.

## What it does not test

No backend, by design: no cookies or server-side sessions, CSRF tokens, MFA,
rate limits, cross-origin redirects, or OAuth/SSO. A hard reload (outside the
worker) or a browser without service workers gets a disabled form. For the
Google Sign-In button, see
[cycle-five/public_oauth_test](https://github.com/cycle-five/public_oauth_test).

## Running the tests

    cd tests
    npm ci
    npx playwright install chromium
    npm test

The Pages workflow runs the same suite before every deploy. `tests/storage-control.mjs`
drives a real Chrome through a login and reports which storage tables gained
rows (counts and table names only); see [`tests/README.md`](tests/README.md).

Serve locally from the repo root (the worker needs the pages at `/`):

    python3 -m http.server 8000

## History

These pages were built in `cycle-five/public_oauth_test` and split out with
their history. The design notes and Chrome storage measurements are in the
original pull requests:
[#3](https://github.com/cycle-five/public_oauth_test/pull/3) (plain login page),
[#6](https://github.com/cycle-five/public_oauth_test/pull/6) (service-worker submit and storage results),
[#7](https://github.com/cycle-five/public_oauth_test/pull/7) (submit receipt, `?expect=`, keep-form page).

## License

Public domain, under the [Unlicense](UNLICENSE).
