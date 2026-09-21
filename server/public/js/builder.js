(function () {
  // --- Sections page: reveal the count input when its checkbox is toggled,
  // and auto-check the box if the Teacher types a count directly ---
  document.querySelectorAll('.section-toggle').forEach(function (cb) {
    var target = document.getElementsByName(cb.dataset.target)[0];
    if (!target) return;

    cb.addEventListener('change', function () {
      target.style.display = cb.checked ? '' : 'none';
      if (cb.checked) target.focus();
    });
    target.addEventListener('input', function () {
      if (target.value && !cb.checked) cb.checked = true;
    });
  });

  // --- Split page: live "New" = count - existing ---
  document.querySelectorAll('.split-existing').forEach(function (input) {
    var row = input.closest('.section-row');
    var out = row ? row.querySelector('.split-new-value') : null;
    if (!out) return;

    var count = parseInt(input.dataset.count, 10) || 0;
    input.addEventListener('input', function () {
      var existing = parseInt(input.value, 10) || 0;
      out.textContent = Math.max(0, count - existing);
    });
  });

  // --- Generate page: Copy Prompt ---
  document.querySelectorAll('.copy-prompt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      var text = target.value;
      var restoreLabel = function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.textContent = original;
        }, 1500);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(restoreLabel, function () {
          target.select();
        });
      } else {
        target.select();
      }
    });
  });
})();
