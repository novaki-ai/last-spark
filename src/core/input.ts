// Unified input: keyboard (WASD + arrows), gamepad (left stick), touch joystick.
export class Input {
  moveX = 0;
  moveY = 0;
  dashPressed = false;   // edge-triggered, consumed by game
  pausePressed = false;  // edge-triggered
  anyConfirm = false;    // edge-triggered (enter/space/click) for story advance
  usingTouch = false;

  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyDX = 0;
  private joyDY = 0;
  private onAnyGesture: (() => void) | null = null;
  private gestureFired = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'shift') this.dashPressed = true;
      if (k === 'escape' || k === 'p') this.pausePressed = true;
      if (k === ' ' || k === 'enter') this.anyConfirm = true;
      this.fireGesture();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('pointerdown', () => this.fireGesture(), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
  }

  setGestureHandler(fn: () => void) {
    this.onAnyGesture = fn;
  }

  private fireGesture() {
    if (this.gestureFired) return;
    this.gestureFired = true;
    this.onAnyGesture?.();
  }

  attachTouchUI(joyEl: HTMLElement, knobEl: HTMLElement, dashEl: HTMLElement, touchRoot: HTMLElement) {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!isTouch) return;
    this.usingTouch = true;
    touchRoot.classList.remove('hidden');

    const R = 48;
    joyEl.style.display = 'none';

    window.addEventListener('touchstart', (e) => {
      this.fireGesture();
      for (const t of Array.from(e.changedTouches)) {
        const x = t.clientX, y = t.clientY;
        // left 60% of screen = joystick (but not on dash button)
        if (this.joyId === null && x < innerWidth * 0.62) {
          this.joyId = t.identifier;
          this.joyBaseX = x; this.joyBaseY = y;
          this.joyDX = 0; this.joyDY = 0;
          joyEl.style.display = 'block';
          joyEl.style.left = `${x - 60}px`;
          joyEl.style.top = `${y - 60}px`;
          knobEl.style.transform = 'translate(-50%,-50%)';
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          e.preventDefault();
          let dx = t.clientX - this.joyBaseX;
          let dy = t.clientY - this.joyBaseY;
          const len = Math.hypot(dx, dy);
          if (len > R) { dx = dx / len * R; dy = dy / len * R; }
          this.joyDX = dx / R; this.joyDY = dy / R;
          knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
      }
    }, { passive: false });

    const endTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.joyDX = 0; this.joyDY = 0;
          joyEl.style.display = 'none';
        }
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    dashEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.dashPressed = true;
      this.fireGesture();
    }, { passive: false });
  }

  update() {
    // keyboard
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const gx = p.axes[0] ?? 0;
      const gy = p.axes[1] ?? 0;
      const dead = 0.22;
      if (Math.hypot(gx, gy) > dead) {
        x += gx; y += gy;
      }
      if (p.buttons[0]?.pressed || p.buttons[1]?.pressed) {
        if (!this.padDashHeld) { this.dashPressed = true; this.padDashHeld = true; }
      } else this.padDashHeld = false;
      if (p.buttons[9]?.pressed) {
        if (!this.padStartHeld) { this.pausePressed = true; this.padStartHeld = true; }
      } else this.padStartHeld = false;
      if (p.buttons[0]?.pressed) {
        if (!this.padConfirmHeld) { this.anyConfirm = true; this.padConfirmHeld = true; }
      } else this.padConfirmHeld = false;
      break; // first connected pad only
    }

    // touch joystick
    x += this.joyDX;
    y += this.joyDY;

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.moveX = x;
    this.moveY = y;
  }

  private padDashHeld = false;
  private padStartHeld = false;
  private padConfirmHeld = false;

  consumeDash(): boolean {
    const d = this.dashPressed;
    this.dashPressed = false;
    return d;
  }
  consumePause(): boolean {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }
  consumeConfirm(): boolean {
    const c = this.anyConfirm;
    this.anyConfirm = false;
    return c;
  }
}
