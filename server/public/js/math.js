// Renders LaTeX in question stems, options and notes. Models answer with
// either $...$ or \(...\) (and $$...$$ or \[...\] for display), so all are
// accepted. Plain Sanskrit text contains none of these, so it passes through
// untouched. If KaTeX failed to load the raw text simply stays visible.
(function () {
  if (typeof renderMathInElement !== 'function') return;
  renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });
})();
