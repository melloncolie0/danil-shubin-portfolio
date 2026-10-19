'use strict';

const library = window.Motion;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const desktopScroll = window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
const easing = [0.22, 1, 0.36, 1];
const springOptions = { stiffness: 220, damping: 24, mass: 0.7 };
const cleanupMotion = new Map();
let motionPreference = 'on';
try { motionPreference = sessionStorage.getItem('portfolio-motion-v2') || 'on'; } catch { /* Motion starts enabled when storage is unavailable. */ }
function isMotionReduced() { return motionPreference === 'off'; }
function syncMotionPreference() {
  const enabled = !isMotionReduced();
  document.documentElement.dataset.motion = enabled ? 'on' : 'off';
  document.querySelectorAll('.motion-toggle').forEach((button) => {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Выключить анимацию' : 'Включить анимацию');
  });
}
syncMotionPreference();
document.querySelectorAll('.motion-toggle').forEach((button) => button.addEventListener('click', () => {
  motionPreference = isMotionReduced() ? 'on' : 'off';
  try { sessionStorage.setItem('portfolio-motion-v2', motionPreference); } catch { /* Preference still applies on this page. */ }
  syncMotionPreference();
  document.dispatchEvent(new Event('motion-preference-change'));
}));
reducedMotion.addEventListener('change', () => { syncMotionPreference(); document.dispatchEvent(new Event('motion-preference-change')); });

function animateElement(element, keyframes, options = {}) {
  if (!library || isMotionReduced()) {
    for (const [key, value] of Object.entries(keyframes)) {
      if (['x', 'y', 'scale', 'rotateX', 'rotateY'].includes(key)) continue;
      element.style[key] = Array.isArray(value) ? value.at(-1) : value;
    }
    return null;
  }
  return library.animate(element, keyframes, { duration: 0.45, ease: easing, ...options });
}

function attachTilt(target, surface, amount = 5) {
  if (!library || !finePointer.matches) return;
  const rotateX = library.springValue(0, springOptions);
  const rotateY = library.springValue(0, springOptions);
  const scale = library.springValue(1, { stiffness: 280, damping: 24 });
  const cancelEffect = library.styleEffect(surface, { rotateX, rotateY, scale });
  function reset() {
    const method = isMotionReduced() ? 'jump' : 'set';
    rotateX[method](0);
    rotateY[method](0);
    scale[method](1);
    surface.style.boxShadow = '';
    surface.style.removeProperty('--light-x');
    surface.style.removeProperty('--light-y');
  }
  function pointerMove(event) {
    if (event.pointerType === 'touch' || !finePointer.matches || isMotionReduced()) return;
    // Measure the stable outer button, rather than the moving surface.
    const box = target.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
    rotateX.set(-y * amount);
    rotateY.set(x * amount);
    scale.set(1.035);
    surface.style.boxShadow = `${-x * 10}px ${18 - y * 5}px 35px -15px rgba(35, 40, 62, .28)`;
    surface.style.setProperty('--light-x', `${(x + 1) * 50}%`);
    surface.style.setProperty('--light-y', `${(y + 1) * 50}%`);
  }
  const pressDown = () => { if (!isMotionReduced()) scale.set(0.985); };
  const pressUp = (event) => { if (isMotionReduced() || event.pointerType === 'touch' || !finePointer.matches) reset(); else scale.set(1.035); };
  target.addEventListener('pointermove', pointerMove);
  target.addEventListener('pointerleave', reset);
  target.addEventListener('pointercancel', reset);
  target.addEventListener('pointerdown', pressDown);
  target.addEventListener('pointerup', pressUp);
  reducedMotion.addEventListener('change', reset);
  document.addEventListener('motion-preference-change', reset);
  cleanupMotion.set(target, () => {
    target.removeEventListener('pointermove', pointerMove);
    target.removeEventListener('pointerleave', reset);
    target.removeEventListener('pointercancel', reset);
    target.removeEventListener('pointerdown', pressDown);
    target.removeEventListener('pointerup', pressUp);
    reducedMotion.removeEventListener('change', reset);
    document.removeEventListener('motion-preference-change', reset);
    cancelEffect();
    rotateX.destroy();
    rotateY.destroy();
    scale.destroy();
  });
}

