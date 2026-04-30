// AKMSMP frontend - vanilla JS SPA
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const State = { user: null, settings: null, view: 'shop' };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}

function tpl(id) {
  return document.importNode($('#' + id).content, true);
}

function fmtINR(n) { return Number(n).toLocaleString('en-IN'); }
function fmtNum(n) { return Number(n).toLocaleString('en-IN'); }
function fmtDate(ts) { if (!ts) return ''; const d = new Date(Number(ts)); return d.toLocaleString(); }

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  const u = State.user;
  if (!u) {
    nav.innerHTML = `<button data-go="auth" class="${State.view==='auth'?'active':''}">Login / Signup</button>`;
  } else {
    nav.innerHTML = `
      <button data-go="shop" class="${State.view==='shop'?'active':''}">Shop</button>
      <button data-go="orders" class="${State.view==='orders'?'active':''}">Order History</button>
      ${u.isAdmin ? `<button data-go="admin" class="${State.view==='admin'?'active':''}">Admin</button>` : ''}
      <span class="who">${u.email}</span>
      <button data-go="logout">Logout</button>
    `;
  }
  $$('button[data-go]', nav).forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));
}

async function navigate(view) {
  if (view === 'logout') {
    await api('/api/logout', { method: 'POST' });
    State.user = null;
    return navigate('auth');
  }
  if (!State.user && view !== 'auth') view = 'auth';
  State.view = view;
  renderNav();
  const root = $('#view');
  root.innerHTML = '';
  if (view === 'auth') return renderAuth(root);
  if (view === 'shop') return renderShop(root);
  if (view === 'orders') return renderOrders(root);
  if (view === 'admin') return renderAdmin(root);
}

