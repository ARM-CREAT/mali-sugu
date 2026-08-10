/* =============================================================
   MALI SUGU — Scroll Infini Haute Performance
   ✅ IntersectionObserver natif
   ✅ Pagination curseur Firestore (pas d'offset)
   ✅ Cache mémoire + SessionStorage (5 min TTL)
   ✅ Préchargement intelligent à 70% du scroll
   ✅ Déduplication par Set d'IDs
   ✅ Lazy loading images + effet blur-up
   ✅ Animations fluides échelonnées
   ✅ Loader moderne
   ✅ Filtre automatique articles > 3 mois
   ✅ Compatible Firebase v8 compat SDK
   ============================================================= */
(function () {
  'use strict';

  /* ─────────────────────────────────────────
     CONFIGURATION
  ───────────────────────────────────────── */
  var CFG = {
    collection: 'produits',          // Nom de la collection Firestore
    pageSize: 20,                    // Articles par chargement
    preloadAt: 0.65,                 // Précharger quand 65% du contenu visible
    cacheTTL: 5 * 60 * 1000,        // Cache 5 minutes
    maxCache: 300,                   // Max articles en mémoire
    animStagger: 60,                 // ms entre chaque apparition
    imgPlaceholder: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmNGYxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2FhYyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPjwvdGV4dD48L3N2Zz4=',
    threeMonthsAgo: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  };

  /* ─────────────────────────────────────────
     ÉTAT GLOBAL
  ───────────────────────────────────────── */
  var State = {
    cursor: null,
    loading: false,
    preloading: false,
    hasMore: true,
    loadedIds: new Set(),
    buffer: [],          // Articles préchargés en attente
    container: null,
    sentinel: null,
    preloadSentinel: null,
    mainObserver: null,
    preloadObserver: null,
    imgObserver: null,
    filters: {}
  };

  /* ─────────────────────────────────────────
     CACHE (Mémoire + SessionStorage)
  ───────────────────────────────────────── */
  var Cache = {
    mem: new Map(),

    _key: function (cursor, filters) {
      return 'ms_' + JSON.stringify(filters || {}) + '_' + (cursor ? cursor.id : 'start');
    },

    get: function (cursor, filters) {
      var k = this._key(cursor, filters);
      // Mémoire d'abord
      var m = this.mem.get(k);
      if (m && Date.now() - m.ts < CFG.cacheTTL) return m.data;
      if (m) this.mem.delete(k);
      // SessionStorage ensuite
      try {
        var raw = sessionStorage.getItem(k);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Date.now() - parsed.ts < CFG.cacheTTL) {
            this.mem.set(k, parsed);
            return parsed.data;
          }
          sessionStorage.removeItem(k);
        }
      } catch (e) {}
      return null;
    },

    set: function (cursor, filters, data) {
      var k = this._key(cursor, filters);
      // Éviction LRU si trop grand
      if (this.mem.size >= CFG.maxCache) {
        this.mem.delete(this.mem.keys().next().value);
      }
      var entry = { data: data, ts: Date.now() };
      this.mem.set(k, entry);
      try { sessionStorage.setItem(k, JSON.stringify(entry)); } catch (e) {}
    },

    clear: function () {
      this.mem.clear();
      try {
        var keys = Object.keys(sessionStorage).filter(function (k) { return k.indexOf('ms_') === 0; });
        keys.forEach(function (k) { sessionStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  /* ─────────────────────────────────────────
     REQUÊTES FIRESTORE
  ───────────────────────────────────────── */
  var DB = {
    _buildQuery: function (afterCursor, filters) {
      var db = firebase.firestore();
      var q = db.collection(CFG.collection)
        .where('created_at', '>', firebase.firestore.Timestamp.fromDate(CFG.threeMonthsAgo))
        .where('statut', '==', 'actif')
        .orderBy('created_at', 'desc')
        .limit(CFG.pageSize);

      // Filtres dynamiques
      if (filters) {
        if (filters.categorie) q = q.where('categorie', '==', filters.categorie);
        if (filters.region) q = q.where('region', '==', filters.region);
        if (filters.prix_max) q = q.where('prix', '<=', Number(filters.prix_max));
        if (filters.prix_min) q = q.where('prix', '>=', Number(filters.prix_min));
      }

      if (afterCursor) q = q.startAfter(afterCursor);
      return q;
    },

    fetch: function (afterCursor, filters) {
      // Vérifier le cache
      var cached = Cache.get(afterCursor, filters);
      if (cached) return Promise.resolve(cached);

      return DB._buildQuery(afterCursor, filters).get().then(function (snap) {
        var result = {
          docs: snap.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data(), { _snap: d }); }),
          lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
          hasMore: snap.docs.length === CFG.pageSize
        };
        Cache.set(afterCursor, filters, result);
        return result;
      });
    }
  };

  /* ─────────────────────────────────────────
     RENDU HTML
  ───────────────────────────────────────── */
  var Render = {
    card: function (p) {
      var prix = p.prix ? Number(p.prix).toLocaleString('fr-FR') + ' FCFA' : 'Prix à négocier';
      var etatColor = { 'Neuf': '#14a44d', 'Très bon état': '#17a2b8', 'Bon état': '#ffc107', 'Usagé': '#6c757d' };
      var couleurEtat = etatColor[p.etat] || '#999';
      var timeAgo = Render._timeAgo(p.created_at);
      var region = p.region || '';
      var titre = Render._escape(p.titre || 'Sans titre');
      var categorie = Render._escape(p.categorie || '');

      return '<div class="ms-card ms-card-hidden" data-id="' + p._id + '">' +
        '<div class="ms-card-img-wrap">' +
          '<img class="ms-card-img ms-lazy" ' +
               'src="' + CFG.imgPlaceholder + '" ' +
               'data-src="' + Render._escape(p.photo_url || p.image || '') + '" ' +
               'alt="' + titre + '" loading="lazy">' +
          (p.etat ? '<span class="ms-card-etat" style="background:' + couleurEtat + '">' + Render._escape(p.etat) + '</span>' : '') +
          (p.en_vedette ? '<span class="ms-card-vedette">⭐ Vedette</span>' : '') +
        '</div>' +
        '<div class="ms-card-body">' +
          '<div class="ms-card-cat">' + categorie + '</div>' +
          '<h3 class="ms-card-titre">' + titre + '</h3>' +
          '<div class="ms-card-prix">' + prix + '</div>' +
          '<div class="ms-card-meta">' +
            (region ? '<span>📍 ' + Render._escape(region) + '</span>' : '') +
            '<span>🕐 ' + timeAgo + '</span>' +
          '</div>' +
          '<div class="ms-card-actions">' +
            '<a href="tel:' + Render._escape(p.vendeur_telephone || '') + '" class="ms-btn-contact">📞 Appeler</a>' +
            (p.vendeur_whatsapp || p.vendeur_telephone ?
              '<a href="https://wa.me/' + Render._escape((p.vendeur_whatsapp || p.vendeur_telephone || '').replace(/\D/g, '')) + '" target="_blank" class="ms-btn-whatsapp">💬 WhatsApp</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    },

    skeleton: function (n) {
      var html = '';
      for (var i = 0; i < n; i++) {
        html += '<div class="ms-card ms-skeleton">' +
          '<div class="ms-skel-img ms-shimmer"></div>' +
          '<div class="ms-card-body">' +
            '<div class="ms-skel-line ms-shimmer" style="width:40%;height:12px;margin-bottom:8px"></div>' +
            '<div class="ms-skel-line ms-shimmer" style="width:80%;height:18px;margin-bottom:8px"></div>' +
            '<div class="ms-skel-line ms-shimmer" style="width:35%;height:22px;margin-bottom:12px"></div>' +
            '<div class="ms-skel-line ms-shimmer" style="width:60%;height:12px"></div>' +
          '</div>' +
        '</div>';
      }
      return html;
    },

    empty: function () {
      return '<div class="ms-empty">' +
        '<div class="ms-empty-icon">🛍️</div>' +
        '<h3>Aucun article trouvé</h3>' +
        '<p>Sois le premier à publier une annonce dans cette catégorie !</p>' +
        '<button onclick="window.MaliSuguScroll.resetFilters()" class="ms-btn-reset">Voir toutes les annonces</button>' +
      '</div>';
    },

    end: function () {
      return '<div class="ms-end">✅ Toutes les annonces ont été chargées</div>';
    },

    _escape: function (s) {
      return String(s || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    _timeAgo: function (ts) {
      if (!ts) return '';
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      var diff = (Date.now() - d) / 1000;
      if (diff < 60) return 'À l\'instant';
      if (diff < 3600) return Math.floor(diff / 60) + ' min';
      if (diff < 86400) return Math.floor(diff / 3600) + ' h';
      if (diff < 2592000) return Math.floor(diff / 86400) + ' j';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };

  /* ─────────────────────────────────────────
     LAZY LOADING IMAGES
  ───────────────────────────────────────── */
  var LazyImg = {
    observer: null,

    init: function () {
      if (this.observer) return;
      this.observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var img = e.target;
          var src = img.dataset.src;
          if (!src || src === CFG.imgPlaceholder) {
            img.src = 'https://via.placeholder.com/400x300/f0f4f1/aac?text=MALI+SUGU';
            LazyImg.observer.unobserve(img);
            return;
          }
          // Préchargement avec effet blur-up
          var tmp = new Image();
          tmp.onload = function () {
            img.src = src;
            img.classList.add('ms-img-loaded');
            LazyImg.observer.unobserve(img);
          };
          tmp.onerror = function () {
            img.src = 'https://via.placeholder.com/400x300/f0f4f1/aac?text=Photo';
            LazyImg.observer.unobserve(img);
          };
          tmp.src = src;
        });
      }, { rootMargin: '200px', threshold: 0 });
    },

    observe: function (container) {
      this.init();
      var imgs = container.querySelectorAll('.ms-lazy:not([data-observed])');
      imgs.forEach(function (img) {
        img.setAttribute('data-observed', '1');
        LazyImg.observer.observe(img);
      });
    }
  };

  /* ─────────────────────────────────────────
     ANIMATIONS D'APPARITION
  ───────────────────────────────────────── */
  function animateCards(container, startIndex) {
    var cards = container.querySelectorAll('.ms-card-hidden');
    cards.forEach(function (card, i) {
      setTimeout(function () {
        card.classList.remove('ms-card-hidden');
        card.classList.add('ms-card-visible');
      }, i * CFG.animStagger);
    });
  }

  /* ─────────────────────────────────────────
     LOADER
  ───────────────────────────────────────── */
  var Loader = {
    el: null,

    show: function () {
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.className = 'ms-loader';
        this.el.innerHTML =
          '<div class="ms-loader-dots">' +
            '<span></span><span></span><span></span>' +
          '</div>' +
          '<p>Chargement des annonces...</p>';
      }
      if (State.sentinel && State.sentinel.parentNode) {
        State.sentinel.parentNode.insertBefore(this.el, State.sentinel);
      }
    },

    hide: function () {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
  };

  /* ─────────────────────────────────────────
     CHARGEMENT DES ARTICLES
  ───────────────────────────────────────── */
  function loadPage(fromBuffer) {
    if (State.loading || !State.hasMore) return;
    State.loading = true;
    Loader.show();

    // Utiliser le buffer préchargé si dispo
    if (fromBuffer !== false && State.buffer.length > 0) {
      var buffered = State.buffer;
      State.buffer = [];
      injectResults(buffered.docs, buffered.lastDoc, buffered.hasMore);
      // Précharger la prochaine page immédiatement
      preloadNext();
      return;
    }

    DB.fetch(State.cursor, State.filters).then(function (result) {
      injectResults(result.docs, result.lastDoc, result.hasMore);
      preloadNext();
    }).catch(function (err) {
      console.error('[MaliSugu Scroll]', err);
      State.loading = false;
      Loader.hide();
    });
  }

  function injectResults(docs, lastDoc, hasMore) {
    Loader.hide();
    State.loading = false;

    // Dédupliquer
    var newDocs = docs.filter(function (d) {
      if (State.loadedIds.has(d._id)) return false;
      State.loadedIds.add(d._id);
      return true;
    });

    if (newDocs.length === 0 && !hasMore) {
      State.hasMore = false;
      if (State.loadedIds.size === 0) {
        State.container.innerHTML = Render.empty();
      } else {
        State.container.insertAdjacentHTML('beforeend', Render.end());
      }
      disconnectObservers();
      return;
    }

    // Injecter le HTML
    if (newDocs.length > 0) {
      var html = newDocs.map(function (p) { return Render.card(p); }).join('');
      State.container.insertAdjacentHTML('beforeend', html);
      animateCards(State.container);
      LazyImg.observe(State.container);
    }

    State.cursor = lastDoc;
    State.hasMore = hasMore;

    if (!hasMore) {
      State.container.insertAdjacentHTML('beforeend', Render.end());
      disconnectObservers();
    }
  }

  /* ─────────────────────────────────────────
     PRÉCHARGEMENT INTELLIGENT
  ───────────────────────────────────────── */
  function preloadNext() {
    if (State.preloading || !State.hasMore || State.buffer.length > 0) return;
    State.preloading = true;

    DB.fetch(State.cursor, State.filters).then(function (result) {
      State.buffer = result;
      State.preloading = false;
    }).catch(function () {
      State.preloading = false;
    });
  }

  /* ─────────────────────────────────────────
     INTERSECTION OBSERVERS
  ───────────────────────────────────────── */
  function setupObservers() {
    disconnectObservers();

    // Observer principal (bas de page → charger)
    State.mainObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !State.loading && State.hasMore) {
        loadPage();
      }
    }, { rootMargin: '300px', threshold: 0 });

    // Observer de préchargement (70% → précharger)
    State.preloadObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && State.hasMore && !State.preloading) {
        preloadNext();
      }
    }, { rootMargin: '0px', threshold: CFG.preloadAt });

    if (State.sentinel) State.mainObserver.observe(State.sentinel);
    if (State.preloadSentinel) State.preloadObserver.observe(State.preloadSentinel);
  }

  function disconnectObservers() {
    if (State.mainObserver) { State.mainObserver.disconnect(); State.mainObserver = null; }
    if (State.preloadObserver) { State.preloadObserver.disconnect(); State.preloadObserver = null; }
  }

  /* ─────────────────────────────────────────
     CSS INJECTÉ DYNAMIQUEMENT
  ───────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('ms-scroll-css')) return;
    var style = document.createElement('style');
    style.id = 'ms-scroll-css';
    style.textContent = `
      /* ── Grille produits ── */
      #ms-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1.25rem;
        padding: 1rem 0;
      }
      @media (max-width: 480px) {
        #ms-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
      }

      /* ── Carte produit ── */
      .ms-card {
        background: #fff;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid #e8f0ea;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        transition: transform 0.2s, box-shadow 0.2s;
        cursor: pointer;
      }
      .ms-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(20,164,77,0.12);
      }

      /* ── Animation apparition ── */
      .ms-card-hidden {
        opacity: 0;
        transform: translateY(20px);
      }
      .ms-card-visible {
        opacity: 1;
        transform: translateY(0);
        transition: opacity 0.35s ease, transform 0.35s ease;
      }

      /* ── Image ── */
      .ms-card-img-wrap {
        position: relative;
        aspect-ratio: 4/3;
        background: #f0f4f1;
        overflow: hidden;
      }
      .ms-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(8px);
        transition: filter 0.4s ease;
      }
      .ms-card-img.ms-img-loaded { filter: blur(0); }

      /* ── Badges ── */
      .ms-card-etat, .ms-card-vedette {
        position: absolute;
        top: 0.5rem;
        padding: 0.2rem 0.6rem;
        border-radius: 6px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #fff;
      }
      .ms-card-etat { left: 0.5rem; }
      .ms-card-vedette {
        right: 0.5rem;
        background: linear-gradient(135deg, #fcd116, #e6b800);
        color: #333;
      }

      /* ── Corps de la carte ── */
      .ms-card-body { padding: 0.85rem; }
      .ms-card-cat {
        font-size: 0.72rem;
        color: #14a44d;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.3rem;
      }
      .ms-card-titre {
        font-size: 0.95rem;
        font-weight: 600;
        color: #1a1a1a;
        margin: 0 0 0.4rem;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .ms-card-prix {
        font-size: 1.1rem;
        font-weight: 800;
        color: #14a44d;
        margin-bottom: 0.5rem;
      }
      .ms-card-meta {
        display: flex;
        gap: 0.75rem;
        font-size: 0.75rem;
        color: #888;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
      }
      .ms-card-actions { display: flex; gap: 0.4rem; }
      .ms-btn-contact, .ms-btn-whatsapp {
        flex: 1;
        padding: 0.45rem 0.3rem;
        border-radius: 8px;
        font-size: 0.78rem;
        font-weight: 600;
        text-align: center;
        text-decoration: none;
        display: block;
        transition: background 0.2s;
      }
      .ms-btn-contact {
        background: #14a44d;
        color: #fff;
      }
      .ms-btn-contact:hover { background: #0d7a38; }
      .ms-btn-whatsapp {
        background: #25d366;
        color: #fff;
      }
      .ms-btn-whatsapp:hover { background: #1ebe5d; }

      /* ── Skeleton loader ── */
      .ms-skeleton .ms-skel-img {
        width: 100%;
        aspect-ratio: 4/3;
        background: #eef2ef;
      }
      .ms-skeleton .ms-skel-line {
        border-radius: 6px;
        background: #eef2ef;
        display: block;
      }

      /* ── Shimmer animation ── */
      @keyframes ms-shimmer {
        0% { background-position: -468px 0; }
        100% { background-position: 468px 0; }
      }
      .ms-shimmer {
        background: linear-gradient(to right, #f0f4f1 8%, #deeee4 18%, #f0f4f1 33%);
        background-size: 936px 104px;
        animation: ms-shimmer 1.5s infinite linear;
      }

      /* ── Loader dots ── */
      .ms-loader {
        text-align: center;
        padding: 2rem;
        color: #5a6b62;
        font-size: 0.9rem;
        grid-column: 1 / -1;
      }
      .ms-loader-dots {
        display: flex;
        justify-content: center;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
      }
      .ms-loader-dots span {
        width: 10px;
        height: 10px;
        background: #14a44d;
        border-radius: 50%;
        animation: ms-bounce 1.2s infinite ease-in-out;
      }
      .ms-loader-dots span:nth-child(1) { animation-delay: 0s; }
      .ms-loader-dots span:nth-child(2) { animation-delay: 0.15s; }
      .ms-loader-dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes ms-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* ── Fin de liste ── */
      .ms-end {
        text-align: center;
        padding: 1.5rem;
        color: #aaa;
        font-size: 0.85rem;
        grid-column: 1 / -1;
        border-top: 1px dashed #e0e7e3;
        margin-top: 1rem;
      }

      /* ── Vide ── */
      .ms-empty {
        text-align: center;
        padding: 3rem 1rem;
        color: #5a6b62;
        grid-column: 1 / -1;
      }
      .ms-empty-icon { font-size: 3rem; margin-bottom: 1rem; }
      .ms-empty h3 { color: #1a1a1a; margin-bottom: 0.5rem; }
      .ms-btn-reset {
        margin-top: 1rem;
        padding: 0.65rem 1.5rem;
        background: #14a44d;
        color: #fff;
        border: none;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
      }

      /* ── Sentinelles invisibles ── */
      .ms-sentinel { height: 1px; visibility: hidden; }
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
     API PUBLIQUE
  ───────────────────────────────────────── */
  window.MaliSuguScroll = {

    /**
     * Initialiser le scroll infini
     * @param {string} containerId  - ID du conteneur dans lequel injecter les cartes
     * @param {object} options      - { collection, pageSize, filters }
     */
    init: function (containerId, options) {
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.error('[MaliSugu Scroll] Firebase Firestore non disponible.');
        return;
      }

      injectCSS();
      Object.assign(CFG, options || {});
      State.filters = CFG.filters || {};

      // Conteneur
      State.container = document.getElementById(containerId);
      if (!State.container) {
        // Créer le conteneur si inexistant
        State.container = document.createElement('div');
        State.container.id = containerId;
        State.container.id = 'ms-grid';
        var parent = document.querySelector('.ms-catalogue') ||
                     document.querySelector('[data-ms-container]') ||
                     document.querySelector('main') ||
                     document.body;
        parent.appendChild(State.container);
      }
      State.container.id = 'ms-grid';

      // Ajouter les squelettes initiaux
      State.container.innerHTML = Render.skeleton(CFG.pageSize);

      // Sentinelle de préchargement (70% du container)
      State.preloadSentinel = document.createElement('div');
      State.preloadSentinel.className = 'ms-sentinel';
      State.container.appendChild(State.preloadSentinel);

      // Sentinelle de chargement (bas de page)
      State.sentinel = document.createElement('div');
      State.sentinel.className = 'ms-sentinel';
      State.container.after(State.sentinel);

      // Démarrer
      State.cursor = null;
      State.hasMore = true;
      State.loading = false;
      State.loadedIds = new Set();
      State.buffer = [];

      setupObservers();

      // Charger la première page immédiatement
      State.container.innerHTML = '';
      State.container.appendChild(State.preloadSentinel);
      loadPage(false);
    },

    /**
     * Appliquer des filtres et recharger depuis zéro
     * @param {object} filters - { categorie, region, prix_min, prix_max }
     */
    applyFilters: function (filters) {
      Cache.clear();
      State.filters = filters || {};
      State.cursor = null;
      State.hasMore = true;
      State.loading = false;
      State.loadedIds = new Set();
      State.buffer = [];
      State.container.innerHTML = Render.skeleton(8);
      State.container.appendChild(State.preloadSentinel);
      setupObservers();
      loadPage(false);
    },

    /**
     * Réinitialiser tous les filtres
     */
    resetFilters: function () {
      this.applyFilters({});
    },

    /**
     * Forcer le rechargement (pull-to-refresh)
     */
    refresh: function () {
      Cache.clear();
      this.init(State.container.id, { filters: State.filters });
    }
  };

  /* ─────────────────────────────────────────
     AUTO-INIT si data-ms-auto présent
  ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.querySelector('[data-ms-auto]');
    if (el) {
      window.MaliSuguScroll.init(el.id || 'ms-grid', {
        collection: el.dataset.msCollection || 'produits'
      });
    }
  });

})();
