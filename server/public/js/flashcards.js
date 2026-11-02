(function () {
  let card = window.__FLASHCARD__;
  if (!card) return;

  const inner = document.getElementById('flip-card-inner');
  const optionsEl = document.getElementById('fc-options');
  const stemEl = document.getElementById('fc-stem');
  const backEl = document.getElementById('fc-back');
  const progressEl = document.getElementById('fc-progress');
  const nextBtn = document.getElementById('next-card-btn');
  const statAttemptedEl = document.getElementById('fc-stat-attempted');
  const statMasteredEl = document.getElementById('fc-stat-mastered');
  const statRemainingEl = document.getElementById('fc-stat-remaining');

  function renderStats(stats) {
    if (!stats) return;
    if (statAttemptedEl) statAttemptedEl.innerHTML = '<strong>' + stats.attempted + '/' + stats.total + '</strong>attempted';
    if (statMasteredEl) statMasteredEl.innerHTML = '<strong>' + stats.mastered + '/' + stats.total + '</strong>mastered';
    if (statRemainingEl) {
      statRemainingEl.innerHTML = '<strong>' + stats.remaining + '</strong>left';
      statRemainingEl.classList.toggle('has-due', stats.remaining > 0);
    }
  }

  function renderFront(newCard) {
    card = newCard;
    stemEl.textContent = card.stem;
    progressEl.textContent = card.correctCount + '/' + card.required + ' correct';
    optionsEl.dataset.questionId = card.id;
    optionsEl.innerHTML = '';
    card.options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.dataset.option = opt;
      btn.textContent = opt;
      optionsEl.appendChild(btn);
    });
    nextBtn.style.display = 'none';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  optionsEl.addEventListener('click', function (e) {
    const btn = e.target.closest('button.option');
    if (!btn) return;

    optionsEl.querySelectorAll('button.option').forEach((b) => (b.disabled = true));
    btn.classList.add('selected');

    fetch('/flashcards/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: card.id, selectedOption: btn.dataset.option }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;

        const resultCls = data.correct ? 'correct' : 'incorrect';
        const resultText = data.correct ? 'सम्यक्! <span class="en">Correct!</span>' : 'असम्यक् <span class="en">Not quite</span>';

        let html = '<div class="fc-result ' + resultCls + '">' + resultText + '</div>';
        html += '<div class="fc-progress">' + data.correctCount + '/' + data.required + ' correct' +
          (data.correctCount >= data.required ? ' — done!' : '') + '</div>';
        html += '<div class="fc-answer">' + escapeHtml(data.correctAnswer) + '</div>';
        if (data.englishMeaning) {
          html += '<div class="fc-english">English: ' + escapeHtml(data.englishMeaning) + '</div>';
        }
        if (data.note) {
          html += '<div class="fc-note">' + escapeHtml(data.note) + '</div>';
        }
        backEl.innerHTML = html;

        inner.classList.add('flipped');
        nextBtn.style.display = 'block';
        renderStats(data.stats);
      })
      .catch(() => {
        optionsEl.querySelectorAll('button.option').forEach((b) => (b.disabled = false));
      });
  });

  nextBtn.addEventListener('click', function () {
    fetch('/flashcards/next?exclude=' + encodeURIComponent(card.id))
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;

        if (data.done) {
          renderStats(data.stats);
          document.querySelector('.flip-card').outerHTML =
            '<p class="empty-state" id="fc-done">सर्वं सम्यक्! सर्वाणि पत्राणि पूर्णानि।<br><span class="en">All cards mastered!</span></p>';
          nextBtn.style.display = 'none';
          return;
        }

        // Flip back toward the front; swap the DOM content halfway through
        // the animation, while both faces are edge-on and invisible.
        inner.classList.remove('flipped');
        setTimeout(function () {
          renderFront(data.card);
          renderStats(data.stats);
        }, 300);
      });
  });
})();
