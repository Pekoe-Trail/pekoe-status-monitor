(function () {
  /**
   * Reduces a path to the page it names, so `/`, `/index` and `/index.html` match, and so do
   * `/stages/4` and `/stages/4.html`.
   *
   * @param {string} path A URL path.
   * @returns {string} The page's path.
   */
  function page(path) {
    return path.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/';
  }

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('a.back') : null;
    if (!target || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!document.referrer || window.history.length < 2) return;
    var from = new URL(document.referrer);
    var to = new URL(target.href);
    if (from.origin !== to.origin || page(from.pathname) !== page(to.pathname)) return;
    event.preventDefault();
    window.history.back();
  });
})();
