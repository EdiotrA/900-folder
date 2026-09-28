// ==========================================================================
// PlayVault Stealth Gate — Real Hardware Calculator & Secret 1223 Trigger
// ==========================================================================

(function () {
  const GATE_KEY = 'playvault_gate_1223';
  const gate = document.getElementById('calcGate');
  const display = document.getElementById('calcDisplay');
  const history = document.getElementById('calcHistory');
  const notes = document.getElementById('calcNotes');
  const platformRoot = document.getElementById('platformRoot');

  // If already unlocked in this session, reveal platform immediately
  if (sessionStorage.getItem(GATE_KEY) === '1') {
    if (gate) gate.style.display = 'none';
    if (platformRoot) platformRoot.classList.remove('hidden');
    return;
  }

  let current = '0';
  let stored = null;
  let op = null;
  let fresh = true;
  let secretBuffer = '';

  function render() {
    if (display) display.textContent = current;
    if (history) {
      if (stored !== null && op) {
        const opSymbol = op === '*' ? '×' : op === '/' ? '÷' : op;
        history.textContent = `${stored} ${opSymbol} ${fresh ? '' : current}`;
      } else {
        history.textContent = '';
      }
    }
  }

  function inputDigit(d) {
    secretBuffer = (secretBuffer + d).slice(-12);
    if (fresh) {
      current = d;
      fresh = false;
    } else {
      current = current === '0' ? d : current + d;
    }
    render();
  }

  function inputDot() {
    if (fresh) {
      current = '0.';
      fresh = false;
    } else if (!current.includes('.')) {
      current += '.';
    }
    render();
  }

  function clearAll() {
    current = '0';
    stored = null;
    op = null;
    fresh = true;
    render();
  }

  function backspace() {
    if (fresh || current.length <= 1) {
      current = '0';
      fresh = true;
    } else {
      current = current.slice(0, -1);
    }
    render();
  }

  function toggleSign() {
    if (current !== '0') {
      current = current.startsWith('-') ? current.slice(1) : '-' + current;
      render();
    }
  }

  function percentage() {
    const val = parseFloat(current);
    if (!isNaN(val)) {
      current = String(val / 100);
      render();
    }
  }

  function compute(a, b, operator) {
    const x = parseFloat(a);
    const y = parseFloat(b);
    if (isNaN(x) || isNaN(y)) return '0';
    if (operator === '+') return String(x + y);
    if (operator === '-') return String(x - y);
    if (operator === '*') return String(x * y);
    if (operator === '/') return y === 0 ? 'Error' : String(x / y);
    return b;
  }

  function chooseOp(nextOp) {
    if (op && !fresh) {
      current = compute(stored, current, op);
    }
    stored = current;
    op = nextOp;
    fresh = true;
    render();
  }

  function equals() {
    if (tryUnlock()) return;
    if (op) {
      current = compute(stored, current, op);
      if (history) {
        const opSymbol = op === '*' ? '×' : op === '/' ? '÷' : op;
        history.textContent = `${stored} ${opSymbol} ${fresh ? '' : current} =`;
      }
      stored = null;
      op = null;
      fresh = true;
      render();
    }
  }

  function tryUnlock() {
    // Secret 1223 password check
    if (secretBuffer.endsWith('1223') || current === '1223') {
      unlockGate();
      return true;
    }
    return false;
  }

  function unlockGate() {
    sessionStorage.setItem(GATE_KEY, '1');
    if (gate) {
      gate.classList.add('calc-exit');
      setTimeout(() => {
        gate.style.display = 'none';
        if (platformRoot) {
          platformRoot.classList.remove('hidden');
        }
        window.dispatchEvent(new Event('playvault:unlocked'));
      }, 250);
    }
  }

  // Quick re-lock function available globally
  window.lockPlayVault = function () {
    sessionStorage.removeItem(GATE_KEY);
    if (gate) {
      gate.classList.remove('calc-exit');
      gate.style.display = 'flex';
    }
    if (platformRoot) {
      platformRoot.classList.add('hidden');
    }
    clearAll();
  };

  // Button clicks on calculator
  document.querySelectorAll('[data-calc]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-calc');
      if (key >= '0' && key <= '9') inputDigit(key);
      else if (key === '.') inputDot();
      else if (key === 'C') clearAll();
      else if (key === 'CE' || key === 'DEL') backspace();
      else if (key === '±') toggleSign();
      else if (key === '%') percentage();
      else if (key === '=') equals();
      else if (['+', '-', '*', '/'].includes(key)) chooseOp(key);
      else if (key === 'enter') {
        if (!tryUnlock()) equals();
      }
    });
  });

  // Physical keyboard listeners for realistic typing and instant 1223 unlock
  window.addEventListener('keydown', (e) => {
    // Do not capture keyboard if user is typing in notes textarea
    if (e.target === notes || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    if (gate && gate.style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDot();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        chooseOp(e.key);
      } else if (e.key === 'Enter' || e.key === '=' || e.key === 'Tab') {
        e.preventDefault();
        if (!tryUnlock()) equals();
      } else if (e.key === 'Backspace') {
        backspace();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        clearAll();
      }
    }
  });

  // School Notes Persistence (Requirement 38)
  if (notes) {
    try {
      const saved = localStorage.getItem('schoolNotes') || localStorage.getItem('calc_notes') || '';
      if (saved) notes.value = saved;
    } catch (_) {}

    notes.addEventListener('input', () => {
      try {
        localStorage.setItem('schoolNotes', notes.value);
        localStorage.setItem('calc_notes', notes.value);
      } catch (_) {}
    });
  }

  render();
})();
