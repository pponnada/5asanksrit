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

  // --- Generate/bank pages: Copy Prompt ---
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
