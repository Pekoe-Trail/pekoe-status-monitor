(function () {
  var root = document.documentElement;

  /**
   * Reads the visitor's saved theme.
   *
   * @returns 'light' or 'dark', or null when nothing valid is saved or storage is blocked.
   */
  function saved() {
    try {
      var value = localStorage.getItem('theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Applies a theme to the page and labels the toggle with the theme it switches to.
   *
   * @param {string} theme 'light' or 'dark'.
   */
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var button = document.querySelector('.theme-toggle');
    if (button) {
      var next = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      button.setAttribute('title', 'Switch to ' + next + ' theme');
    }
  }

  apply(saved() || 'light');

  window.addEventListener('storage', function (event) {
    if (event.key === 'theme') apply(saved() || 'light');
  });

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('.theme-toggle');
    if (!button) return;
    button.hidden = false;
    apply(root.getAttribute('data-theme'));
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch (e) {}
      apply(next);
    });
  });
})();
