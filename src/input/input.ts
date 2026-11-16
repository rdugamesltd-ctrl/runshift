import { INPUT } from '../balance';
import type { Action } from '../game/types';
import { keyToAction, keyToCommand } from './keyboard';
import { SwipeDetector } from './swipe';
import type { ActionEvent, InputPort } from './types';

/** What Input listens to and reads: the page by default (`browserHost()`); tests pass stand-ins. */
export interface InputHost {
  /** Hears keys, pointers, blur, pagehide and the context menu: the window. */
  readonly window: EventTarget;
  /** Hears the page guards (gesturestart, dblclick, touchmove): the document. */
  readonly document: EventTarget;
  /** The viewport in CSS px, for the swipe threshold. */
  viewport(): { w: number; h: number };
  /** The clock: performance.now() milliseconds, the time base of ActionEvent.at. */
  now(): number;
}

/** Actions held beyond this are dropped, oldest first. The app drains every frame, so only a stalled app gets here. */
const MAX_QUEUED = 16;
/** A stroke starting on one of these belongs to the UI (buttons, panels, scrolling lists), not to the runner. */
const UI = '[data-act], .panel, .scrolls, button, a[href], input, select, textarea, label';
/** Keys typed into one of these belong to the field. */
const TYPING = 'input, textarea, select, [contenteditable]';
/** On the menus, Enter and Space on one of these focused controls press the control. */
const CONTROL = 'button, a[href], summary, [data-act], [role="button"]';
/** Scrolling panels: they keep their touch pans, and on the menus their arrow and Space keys. */
const SCROLLS = '.scrolls';

/** True if `target` is an element inside something matching `selector`. Duck-typed, so stand-in targets work too. */
function within(target: EventTarget | null, selector: string): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === 'function' && element.closest(selector) !== null;
}

/** On the menus a focused control or a scrolling panel keeps its own keys. */
function ownedByFocus(target: EventTarget | null, code: string): boolean {
  if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && within(target, CONTROL)) return true;
  return (code === 'Space' || code.startsWith('Arrow')) && within(target, SCROLLS);
}

function preventDefault(event: Event): void {
  event.preventDefault();
}

/** The real page: window, document, the window's size (one reused object) and performance.now(). */
export function browserHost(): InputHost {
  const size = { w: 0, h: 0 };
  return {
    window,
    document,
    viewport() {
      size.w = window.innerWidth;
      size.h = window.innerHeight;
      return size;
    },
    now: () => performance.now(),
  };
}

/**
 * Keyboard, touch and mouse merged into one queue of actions, drained once per frame. The listeners go on in the
 * constructor:
 *
 * - Pointers on the window: a touch, pen or main-button mouse drag is a swipe (SwipeDetector, INPUT.swipe). The
 *   pointer is captured so a drag that leaves the canvas or the window keeps reporting; strokes that start on the
 *   UI (`[data-act]`, `.panel`, `.scrolls`, form controls) are the UI's.
 * - Keys: Arrows and WASD move, Space jumps; Esc and P call onPause, M onMute, Enter onConfirm. Auto-repeats press
 *   nothing; game keys never reach the browser (no page scroll, no Space pressing a focused button), except that on
 *   the menus a focused control keeps Enter and Space and a scrolling panel its arrows. Shortcuts with Ctrl, Alt
 *   or Meta, and typing into a field, stay the browser's.
 * - Page guards: no context menu (long press), pinch or double-tap zoom, no touch scrolling outside `.scrolls`.
 * - blur and pagehide release everything.
 *
 * onFirstGesture and onGesture are called by installUnlock (unlock.ts), which listens for gestures on its own.
 */
export class Input implements InputPort {
  onPause: () => void = () => {};
  onMute: () => void = () => {};
  onConfirm: () => void = () => {};
  onFirstGesture: () => void = () => {};
  onGesture: () => void = () => {};
  /** For the debug overlay: strokes started on the play area, and swipes recognised. */
  readonly stats = { strokes: 0, swipes: 0 };

