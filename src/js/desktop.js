/* Mura GIS: жұмыс үстелі қабығы. Құралдың өз коды (qorgau/*.js) сайттағымен бірдей —
   мұнда тек жоғарғы жолаққа бағдарлама белгісін қосамыз. */
(function () {
  'use strict';
  var info = window.mura || {};
  function brand() {
    var top = document.querySelector('.qa-top');
    if (!top || top.querySelector('.mura-brand')) return;
    var b = document.createElement('span');
    b.className = 'mura-brand';
    b.title = 'Mura GIS' + (info.version ? ' ' + info.version : '');
    b.innerHTML = '<img src="img/icon.svg" alt=""><span>Mura GIS</span>' + (info.version ? '<small>v' + info.version + '</small>' : '');
    top.insertBefore(b, top.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brand); else brand();
})();
