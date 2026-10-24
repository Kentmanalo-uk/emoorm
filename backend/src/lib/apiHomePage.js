/**
 * The page a browser gets at /api: the E-MOORM API reference, in the
 * manner of Wikipedia's api.php. General rules first (the "main module"),
 * then every module and endpoint, read from the routes by lib/apiDocs.js:
 * method, path, who may call it, parameters, and a try-it link for public
 * reads. Programs asking for JSON still get the JSON welcome.
 */

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The access badge: who may call an endpoint. */
function accessBadge({ level, roles }) {
  if (level === 'partner') return '<span class="acc is-partner">Partner only</span>';
  if (roles && roles.length) return `<span class="acc is-role">${escapeHtml(roles.join(', '))}</span>`;
  if (level === 'signed-in') return '<span class="acc is-auth">Signed in</span>';
  if (level === 'optional') return '<span class="acc is-optional">Sign-in optional</span>';
  return '<span class="acc is-public">Public</span>';
}

// Public reads worth opening in a browser (not sign-in redirects or config).
const TRY_IT = new Set([
  '/health', '/products', '/stores', '/categories', '/municipalities', '/today',
  '/app-settings', '/banners', '/couriers',
]);

/** The path with its :params marked. */
const pathHtml = (path) => escapeHtml(path).replace(/:(\w+)/g, '<span class="pp">:$1</span>');

function endpointHtml(ep) {
  const id = slug(`${ep.method} ${ep.path}`);
  const params = ep.params.length ? `
          <table class="params">
            <thead><tr><th>Parameter</th><th>In</th><th>Required</th></tr></thead>
            <tbody>${ep.params.map((p) => `
              <tr><td><code>${escapeHtml(p.name)}</code></td><td>${escapeHtml(p.in)}</td><td>${p.required ? '<span class="req">Required</span>' : 'Optional'}</td></tr>`).join('')}
            </tbody>
          </table>` : '';
  const tryIt = ep.method === 'GET' && TRY_IT.has(ep.path.replace(/^\/[^/]+/, ''))
    ? `<p class="try">Try it: <a href="${escapeHtml(ep.path)}">${escapeHtml(ep.path)}</a></p>` : '';
  const search = `${ep.method} ${ep.path} ${ep.description} ${(ep.roles || []).join(' ')}`.toLowerCase();
  return `
        <article class="ep" id="${id}" data-search="${escapeHtml(search)}">
          <header>
            <span class="m is-${ep.method.toLowerCase()}">${ep.method}</span>
            <a class="ep-path" href="#${id}">${pathHtml(ep.path)}</a>
            ${accessBadge(ep)}
          </header>
          ${ep.description ? `<p class="desc">${escapeHtml(ep.description)}</p>` : ''}${params}${tryIt}
        </article>`;
}

/**
 * @param {Object} options
 * @param {String} options.origin - e.g. https://emoorm.shop
 * @param {String} options.prefix - the API prefix, e.g. /api
 * @param {String} options.version
 * @param {String} options.description
 * @param {Number} options.rateLimit - requests per minute per address
 * @param {{ modules: Array, total: Number }} options.docs - from lib/apiDocs
 * @returns {String} HTML
 */
