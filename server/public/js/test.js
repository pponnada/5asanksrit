(function () {
  const attempt = window.__ATTEMPT__;
  if (!attempt) return;

  // --- Tap-to-select, saved immediately ---
  const optionsContainer = document.querySelector('.options');
  if (optionsContainer) {
    optionsContainer.addEventListener('click', function (e) {
      const btn = e.target.closest('button.option');
      if (!btn) return;

      optionsContainer.querySelectorAll('button.option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');

      fetch('/test/' + attempt.paperId + '/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: attempt.questionId,
          selectedOption: btn.dataset.option,
        }),
      }).catch(() => {
        // Best-effort; the server re-derives state from start_ts on next
        // load regardless, so a dropped save just means this one tap needs
        // to be retried by the Student.
      });
    });
  }

  // --- Countdown timer ---
  const display = document.getElementById('timer-display');
  const fill = document.getElementById('timer-fill');
  const endsAt = new Date(attempt.endsAt).getTime();
  const totalMs = attempt.totalSeconds * 1000;
  let autoSubmitted = false;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function tick() {
    const remainingMs = endsAt - Date.now();

    if (remainingMs <= 0) {
      if (display) display.textContent = '00:00';
      if (fill) fill.style.width = '0%';
      if (!autoSubmitted) {
        autoSubmitted = true;
        submitForm();
      }
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const mm = Math.floor(totalSeconds / 60);
    const ss = totalSeconds % 60;
    if (display) display.textContent = pad(mm) + ':' + pad(ss);

    if (fill) {
      const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
      fill.style.width = pct + '%';
      fill.style.backgroundColor = pct < 15 ? '#b5342e' : pct < 40 ? '#c9962e' : '#2f7d4f';
    }

    setTimeout(tick, 1000);
  }

  function submitForm() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/test/' + attempt.paperId + '/submit';
    document.body.appendChild(form);
    form.submit();
  }

  if (display) tick();
})();
