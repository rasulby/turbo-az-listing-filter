// ==UserScript==
// @name         Turbo.az Listing Filter
// @namespace    local.turbo-filter
// @version      1.4.0
// @description  Adds local saved and hidden vehicle filters to Turbo.az listings.
// @author       Turbo.az Listing Filter contributors
// @match        https://turbo.az/*
// @match        https://*.turbo.az/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = false;
  const TARGET_VISIBLE_CARDS = 20;
  const MAX_EXTRA_PAGES = 10;
  const STORAGE_KEY = 'turbo-filter:v1';
  const CARD_SELECTOR = '.products-i';
  const OWN_UI = '[data-turbo-filter-ui]';
  const debug = (...args) => { if (DEBUG) console.debug('[Turbo Filter]', ...args); };
  const cleanText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const normalizeModel = value => cleanText(value).toLowerCase();
  const normalizeYear = value => /^(19|20)\d{2}$/.test(cleanText(value)) ? cleanText(value) : null;

  function normalizeEngine(value) {
    const match = cleanText(value).match(/^(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:l|л|lit(?:er|re)s?)?$/i);
    if (!match) return null;
    const number = Number(match[1].replace(',', '.'));
    return number > 0 && number <= 30 ? String(number) : null;
  }

  // Turbo.az supplies brand and model together; retain the full name as the identity.
  function getBrandModel(card) {
    return cleanText(card.querySelector('.products-i__name')?.textContent) || null;
  }

  function getCarYear(card) {
    const text = cleanText(card.querySelector('.products-i__attributes')?.textContent);
    return normalizeYear(text.match(/(?:^|[^\d])(19\d{2}|20\d{2})(?!\d)/)?.[1]);
  }

  function getEngineSize(card) {
    const text = cleanText(card.querySelector('.products-i__attributes')?.textContent);
    const withUnit = text.match(/(?:^|[\s,;|])(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:l|л|lit(?:er|re)s?)(?=$|[\s,;|])/i);
    if (withUnit) return normalizeEngine(withUnit[1]);
    // Unitless engine values are accepted only in the engine slot after the year.
    const unitless = text.match(/^(?:19|20)\d{2}\s*[,;|]\s*(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:[,;|]|$)/);
    return unitless ? normalizeEngine(unitless[1]) : null;
  }

  function readCar(card) {
    return { model: getBrandModel(card), year: getCarYear(card), engine: getEngineSize(card) };
  }

  function entryKey(entry, hidden = false) {
    const values = [normalizeModel(entry.model)];
    if (entry.year) values.push(entry.year);
    if (hidden && entry.engine) values.push(entry.engine);
    return JSON.stringify(values);
  }

  function ruleCovers(rule, entry) {
    return normalizeModel(rule.model) === normalizeModel(entry.model)
      && (!rule.year || rule.year === entry.year)
      && (!rule.engine || rule.engine === entry.engine);
  }

  function matchesHiddenRule(car) {
    return hiddenKeys.has(entryKey({ model: car.model }))
      || (Boolean(car.year) && hiddenKeys.has(entryKey({ model: car.model, year: car.year })))
      || (Boolean(car.year && car.engine) && hiddenKeys.has(entryKey(car, true)));
  }

  function formatEntry(entry) {
    return [entry.model, entry.year, entry.engine].filter(Boolean).join(' — ');
  }

  const storage = {
    read() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const result = { saved: [], hidden: [] };
        for (const section of ['saved', 'hidden']) {
          const seen = new Set();
          for (const value of Array.isArray(raw?.[section]) ? raw[section] : []) {
            if (!value || typeof value.model !== 'string') continue;
            const entry = { model: cleanText(value.model) };
            if (section === 'saved' || Object.hasOwn(value, 'year')) {
              entry.year = normalizeYear(value.year);
              if (!entry.year) continue;
            }
            if (section === 'hidden' && Object.hasOwn(value, 'engine')) {
              entry.engine = normalizeEngine(value.engine);
              if (!entry.year || !entry.engine) continue;
            }
            if (!entry.model) continue;
            const key = entryKey(entry, section === 'hidden');
            if (!seen.has(key)) result[section].push(entry);
            seen.add(key);
          }
        }
        return result;
      } catch (error) {
        debug('Cannot read stored configurations', error);
        return { saved: [], hidden: [] };
      }
    },
    write(value) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn('[Turbo Filter] Could not save configurations.', error);
        return false;
      }
    }
  };

  let state = storage.read();
  let savedKeys = new Set();
  let hiddenKeys = new Set();
  let panelBody;
  let toggle;
  let status;
  let hideMenu;
  let hideMenuButton;

  function rebuildKeys() {
    savedKeys = new Set(state.saved.map(entry => entryKey(entry)));
    hiddenKeys = new Set(state.hidden.map(entry => entryKey(entry, true)));
  }

  function changeEntry(section, car, remove = false) {
    const hidden = section === 'hidden';
    const entry = { model: car.model };
    if (car.year) entry.year = car.year;
    if (hidden && car.engine) entry.engine = car.engine;
    if (!entry.model || (!hidden && !entry.year) || (entry.engine && !entry.year)) return;
    const next = storage.read();
    const key = entryKey(entry, hidden);
    if (hidden && !remove) {
      if (next.hidden.some(item => ruleCovers(item, entry))) return;
      next.hidden = next.hidden.filter(item => !ruleCovers(entry, item));
    }
    next[section] = next[section].filter(item => entryKey(item, hidden) !== key);
    if (!remove) next[section].push(entry);
    commitState(next);
  }

  function clearSection(section) {
    const message = section === 'saved' ? 'Remove all saved models?' : 'Restore all hidden models?';
    if (!window.confirm(message)) return;
    const next = storage.read();
    next[section] = [];
    commitState(next);
  }

  function commitState(next) {
    if (!storage.write(next)) {
      panelBody.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      status.textContent = 'Browser storage is unavailable. Your change was not saved.';
      return;
    }
    status.textContent = '';
    state = next;
    refresh();
  }

  function makeButton(label, title, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
  }

  function closeHideMenu() {
    hideMenu?.remove();
    hideMenuButton?.setAttribute('aria-expanded', 'false');
    hideMenu = null;
    hideMenuButton = null;
  }

  function openHideMenu(card, button) {
    const wasOpen = hideMenuButton === button;
    closeHideMenu();
    if (wasOpen) return;
    const car = readCar(card);
    if (!car.model) return;
    hideMenuButton = button;
    button.setAttribute('aria-expanded', 'true');
    hideMenu = document.createElement('div');
    hideMenu.id = 'turbo-filter-hide-menu';
    hideMenu.dataset.turboFilterUi = '';
    hideMenu.append('Hide:');
    const choose = scope => {
      const current = readCar(card);
      closeHideMenu();
      if (!card.isConnected || (scope !== 'model' && !current.year)
        || (scope === 'engine' && !current.engine)) return;
      const entry = { model: current.model };
      if (scope !== 'model') entry.year = current.year;
      if (scope === 'engine') entry.engine = current.engine;
      changeEntry('hidden', entry);
    };
    const model = makeButton(car.model, 'Hide this brand and model, all years and engines', () => choose('model'));
    const year = makeButton(car.year ? formatEntry({ model: car.model, year: car.year }) : 'Model + Year (year unavailable)',
      'Hide this brand, model and year, all engines', () => choose('year'));
    const engine = makeButton(car.year && car.engine ? formatEntry(car) : 'Model + Year + Engine (unavailable)',
      'Hide this brand, model, year and engine', () => choose('engine'));
    year.disabled = !car.year;
    engine.disabled = !car.year || !car.engine;
    hideMenu.append(model, year, engine);
    // Mount outside the card so its overflow and advertisement link cannot cover the menu.
    hideMenu.addEventListener('click', event => event.stopPropagation());
    document.body.append(hideMenu);
    const rect = button.getBoundingClientRect();
    const menuRect = hideMenu.getBoundingClientRect();
    hideMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menuRect.width - 8))}px`;
    const top = rect.bottom + 4 + menuRect.height <= window.innerHeight - 8
      ? rect.bottom + 4 : rect.top - menuRect.height - 4;
    hideMenu.style.top = `${Math.max(8, top)}px`;
    model.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    if (hideMenu && !hideMenu.contains(event.target) && !hideMenuButton.contains(event.target)) closeHideMenu();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && hideMenu) {
      const button = hideMenuButton;
      closeHideMenu();
      button.focus();
    }
  });
  window.addEventListener('resize', closeHideMenu);
  document.addEventListener('scroll', closeHideMenu, true);

  function processCard(card) {
    try {
      const car = readCar(card);
      const canSave = Boolean(car.model && car.year);
      const canHide = Boolean(car.model);
      let controls = card.querySelector('[data-turbo-filter-controls]');
      if (card.dataset.turboFilterProcessed !== 'true' || !controls) {
        controls?.remove();
        controls = document.createElement('div');
        controls.dataset.turboFilterUi = '';
        controls.dataset.turboFilterControls = '';
        controls.append(
          makeButton('★', 'Save model and year', () => changeEntry('saved', readCar(card))),
          makeButton('🚫', 'Choose a hidden rule', () => openHideMenu(card, controls.children[1]))
        );
        card.append(controls);
        card.dataset.turboFilterProcessed = 'true';
        if (!canHide) debug('Incomplete configuration; unavailable actions disabled', car, card);
      }
      const [star, block] = controls.children;
      star.disabled = !canSave;
      block.disabled = !canHide;
      star.title = canSave ? 'Save model and year' : 'Model or year unavailable';
      block.title = canHide ? 'Choose a hidden rule' : 'Brand and model unavailable';
      if (!block.hasAttribute('aria-expanded')) block.setAttribute('aria-expanded', 'false');
      block.setAttribute('aria-controls', 'turbo-filter-hide-menu');
      star.setAttribute('aria-pressed', String(canSave && savedKeys.has(entryKey(car))));
      // Removing our attribute restores the site's own display behavior.
      card.toggleAttribute('data-turbo-filter-hidden', canHide && matchesHiddenRule(car));
      applySeenRule(card);
    } catch (error) {
      debug('Skipping unsupported card', error, card);
    }
  }

  function getSeenStorageKey() {
    const url = new URL(window.location.href);
    const parameters = [...url.searchParams].filter(([name]) => name.toLowerCase() !== 'page');
    parameters.sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0);
    return `turbo-filter:seen:${url.origin}${url.pathname}?${new URLSearchParams(parameters)}`;
  }

  function readSeenListings(key) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
      return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
    } catch (error) {
      debug('Cannot read seen listings', error);
      return new Set();
    }
  }

  const seenStorageKey = getSeenStorageKey();
  const seenListings = readSeenListings(seenStorageKey);
  const displayedCards = new Map();

  function writeSeenListings() {
    try {
      sessionStorage.setItem(seenStorageKey, JSON.stringify([...seenListings]));
    } catch (error) {
      debug('Cannot persist seen listings; deduplication is limited to this page', error);
    }
  }

  function isCardVisible(card) {
    if (!card.isConnected || card.hasAttribute('data-turbo-filter-hidden')
      || card.hasAttribute('data-turbo-filter-seen')) return false;
    const style = getComputedStyle(card);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse'
      && card.getClientRects().length > 0;
  }

  function applySeenRule(card) {
    const identity = getListingIdentity(card);
    const alreadyShown = identity && seenListings.has(identity) && displayedCards.get(identity) !== card;
    card.toggleAttribute('data-turbo-filter-seen', Boolean(alreadyShown));
    if (identity && !seenListings.has(identity) && isCardVisible(card)) {
      // Keep this instance visible during later filter and observer updates.
      displayedCards.set(identity, card);
      seenListings.add(identity);
      writeSeenListings();
    }
  }

  function resetSeenListings() {
    if (!window.confirm('Reset seen listings for this search?')) return;
    seenListings.clear();
    displayedCards.clear();
    writeSeenListings();
    refresh();
  }

  function compareEntries(a, b) {
    return normalizeModel(a.model).localeCompare(normalizeModel(b.model), undefined, { sensitivity: 'base' })
      || Number(a.year || 0) - Number(b.year || 0)
      || Number(a.engine || 0) - Number(b.engine || 0);
  }

  const autoFill = {
    url: window.location.href,
    page: getCurrentPageNumber(),
    checked: 0,
    running: false,
    scheduled: false,
    stopped: false,
    initialized: false,
    hasNext: false,
    container: null,
    presentIds: new Set(),
    candidates: new Map()
  };

  function getCurrentPageNumber(url = window.location.href) {
    const page = Number(new URL(url).searchParams.get('page') || 1);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  }

  function buildPageUrl(page) {
    const url = new URL(autoFill.url);
    url.searchParams.set('page', String(page));
    url.hash = '';
    return url;
  }

  function getResultContainer(root) {
    const pagination = root.querySelector('.pagination');
    if (!pagination) return null;
    const containers = [...root.querySelectorAll('.products')].filter(container =>
      container.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING);
    return containers.at(-1) || null;
  }

  function hasNextPage(root, page) {
    return [...root.querySelectorAll('.pagination a[rel~="next"]')].some(link => {
      try {
        const url = new URL(link.getAttribute('href'), autoFill.url);
        return url.origin === window.location.origin && url.pathname === new URL(autoFill.url).pathname
          && getCurrentPageNumber(url.href) === page + 1;
      } catch {
        return false;
      }
    });
  }

  function getListingIdentity(card) {
    const href = card.querySelector('.products-i__link')?.getAttribute('href');
    if (!href) return null;
    try {
      const url = new URL(href, autoFill.url);
      if (url.origin !== window.location.origin) return null;
      const path = url.pathname.replace(/\/+$/, '');
      const id = path.match(/^\/autos\/(\d+)(?:-|$)/)?.[1];
      return id ? `id:${id}` : /^\/autos\/[^/]+$/.test(path) ? `path:${path}` : null;
    } catch {
      return null;
    }
  }

  function collectPresentListingIds() {
    autoFill.presentIds.clear();
    document.querySelectorAll(CARD_SELECTOR).forEach(card => {
      const id = getListingIdentity(card);
      if (id) autoFill.presentIds.add(id);
    });
  }

  function getVisibleCards() {
    return [...document.querySelectorAll(CARD_SELECTOR)].filter(card =>
      isCardVisible(card) && !matchesHiddenRule(readCar(card)));
  }

  async function fetchPageCards(page) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const url = buildPageUrl(page);
      const response = await fetch(url.href, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok || response.redirected) throw new Error(`Listing fetch failed: ${response.status}`);
      const root = new DOMParser().parseFromString(await response.text(), 'text/html');
      const container = getResultContainer(root);
      // A final page may omit pagination entirely.
      const results = container || [...root.querySelectorAll('.products')].at(-1);
      return {
        cards: results ? [...results.querySelectorAll(CARD_SELECTOR)] : [],
        hasNext: hasNextPage(root, page)
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function appendMatchingCards() {
    collectPresentListingIds();
    let remaining = TARGET_VISIBLE_CARDS - getVisibleCards().length;
    for (const [id, card] of autoFill.candidates) {
      if (remaining <= 0) break;
      if (autoFill.presentIds.has(id)) {
        autoFill.candidates.delete(id);
        continue;
      }
      if (seenListings.has(id) || matchesHiddenRule(readCar(card))) continue;
      const appended = document.importNode(card, true);
      processCard(appended);
      autoFill.container.append(appended);
      applySeenRule(appended);
      autoFill.presentIds.add(id);
      autoFill.candidates.delete(id);
      if (isCardVisible(appended)) remaining--;
    }
  }

  async function autoFillListings() {
    if (autoFill.running || autoFill.url !== window.location.href) return;
    if (!autoFill.initialized) {
      autoFill.container = getResultContainer(document);
      if (!autoFill.container) return;
      autoFill.hasNext = hasNextPage(document, autoFill.page);
      autoFill.initialized = true;
    }
    if (!autoFill.container.isConnected) return;
    autoFill.running = true;
    try {
      appendMatchingCards();
      while (!autoFill.stopped && autoFill.hasNext && autoFill.checked < MAX_EXTRA_PAGES
        && getVisibleCards().length < TARGET_VISIBLE_CARDS) {
        autoFill.checked++;
        const result = await fetchPageCards(autoFill.page + 1);
        if (autoFill.url !== window.location.href || !autoFill.container.isConnected) {
          autoFill.stopped = true;
          break;
        }
        autoFill.page++;
        autoFill.hasNext = result.hasNext && result.cards.length > 0;
        for (const card of result.cards) {
          const id = getListingIdentity(card);
          if (id && !autoFill.presentIds.has(id)) autoFill.candidates.set(id, card);
        }
        // Rules may have changed while the request was in flight.
        appendMatchingCards();
      }
    } catch (error) {
      autoFill.stopped = true;
      debug('Auto-fill stopped', error);
    } finally {
      autoFill.running = false;
    }
  }

  function scheduleAutoFill() {
    if (autoFill.scheduled || autoFill.running) return;
    autoFill.scheduled = true;
    window.setTimeout(() => {
      autoFill.scheduled = false;
      void autoFillListings();
    }, 100);
  }

  function renderPanel() {
    toggle.textContent = `Turbo Filter · Saved (${state.saved.length}) · Hidden (${state.hidden.length})`;
    panelBody.querySelectorAll('section').forEach(section => section.remove());
    for (const sectionName of ['saved', 'hidden']) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = `${sectionName === 'saved' ? 'Saved' : 'Hidden'} (${state[sectionName].length})`;
      const bulkLabel = sectionName === 'saved' ? 'Remove All' : 'Restore All';
      const bulk = makeButton(bulkLabel, bulkLabel, () => clearSection(sectionName));
      bulk.disabled = !state[sectionName].length;
      section.append(heading, bulk);
      for (const entry of [...state[sectionName]].sort(compareEntries)) {
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = formatEntry(entry);
        const action = sectionName === 'hidden' ? 'Restore' : 'Remove';
        row.append(label, makeButton(action, `${action} ${label.textContent}`, () => changeEntry(sectionName, entry, true)));
        section.append(row);
      }
      if (!state[sectionName].length) section.append('No entries.');
      panelBody.append(section);
    }
  }

  function refresh() {
    closeHideMenu();
    rebuildKeys();
    renderPanel();
    document.querySelectorAll(CARD_SELECTOR).forEach(processCard);
    scheduleAutoFill();
  }

  function createPanel() {
    const style = document.createElement('style');
    style.textContent = `
      .products-i[data-turbo-filter-hidden], .products-i[data-turbo-filter-seen] { display: none !important; }
      .products-i[data-turbo-filter-processed] { position: relative; }
      [data-turbo-filter-controls] { position: absolute; top: 6px; left: 6px; z-index: 20; display: flex; gap: 4px; }
      [data-turbo-filter-ui] button { font: 14px sans-serif; color: #222; background: white; border: 1px solid #aaa; border-radius: 4px; padding: 5px 8px; cursor: pointer; }
      [data-turbo-filter-ui] button:disabled { opacity: .45; cursor: default; }
      [data-turbo-filter-ui] button[aria-pressed="true"] { background: #ffe28a; }
      #turbo-filter-hide-menu { position: fixed; z-index: 2147483647; display: grid; gap: 4px; padding: 8px; background: white; color: #222; border: 1px solid #aaa; border-radius: 4px; font: 13px sans-serif; box-shadow: 0 2px 8px #0003; max-width: calc(100vw - 32px); }
      #turbo-filter-panel { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; font: 13px sans-serif; color: #222; background: #fff; border: 1px solid #aaa; border-radius: 6px; padding: 6px; max-width: calc(100vw - 36px); box-shadow: 0 2px 8px #0003; }
      #turbo-filter-body { width: 340px; max-width: calc(100vw - 50px); max-height: 55vh; overflow: auto; }
      #turbo-filter-body h3 { font: bold 14px sans-serif; margin: 12px 0 6px; }
      #turbo-filter-body section > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; }
      #turbo-filter-body span { overflow-wrap: anywhere; }
    `;
    document.head.append(style);
    const panel = document.createElement('div');
    panel.id = 'turbo-filter-panel';
    panel.dataset.turboFilterUi = '';
    panelBody = document.createElement('div');
    panelBody.id = 'turbo-filter-body';
    panelBody.hidden = true;
    toggle = makeButton('Turbo Filter', 'Open or close Turbo Filter', () => {
      panelBody.hidden = !panelBody.hidden;
      toggle.setAttribute('aria-expanded', String(!panelBody.hidden));
    });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panelBody.id);
    status = document.createElement('p');
    status.setAttribute('role', 'status');
    panelBody.append(status, makeButton('Reset Seen', 'Reset seen listings for this search', resetSeenListings));
    panel.append(toggle, panelBody);
    document.body.append(panel);
  }

  function observeCards() {
    // Batch only affected cards. Ignore our UI to prevent observer feedback loops.
    const pending = new Set();
    let scheduled = false;
    const collect = node => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element || element.closest(OWN_UI)) return;
      const card = element.closest(CARD_SELECTOR);
      if (card) pending.add(card);
      element.querySelectorAll(CARD_SELECTOR).forEach(item => pending.add(item));
    };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.target.parentElement?.closest(OWN_UI) || record.target.closest?.(OWN_UI)) continue;
        if (record.type === 'childList') {
          // Changes within an existing card may complete or replace its fields.
          const targetCard = record.target.closest?.(CARD_SELECTOR);
          const changed = [...record.addedNodes, ...record.removedNodes];
          if (targetCard && changed.some(node => !(node.nodeType === 1 && node.matches(OWN_UI)))) pending.add(targetCard);
          record.addedNodes.forEach(collect);
        } else collect(record.target);
      }
      if (!pending.size || scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const cards = [...pending];
        pending.clear();
        cards.forEach(card => { if (card.isConnected) processCard(card); });
        scheduleAutoFill();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  createPanel();
  refresh();
  observeCards();
  // Keep same-origin tabs consistent using browser-local events only.
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) {
      state = storage.read();
      refresh();
    }
  });
})();
