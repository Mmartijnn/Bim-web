/* Laad-animatie: markeert een foto (en zijn vak) zodra hij geladen is */
(function () {
  var boxes = '.card, .p-card, .banner-break, .p-banner';
  document.querySelectorAll('.card img, .p-card img, .banner-break img, .p-banner img').forEach(function (img) {
    var box = img.closest(boxes);
    function done() {
      img.classList.add('loaded');
      if (box) box.classList.add('is-loaded');
    }
    if (img.complete && img.naturalWidth > 0) {
      done();
    } else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
})();