if (library) {
  library.hover('.tactile', (element) => {
    if (isMotionReduced()) return;
    const animation = library.animate(element, { y: -3 }, { type: 'spring', stiffness: 320, damping: 22 });
    return () => { animation.stop(); library.animate(element, { y: 0 }, { type: 'spring', stiffness: 320, damping: 22 }); };
  });
  library.press('.tactile', (element) => {
    if (isMotionReduced()) return;
    library.animate(element, { scale: 0.97 }, { duration: 0.1 });
    return () => library.animate(element, { scale: 1 }, { type: 'spring', stiffness: 420, damping: 26 });
  });
}

initHeroMotion();
document.querySelectorAll('.website-work').forEach((work) => attachTilt(work, work.querySelector('.website-arrangement'), 2.5));
if (document.querySelector('.project-intro')) animateElement(document.querySelector('.project-intro'), { opacity: [0, 1], y: [22, 0] }, { duration: 0.75 });

function initHeroMotion() {
  const sequence = document.querySelector('.hero-sequence');
  const root = document.documentElement;
  if (!sequence || !library) { root.removeAttribute('data-hero-entry'); return; }
  const composition = sequence.querySelector('.hero-composition');
  const lines = [...sequence.querySelectorAll('.headline-line')];
  const rows = [...sequence.querySelectorAll('.skill-row')];
  let stopScroll = null;
  let strokeEntrance = null;
  let entrancePending = root.dataset.heroEntry === 'pending';

  function finishEntrance() {
    entrancePending = false;
    strokeEntrance?.finish();
    root.removeAttribute('data-hero-entry');
    rows.forEach(row => { row.style.transform = ''; row.style.opacity = ''; });
  }

  function renderScroll(progress) {
    const value = isMotionReduced() ? 0 : progress;
    composition.style.transform = `translate3d(0,${-value * 100}px,0) scale(${1 - value * 0.035})`;
    composition.style.opacity = String(Math.max(0, 1 - value * 1.35));
  }

  function configureMotion() {
    stopScroll?.();
    stopScroll = null;
    renderScroll(0);
    if (isMotionReduced()) finishEntrance();
    if (isMotionReduced()) return;
    if (desktopScroll.matches) stopScroll = library.scroll(renderScroll, { target: sequence, offset: ['start start', 'end start'] });
  }
  configureMotion();
  document.addEventListener('motion-preference-change', configureMotion);
  desktopScroll.addEventListener('change', configureMotion);

  // Only load the entrance renderer for a visible Hero after Benzin is ready.
  document.fonts.ready.then(async () => {
    if (!entrancePending || isMotionReduced() || root.dataset.heroEntry !== 'pending' || sequence.getBoundingClientRect().bottom <= 0) {
      finishEntrance();
      return;
    }
    try {
      const { playHeroStroke } = await import('./vendor/hero-stroke.js?v=1');
      if (isMotionReduced() || !entrancePending || root.dataset.heroEntry !== 'pending') { finishEntrance(); return; }
      strokeEntrance = playHeroStroke({ lines, rows, onComplete: finishEntrance });
      root.dataset.heroEntry = 'drawing';
    } catch {
      finishEntrance();
    }
  });
  sequence.querySelectorAll('.hero-skill').forEach(attachSkillMotion);
}

