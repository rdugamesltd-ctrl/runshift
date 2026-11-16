import { UPGRADES } from '../balance';
import type { Progress } from '../game/systems/progress';
import { powerUpDuration } from '../game/systems/powerups';
import { buyBlock, upgradeCost } from '../game/systems/upgrades';
import type { PowerUpKind } from '../game/types';
import { el, num } from './hud';
import { coinNode, iconNode, type IconName } from './icons';
import './powerups.css';

/** What the upgrades panel tells the app. */
export interface UpgradeHooks {
  /** A level was bought (and saved). */
  bought?(kind: PowerUpKind, level: number): void;
}

/** The upgrades in shop order, with their names and what a level buys. */
const ITEMS: readonly { kind: PowerUpKind; icon: IconName; name: string; detail: string }[] = [
  { kind: 'magnet', icon: 'magnet', name: 'Magnet', detail: 'Pulls nearby gold in for longer.' },
  { kind: 'shield', icon: 'shield', name: 'Shield', detail: 'Stays up longer, waiting for a hit.' },
  { kind: 'multiplier', icon: 'x2', name: 'Double score', detail: 'Doubles score and gold for longer.' },
  { kind: 'glide', icon: 'glide', name: 'Glide board', detail: 'Floats over gaps for longer.' },
];

/** A duration, s, as the card shows it. */
function seconds(s: number): string {
  return `${Math.round(s)}s`;
}

/**
 * Fills the upgrades panel: the gold to spend, then one card per power-up with its level pips, how long it lasts
 * now and after the next level, and a BUY button with the price (`[data-act=buy-<kind>]`, UPGRADES.cost). A
 * button the gold cannot pay for is disabled; a full upgrade shows MAX. Buying saves at once and redraws the panel,
 * keeping focus on the same button for keyboard players.
 */
export function mountUpgrades(panel: HTMLElement, progress: Progress, hooks: UpgradeHooks = {}): void {
  const draw = (justBought: PowerUpKind | null) => {
    const save = progress.data;
    panel.replaceChildren();

    const wallet = el(panel, 'div', 'up-wallet');
    wallet.setAttribute('aria-label', `Gold: ${num(save.gold)}`);
    wallet.append(coinNode());
    el(wallet, 'span', 'up-wallet-value', num(save.gold));

    const list = el(panel, 'ul', 'up-list');
    for (const item of ITEMS) {
      const level = save.upgrades[item.kind];
      const cost = upgradeCost(level);
      const block = buyBlock(save, item.kind);
      const card = el(list, 'li', `up-card up-${item.kind}`);
      if (item.kind === justBought) card.classList.add('is-bought');

      el(card, 'span', 'up-badge').append(iconNode(item.icon));
      const text = el(card, 'div', 'up-text');
      el(text, 'b', 'up-name', item.name);
      el(text, 'span', 'up-detail', item.detail);
      const meter = el(text, 'div', 'up-meter');
      const pips = el(meter, 'span', 'up-pips');
      pips.setAttribute('role', 'img');
      pips.setAttribute('aria-label', `Level ${level} of ${UPGRADES.maxLevel}`);
      for (let i = 0; i < UPGRADES.maxLevel; i++) el(pips, 'i', i < level ? 'is-on' : '');
      const now = powerUpDuration(item.kind, level);
      const time = el(meter, 'span', 'up-time', seconds(now));
      if (cost !== null) {
        time.append(iconNode('chevron'));
        el(time, 'b', '', seconds(powerUpDuration(item.kind, level + 1)));
      }

      if (cost === null) {
        el(card, 'span', 'up-max', 'MAX');
        continue;
      }
      const buy = el(card, 'button', 'btn btn-gold up-buy');
      buy.type = 'button';
      buy.dataset.act = `buy-${item.kind}`;
      buy.disabled = block !== null;
      buy.append(coinNode());
      el(buy, 'span', 'btn-label', num(cost));
      buy.setAttribute('aria-label', `Buy ${item.name} level ${level + 1} for ${num(cost)} gold`);
      if (block === 'gold') buy.title = `Needs ${num(cost - save.gold)} more gold`;
    }

    if (Object.values(save.upgrades).every((level) => level >= UPGRADES.maxLevel)) {
      el(panel, 'p', 'up-note', 'Every upgrade is maxed out. Nice work, officer!');
    } else {
      el(panel, 'p', 'up-note', 'Upgrades make power-ups last longer. Collect gold on your runs to buy them.');
    }
  };

  panel.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button.up-buy') : null;
    if (!button || button.disabled) return;
    const kind = button.dataset.act?.slice('buy-'.length) as PowerUpKind | undefined;
    if (!kind || !progress.buyUpgrade(kind)) return;
    const keyboard = event.detail === 0;
    draw(kind);
    hooks.bought?.(kind, progress.data.upgrades[kind]);
    if (keyboard) {
      // The pressed button was redrawn: hand focus to its replacement, or to the next one that can still buy.
      const next = panel.querySelector<HTMLButtonElement>(`[data-act="buy-${kind}"]:not(:disabled)`)
        ?? panel.querySelector<HTMLButtonElement>('button.up-buy:not(:disabled)');
      next?.focus();
    }
  });
  draw(null);
}