  private readonly host: InputHost;
  private readonly swipes: SwipeDetector;
  private readonly queue: ActionEvent[] = [];
  /** The source of every stroke in progress, by pointer id. */
  private readonly pointers = new Map<number, ActionEvent['source']>();
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions | undefined][] = [];
  private active = true;

  constructor(host: InputHost = browserHost()) {
    this.host = host;
    this.swipes = new SwipeDetector(INPUT.swipe, () => host.viewport());
    const win = host.window;
    const doc = host.document;
    this.listen(win, 'keydown', (e) => this.keyDown(e as KeyboardEvent));
    this.listen(win, 'pointerdown', (e) => this.pointerDown(e as PointerEvent));
    this.listen(win, 'pointermove', (e) => this.pointerMove(e as PointerEvent));
    this.listen(win, 'pointerup', (e) => this.pointerUp(e as PointerEvent));
    this.listen(win, 'pointercancel', (e) => this.pointerCancel(e as PointerEvent));
    // Losing focus mid-stroke would otherwise finish the stroke later, somewhere else.
    this.listen(win, 'blur', () => this.releaseAll());
    this.listen(win, 'pagehide', () => this.releaseAll());
    // A long press must not open a menu, a pinch must not zoom (Safari), a double tap must not zoom.
    this.listen(win, 'contextmenu', preventDefault);
    this.listen(doc, 'gesturestart', preventDefault);
    this.listen(doc, 'dblclick', preventDefault);
    // The page itself never scrolls or bounces, but a panel taller than a landscape phone must scroll.
    this.listen(
      doc,
      'touchmove',
      (e) => {
        if (!within(e.target, SCROLLS)) e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Moves every queued action into out[0..n) and returns n. */
  drain(out: ActionEvent[]): number {
    const n = this.queue.length;
    for (let i = 0; i < n; i++) out[i] = this.queue[i];
    out.length = n;
    this.queue.length = 0;
    return n;
  }

  /** Queues an action as if pressed now (source 'bot': bots, window.__runshift.act). */
  inject(action: Action): void {
    this.push(action, 'bot');
  }

  /** Forgets everything queued and every stroke in progress (blur, pause). */
  releaseAll(): void {
    this.queue.length = 0;
    this.pointers.clear();
    this.swipes.clear();
  }

  /**
   * Turns gameplay input on or off (off on menus). While off nothing is queued; commands (pause, mute, confirm)
   * still work. A change also releases everything, so only strokes and presses made after it count.
   */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.releaseAll();
  }

  /** Removes every listener (tests, hot reload). */
  dispose(): void {
    for (const [target, type, listener, options] of this.listeners) target.removeEventListener(type, listener, options);
    this.listeners.length = 0;
    this.releaseAll();
  }

  private listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, listener, options);
    this.listeners.push([target, type, listener, options]);
  }

  private push(action: Action, source: ActionEvent['source']): void {
    if (!this.active) return;
    if (this.queue.length >= MAX_QUEUED) this.queue.shift();
    this.queue.push({ action, at: this.host.now(), source });
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || within(e.target, TYPING)) return;
    const action = keyToAction(e.code);
    const command = action ? null : keyToCommand(e.code);
    if (!action && !command) return;
    if (!this.active && ownedByFocus(e.target, e.code)) return;
    e.preventDefault();
    // Holding a key presses it once.
    if (e.repeat) return;
    if (action) this.push(action, 'key');
    else if (command === 'pause') this.onPause();
    else if (command === 'mute') this.onMute();
    else this.onConfirm();
  }

  private pointerDown(e: PointerEvent): void {
    const mouse = e.pointerType === 'mouse';
    // The main mouse button drags; any finger or pen does.
    if ((mouse && e.button !== 0) || within(e.target, UI)) return;
    this.pointers.set(e.pointerId, mouse ? 'mouse' : 'touch');
    this.swipes.down(e.pointerId, e.clientX, e.clientY, e.isTrusted ? e.timeStamp : this.host.now());
    this.stats.strokes++;
    // Capture keeps the moves and the lift coming when a drag leaves the canvas or the window. It throws if the
    // pointer is already gone, which must not lose the stroke.
    const target = e.target as { setPointerCapture?: (pointerId: number) => void } | null;
    try {
      target?.setPointerCapture?.(e.pointerId);
    } catch {
      /* the stroke still counts */
    }
  }

  private pointerMove(e: PointerEvent): void {
    const source = this.pointers.get(e.pointerId);
    if (!source) return;
    const action = this.swipes.move(e.pointerId, e.clientX, e.clientY, e.isTrusted ? e.timeStamp : this.host.now());
    if (action) this.swiped(action, source);
  }

  private pointerUp(e: PointerEvent): void {
    const source = this.pointers.get(e.pointerId);
    if (!source) return;
    this.pointers.delete(e.pointerId);
    const action = this.swipes.up(e.pointerId, e.clientX, e.clientY, e.isTrusted ? e.timeStamp : this.host.now());
    if (action) this.swiped(action, source);
  }

  private pointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    this.swipes.cancel(e.pointerId);
  }

  private swiped(action: Action, source: ActionEvent['source']): void {
    this.stats.swipes++;
    this.push(action, source);
  }
}
