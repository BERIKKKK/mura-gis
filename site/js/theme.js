/* Mura GIS сайты: жарық / қараңғы тақырыпты ауыстыру (таңдау осы браузерде есте сақталады). */
(function () {
  'use strict';
  var KEY = 'mura.site.theme', root = document.documentElement;
  try { var saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') root.dataset.theme = saved; } catch (e) { /* елемейміз */ }
  function isDark() {
    if (root.dataset.theme) return root.dataset.theme === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;
    function label() { btn.setAttribute('aria-label', isDark() ? 'Жарық тақырып' : 'Қараңғы тақырып'); btn.title = btn.getAttribute('aria-label'); }
    label();
    btn.addEventListener('click', function () {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) { /* елемейміз */ }
      label();
    });
  });
})();