// ---------- AUTH ----------
function renderAuth(root) {
  root.appendChild(tpl('t-auth'));
  let mode = 'login';
  const setMode = (m) => {
    mode = m;
    $$('.tab', root).forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    $('#authTitle').textContent = m === 'login' ? 'Welcome back' : 'Create your account';
    $('#authSub').textContent = m === 'login' ? 'Sign in to your AKMSMP account.' : 'Sign up with email and password.';
    const pw = $('input[name=password]');
    pw.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
  };
  $$('.tab', root).forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { email: fd.get('email'), password: fd.get('password') };
    try {
      const data = await api('/api/' + mode, { method: 'POST', body });
      State.user = data.user;
      toast(mode === 'login' ? 'Welcome back.' : 'Account created.', 'success');
      navigate('shop');
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------- SHOP ----------
async function renderShop(root) {
  root.appendChild(tpl('t-shop'));
  try {
    const { items } = await api('/api/items');
    const grid = $('#items', root);
    if (!items.length) { grid.innerHTML = '<p class="muted">No items available right now.</p>'; return; }
    grid.innerHTML = items.map(it => `
      <div class="item-card">
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="value">${fmtNum(it.akmValue)} AKM Dollars</div>
        <div class="price">₹${fmtINR(it.priceInr)}</div>
        <button class="btn primary glow buy" data-id="${it.id}">Buy Now</button>
      </div>
    `).join('');
    $$('.buy', grid).forEach(b => b.addEventListener('click', () => beginPurchase(b.dataset.id)));
  } catch (err) { toast(err.message, 'error'); }
}

async function beginPurchase(itemId) {
  try {
    const { order } = await api('/api/orders', { method: 'POST', body: { itemId } });
    renderPay(order);
  } catch (err) { toast(err.message, 'error'); }
}

async function renderPay(order) {
  const root = $('#view');
  root.innerHTML = '';
  root.appendChild(tpl('t-pay'));
  $('#payOrderId').textContent = order.id.slice(-6).toUpperCase();
  $('#payItem').textContent = order.itemName;
  $('#payPrice').textContent = fmtINR(order.priceInr);
  $('#payValue').textContent = fmtNum(order.akmValue);

  const s = State.settings || await loadSettings();
  $('#upiId').textContent = s.upiId || '—';
  $('#upiName').textContent = s.upiName || 'AKMSMP';

  const upiUrl = `upi://pay?pa=${encodeURIComponent(s.upiId || '')}&pn=${encodeURIComponent(s.upiName || 'AKMSMP')}&am=${encodeURIComponent(order.priceInr)}&cu=INR&tn=${encodeURIComponent('AKMSMP ' + order.id.slice(-6))}`;
  const qrSrc = s.qrImagePath
    ? s.qrImagePath
    : `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiUrl)}`;
  $('#qrImg').src = qrSrc;

  $('#backToShop').addEventListener('click', () => navigate('shop'));
  $('#utrForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const utr = new FormData(e.target).get('utr');
    try {
      await api(`/api/orders/${order.id}/utr`, { method: 'POST', body: { utr } });
      toast('Submitted. Waiting for admin approval.', 'success');
      navigate('orders');
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function loadSettings() {
  const s = await api('/api/settings/public');
  State.settings = s;
  return s;
}

// ---------- ORDERS ----------
async function renderOrders(root) {
  root.appendChild(tpl('t-orders'));
  try {
    const { orders } = await api('/api/orders/mine');
    const list = $('#myOrders', root);
    if (!orders.length) { list.innerHTML = '<p class="muted">No orders yet. Head to the shop to buy a pack.</p>'; return; }
    list.innerHTML = orders.map(o => `
      <div class="order-row">
        <div>
          <div class="item-name">${escapeHtml(o.itemName)} <span class="muted">· ₹${fmtINR(o.priceInr)} · ${fmtNum(o.akmValue)} AKM</span></div>
          <div class="meta">Order #${o.id.slice(-6).toUpperCase()} · ${fmtDate(o.createdAt)}${o.utr ? ' · UTR: ' + escapeHtml(o.utr) : ''}</div>
        </div>
        <div style="text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <span class="status ${o.status}">${statusLabel(o.status)}</span>
          ${o.code ? `<span class="code-box ${o.used==='true'?'used':''}" title="${o.used==='true'?'Already redeemed':'Magic code'}">${o.code}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
}

function statusLabel(s) {
  return ({
    awaiting_utr: 'Waiting for UTR',
    processing: 'Processing',
    paid: 'Paid',
    rejected: 'Rejected',
  })[s] || s;
}

// ---------- ADMIN ----------
async function renderAdmin(root) {
  root.appendChild(tpl('t-admin'));
  let tab = 'orders';
  const showTab = (t) => {
    tab = t;
    $$('.admin-tabs .tab', root).forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    if (t === 'orders') return renderAdminOrders();
    if (t === 'items') return renderAdminItems();
    if (t === 'settings') return renderAdminSettings();
  };
  $$('.admin-tabs .tab', root).forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab('orders');
}

async function renderAdminOrders() {
  const body = $('#adminBody');
  body.innerHTML = '<p class="muted">Loading orders…</p>';
  try {
    const { orders } = await api('/api/admin/orders');
    if (!orders.length) { body.innerHTML = '<p class="muted">No orders yet.</p>'; return; }
    body.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="admin-table">
        <thead><tr>
          <th>Order</th><th>User</th><th>Item</th><th>UTR</th><th>Status</th><th>Code</th><th>Created</th><th></th>
        </tr></thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td>#${o.id.slice(-6).toUpperCase()}</td>
              <td>${escapeHtml(o.userEmail)}</td>
              <td>${escapeHtml(o.itemName)}<br><span class="muted small">₹${fmtINR(o.priceInr)} · ${fmtNum(o.akmValue)} AKM</span></td>
              <td>${o.utr ? escapeHtml(o.utr) : '<span class="muted">—</span>'}</td>
              <td><span class="status ${o.status}">${statusLabel(o.status)}</span></td>
              <td>${o.code ? `<span class="code-box ${o.used==='true'?'used':''}">${o.code}</span>` : '<span class="muted">—</span>'}</td>
              <td class="muted small">${fmtDate(o.createdAt)}</td>
              <td>
                <div class="actions">
                  ${o.status === 'processing' ? `
                    <button class="btn small success" data-act="accept" data-id="${o.id}">Accept</button>
                    <button class="btn small danger" data-act="reject" data-id="${o.id}">Reject</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
    $$('button[data-act]', body).forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.act, id = b.dataset.id;
      try {
        await api(`/api/admin/orders/${id}/${act}`, { method: 'POST' });
        toast(act === 'accept' ? 'Order accepted, code generated.' : 'Order rejected.', 'success');
        renderAdminOrders();
      } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) { toast(err.message, 'error'); body.innerHTML = '<p class="muted">Failed to load.</p>'; }
}

async function renderAdminItems() {
  const body = $('#adminBody');
  body.innerHTML = '<p class="muted">Loading items…</p>';
  try {
    const { items } = await api('/api/admin/items');
    body.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Price (₹)</th><th>AKM Value</th><th>Sort</th><th>Visible</th><th></th></tr></thead>
        <tbody id="itemsBody">
          ${items.map(it => itemRow(it)).join('')}
        </tbody>
      </table></div>
      <h3 style="margin-top:24px;">Add a new pack</h3>
      <form id="newItem" class="form">
        <label>Name <input name="name" required placeholder="e.g. 250,000 AKM Dollars"/></label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <label>Price (₹)<input name="priceInr" required type="number" min="1"/></label>
          <label>AKM Value<input name="akmValue" required type="number" min="1"/></label>
          <label>Sort Order<input name="sortOrder" type="number" min="1" placeholder="optional"/></label>
        </div>
        <button class="btn primary" type="submit">Add Pack</button>
      </form>
    `;
    bindItemRows();
    $('#newItem').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/admin/items', { method: 'POST', body: {
          name: fd.get('name'), priceInr: fd.get('priceInr'),
          akmValue: fd.get('akmValue'), sortOrder: fd.get('sortOrder'),
        }});
        toast('Pack added.', 'success');
        renderAdminItems();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (err) { toast(err.message, 'error'); }
}

function itemRow(it) {
  return `
    <tr data-id="${it.id}">
      <td><input class="row-input" data-field="name" value="${escapeAttr(it.name)}"/></td>
      <td><input class="row-input" data-field="priceInr" type="number" min="0" value="${escapeAttr(it.priceInr)}" style="width:90px"/></td>
      <td><input class="row-input" data-field="akmValue" type="number" min="0" value="${escapeAttr(it.akmValue)}" style="width:120px"/></td>
      <td><input class="row-input" data-field="sortOrder" type="number" value="${escapeAttr(it.sortOrder)}" style="width:70px"/></td>
      <td><input class="row-input" data-field="visible" type="checkbox" ${it.visible !== 'false' ? 'checked' : ''}/></td>
      <td><div class="actions">
        <button class="btn small" data-act="save">Save</button>
        <button class="btn small danger" data-act="delete">Delete</button>
      </div></td>
    </tr>`;
}

function bindItemRows() {
  $$('#itemsBody tr').forEach(tr => {
    const id = tr.dataset.id;
    $$('button[data-act]', tr).forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.act === 'delete') {
        if (!confirm('Delete this pack?')) return;
        try { await api(`/api/admin/items/${id}`, { method: 'DELETE' }); toast('Deleted.', 'success'); renderAdminItems(); }
        catch (err) { toast(err.message, 'error'); }
      } else {
        const body = {};
        $$('.row-input', tr).forEach(inp => {
          const f = inp.dataset.field;
          body[f] = inp.type === 'checkbox' ? inp.checked : inp.value;
        });
        try { await api(`/api/admin/items/${id}`, { method: 'PUT', body }); toast('Saved.', 'success'); renderAdminItems(); }
        catch (err) { toast(err.message, 'error'); }
      }
    }));
  });
}

async function renderAdminSettings() {
  const body = $('#adminBody');
  body.innerHTML = '<p class="muted">Loading settings…</p>';
  try {
    const { settings } = await api('/api/admin/settings');
    const get = (k) => (settings.find(s => s.key === k) || {}).value || '';
    body.innerHTML = `
      <form id="settingsForm" class="form" style="max-width:520px;">
        <label>Server / Brand Name<input name="serverName" value="${escapeAttr(get('serverName'))}"/></label>
        <label>UPI ID (e.g. yourname@upi)<input name="upiId" value="${escapeAttr(get('upiId'))}"/></label>
        <label>UPI Display Name<input name="upiName" value="${escapeAttr(get('upiName'))}"/></label>
        <label>Custom QR Image URL <span class="muted small">(optional - leave blank to auto-generate)</span>
          <input name="qrImagePath" value="${escapeAttr(get('qrImagePath'))}" placeholder="/img/your-qr.png or full URL"/>
        </label>
        <button class="btn primary" type="submit">Save Settings</button>
      </form>
      <p class="muted small" style="margin-top:24px;">Tip: To use your own QR image, upload it into the <code>public/img/</code> folder and put e.g. <code>/img/my-qr.png</code> here.</p>
    `;
    $('#settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await api('/api/admin/settings', { method: 'PUT', body });
        State.settings = null; // force reload next time
        toast('Settings saved.', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- helpers ----------
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// ---------- bootstrap ----------
(async () => {
  try {
    const { user } = await api('/api/me');
    State.user = user;
    const s = await api('/api/settings/public');
    State.settings = s;
    if (s.serverName) $('#serverName').textContent = s.serverName;
  } catch {}
  navigate(State.user ? 'shop' : 'auth');
})();