function attachSkillMotion(target) {
  const face = target.querySelector('.skill-face');
  const depth = library.springValue(0, { stiffness: 270, damping: 24 });
  const vertical = library.springValue(0, { stiffness: 270, damping: 24 });
  const scale = library.springValue(1, { stiffness: 320, damping: 26 });
  library.styleEffect(face, { z: depth, y: vertical, scale });
  function reset() {
    const method = isMotionReduced() ? 'jump' : 'set';
    depth[method](0);
    vertical[method](0);
    scale[method](1);
  }
  function bringForward() {
    if (isMotionReduced()) return;
    depth.set(24);
    vertical.set(-3);
    scale.set(1.07);
  }
  target.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch' && finePointer.matches) bringForward();
  });
  target.addEventListener('pointerleave', () => { if (!target.matches(':focus-visible')) reset(); });
  target.addEventListener('pointercancel', reset);
  target.addEventListener('focus', bringForward);
  target.addEventListener('blur', reset);
  document.addEventListener('motion-preference-change', reset);
}

const grid = document.getElementById('card-grid');
if (grid) initGallery().catch((error) => {
  console.error('Gallery loading failed', error);
  grid.innerHTML = '<p class="gallery-error">Не удалось загрузить работы. <button type="button" class="pill secondary" id="retry-gallery">Попробовать ещё раз</button></p>';
  document.getElementById('retry-gallery').addEventListener('click', () => location.reload());
});

