(function () {
  let card = window.__FLASHCARD__;
  if (!card) return;

  const inner = document.getElementById('flip-card-inner');
  const optionsEl = document.getElementById('fc-options');
  const stemEl = document.getElementById('fc-stem');
  const backEl = document.getElementById('fc-back');
  const nextBtn = document.getElementById('next-card-btn');
  const statsEl = document.getElementById('fc-stats');

  function renderStats(stats) {
    if (!statsEl || !stats) return;
    statsEl.innerHTML = stats.mastered + '/' + stats.total + ' <span class="en">mastered</span>';
  }

  function renderFront(newCard) {
    card = newCard;
    stemEl.textContent = card.stem;
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
