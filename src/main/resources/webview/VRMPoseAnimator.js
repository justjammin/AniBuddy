/**
 * VRMPoseAnimator.js — Expression & blink controller.
 * Bone poses are driven entirely by VRMA files via VRMAnimationMixer.
 * This module only handles facial expressions and eye blinking per state.
 */

function lerp(a, b, t) { return a + (b - a) * t; }

const EXPR_LIBRARY = {
  idle:    { relaxed: 0.35 },
  typing:  { happy: 0.4,    relaxed: 0.2 },
  reading: { relaxed: 0.2 },
  running: { surprised: 0.5, happy: 0.2 },
  waiting: { sad: 0.3,      relaxed: 0.2 },
  error:   { surprised: 0.8, angry: 0.3 },
  done:    { happy: 1.0 },
  alert:   { surprised: 1.0, angry: 0.2 },
};

const ALL_EXPRS = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];

const BLINK_RATES = {
  idle: 3.5, typing: 4.5, reading: 2.5, running: 5,
  waiting: 2, error: 0.8, done: 3, alert: 1.2,
};

export class VRMPoseAnimator {

  constructor(vrm) {
    this.vrm           = vrm;
    this.currentState  = 'idle';
    this.oneShotActive = false;
    this.oneShotTimer  = 0;
    this.oneShotDur    = 1.5;
    this.returnState   = 'idle';
    this.blinkTimer    = 0;
    this.blinkInterval = 3.5;
    this.isBlinking    = false;
    this.blinkPhase    = 0;
  }

  setState(state) {
    if (!EXPR_LIBRARY[state] || (state === this.currentState && !this.oneShotActive)) return;
    this.currentState  = state;
    this.oneShotActive = false;
  }

  triggerOnce(state, duration = 1.8) {
    if (!EXPR_LIBRARY[state]) return;
    this.returnState   = this.currentState;
    this.oneShotActive = true;
    this.oneShotTimer  = 0;
    this.oneShotDur    = duration;
    this.currentState  = state;
  }

  update(delta) {
    if (!this.vrm?.expressionManager) return;
    if (this.oneShotActive) {
      this.oneShotTimer += delta;
      if (this.oneShotTimer >= this.oneShotDur) {
        this.oneShotActive = false;
        this.currentState  = this.returnState;
      }
    }
    this._applyExpressions();
    this._updateBlink(delta);
  }

  reset(vrm) {
    this.vrm           = vrm;
    this.currentState  = 'idle';
    this.oneShotActive = false;
  }

  _applyExpressions() {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const target = EXPR_LIBRARY[this.currentState] || {};
    for (const expr of ALL_EXPRS) {
      em.setValue(expr, lerp(em.getValue(expr) ?? 0, target[expr] ?? 0, 0.06));
    }
  }

  _updateBlink(delta) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    this.blinkInterval = BLINK_RATES[this.currentState] ?? 3.5;
    this.blinkTimer += delta;
    if (!this.isBlinking && this.blinkTimer >= this.blinkInterval) {
      this.isBlinking = true;
      this.blinkPhase = 0;
      this.blinkTimer = 0;
    }
    if (this.isBlinking) {
      this.blinkPhase += delta / 0.12;
      em.setValue('blink', Math.sin(Math.max(0, Math.min(Math.PI, this.blinkPhase))));
      if (this.blinkPhase >= Math.PI) {
        this.isBlinking = false;
        em.setValue('blink', 0);
      }
    }
  }
}

export const STATE_META = {
  idle:    { label: 'IDLE',    emoji: '😌', color: '#a78bfa' },
  typing:  { label: 'WRITING', emoji: '⌨️',  color: '#34d399' },
  reading: { label: 'READING', emoji: '👀',  color: '#60a5fa' },
  running: { label: 'RUNNING', emoji: '⚡',  color: '#fbbf24' },
  waiting: { label: 'WAITING', emoji: '💭',  color: '#f472b6' },
  error:   { label: 'ERROR',   emoji: '💢',  color: '#f87171' },
  done:    { label: 'DONE',    emoji: '✨',  color: '#86efac' },
  alert:   { label: 'ALERT',   emoji: '🚨',  color: '#fb923c' },
};