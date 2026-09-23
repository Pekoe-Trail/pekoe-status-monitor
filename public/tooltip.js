(function () {
  var tip;
  var shown = null;

  /**
   * Shows the tooltip over an element, kept inside the window.
   *
   * @param {Element} target The element carrying `data-tip`.
   */
  function show(target) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      tip.setAttribute('role', 'presentation');
      document.body.appendChild(tip);
    }
    tip.textContent = target.getAttribute('data-tip');
    tip.classList.add('on');
    var box = target.getBoundingClientRect();
    var width = tip.offsetWidth;
    var left = box.left + box.width / 2 - width / 2;
    var top = box.top - tip.offsetHeight - 8;
    tip.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
    tip.style.top = (top < 8 ? box.bottom + 8 : top) + 'px';
    shown = target;
  }

  /**
   * Hides the tooltip.
   */
  function hide() {
    shown = null;
    if (tip) tip.classList.remove('on');
  }

  document.addEventListener('pointerover', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-tip]') : null;
    if (target) show(target);
    else if (shown) hide();
  });
  document.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, true);
  document.addEventListener('focusin', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-tip]') : null;
    if (target) show(target);
    else hide();
  });
  document.addEventListener('focusout', hide);
})();
