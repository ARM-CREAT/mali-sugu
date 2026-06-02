/* =============================================================
   MALI SUGU — SEO & Sécurité
   ✅ Données structurées (schema.org) pour Google
   ✅ Open Graph dynamique
   ✅ Protection XSS basique
   ✅ Détection cyberattaques (rate limiting client)
   ============================================================= */
(function () {
  'use strict';

  /* ═══════════════ SEO STRUCTURÉ ═══════════════ */
  function injectStructuredData() {
    // Schema Organization
    var orgSchema = {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      "name": "MALI SUGU",
      "alternateName": "Mali Sugu Marketplace",
      "url": "https://mali-sugu.vercel.app",
      "logo": "https://mali-sugu.vercel.app/ms-icon-512.png",
      "description": "Marketplace en ligne du Mali. Achetez et vendez près de chez vous avec Orange Money, Moov Money et carte bancaire.",
      "areaServed": { "@type": "Country", "name": "Mali" },
      "currenciesAccepted": "XOF",
      "paymentAccepted": "Cash, Credit Card, Orange Money, Moov Money",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "ML",
        "addressLocality": "Bamako"
      },
      "sameAs": [
        "https://github.com/ARM-CREAT"
      ]
    };

    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(orgSchema);
    document.head.appendChild(s);
  }

  /* ═══════════════ META TAGS DYNAMIQUES ═══════════════ */
  function injectMetaTags() {
    var metas = [
      { name: 'description', content: 'Marketplace en ligne du Mali. Achetez et vendez localement. Paiement Orange Money, Moov Money et carte bancaire. Livraison rapide.' },
      { name: 'keywords', content: 'mali, marketplace, vente en ligne, achat, orange money, moov money, bamako, sikasso, kayes, mopti, mali sugu' },
      { name: 'author', content: 'MALI SUGU' },
      { name: 'robots', content: 'index, follow, max-image-preview:large' },
      { name: 'theme-color', content: '#14a44d' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'MALI SUGU' },
      { property: 'og:title', content: 'MALI SUGU — Marché en ligne du Mali' },
      { property: 'og:description', content: 'Achetez et vendez près de chez vous au Mali. Orange Money, Moov Money, livraison à domicile.' },
      { property: 'og:image', content: 'https://mali-sugu.vercel.app/ms-icon-512.png' },
      { property: 'og:url', content: 'https://mali-sugu.vercel.app' },
      { property: 'og:locale', content: 'fr_FR' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'MALI SUGU — Marché en ligne du Mali' },
      { name: 'twitter:description', content: 'Marketplace au Mali avec paiement mobile money.' },
      { name: 'twitter:image', content: 'https://mali-sugu.vercel.app/ms-icon-512.png' }
    ];

    metas.forEach(function (m) {
      var attr = m.name ? 'name' : 'property';
      var val = m.name || m.property;
      // Ne pas écraser si déjà présent
      if (document.querySelector('meta[' + attr + '="' + val + '"]')) return;
      var el = document.createElement('meta');
      el.setAttribute(attr, val);
      el.setAttribute('content', m.content);
      document.head.appendChild(el);
    });

    // Canonical URL
    if (!document.querySelector('link[rel="canonical"]')) {
      var link = document.createElement('link');
      link.rel = 'canonical';
      link.href = 'https://mali-sugu.vercel.app' + window.location.pathname;
      document.head.appendChild(link);
    }
  }

  /* ═══════════════ PROTECTION XSS / RATE LIMITING ═══════════════ */
  var Security = {
    requestCount: 0,
    requestWindowStart: Date.now(),
    MAX_REQUESTS: 100, // par minute
    BLOCKED_PATTERNS: [
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b/gi,
      /eval\s*\(/gi
    ],

    init: function () {
      this._patchFirestoreWrites();
      this._patchLinks();
    },

    sanitize: function (input) {
      if (typeof input !== 'string') return input;
      this.BLOCKED_PATTERNS.forEach(function (p) {
        input = input.replace(p, '');
      });
      return input;
    },

    _patchFirestoreWrites: function () {
      // Intercepter les écritures Firestore pour détecter du contenu suspect
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      var self = this;
      var orig = firebase.firestore.CollectionReference.prototype.add;
      firebase.firestore.CollectionReference.prototype.add = function (data) {
        // Rate limiting basique côté client
        var now = Date.now();
        if (now - self.requestWindowStart > 60000) {
          self.requestWindowStart = now;
          self.requestCount = 0;
        }
        self.requestCount++;
        if (self.requestCount > self.MAX_REQUESTS) {
          console.warn('[Security] Rate limit dépassé');
          return Promise.reject(new Error('Trop de requêtes. Réessaie dans 1 minute.'));
        }

        // Sanitize les champs string
        if (data && typeof data === 'object') {
          Object.keys(data).forEach(function (k) {
            if (typeof data[k] === 'string') data[k] = self.sanitize(data[k]);
          });
        }
        return orig.call(this, data);
      };
    },

    _patchLinks: function () {
      // Tous les liens externes : noopener noreferrer
      document.addEventListener('click', function (e) {
        var link = e.target.closest('a');
        if (link && link.href && !link.href.startsWith(window.location.origin) && link.href.indexOf('http') === 0) {
          if (!link.rel || link.rel.indexOf('noopener') < 0) {
            link.rel = 'noopener noreferrer';
            link.target = link.target || '_blank';
          }
        }
      });
    }
  };

  /* ═══════════════ AMÉLIORATION PERFORMANCE ═══════════════ */
  function optimisations() {
    // Préchargement DNS pour Firebase et CDN
    var preconnects = [
      'https://firestore.googleapis.com',
      'https://firebaseinstallations.googleapis.com',
      'https://www.googleapis.com',
      'https://cdn.jsdelivr.net'
    ];
    preconnects.forEach(function (url) {
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });

    // Lazy loading natif des iframes
    document.querySelectorAll('iframe:not([loading])').forEach(function (f) {
      f.loading = 'lazy';
    });
  }

  /* ═══════════════ INITIALISATION ═══════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    injectMetaTags();
    injectStructuredData();
    optimisations();
    Security.init();
    console.log('[MS SEO+Security] ✅ Activé');
  });

  window.MSSecurity = Security;
})();
