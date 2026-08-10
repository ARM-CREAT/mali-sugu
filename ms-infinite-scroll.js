/* =============================================================
   MALI SUGU — Scroll infini (version propre, SDK moderne)
   ✅ Utilise window.CLOUD.getProduitsPage() — même SDK que le reste du site
   ✅ Aucun SDK compat, aucun conflit avec go()/renderAll()
   ✅ N'ajoute que des cartes en plus, ne touche à aucune fonction existante
   ✅ Fonctionne sur : Accueil (#latestProducts) + Catalogue (#catalogProducts)
   ============================================================= */
(function () {
  'use strict';

  var PAGE_SIZE = 12;

  var etatParZone = {}; // { zoneId: { lastVisible, hasMore, loading, sentinel } }

  function attendreCloud(callback) {
    if (window.CLOUD && window.CLOUD.getProduitsPage) { callback(); return; }
    setTimeout(function () { attendreCloud(callback); }, 200);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtPrix(p) {
    return (Number(p) || 0).toLocaleString('fr-FR') + ' FCFA';
  }

  function fmtDate(t) {
    try { return new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  var CAT_ICONS = { alim:'🍚', vet:'👕', tel:'📱', elec:'💻', maison:'🪑', auto:'🏍️', beaute:'💄', art:'🪡', agri:'🌾', immo:'🏠', enfant:'🧸', autre:'📦' };
  function getCatIc(cat) { return CAT_ICONS[cat] || '📦'; }

  // Construit une carte produit identique visuellement à celles du site
  function carteHTML(p) {
    var isNew = (Date.now() - p.date) < 48 * 3600 * 1000;
    var imgSrc = p.photo || '';
    return '<div class="product ms-infinite-card" data-id="' + escapeHtml(p.id) + '">' +
      '<div class="img" style="' + (imgSrc ? 'background-image:url(' + imgSrc + ')' : '') + '">' +
        (!imgSrc ? getCatIc(p.cat) : '') +
        (isNew ? '<span class="new">NOUVEAU</span>' : '') +
      '</div>' +
      '<div class="info">' +
        '<h4>' + escapeHtml(p.titre) + '</h4>' +
        '<div class="price">' + fmtPrix(p.prix) + '</div>' +
        '<div class="seller">📍 ' + escapeHtml(p.region || p.ville || '') + '</div>' +
        '<div class="meta"><span>' + getCatIc(p.cat) + ' ' + escapeHtml(p.cat || '') + '</span><span>' + fmtDate(p.date) + '</span></div>' +
      '</div>' +
    '</div>';
  }

  // Ouvre la fiche détail en réutilisant voirDetail() du site, après avoir
  // fusionné l'item dans state.produits pour que la page détail le trouve
  function ouvrirProduit(p) {
    if (!window.state || !window.state.produits) return;
    var existe = window.state.produits.some(function (x) { return x.id === p.id; });
    if (!existe) window.state.produits.push(p);
    if (window.voirDetail) window.voirDetail(p.id);
  }

  // Charge la page suivante pour une zone donnée
  function chargerPage(zoneId, container) {
    var etat = etatParZone[zoneId];
    if (!etat || etat.loading || !etat.hasMore) return;
    etat.loading = true;

    window.CLOUD.getProduitsPage(etat.lastVisible, PAGE_SIZE).then(function (res) {
      etat.loading = false;
      etat.lastVisible = res.lastVisible;
      etat.hasMore = res.hasMore;

      // Évite les doublons avec ce qui est déjà affiché (rendu initial du site)
      var idsExistants = {};
      container.querySelectorAll('[data-id]').forEach(function (el) { idsExistants[el.dataset.id] = true; });

      var html = '';
      res.items.forEach(function (p) {
        if (idsExistants[p.id]) return;
        idsExistants[p.id] = true;
        html += carteHTML(p);
      });

      if (html) {
        var sentinel = etat.sentinel;
        sentinel.insertAdjacentHTML('beforebegin', html);
        // Attache les clics sur les nouvelles cartes seulement
        var toutesCartes = container.querySelectorAll('.ms-infinite-card:not([data-bound])');
        toutesCartes.forEach(function (carte) {
          carte.setAttribute('data-bound', '1');
          carte.addEventListener('click', function () {
            var id = carte.dataset.id;
            var item = res.items.find(function (x) { return x.id === id; });
            if (item) ouvrirProduit(item);
          });
        });
      }

      if (!etat.hasMore && etat.sentinel) {
        etat.sentinel.style.display = 'none';
      }
    }).catch(function (e) {
      etat.loading = false;
      console.warn('[MS Scroll Infini]', e.message);
    });
  }

  // Initialise le scroll infini sur une zone (container = élément grid existant)
  function initZone(container, zoneId) {
    if (!container || container.dataset.msInfiniteInit) return;
    container.dataset.msInfiniteInit = '1';

    var sentinel = document.createElement('div');
    sentinel.className = 'ms-infinite-sentinel';
    sentinel.style.cssText = 'flex:0 0 100%;height:1px;grid-column:1/-1';
    container.appendChild(sentinel);

    etatParZone[zoneId] = { lastVisible: null, hasMore: true, loading: false, sentinel: sentinel };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) chargerPage(zoneId, container);
      });
    }, { root: null, rootMargin: '300px' });

    observer.observe(sentinel);

    // Charge la première page tout de suite
    chargerPage(zoneId, container);
  }

  function init() {
    // Zone Catalogue (page complète, la plus utile pour un scroll infini)
    var catalogueEl = document.getElementById('catalogProducts');
    if (catalogueEl) initZone(catalogueEl, 'catalogue');

    // Zone Accueil (produits récents)
    var accueilEl = document.getElementById('latestProducts');
    if (accueilEl) initZone(accueilEl, 'accueil');

    console.log('[MS Scroll Infini] ✅ Activé (SDK moderne, sans conflit)');
  }

  document.addEventListener('DOMContentLoaded', function () {
    attendreCloud(function () {
      setTimeout(init, 500);
    });
  });
})();
