(function () {
  var nav = document.querySelector('[data-stage-nav]');
  if (!nav) return;
  var panels = Array.prototype.slice.call(nav.querySelectorAll('.stage-nav-panel'));
  var stages = panels.map(function (panel) { return panel.getAttribute('data-stage'); });

  /**
   * Finds the stage the visitor is following: the one in the address, then the stage page they
   * came from.
   *
   * @returns {string|null} The stage number, or null when they aren't following one.
   */
  function following() {
    var asked = new URL(window.location.href).searchParams.get('stage');
    if (stages.indexOf(asked) >= 0) return asked;
    var from = document.referrer && new URL(document.referrer);
    var match = from && from.origin === window.location.origin && from.pathname.match(/^\/stages\/(\d+)/);
    if (match && stages.indexOf(match[1]) >= 0) return match[1];
    return null;
  }

  /**
   * Shows the alert as it stands on one stage: that stage in the header and the details, with a
   * note of how many other stages the same alert went to.
   *
   * @param {string} stage The stage number.
   */
  function narrow(stage) {
    var badgeLabel = document.querySelector('[data-stage-badge-label]');
    if (badgeLabel) badgeLabel.textContent = 'Stage';
    var badgeNum = document.querySelector('[data-stage-badge-num]');
    if (badgeNum) badgeNum.textContent = stage.length === 1 ? '0' + stage : stage;
    var label = document.querySelector('[data-stage-label]');
    if (label) label.textContent = 'Stage';
    var all = document.querySelector('[data-all-stages]');
    if (all) all.hidden = true;
    var chips = document.querySelector('.stage-chips');
    if (chips) chips.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('.stage-chips li[data-stage]'), function (chip) {
      chip.hidden = chip.getAttribute('data-stage') !== stage;
    });
    var others = document.querySelector('[data-other-stages]');
    if (others) {
      var count = stages.length - 1;
      others.textContent = 'Also sent to ' + count + ' other ' + (count === 1 ? 'stage' : 'stages');
      others.hidden = false;
    }
  }

  var stage = following();
  if (stage) narrow(stage);
  else stage = stages[0];
  panels.forEach(function (panel) {
    panel.hidden = panel.getAttribute('data-stage') !== stage;
  });
})();
