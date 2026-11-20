import { ROSTER } from './football';
import { HEROES } from './heroes';
import { drawPortrait } from './portraits';
import { readJSON, writeJSON } from './settings';
import type { StorageAccess } from './settings';

const favoriteKey = 'zeerush.favorite-hero.v1';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function connectHeroPicker(dialog: HTMLDialogElement, toggle: HTMLButtonElement, teams: readonly string[], storage: StorageAccess | undefined, select: (hero: number | undefined) => void, signal: AbortSignal) {
  const list = dialog.querySelector('#hero-list')!;
  const clear = dialog.querySelector<HTMLButtonElement>('#hero-clear')!;
  const current = dialog.querySelector('#hero-current')!;
  const toggleLabel = toggle.querySelector('#hero-toggle-label')!;
  const buttons: HTMLButtonElement[] = [];
  const saved = readJSON(storage, favoriteKey);
  let favorite = typeof saved === 'number' && Number.isInteger(saved) && HEROES[saved] ? saved : undefined;

  function update() {
    const hero = favorite === undefined ? undefined : HEROES[favorite];
    toggle.classList.toggle('following', !!hero);
    toggleLabel.textContent = hero?.name ?? 'Heroes';
    toggle.setAttribute('aria-label', hero ? `Heroes, following ${hero.name}` : 'Heroes');
    current.textContent = hero ? `Following ${hero.name}` : 'Pick a player to follow on the pitch.';
    clear.hidden = !hero;
    buttons.forEach((button, id) => button.setAttribute('aria-pressed', String(favorite === id)));
    select(favorite);
  }

  function choose(id: number | undefined) {
    favorite = id;
    writeJSON(storage, favoriteKey, id ?? null);
    update();
    dialog.close();
  }

  for (const [team, name] of teams.entries()) {
    const group = element('section', 'hero-team');
    group.dataset.team = String(team);
    const heading = element('h3', undefined, name);
    const cards = element('div', 'hero-grid');
    group.append(heading, cards);
    for (let slot = 0; slot < ROSTER.length; slot++) {
      const id = team * ROSTER.length + slot;
      const hero = HEROES[id];
      const card = element('button', 'hero-card');
      card.type = 'button';
      card.dataset.hero = String(id);
      card.style.setProperty('--hero-accent', hero.accent);
      const art = element('span', 'hero-card-art');
      const portrait = element('canvas');
      portrait.width = 200; portrait.height = 148;
      portrait.setAttribute('aria-hidden', 'true');
      drawPortrait(portrait, id);
      const number = element('span', 'hero-number', `#${ROSTER[slot].number}`);
      art.append(portrait, number);
      const copy = element('span', 'hero-card-copy');
      copy.append(element('strong', undefined, hero.name), element('b', undefined, hero.title), element('small', undefined, hero.line));
      card.append(art, copy);
      card.addEventListener('click', () => choose(id), { signal });
      cards.append(card);
      buttons.push(card);
    }
    list.append(group);
  }

  toggle.addEventListener('click', () => dialog.showModal(), { signal });
  dialog.querySelector('#hero-close')!.addEventListener('click', () => dialog.close(), { signal });
  clear.addEventListener('click', () => choose(undefined), { signal });
  update();
  return () => favorite;
}
