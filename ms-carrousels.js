/* =============================================================
   MALI SUGU — Carrousels horizontaux infinis
   ✅ Scroll gauche/droite infini sur chaque carrousel
   ✅ 5 carrousels thématiques au-dessus du catalogue
   ✅ Touche pas au scroll vertical existant
   ✅ Lazy loading + cache pour rapidité
   ✅ Compatible mode sombre
   ============================================================= */
(function () {
  'use strict';
  if (typeof firebase === 'undefined' || !firebase.firestore) return;
  var db = firebase.firestore();

  // ============ CONFIGURATION ============
  var CFG = {
    pageSize: 10, // produits par chargement horizontal
    cacheMs: 5 * 60 * 1000, // 5 min de cache
    insertBefore: '#ms-grid, .produits-grid, .catalogue-grid, [data-ms-auto]'
  };

  var cache = {}; // cache mémoire par type

  /* ─────────── DÉFINITION DES CARROUSELS ─────────── */
  var CARROUSELS = [
    {
      id: 'boostes',
      titre: '🔥 Boostés',
      sousTitre: 'Annonces en vedette',
      couleur: '#fcd116',
      query: function () {
        // Produits avec boost actif
        return db.collection('produits')
          .where('boost_jusqua', '>', new Date().toISOString())
          .limit(CFG.pageSize);
      }
    },
    {
      id: 'nouveautes',
      titre: '✨ Nouveautés',
      sousTitre: 'Les plus récents',
      couleur: '#14a44d',
      query: function (lastDoc) {
        var q = db.collection('produits')
          .orderBy('created_at', 'desc')
          .limit(CFG.pageSize);
        return lastDoc ? q.startAfter(lastDoc) : q;
      }
    },
    {
      id: 'pres-de-toi',
      titre: '📍 Près de toi',
      sousTitre: 'Dans ta région',
      couleur: '#ea4335',
      query: function () {
        var pos = JSON.parse(localStorage.getItem('ms_user_position') || 'null');
        if (!pos) return null; // pas de géoloc → on saute ce carrousel
        return db.collection('produits').limit(40); // on filtre côté client
      },
      filtre: function (docs) {
        var pos = JSON.parse(localStorage.getItem('ms_user_position') || 'null');
        if (!pos) return docs;
        return docs.filter(function (d) {
          var p = d.data();
          if (!p.lat || !p.lng) return false;
          var dist = distanceKm(pos.lat, pos.lng, p.lat, p.lng);
          return dist <= 50;
        }).slice(0, CFG.pageSize);
      }
    },
    {
      id: 'mieux-notes',
      titre: '⭐ Mieux notés',
      sousTitre: 'Les favoris des clients',
      couleur: '#ff9500',
      query: function () {
        return db.collection('produits').limit(30); // filtré côté client
      },
      filtre: function (docs) {
        return docs.filter(function (d) {
          var p = d.data();
          return p.avis && p.avis.length > 0;
        }).map(function (d) {
          var p = d.data();
          var moy = p.avis.reduce(function (s, a) { return s + a.note; }, 0) / p.avis.length;
          return { doc: d, score: moy };
        }).sort(function (a, b) { return b.score - a.score; })
          .slice(0, CFG.pageSize)
          .map(function (e) { return e.doc; });
      }
    },
    {
      id: 'pour-toi',
      titre: '🤖 Pour toi',
      sousTitre: 'Basé sur tes goûts',
      couleur: '#9c27b0',
      query: function () {
        var hist = JSON.parse(localStorage.getItem('ms_browse_history') || '[]');
        if (hist.length < 3) return null; // pas assez d'historique

        // Catégorie la plus consultée
        var catCount = {};
        hist.forEach(function (h) { if (h.cat) catCount[h.cat] = (catCount[h.cat] || 0) + 1; });
        var topCat = Object.entries(catCount).sort(function (a, b) { return b[1] - a[1]; })[0];
        if (!topCat) return null;

        return db.collection('produits')
          .where('categorie', '==', topCat[0])
          .limit(CFG.pageSize);
      }
    }
  ];

  /* ─────────── UTILITAIRES ─────────── */
  function distanceKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ─────────── CRÉATION D'UNE CARTE PRODUIT (mini) ─────────── */
  function carteHTML(id, p, boost) {
    var img = p.photo_url || p.image || (p.photos_urls ? p.photos_urls.split('|')[0] : '');
    var prix = p.prix ? Number(p.prix).toLocaleString('fr-FR') + ' FCFA' : '';
    var note = '';
    if (p.avis && p.avis.length > 0) {
      var moy = (p.avis.reduce(function (s, a) { return s + a.note; }, 0) / p.avis.length).toFixed(1);
      note = '<div class="ms-h-note">⭐ ' + moy + ' (' + p.avis.length + ')</div>';
    }
    return '<div class="ms-h-card" data-id="' + escape(id) + '" onclick="MSCarousels.ouvrir(\'' + escape(id) + '\')">' +
      (boost ? '<span class="ms-h-boost">🔥 BOOST</span>' : '') +
      '<div class="ms-h-img-wrap">' +
        (img ? '<img loading="lazy" src="' + escape(img) + '" class="ms-h-img">' : '<div class="ms-h-noimg">📦</div>') +
      '</div>' +
      '<div class="ms-h-info">' +
        '<div class="ms-h-titre">' + escape((p.titre || '').slice(0, 40)) + '</div>' +
        '<div class="ms-h-prix">' + prix + '</div>' +
        note +
        (p.region ? '<div class="ms-h-region">📍 ' + escape(p.region) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  /* ─────────── CRÉATION D'UN CARROUSEL ─────────── */
  function creerCarrousel(def) {
    var section = document.createElement('section');
    section.className = 'ms-carousel-section';
    section.dataset.carrouselId = def.id;
    section.innerHTML =
      '<div class="ms-carousel-header">' +
        '<div>' +
          '<h2 class="ms-carousel-titre" style="border-left-color:' + def.couleur + '">' + escape(def.titre) + '</h2>' +
          (def.sousTitre ? '<div class="ms-carousel-sub">' + escape(def.sousTitre) + '</div>' : '') +
        '</div>' +
        '<div class="ms-carousel-nav">' +
          '<button class="ms-carousel-arrow" data-dir="-1">◀</button>' +
          '<button class="ms-carousel-arrow" data-dir="1">▶</button>' +
        '</div>' +
      '</div>' +
      '<div class="ms-carousel-track" data-track></div>' +
      '<div class="ms-carousel-loading" data-loading style="display:none">⏳</div>';

    // Boutons navigation
    var track = section.querySelector('[data-track]');
    section.querySelectorAll('.ms-carousel-arrow').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.dataset.dir);
        track.scrollBy({ left: dir * 320, behavior: 'smooth' });
      });
    });

    // Chargement initial
    chargerCarrousel(def, section, true);

    // IntersectionObserver pour scroll horizontal infini
    var sentinelle = document.createElement('div');
    sentinelle.className = 'ms-carousel-sentinelle';
    sentinelle.style.cssText = 'flex:0 0 1px;height:1px';
    track.appendChild(sentinelle);

    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          chargerCarrousel(def, section, false);
        }
      });
    }, { root: track, rootMargin: '0px 200px 0px 0px' }).observe(sentinelle);

    return section;
  }

  /* ─────────── CHARGEMENT PRODUITS ─────────── */
  function chargerCarrousel(def, section, premiere) {
    var track = section.querySelector('[data-track]');
    var loading = section.querySelector('[data-loading]');
    var sentinelle = section.querySelector('.ms-carousel-sentinelle');

    if (section.dataset.loading === '1') return;
    if (section.dataset.fin === '1') return;
    section.dataset.loading = '1';
    loading.style.display = 'block';

    // Cache
    var cacheKey = def.id;
    var cached = cache[cacheKey];
    if (premiere && cached && Date.now() - cached.t < CFG.cacheMs) {
      cached.html.forEach(function (h) {
        sentinelle.insertAdjacentHTML('beforebegin', h);
      });
      loading.style.display = 'none';
      section.dataset.loading = '0';
      return;
    }

    var lastDoc = section._lastDoc || null;
    var q = def.query(lastDoc);
    if (!q) {
      // Pas de query possible (ex: pas d'historique pour "Pour toi")
      section.remove();
      return;
    }

    q.get().then(function (snap) {
      if (snap.empty) {
        section.dataset.fin = '1';
        loading.style.display = 'none';
        if (premiere && track.children.length <= 1) section.remove(); // section vide
        return;
      }

      var docs = snap.docs;
      if (def.filtre) docs = def.filtre(docs);
      if (docs.length === 0) {
        section.dataset.fin = '1';
        loading.style.display = 'none';
        if (premiere && track.children.length <= 1) section.remove();
        return;
      }

      section._lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < CFG.pageSize) section.dataset.fin = '1';

      var htmls = [];
      docs.forEach(function (d) {
        var p = d.data();
        var html = carteHTML(d.id, p, def.id === 'boostes');
        htmls.push(html);
        sentinelle.insertAdjacentHTML('beforebegin', html);
      });

      // Sauve dans cache
      if (premiere) cache[cacheKey] = { html: htmls, t: Date.now() };

      loading.style.display = 'none';
      section.dataset.loading = '0';
    }).catch(function (e) {
      console.warn('[Carousel ' + def.id + ']', e.message);
      loading.style.display = 'none';
      section.dataset.loading = '0';
      // Si erreur de requête (ex: pas d'index Firestore), on retire la section
      if (premiere) section.remove();
    });
  }

  /* ─────────── STYLES ─────────── */
  function injecterCSS() {
    if (document.getElementById('ms-carousel-css')) return;
    var s = document.createElement('style');
    s.id = 'ms-carousel-css';
    s.textContent = `
      .ms-carousel-section {
        margin: 1.5rem 0;
        padding: 0 1rem;
      }
      .ms-carousel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 0.85rem;
      }
      .ms-carousel-titre {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 800;
        color: #0d7a38;
        padding-left: 0.85rem;
        border-left: 4px solid #14a44d;
        line-height: 1.2;
      }
      html.ms-dark .ms-carousel-titre { color: #4ce080; }
      .ms-carousel-sub {
        font-size: 0.82rem;
        color: #888;
        margin-top: 0.25rem;
        padding-left: 1rem;
      }
      html.ms-dark .ms-carousel-sub { color: #aaa; }
      .ms-carousel-nav {
        display: flex;
        gap: 0.4rem;
      }
      .ms-carousel-arrow {
        width: 36px; height: 36px;
        border-radius: 50%;
        border: 1px solid #ddd;
        background: #fff;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
      }
      .ms-carousel-arrow:hover {
        background: #14a44d;
        color: #fff;
        border-color: #14a44d;
        transform: scale(1.05);
      }
      html.ms-dark .ms-carousel-arrow {
        background: #2a2a2a; border-color: #444; color: #e0e0e0;
      }
      .ms-carousel-track {
        display: flex;
        gap: 0.85rem;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        padding-bottom: 0.5rem;
        scroll-snap-type: x mandatory;
      }
      .ms-carousel-track::-webkit-scrollbar { height: 6px; }
      .ms-carousel-track::-webkit-scrollbar-thumb { background: #14a44d; border-radius: 4px; }
      .ms-carousel-track::-webkit-scrollbar-track { background: transparent; }

      .ms-h-card {
        flex: 0 0 200px;
        background: #fff;
        border: 1px solid #e0ebe3;
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.25s;
        scroll-snap-align: start;
        position: relative;
      }
      .ms-h-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(20,164,77,0.2);
        border-color: #14a44d;
      }
      html.ms-dark .ms-h-card {
        background: #2a2a2a;
        border-color: #3a3a3a;
        color: #e0e0e0;
      }
      .ms-h-img-wrap {
        width: 100%;
        aspect-ratio: 1 / 1;
        background: #eef2ef;
        overflow: hidden;
      }
      html.ms-dark .ms-h-img-wrap { background: #1f1f1f; }
      .ms-h-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s;
      }
      .ms-h-card:hover .ms-h-img { transform: scale(1.05); }
      .ms-h-noimg {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-size: 3rem; color: #aaa;
      }
      .ms-h-info { padding: 0.65rem; }
      .ms-h-titre {
        font-weight: 600;
        font-size: 0.88rem;
        margin-bottom: 0.3rem;
        line-height: 1.3;
        height: 2.6em;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .ms-h-prix {
        font-weight: 800;
        color: #14a44d;
        font-size: 0.95rem;
      }
      html.ms-dark .ms-h-prix { color: #4ce080; }
      .ms-h-note {
        font-size: 0.75rem;
        color: #888;
        margin-top: 0.25rem;
      }
      .ms-h-region {
        font-size: 0.72rem;
        color: #999;
        margin-top: 0.2rem;
      }
      .ms-h-boost {
        position: absolute;
        top: 6px; left: 6px;
        background: linear-gradient(135deg, #fcd116, #ff9500);
        color: #1a1a1a;
        font-size: 0.65rem;
        font-weight: 800;
        padding: 0.2rem 0.45rem;
        border-radius: 4px;
        z-index: 2;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .ms-carousel-loading {
        text-align: center;
        padding: 0.5rem;
        color: #888;
        font-size: 1.2rem;
      }

      @media (max-width: 600px) {
        .ms-h-card { flex: 0 0 160px; }
        .ms-carousel-titre { font-size: 1.05rem; }
        .ms-carousel-arrow { width: 32px; height: 32px; font-size: 0.75rem; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ─────────── INSERTION DANS LA PAGE ─────────── */
  function insererCarrousels() {
    // Cherche où insérer (avant le grid de produits)
    var anchor = document.querySelector(CFG.insertBefore);
    if (!anchor) {
      // Fallback : insère après le header ou en haut du main
      anchor = document.querySelector('main') || document.body.children[1];
      if (!anchor) return;
    }

    // Crée un container pour tous les carrousels
    var container = document.createElement('div');
    container.id = 'ms-carousels-container';
    anchor.parentNode.insertBefore(container, anchor);

    // Crée chaque carrousel
    CARROUSELS.forEach(function (def) {
      try {
        var section = creerCarrousel(def);
        container.appendChild(section);
      } catch (e) {
        console.warn('[Carousel ' + def.id + ']', e);
      }
    });
  }

  /* ─────────── OUVERTURE PRODUIT ─────────── */
  window.MSCarousels = {
    ouvrir: function (id) {
      // Cherche d'abord une carte existante dans le grid
      var card = document.querySelector('.ms-card[data-id="' + id + '"]');
      if (card) {
        card.click();
        return;
      }
      // Sinon, navigue via hash
      window.location.hash = 'produit-' + id;
    },
    refresh: function () {
      cache = {};
      var c = document.getElementById('ms-carousels-container');
      if (c) c.remove();
      insererCarrousels();
    }
  };

  /* ─────────── INITIALISATION ─────────── */
  document.addEventListener('DOMContentLoaded', function () {
    injecterCSS();
    // Délai pour laisser le scroll vertical s'initialiser d'abord
    setTimeout(insererCarrousels, 800);
    console.log('[MS Carousels] ✅ Carrousels horizontaux activés');
  });
})();
