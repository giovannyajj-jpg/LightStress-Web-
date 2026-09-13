(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Menú móvil
  // ---------------------------------------------------------------------
  const burger = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  burger.addEventListener('click', () => navLinks.classList.toggle('is-open'));
  navLinks.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => navLinks.classList.remove('is-open'))
  );

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  // ---------------------------------------------------------------------
  // Copiar IP
  // ---------------------------------------------------------------------
  document.getElementById('copyIpBtn').addEventListener('click', async () => {
    const ip = 'LightStress.xyz:19132';
    try {
      await navigator.clipboard.writeText(ip);
      showToast('IP copiada correctamente.');
    } catch (err) {
      showToast('No se pudo copiar la IP. Cópiala manualmente: ' + ip);
    }
  });

  // ---------------------------------------------------------------------
  // STATUS REAL — SSE con fallback a polling.
  // Nunca se muestran datos falsos: si no hay respuesta, se marca offline
  // y no se dejan cifras "viejas" como si fueran actuales.
  // ---------------------------------------------------------------------
  const dot1 = document.getElementById('statusDot');
  const dot2 = document.getElementById('statusDot2');
  const text1 = document.getElementById('statusText');
  const text2 = document.getElementById('statusText2');
  const playerCountEl = document.getElementById('playerCount');
  const infoPlayersEl = document.getElementById('infoPlayers');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const playersMessageEl = document.getElementById('playersMessage');

  function renderStatus(data) {
    const dots = [dot1, dot2];
    const texts = [text1, text2];

    if (data.online) {
      dots.forEach((d) => { d.classList.add('online'); d.classList.remove('offline'); });
      texts.forEach((t) => { t.textContent = '🟢 ONLINE'; });

      const players = data.players ?? '—';
      const max = data.maxPlayers ?? '—';
      playerCountEl.textContent = `${players} / ${max}`;
      infoPlayersEl.textContent = `${players} / ${max}`;

      if (data.players === 0) {
        playersMessageEl.textContent = 'No hay jugadores conectados actualmente.';
      } else {
        playersMessageEl.textContent = `${data.players} jugadores conectados. Máximo: ${data.maxPlayers}.`;
      }
    } else {
      dots.forEach((d) => { d.classList.add('offline'); d.classList.remove('online'); });
      texts.forEach((t) => { t.textContent = '🔴 SERVIDOR OFFLINE'; });
      playerCountEl.textContent = '— / —';
      infoPlayersEl.textContent = '— / —';
      playersMessageEl.textContent = 'No se puede obtener la lista de jugadores.';
    }

    if (data.lastUpdated) {
      const d = new Date(data.lastUpdated);
      lastUpdatedEl.textContent = `Última actualización: ${d.toLocaleTimeString('es-ES')}`;
    }
  }

  function startPolling() {
    async function poll() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const data = await res.json();
        renderStatus(data);
      } catch (err) {
        renderStatus({ online: false });
      }
    }
    poll();
    setInterval(poll, 8000);
  }

  function startStatusFeed() {
    if (!('EventSource' in window)) {
      startPolling();
      return;
    }
    try {
      const source = new EventSource('/api/status/stream');
      source.onmessage = (event) => {
        try {
          renderStatus(JSON.parse(event.data));
        } catch (_) { /* ignorar frame malformado */ }
      };
      source.onerror = () => {
        source.close();
        startPolling();
      };
    } catch (err) {
      startPolling();
    }
  }

  startStatusFeed();

  // ---------------------------------------------------------------------
  // Render genérico de secciones dinámicas (tienda / free ranks / eventos / sorteos)
  // Todo el contenido viene de config editable en el backend, no hardcodeado.
  // ---------------------------------------------------------------------
  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('request failed');
    return res.json();
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  async function renderShop() {
    const grid = document.getElementById('shopGrid');
    try {
      const products = await loadJSON('/api/products');
      products.forEach((p) => {
        const card = el('div', 'glass-card product-card');
        card.innerHTML = `
          <div class="product-card__icon">${p.icon}</div>
          <div class="product-card__name">${p.name}</div>
          <div class="product-card__desc">${p.description}</div>
          <div class="product-card__price">${p.price}</div>
          <ul class="product-card__benefits">
            ${(p.benefits || []).map((b) => `<li>${b}</li>`).join('')}
          </ul>
          <button class="btn btn--primary btn--full" data-product="${p.id}">${p.buttonLabel || 'COMPRAR'}</button>
        `;
        grid.appendChild(card);
      });
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-product]');
        if (!btn) return;
        showToast('La pasarela de pagos aún no está conectada. Próximamente.');
      });
    } catch (err) {
      grid.innerHTML = '<p>No se pudo cargar la tienda en este momento.</p>';
    }
  }

  async function renderFreeRanks() {
    const grid = document.getElementById('freeRanksGrid');
    try {
      const ranks = await loadJSON('/api/free-ranks');
      ranks.forEach((r) => {
        const card = el('div', 'glass-card');
        card.innerHTML = `
          <div class="product-card__name">${r.name}</div>
          <div class="product-card__desc">${r.description}</div>
          <div class="product-card__desc" style="margin-top:10px;color:var(--blue-400)">${r.howToGet}</div>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = '<p>No se pudieron cargar los rangos gratuitos.</p>';
    }
  }

  function formatCountdown(dateStr, timeStr) {
    const target = new Date(`${dateStr}T${timeStr || '00:00'}`);
    const diff = target.getTime() - Date.now();
    if (isNaN(target.getTime()) || diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  async function renderEvents() {
    const grid = document.getElementById('eventsGrid');
    try {
      const events = await loadJSON('/api/events');
      if (!events.length) {
        grid.innerHTML = '<p>No hay eventos programados por ahora.</p>';
        return;
      }
      events.forEach((ev) => {
        const card = el('div', 'glass-card');
        const countdown = formatCountdown(ev.date, ev.time);
        card.innerHTML = `
          <div class="product-card__name">🎉 ${ev.title}</div>
          <div class="product-card__desc">${ev.description}</div>
          <div class="event-card__date">📅 ${ev.date} · ⏰ ${ev.time || ''}</div>
          ${countdown ? `<div class="event-card__countdown">${countdown}</div>` : ''}
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = '<p>No se pudieron cargar los eventos.</p>';
    }
  }

  async function renderRaffles() {
    const grid = document.getElementById('rafflesGrid');
    try {
      const raffles = await loadJSON('/api/raffles');
      if (!raffles.length) {
        grid.innerHTML = '<p>No hay sorteos activos por ahora.</p>';
        return;
      }
      raffles.forEach((r) => {
        const card = el('div', 'glass-card');
        card.innerHTML = `
          <div class="product-card__name">🎁 ${r.prize}</div>
          <div class="raffle-card__meta">
            <span>📅 ${r.date}</span>
            <span>👥 ${r.participants} participantes</span>
            <span>🔥 ${r.status}</span>
          </div>
          <a href="https://discord.gg/8azZTpFVkq" target="_blank" rel="noopener" class="btn btn--primary btn--full" style="margin-top:16px">Participar</a>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = '<p>No se pudieron cargar los sorteos.</p>';
    }
  }

  renderShop();
  renderFreeRanks();
  renderEvents();
  renderRaffles();
})();