function renderApiHome({ origin, prefix, version, description, rateLimit, docs }) {
  const base = `${origin}${prefix}`;
  const { modules, total } = docs;

  const toc = modules.map((m) => `
          <li data-mod="${slug(m.name)}"><a href="#mod-${slug(m.name)}"><span>${escapeHtml(m.name)}</span><small>${m.endpoints.length}</small></a></li>`).join('');

  const sections = modules.map((m) => `
      <section class="mod" id="mod-${slug(m.name)}" data-mod="${slug(m.name)}">
        <h2><span class="mod-name">${escapeHtml(m.name)}</span> <code>${escapeHtml(m.prefix)}</code></h2>
        <p class="mod-text">${escapeHtml(m.text)} <span class="mod-count">${m.endpoints.length} ${m.endpoints.length === 1 ? 'endpoint' : 'endpoints'}</span></p>
        ${m.endpoints.map(endpointHtml).join('')}
      </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>E-MOORM API reference</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&display=swap">
  <style>
    :root {
      --green: #059669; --green-dark: #047857; --green-50: #ecfdf5; --green-100: #d1fae5;
      --ink: #111827; --text: #374151; --muted: #6b7280; --line: #e5e7eb; --soft: #f9fafb;
    }
    * { box-sizing: border-box; }
    html { scroll-padding-top: 16px; }
    body { margin: 0; background: #fff; color: var(--ink); font-family: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.55; -webkit-font-smoothing: antialiased; }
    a { color: var(--green-dark); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 0 32px; }

    header.top { border-bottom: 1px solid #f3f4f6; }
    .bar { display: flex; align-items: center; justify-content: space-between; height: 70px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: #15803d; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; text-decoration: none; }
    .brand img { width: 32px; height: 32px; }
    .brand small { padding: 3px 9px; border-radius: 999px; background: var(--green-50); color: var(--green-dark); font-size: 12px; font-weight: 600; letter-spacing: 0; }
    .bar nav { display: flex; gap: 22px; font-size: 14px; }
    .bar nav a { color: var(--text); text-decoration: none; }
    .bar nav a:hover { color: var(--green-dark); }

    .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 40px; align-items: start; padding-top: 28px; padding-bottom: 64px; }

    /* Contents */
    .side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 32px); }
    .find { width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; }
    .find:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12); }
    .found { color: var(--muted); font-size: 12.5px; }
    .side h3 { margin: 4px 0 0; color: var(--muted); font-size: 12px; font-weight: 600; }
    .toc { margin: 0; padding: 0 4px 0 0; overflow-y: auto; list-style: none; }
    .toc a { display: flex; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 7px; color: var(--text); font-size: 13.5px; text-decoration: none; }
    .toc a:hover { background: var(--soft); color: var(--green-dark); }
    .toc small { color: #9ca3af; font-size: 12px; }
    .toc li.is-empty { display: none; }

    /* Intro */
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px; border: 1px solid var(--green-100); border-radius: 999px; background: var(--green-50); color: var(--green-dark); font-size: 12.5px; font-weight: 600; }
    .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
    h1 { margin: 12px 0 0; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
    .lead { max-width: 78ch; margin: 8px 0 0; color: var(--text); }
    .note { margin: 16px 0 0; padding: 12px 16px; border: 1px solid #fde68a; border-radius: 12px; background: #fffbeb; color: #78350f; font-size: 14px; }
    .base { display: flex; align-items: center; gap: 8px; max-width: 560px; margin-top: 16px; padding: 6px 6px 6px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--soft); }
    .base span { color: var(--muted); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
    .base code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button.copy { flex-shrink: 0; height: 32px; padding: 0 14px; border: 0; border-radius: 8px; background: var(--green-dark); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }

    /* Main module */
    .main-mod { margin-top: 32px; }
    h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0; padding-bottom: 8px; border-bottom: 1px solid var(--line); font-size: 21px; font-weight: 600; }
    h2 code { color: var(--muted); font-size: 14px; font-weight: 500; }
    dl.rules { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 0; margin: 14px 0 0; }
    dl.rules dt, dl.rules dd { margin: 0; padding: 11px 0; border-bottom: 1px solid #f3f4f6; }
    dl.rules dt { color: var(--ink); font-weight: 600; font-size: 14px; }
    dl.rules dd { color: var(--text); font-size: 14px; }
    dl.rules dd code { padding: 1px 6px; border-radius: 5px; background: var(--soft); color: var(--ink); }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    .codes { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 4px 10px; }
    .codes b { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 600; }

    /* Modules and endpoints */
    .mod { margin-top: 40px; }
    .mod-text { margin: 8px 0 14px; color: var(--muted); font-size: 14px; }
    .mod-count { margin-left: 6px; color: #9ca3af; }
    .ep { margin-top: 10px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; }
    .ep:target { border-color: var(--green); box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12); }
    .ep header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
    .m { display: inline-block; min-width: 58px; padding: 2px 0; border-radius: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.03em; text-align: center; }
    .m.is-get { background: #eff6ff; color: #1d4ed8; }
    .m.is-post { background: var(--green-50); color: var(--green-dark); }
    .m.is-put, .m.is-patch { background: #fffbeb; color: #b45309; }
    .m.is-delete { background: #fef2f2; color: #b91c1c; }
    .ep-path { flex: 1; min-width: 0; color: var(--ink); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13.5px; font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
    .ep-path:hover { color: var(--green-dark); }
    .pp { color: #7c3aed; }
    .acc { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .acc.is-public { background: var(--green-50); color: var(--green-dark); }
    .acc.is-optional { background: #f3f4f6; color: var(--text); }
    .acc.is-auth { background: #eff6ff; color: #1d4ed8; }
    .acc.is-role { background: #f5f3ff; color: #6d28d9; }
    .acc.is-partner { background: #1f2937; color: #fff; }
    .desc { margin: 8px 0 0; color: var(--text); font-size: 14px; }
    table.params { width: 100%; max-width: 640px; margin-top: 10px; border-collapse: collapse; font-size: 13.5px; }
    table.params th { padding: 6px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; }
    table.params td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; color: var(--text); }
    table.params td:first-child { color: var(--ink); }
    .req { color: #b91c1c; font-weight: 600; }
    .try { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
    .try a { font-family: ui-monospace, Menlo, Consolas, monospace; }
    .ep.is-hidden, .mod.is-hidden { display: none; }
    .nothing { display: none; margin-top: 28px; color: var(--muted); }

    footer { padding: 24px 0 40px; border-top: 1px solid #f3f4f6; color: var(--muted); font-size: 13px; }
    footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
    footer a { color: var(--muted); }

    @media (max-width: 960px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .side { position: static; max-height: none; }
      .toc { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); max-height: 240px; }
    }
    @media (max-width: 600px) {
      .wrap { padding: 0 16px; }
      .bar nav a:not(:last-child) { display: none; }
      h1 { font-size: 24px; }
      dl.rules { grid-template-columns: minmax(0, 1fr); }
      dl.rules dt { padding-bottom: 0; border-bottom: 0; }
      .base span { display: none; }
    }
  </style>
</head>
<body>
  <header class="top">
    <div class="wrap bar">
      <a class="brand" href="/"><img src="/brand-icon.svg" alt=""> emoorm <small>API</small></a>
      <nav>
        <a href="${escapeHtml(prefix)}/health">Status</a>
        <a href="/help">Help</a>
        <a href="/">Go to emoorm.shop</a>
      </nav>
    </div>
  </header>

  <div class="wrap layout">
    <aside class="side" aria-label="Contents">
      <input class="find" type="search" placeholder="Find an endpoint" aria-label="Find an endpoint">
      <span class="found" aria-live="polite">${total} endpoints in ${modules.length} modules</span>
      <h3>Contents</h3>
      <ul class="toc">
          <li><a href="#main-module"><span>Main module</span></a></li>${toc}
      </ul>
    </aside>

    <main>
      <span class="status"><i></i> API is running</span>
      <h1>E-MOORM API reference</h1>
      <p class="lead">${escapeHtml(description)}. This page lists all ${total} endpoints in ${modules.length} modules, with who may call each one and what it takes. It is built from the server's own routes, so it always matches what is running.</p>
      <p class="note">Most endpoints need you to sign in. Public ones you can open right here: look for <strong>Try it</strong>.</p>
      <div class="base">
        <span>Base URL</span>
        <code>${escapeHtml(base)}</code>
        <button class="copy" type="button" data-copy="${escapeHtml(base)}">Copy</button>
      </div>

      <section class="main-mod" id="main-module">
        <h2>Main module</h2>
        <dl class="rules">
          <dt>Version</dt>
          <dd>${escapeHtml(version)}</dd>
          <dt>Format</dt>
          <dd>JSON in, JSON out. Every answer is <code>{ success, message, data }</code>. Lists that page add <code>pagination: { total, page, pageSize, totalPages, hasNext, hasPrev }</code>.</dd>
          <dt>Signing in</dt>
          <dd><code>POST ${escapeHtml(prefix)}/auth/login</code> answers an <code>accessToken</code> and a <code>refreshToken</code>. Send <code>Authorization: Bearer &lt;accessToken&gt;</code> with each call. When it expires (401), get a new pair from <code>POST ${escapeHtml(prefix)}/auth/refresh-token</code>. Admins also give a 6-digit code from an authenticator app.</dd>
          <dt>Who may call</dt>
          <dd class="legend">
            <span class="acc is-public">Public</span> anyone
            <span class="acc is-optional">Sign-in optional</span> more for signed-in people
            <span class="acc is-auth">Signed in</span> any account
            <span class="acc is-role">Seller</span> only these roles
            <span class="acc is-partner">Partner only</span> partner systems
          </dd>
          <dt>Pages</dt>
          <dd><code>?page=</code> from 1, and <code>?pageSize=</code> (20 by default, at most 100).</dd>
          <dt>Limits</dt>
          <dd>${escapeHtml(rateLimit)} requests a minute per address, and tighter limits on signing in, password resets, uploads and sending messages. Over a limit: 429, with <code>RateLimit-*</code> headers.</dd>
          <dt>Status codes</dt>
          <dd class="codes">
            <b>200</b><span>OK. <b>201</b> created, <b>204</b> done with no body.</span>
            <b>400</b><span>The request is wrong; the message says why.</span>
            <b>401</b><span>Not signed in, or the token expired.</span>
            <b>403</b><span>Signed in, but not allowed (role, or not your record).</span>
            <b>404</b><span>Not found.</span>
            <b>409</b><span>Conflict, like a name already taken.</span>
            <b>422</b><span>Validation failed: <code>errors: [{ field, message }]</code>.</span>
            <b>429</b><span>Too many requests; wait and try again.</span>
            <b>503</b><span>Busy for a moment; retry after <code>Retry-After</code>.</span>
          </dd>
        </dl>
      </section>
${sections}
      <p class="nothing">No endpoint matches that.</p>
    </main>
  </div>

  <footer>
    <div class="wrap">
      <span>&copy; ${new Date().getFullYear()} E-MOORM, Oriental Mindoro</span>
      <span><a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="mailto:emoormshop@gmail.com">emoormshop@gmail.com</a></span>
    </div>
  </footer>

  <script>
    document.querySelectorAll('button.copy').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(button.getAttribute('data-copy')).then(function () {
          button.textContent = 'Copied';
          setTimeout(function () { button.textContent = 'Copy'; }, 1500);
        }, function () {});
      });
    });

    // Find: hide endpoints (and then modules) that do not match.
    (function () {
      var input = document.querySelector('.find');
      var found = document.querySelector('.found');
      var nothing = document.querySelector('.nothing');
      var mods = Array.prototype.slice.call(document.querySelectorAll('section.mod'));
      var initial = found.textContent;
      input.addEventListener('input', function () {
        var words = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
        var shown = 0;
        mods.forEach(function (mod) {
          var inMod = 0;
          var name = mod.getAttribute('data-mod');
          mod.querySelectorAll('.ep').forEach(function (ep) {
            var text = ep.getAttribute('data-search') + ' ' + name;
            var ok = words.every(function (w) { return text.indexOf(w) !== -1; });
            ep.classList.toggle('is-hidden', !ok);
            if (ok) inMod += 1;
          });
          mod.classList.toggle('is-hidden', inMod === 0);
          var li = document.querySelector('.toc li[data-mod="' + name + '"]');
          if (li) li.classList.toggle('is-empty', inMod === 0);
          shown += inMod;
        });
        found.textContent = words.length ? shown + (shown === 1 ? ' endpoint matches' : ' endpoints match') : initial;
        nothing.style.display = words.length && shown === 0 ? 'block' : 'none';
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderApiHome };
