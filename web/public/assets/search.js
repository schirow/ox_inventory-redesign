// Inventory toolbar: amount, search, sorting, favorites, settings
// (DOM addon, independent of the React build)
(() => {
  const PAGE_SIZE = 30; // ox loads slots in steps of 30

  const SORT_MODES = [
    { key: 'default', label: 'Sort' },
    { key: 'az', label: 'Name A–Z' },
    { key: 'za', label: 'Name Z–A' },
    { key: 'count', label: 'Amount' },
  ];

  const ICONS = {
    search:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sort: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    clear:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    wrench:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a4 4 0 0 1-5.2-5.2l2.6 2.6 2.4-.4.4-2.4z"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    arrowRight:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    arrowLeft:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  };

  // ---------- Theme (colors from data/theme.lua, sent by client.lua) ----------
  const hexToRgb = (hex) => {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    if (!/^[0-9a-f]{6}/i.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const mix = (rgb, target, amount) => rgb.map((c) => Math.round(c + (target - c) * amount));
  const toHex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
  const textOn = ([r, g, b]) => ((r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111' : '#fff');

  const applyTheme = (theme) => {
    if (!theme) return;
    const root = document.documentElement.style;
    const accent = hexToRgb(theme.accent);
    const highlight = hexToRgb(theme.highlight) || accent;

    if (accent) {
      root.setProperty('--p', toHex(accent));
      root.setProperty('--p-rgb', accent.join(' '));
      root.setProperty('--p2', toHex(mix(accent, 255, 0.3)));
      root.setProperty('--p-dark', toHex(mix(accent, 0, 0.25)));
    }
    if (highlight) {
      root.setProperty('--y', toHex(highlight));
      root.setProperty('--y-rgb', highlight.join(' '));
      root.setProperty('--y-dark', toHex(mix(highlight, 0, 0.2)));
      root.setProperty('--y-text', textOn(highlight));
    }
  };

  window.addEventListener('message', (e) => {
    if (e.data?.action === 'setTheme') applyTheme(e.data.data);
  });

  // ---------- NUI ----------
  const RESOURCE = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'ox_inventory';
  // ox replaces window.fetch with an empty function on load -> keep the real reference first
  const realFetch = window.fetch.bind(window);
  const nui = (name, data) =>
    Promise.resolve()
      .then(() =>
        realFetch(`https://${RESOURCE}/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(data ?? {}),
        })
      )
      .then((r) => r.json())
      .catch(() => null);

  // ---------- Storage ----------
  const load = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };

  const DEFAULT_SETTINGS = {
    favFirst: true, // favorites first when sorting
    showStars: true, // favorite stars on items
    remember: false, // keep search/sort when reopening
    autoFocus: false, // focus the search field when opening
    keepFavs: true, // keep favorites in the inventory on "Move all"
    defaultSort: 'default',
  };
  const settings = Object.assign({}, DEFAULT_SETTINGS, load('invAddonSettings', {}));
  const favs = new Set(load('invAddonFavs', []));
  const saveSettings = () => save('invAddonSettings', settings);
  const saveFavs = () => save('invAddonFavs', Array.from(favs));

  // state per inventory side (the inventory is removed completely when closed)
  const state = {
    player: { q: '', sort: settings.defaultSort, favOnly: false },
    other: { q: '', sort: settings.defaultSort },
  };

  const controllers = new Map(); // wrapper -> { side, bar }

  // ---------- Slot helpers ----------
  const getLabel = (slot) => {
    const el = slot.querySelector('.inventory-slot-label-text');
    return el ? el.textContent.trim() : '';
  };

  const getCount = (slot) => {
    for (const p of slot.querySelectorAll('.item-slot-info-wrapper p')) {
      const m = p.textContent.replace(/[,.\s]/g, '').match(/^x?(\d+)x?$/i);
      if (m) return parseInt(m[1], 10);
    }
    return getLabel(slot) ? 1 : 0;
  };

  const stopAll = (el) => {
    for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'dragstart'])
      el.addEventListener(ev, (e) => e.stopPropagation());
  };

  const ensureStar = (slot, label) => {
    let btn = slot.querySelector(':scope > .inv-fav-toggle');
    if (!label || !settings.showStars) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-fav-toggle';
      btn.innerHTML = ICONS.star;
      stopAll(btn);
      btn.addEventListener('click', () => {
        const l = getLabel(slot);
        if (!l) return;
        if (favs.has(l)) favs.delete(l);
        else favs.add(l);
        saveFavs();
        applyAll();
      });
      slot.appendChild(btn);
    }
    btn.title = favs.has(label) ? 'Remove from favorites' : 'Add to favorites';
    if (slot.querySelector('.inventory-slot-number')) btn.setAttribute('data-below-number', '');
    else btn.removeAttribute('data-below-number');
  };

  const setAttr = (el, name, on) => {
    if (on) {
      if (!el.hasAttribute(name)) el.setAttribute(name, '');
    } else if (el.hasAttribute(name)) el.removeAttribute(name);
  };

  // ---------- Filter & sorting ----------
  const apply = (wrapper) => {
    const ctl = controllers.get(wrapper);
    const grid = wrapper.querySelector('.inventory-grid-container');
    if (!ctl || !grid) return;

    const st = state[ctl.side];
    const query = st.q.trim().toLowerCase();
    const favOnly = ctl.side === 'player' && st.favOnly;
    const filtering = query !== '' || favOnly;
    const slots = Array.from(grid.querySelectorAll(':scope > .inventory-slot'));
    const info = new Map();

    for (const slot of slots) {
      const label = getLabel(slot);
      const fav = label !== '' && favs.has(label);
      const match = (!query || label.toLowerCase().includes(query)) && (!favOnly || fav);
      info.set(slot, { label, fav });
      setAttr(slot, 'data-inv-fav', fav);
      setAttr(slot, 'data-inv-hidden', filtering && !match);
      setAttr(slot, 'data-inv-ghost', false);
      ensureStar(slot, label);
    }

    // sorting (visual only via CSS order, slots stay the same on the server)
    if (st.sort === 'default') {
      for (const slot of slots) if (slot.style.order) slot.style.order = '';
    } else {
      const sorted = slots.slice().sort((a, b) => {
        const A = info.get(a);
        const B = info.get(b);
        if (!A.label !== !B.label) return A.label ? -1 : 1; // empty slots last
        if (!A.label) return 0;
        if (settings.favFirst && A.fav !== B.fav) return A.fav ? -1 : 1;
        if (st.sort === 'az') return A.label.localeCompare(B.label, 'en');
        if (st.sort === 'za') return B.label.localeCompare(A.label, 'en');
        return getCount(b) - getCount(a) || A.label.localeCompare(B.label, 'en');
      });
      sorted.forEach((slot, i) => {
        const o = String(i);
        if (slot.style.order !== o) slot.style.order = o;
      });
    }

    // keep the last slot as an invisible placeholder so ox keeps loading more slots
    const last = slots[slots.length - 1];
    if (filtering && last && slots.length % PAGE_SIZE === 0 && last.hasAttribute('data-inv-hidden')) {
      last.removeAttribute('data-inv-hidden');
      last.setAttribute('data-inv-ghost', '');
      last.style.order = '99999';
    }
  };

  const applyAll = () => controllers.forEach((_, w) => apply(w));

  // ---------- Building blocks ----------
  const createSearch = (wrapper, st) => {
    const field = document.createElement('label');
    field.className = 'inv-search-field';
    field.innerHTML = `${ICONS.search}<input type="text" placeholder="Search..." spellcheck="false" /><button type="button" class="inv-search-clear" title="Clear">${ICONS.clear}</button>`;
    const input = field.querySelector('input');
    const clear = field.querySelector('.inv-search-clear');

    const set = (v) => {
      input.value = v;
      st.q = v;
      field.classList.toggle('has-value', v !== '');
      apply(wrapper);
    };
    input.value = st.q;
    field.classList.toggle('has-value', st.q !== '');

    input.addEventListener('input', () => set(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value !== '') {
        e.stopPropagation();
        set('');
      }
    });
    clear.addEventListener('click', (e) => {
      e.preventDefault();
      set('');
      input.focus();
    });
    return field;
  };

  const createSort = (wrapper, st) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inv-sort-btn';
    btn.innerHTML = `${ICONS.sort}<span></span>`;
    const render = () => {
      const mode = SORT_MODES.find((m) => m.key === st.sort) || SORT_MODES[0];
      btn.querySelector('span').textContent = mode.label;
      btn.classList.toggle('active', mode.key !== 'default');
    };
    btn.addEventListener('click', () => {
      const i = SORT_MODES.findIndex((m) => m.key === st.sort);
      st.sort = SORT_MODES[(i + 1) % SORT_MODES.length].key;
      render();
      apply(wrapper);
    });
    render();
    return btn;
  };

  // custom amount field that drives the original (hidden) ox field
  const createAmount = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inv-amount';
    input.inputMode = 'numeric';
    input.title = 'Amount (0 = all)';
    input.spellcheck = false;

    const original = () => document.querySelector('.inventory-control .inventory-control-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    input.value = (original()?.value || '0').replace(/\D/g, '') || '0';
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      if (input.value !== digits) input.value = digits;
      const orig = original();
      if (!orig) return;
      setter.call(orig, digits || '0');
      orig.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.addEventListener('blur', () => {
      if (input.value === '') input.value = '0';
    });
    input.addEventListener('focus', () => input.select());
    return input;
  };

  const createFavButton = (wrapper, st) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inv-icon-btn inv-fav-btn';
    btn.title = 'Show favorites only';
    btn.innerHTML = ICONS.star;
    btn.classList.toggle('active', st.favOnly);
    btn.addEventListener('click', () => {
      st.favOnly = !st.favOnly;
      btn.classList.toggle('active', st.favOnly);
      apply(wrapper);
    });
    return btn;
  };

  const createSettings = () => {
    const wrap = document.createElement('div');
    wrap.className = 'inv-settings-wrap';

    const toggle = (key, label) =>
      `<label class="inv-set-row"><span>${label}</span><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}/><i class="inv-switch"></i></label>`;

    wrap.innerHTML =
      `<button type="button" class="inv-icon-btn inv-settings-btn" title="Settings">${ICONS.wrench}</button>` +
      `<div class="inv-settings-pop">` +
      `<div class="inv-set-title">Settings</div>` +
      toggle('favFirst', 'Favorites first when sorting') +
      toggle('showStars', 'Show favorite stars on items') +
      toggle('remember', 'Remember search & sorting') +
      toggle('autoFocus', 'Focus search field when opening') +
      toggle('keepFavs', 'Keep favorites on "Move all"') +
      `<label class="inv-set-row"><span>Default sorting</span><select data-key="defaultSort">` +
      SORT_MODES.map(
        (m) =>
          `<option value="${m.key}" ${settings.defaultSort === m.key ? 'selected' : ''}>${m.key === 'default' ? 'Slot order' : m.label}</option>`
      ).join('') +
      `</select></label>` +
      `<div class="divider"></div>` +
      `<button type="button" class="inv-set-reset">Reset favorites (<b>${favs.size}</b>)</button>` +
      `</div>`;

    const btn = wrap.querySelector('.inv-settings-btn');
    const pop = wrap.querySelector('.inv-settings-pop');
    const reset = wrap.querySelector('.inv-set-reset');

    btn.addEventListener('click', () => {
      reset.querySelector('b').textContent = favs.size;
      wrap.classList.toggle('open');
    });
    pop.querySelectorAll('input[data-key]').forEach((cb) =>
      cb.addEventListener('change', () => {
        settings[cb.dataset.key] = cb.checked;
        saveSettings();
        applyAll();
      })
    );
    pop.querySelector('select').addEventListener('change', (e) => {
      settings.defaultSort = e.target.value;
      saveSettings();
    });
    reset.addEventListener('click', () => {
      favs.clear();
      saveFavs();
      reset.querySelector('b').textContent = '0';
      applyAll();
    });
    return wrap;
  };

  // ---------- Bags drawer (docked to the player inventory) + move all right/left ----------
  let bagsTimer = null;
  let middle = null;
  let bagsEl = null;

  const renderBags = (bags) => {
    if (!bagsEl || !bagsEl.isConnected) return;
    const list = Array.isArray(bags) ? bags : [];
    bagsEl.querySelector('.inv-bags-count').textContent = list.length;
    bagsEl.classList.toggle('no-bags', list.length === 0);

    const box = bagsEl.querySelector('.inv-bags-list');
    box.textContent = '';
    if (list.length === 0) {
      box.innerHTML = '<div class="inv-bags-empty">No bags in your inventory</div>';
      return;
    }
    for (const bag of list) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'inv-bag-row' + (bag.open ? ' open' : '');
      const img = document.createElement('img');
      img.src = `nui://${RESOURCE}/web/images/${bag.name}.png`;
      img.onerror = () => (img.style.visibility = 'hidden');
      const label = document.createElement('span');
      label.textContent = bag.label;
      row.append(img, label);
      if (bag.open) {
        const tag = document.createElement('i');
        tag.textContent = 'Open';
        row.append(tag);
      }
      row.addEventListener('click', () => {
        bagsEl.classList.remove('open');
        if (!bag.open) nui('useItem', bag.slot);
      });
      box.append(row);
    }
  };

  const refreshBags = () => {
    clearTimeout(bagsTimer);
    bagsTimer = setTimeout(() => nui('getBags').then(renderBags), 250);
  };

  const transfer = (direction, btn) => {
    const data = { direction };
    if (direction === 'toRight') {
      data.query = state.player.q.trim();
      if (state.player.favOnly) data.only = Array.from(favs);
      else if (settings.keepFavs) data.exclude = Array.from(favs);
    } else {
      data.query = state.other.q.trim();
    }
    middle.querySelectorAll('.inv-arrow').forEach((b) => (b.disabled = true));
    btn.classList.add('busy');
    nui('transferAll', data).finally(() => {
      btn.classList.remove('busy');
      middle.querySelectorAll('.inv-arrow').forEach((b) => (b.disabled = false));
      refreshBags();
    });
  };

  // the drawer hangs on the right edge of the player inventory, the tab on the drawer
  const createBags = () => {
    bagsEl = document.createElement('div');
    bagsEl.className = 'inv-bags';
    bagsEl.innerHTML =
      `<div class="inv-bags-drawer"><div class="inv-bags-inner">` +
      `<div class="inv-set-title">Bags</div><div class="inv-bags-list"></div>` +
      `</div></div>` +
      `<button type="button" class="inv-bags-tab" title="Bags">${ICONS.chevron}<span>Bags</span><b class="inv-bags-count">0</b></button>`;
    stopAll(bagsEl);

    bagsEl.querySelector('.inv-bags-tab').addEventListener('click', () => {
      bagsEl.classList.toggle('open');
      if (bagsEl.classList.contains('open')) nui('getBags').then(renderBags);
    });
    return bagsEl;
  };

  const mountMiddle = (control) => {
    middle = document.createElement('div');
    middle.className = 'inv-middle';
    middle.innerHTML =
      `<button type="button" class="inv-arrow" data-dir="toRight" title="Move all right (or search results)">${ICONS.arrowRight}</button>` +
      `<button type="button" class="inv-arrow" data-dir="toLeft" title="Move all left (or search results)">${ICONS.arrowLeft}</button>`;
    middle.querySelectorAll('.inv-arrow').forEach((btn) =>
      btn.addEventListener('click', () => transfer(btn.dataset.dir, btn))
    );
    control.appendChild(middle);
  };

  // double-click an item in the player inventory = use it
  // ox always renders slots in slot order (sorting is CSS order only) -> index + 1 = slot
  document.addEventListener('dblclick', (e) => {
    const slot = e.target instanceof Element && e.target.closest('.inventory-slot');
    if (!slot || !getLabel(slot)) return;

    const grid = slot.parentElement;
    const wrapper = grid?.closest('.inventory-grid-wrapper');
    if (!grid?.classList.contains('inventory-grid-container') || controllers.get(wrapper)?.side !== 'player') return;

    const index = Array.prototype.indexOf.call(grid.children, slot);
    if (index >= 0) nui('useItem', index + 1);
  });

  document.addEventListener('mousedown', (e) => {
    document.querySelectorAll('.inv-bags.open').forEach((w) => {
      if (!w.contains(e.target)) w.classList.remove('open');
    });
    document.querySelectorAll('.inv-settings-wrap.open').forEach((w) => {
      if (!w.contains(e.target)) w.classList.remove('open');
    });
  });

  // ---------- Mounting ----------
  const resetState = (st) => {
    if (settings.remember) return;
    st.q = '';
    st.sort = settings.defaultSort;
    if ('favOnly' in st) st.favOnly = false;
  };

  const mountPlayer = (wrapper) => {
    const st = state.player;
    resetState(st);
    const bar = document.createElement('div');
    bar.className = 'inv-toolbar';
    const search = createSearch(wrapper, st);
    bar.append(createAmount(), search, createSort(wrapper, st), createFavButton(wrapper, st), createSettings());
    wrapper.append(bar, createBags());
    controllers.set(wrapper, { side: 'player', bar });
    playerSignature = '';
    if (settings.autoFocus) setTimeout(() => search.querySelector('input').focus(), 50);
  };

  const mountOther = (wrapper) => {
    const header = wrapper.firstElementChild;
    if (!header || header.classList.contains('inventory-grid-container')) return;
    const st = state.other;
    resetState(st);
    const bar = document.createElement('div');
    bar.className = 'inv-search-bar';
    bar.append(createSearch(wrapper, st), createSort(wrapper, st));
    header.appendChild(bar);
    controllers.set(wrapper, { side: 'other', bar });
  };

  let playerSignature = '';

  const scan = () => {
    for (const w of controllers.keys()) if (!w.isConnected) controllers.delete(w);

    document.querySelectorAll('.inventory-wrapper > .inventory-grid-wrapper').forEach((wrapper) => {
      if (!controllers.has(wrapper)) {
        if (wrapper.parentElement.firstElementChild === wrapper) mountPlayer(wrapper);
        else mountOther(wrapper);
      }

      // right side is only the ground (empty = newdrop, "Drop 123" = pile) -> title "Ground"
      if (controllers.get(wrapper)?.side === 'other') {
        const title = wrapper.querySelector('.inventory-grid-header-wrapper p:first-child');
        const text = title ? title.textContent.trim() : '';
        setAttr(wrapper, 'data-inv-ground', text === '' || /^Drop \d+$/.test(text));
      }

      apply(wrapper);
    });

    const control = document.querySelector('.inventory-wrapper > .inventory-control');
    if (control && !control.querySelector('.inv-middle')) mountMiddle(control);

    // update the bag count whenever the player inventory changes
    const playerGrid = document.querySelector('.inventory-wrapper > .inventory-grid-wrapper:first-child .inventory-grid-container');
    if (playerGrid && bagsEl?.isConnected) {
      const sig = Array.from(playerGrid.querySelectorAll(':scope > .inventory-slot'), getLabel).join('|');
      if (sig !== playerSignature) {
        playerSignature = sig;
        refreshBags();
      }
    }
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  };

  const start = () => {
    const root = document.getElementById('root');
    if (!root) return setTimeout(start, 100);
    document.body.classList.add('inv-addon');
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true, characterData: true });
    schedule();
  };

  start();
})();
