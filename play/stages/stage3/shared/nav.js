(() => {
  'use strict';

  /**
   * Local file (file://) と GitHub Pages の両方で確実に動く通常ページ遷移。
   * target は将来のルーター用識別子として残しているが、現状は fallbackHref を使う。
   */
  function go(target, fallbackHref) {
    if (!fallbackHref) return;
    window.location.href = fallbackHref;
  }

  window.KAKARE_NAV = { go };
})();