async function initGallery() {
  const response = await fetch('media/cards.json');
  if (!response.ok) throw new Error(`Cards request returned ${response.status}`);
  const cards = await response.json();
  let category = 'Все';
  let expanded = false;
  let activeCards = [];
  let selectedIndex = 0;
  let lastFocus = null;
  let renderVersion = 0;
  const selectedIds = ['card-04', 'card-13', 'card-17', 'card-21', 'card-08', 'card-11'];
  const showAll = document.getElementById('show-all');
  const filterButtons = [...document.querySelectorAll('.filter')];
  const indicator = document.querySelector('.filter-indicator');
  const dialog = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const status = document.getElementById('gallery-status');

  function currentCards() {
    if (category !== 'Все') return cards.filter((card) => card.category === category);
    const selected = selectedIds.map((id) => cards.find((card) => card.id === id));
    return expanded ? [...selected, ...cards.filter((card) => !selectedIds.includes(card.id))] : selected;
  }

  function positionIndicator(immediate = false) {
    const selected = filterButtons.find((button) => button.dataset.category === category);
    if (!selected) return;
    const properties = { left: selected.offsetLeft, top: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight };
    if (immediate || isMotionReduced() || !library) {
      for (const [key, value] of Object.entries(properties)) indicator.style[key] = `${value}px`;
    } else {
      animateElement(indicator, properties, { type: 'spring', stiffness: 380, damping: 32 });
    }
  }

  function makeCard(card) {
    const article = document.createElement('article');
    article.className = 'product-work';
    article.dataset.id = card.id;
    const button = document.createElement('button');
    button.className = 'card-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Открыть карточку ${card.title}`);
    button.dataset.cardId = card.id;
    const surface = document.createElement('div');
    surface.className = 'card-surface';
    const image = document.createElement('img');
    image.className = 'card-image';
    image.src = card.src;
    image.alt = `${card.title}, дизайн карточки товара`;
    image.width = card.width;
    image.height = card.height;
    image.loading = 'lazy';
    const plus = document.createElement('span');
    plus.className = 'card-open';
    plus.setAttribute('aria-hidden', 'true');
    surface.append(image, plus);
    button.append(surface);
    const caption = document.createElement('div');
    caption.className = 'card-meta';
    const title = document.createElement('h3');
    title.textContent = card.title;
    const label = document.createElement('p');
    label.textContent = card.category;
    caption.append(title, label);
    article.append(button, caption);
    attachTilt(button, surface);
    return article;
  }

  async function renderCards(animate = true) {
    const version = ++renderVersion;
    const oldPositions = new Map([...grid.children].map((element) => [element.dataset.id, element.getBoundingClientRect()]));
    const incoming = currentCards();
    const incomingIds = new Set(incoming.map((card) => card.id));
    for (const article of [...grid.children]) {
      if (!incomingIds.has(article.dataset.id)) {
        const button = article.querySelector('button');
        cleanupMotion.get(button)?.();
        cleanupMotion.delete(button);
        article.remove();
      }
    }
    for (const card of incoming) {
      const existing = [...grid.children].find((element) => element.dataset.id === card.id);
      grid.append(existing || makeCard(card));
    }
    showAll.parentElement.hidden = category !== 'Все' || expanded;
    status.textContent = category === 'Все' ? (expanded ? 'Все работы' : 'Выбранные работы') : category;
    // FLIP animation moves surviving items from their previous positions.
    if (animate && library && !isMotionReduced()) {
      for (const [index, article] of [...grid.children].entries()) {
        const before = oldPositions.get(article.dataset.id);
        const after = article.getBoundingClientRect();
        if (before) {
          animateElement(article, { x: [before.left - after.left, 0], y: [before.top - after.top, 0] }, { type: 'spring', stiffness: 200, damping: 27 });
        } else {
          animateElement(article, { opacity: [0, 1], y: [16, 0], scale: [0.985, 1] }, { duration: 0.4, delay: Math.min(index * 0.025, 0.125) });
        }
      }
    }
    if (version === renderVersion) positionIndicator(!animate);
  }

  filterButtons.forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.category;
    expanded = false;
    for (const filter of filterButtons) {
      const active = filter === button;
      filter.classList.toggle('active', active);
      filter.setAttribute('aria-pressed', String(active));
    }
    renderCards();
  }));
  showAll.addEventListener('click', () => { expanded = true; renderCards(); });
  new ResizeObserver(() => positionIndicator(true)).observe(document.querySelector('.filters'));
  document.fonts.ready.then(() => positionIndicator(true));

  function displayCard() {
    const card = activeCards[selectedIndex];
    lightboxImage.src = card.large;
    lightboxImage.alt = `${card.title}, полное изображение карточки товара`;
    document.getElementById('lightbox-title').textContent = card.title;
    document.getElementById('lightbox-category').textContent = card.category;
    document.getElementById('lightbox-count').textContent = `${selectedIndex + 1} / ${activeCards.length}`;
    document.getElementById('previous-card').disabled = activeCards.length < 2;
    document.getElementById('next-card').disabled = activeCards.length < 2;
    animateElement(lightboxImage, { opacity: [0.5, 1] }, { duration: 0.22 });
    if (dialog.open) announceCard();
  }

  function announceCard() {
    document.dispatchEvent(new CustomEvent('portfolio-card-open', { detail: activeCards[selectedIndex] }));
  }

  function openCard(id, origin, pointer = false) {
    const isGallery = origin.closest('.card-grid');
    activeCards = isGallery ? currentCards() : cards;
    selectedIndex = activeCards.findIndex((card) => card.id === id);
    if (selectedIndex < 0) return;
    lastFocus = origin;
    displayCard();
    dialog.dataset.pointerFocus = String(pointer);
    dialog.showModal();
    announceCard();
    document.body.classList.add('modal-open');
    dialog.scrollTop = 0;
    animateElement(dialog, { opacity: [0, 1], y: [18, 0], scale: [0.975, 1] }, { duration: 0.35 });
  }

  function nextCard(direction) {
    selectedIndex = (selectedIndex + direction + activeCards.length) % activeCards.length;
    displayCard();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-card-id]');
    if (button) openCard(button.dataset.cardId, button, event.detail !== 0 || event.pointerType === 'touch');
  });
  document.getElementById('previous-card').addEventListener('click', () => nextCard(-1));
  document.getElementById('next-card').addEventListener('click', () => nextCard(1));
  document.querySelector('.close-lightbox').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (event) => {
    dialog.dataset.pointerFocus = 'false';
    if (event.key === 'ArrowRight') { event.preventDefault(); nextCard(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); nextCard(-1); }
  });
  dialog.addEventListener('close', () => {
    document.dispatchEvent(new Event('portfolio-card-close'));
    document.body.classList.remove('modal-open');
    lastFocus?.focus({ preventScroll: true });
  });
  await renderCards(false);
}
