/* =============================================================
   MALI SUGU — Extras V2
   ✅ 🌙 Mode sombre avec persistance
   ✅ ❤️ Favoris/Wishlist synchronisé
   ✅ 📊 Tableau de bord vendeur (statistiques)
   ============================================================= */
(function () {
  'use strict';
  if (typeof firebase === 'undefined') return;
  var db = firebase.firestore();

  /* ═══════════════ MODE SOMBRE ═══════════════ */
  var DarkMode = {
    KEY: 'ms_dark_mode',

    init: function () {
      this._injectCSS();
      this._injectBouton();
      var pref = localStorage.getItem(this.KEY);
      if (pref === '1' || (pref === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        this.activer();
      }
    },

    activer: function () {
      document.documentElement.classList.add('ms-dark');
      localStorage.setItem(this.KEY, '1');
      var btn = document.getElementById('ms-darkmode-btn');
      if (btn) btn.textContent = '☀️';
    },

    desactiver: function () {
      document.documentElement.classList.remove('ms-dark');
      localStorage.setItem(this.KEY, '0');
      var btn = document.getElementById('ms-darkmode-btn');
      if (btn) btn.textContent = '🌙';
    },

    toggle: function () {
      if (document.documentElement.classList.contains('ms-dark')) {
        this.desactiver();
      } else {
        this.activer();
      }
    },

    _injectBouton: function () {
      if (document.getElementById('ms-darkmode-btn')) return;
      var btn = document.createElement('button');
      btn.id = 'ms-darkmode-btn';
      btn.className = 'ms-darkmode-toggle';
      btn.title = 'Basculer mode sombre';
      btn.textContent = '🌙';
      btn.addEventListener('click', function () { DarkMode.toggle(); });
      document.body.appendChild(btn);
    },

    _injectCSS: function () {
      if (document.getElementById('ms-dark-css')) return;
      var s = document.createElement('style');
      s.id = 'ms-dark-css';
      s.textContent = `
        .ms-darkmode-toggle {
          position:fixed; top:1rem; right:1rem;
          width:42px; height:42px; border-radius:50%;
          background:#fff; border:1px solid #ddd;
          font-size:1.3rem; cursor:pointer; z-index:7500;
          box-shadow:0 2px 8px rgba(0,0,0,0.1);
          transition: all 0.3s;
        }
        .ms-darkmode-toggle:hover { transform: rotate(20deg); }

        html.ms-dark {
          background:#1a1a1a;
          color:#e0e0e0;
          color-scheme: dark;
        }
        html.ms-dark body { background:#1a1a1a; color:#e0e0e0; }
        html.ms-dark .ms-darkmode-toggle { background:#2a2a2a; border-color:#444; color:#fcd116; }

        /* Cartes, modals, formulaires en mode sombre */
        html.ms-dark .ms-card,
        html.ms-dark .arm-card,
        html.ms-dark .ms-auth-box,
        html.ms-dark .ms-mod-box,
        html.ms-dark .ms-chat-window,
        html.ms-dark .ms-pay-modal,
        html.ms-dark .ms-social-post,
        html.ms-dark .ms-social-composer {
          background:#2a2a2a !important;
          color:#e0e0e0 !important;
          border-color:#3a3a3a !important;
        }
        html.ms-dark input,
        html.ms-dark textarea,
        html.ms-dark select {
          background:#1f1f1f !important;
          color:#e0e0e0 !important;
          border-color:#3a3a3a !important;
        }
        html.ms-dark .ms-card-titre,
        html.ms-dark .arm-section h2,
        html.ms-dark .ms-mod-titre { color:#fff !important; }
        html.ms-dark .ms-card-meta,
        html.ms-dark .ms-card-cat { color:#aaa !important; }

        html.ms-dark .ms-chat-messages { background:#1f1f1f !important; }
        html.ms-dark .ms-chat-bubble:not(.me .ms-chat-bubble) {
          background:#3a3a3a !important; color:#e0e0e0 !important;
        }

        /* Header/Nav en mode sombre */
        html.ms-dark header, html.ms-dark nav { background:#222 !important; }
      `;
      document.head.appendChild(s);
    }
  };

  /* ═══════════════ FAVORIS / WISHLIST ═══════════════ */
  var Favoris = {
    list: [],

    init: function () {
      this._injectCSS();
      this._charger();
      this._attacherBoutons();

      // Re-attacher quand de nouveaux produits arrivent (scroll infini)
      var grid = document.getElementById('ms-grid') || document.getElementById('catalogue');
      if (grid) {
        new MutationObserver(function () { Favoris._attacherBoutons(); })
          .observe(grid, { childList: true, subtree: true });
      }
    },

    _charger: function () {
      this.list = JSON.parse(localStorage.getItem('ms_favoris') || '[]');

      // Sync avec Firestore si user connecté
      if (window.MSAuth && window.MSAuth.user) {
        var uid = window.MSAuth.user.uid;
        db.collection('utilisateurs').doc(uid).get().then(function (doc) {
          if (doc.exists && doc.data().favoris) {
            var serverFavoris = doc.data().favoris;
            var merged = Array.from(new Set([...Favoris.list, ...serverFavoris]));
            Favoris.list = merged;
            localStorage.setItem('ms_favoris', JSON.stringify(merged));
            Favoris._majAffichage();
          }
        });
      }
    },

    _sauver: function () {
      localStorage.setItem('ms_favoris', JSON.stringify(this.list));
      if (window.MSAuth && window.MSAuth.user) {
        db.collection('utilisateurs').doc(window.MSAuth.user.uid)
          .set({ favoris: this.list }, { merge: true });
      }
    },

    toggle: function (produitId) {
      var idx = this.list.indexOf(produitId);
      if (idx >= 0) {
        this.list.splice(idx, 1);
        this._toast('💔 Retiré des favoris');
      } else {
        this.list.unshift(produitId);
        this._toast('❤️ Ajouté aux favoris');
      }
      this._sauver();
      this._majAffichage();
    },

    estFavori: function (id) { return this.list.indexOf(id) >= 0; },

    _attacherBoutons: function () {
      document.querySelectorAll('.ms-card:not([data-fav-attached])').forEach(function (card) {
        card.setAttribute('data-fav-attached', '1');
        var id = card.dataset.id;
        if (!id) return;
        var imgWrap = card.querySelector('.ms-card-img-wrap') || card;
        var btn = document.createElement('button');
        btn.className = 'ms-fav-btn' + (Favoris.estFavori(id) ? ' active' : '');
        btn.innerHTML = '❤️';
        btn.title = 'Ajouter aux favoris';
        btn.addEventListener('click', function (e) {
          e.stopPropagation(); e.preventDefault();
          Favoris.toggle(id);
        });
        imgWrap.appendChild(btn);
      });
    },

    _majAffichage: function () {
      document.querySelectorAll('.ms-fav-btn').forEach(function (btn) {
        var card = btn.closest('.ms-card');
        if (!card) return;
        var id = card.dataset.id;
        btn.classList.toggle('active', Favoris.estFavori(id));
      });
      // MAJ compteur favoris dans le header si présent
      var compteur = document.getElementById('ms-fav-count');
      if (compteur) compteur.textContent = this.list.length;
    },

    afficher: function (containerId) {
      var c = document.getElementById(containerId);
      if (!c) return;
      if (this.list.length === 0) {
        c.innerHTML = '<div style="text-align:center;padding:3rem"><div style="font-size:3rem">💔</div><h3>Aucun favori</h3><p style="color:#888">Clique sur ❤️ sur les produits que tu aimes pour les retrouver ici.</p></div>';
        return;
      }
      c.innerHTML = '<p style="color:#888">Chargement...</p>';
      Promise.all(this.list.slice(0, 50).map(function (id) {
        return db.collection('produits').doc(id).get();
      })).then(function (docs) {
        var html = '<h2 style="color:#14a44d">❤️ Mes Favoris (' + Favoris.list.length + ')</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;margin-top:1rem">';
        docs.forEach(function (d) {
          if (!d.exists) return;
          var p = d.data();
          html += '<div class="ms-card" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0ebe3">' +
            '<img src="' + (p.photo_url || p.image || '') + '" style="width:100%;aspect-ratio:4/3;object-fit:cover">' +
            '<div style="padding:0.8rem"><div style="font-weight:600">' + (p.titre || '') + '</div>' +
            '<div style="color:#14a44d;font-weight:800;margin-top:0.3rem">' + (p.prix ? Number(p.prix).toLocaleString('fr-FR') + ' FCFA' : '') + '</div>' +
            '<button onclick="MSFavoris.toggle(\'' + d.id + '\')" style="margin-top:0.5rem;background:#fff0f0;color:#ce1126;border:1px solid #ce1126;padding:0.4rem 0.7rem;border-radius:6px;cursor:pointer;font-size:0.85rem">💔 Retirer</button>' +
            '</div></div>';
        });
        html += '</div>';
        c.innerHTML = html;
      });
    },

    _toast: function (msg) {
      if (window.MaliSuguModern && window.MaliSuguModern.Utils) {
        window.MaliSuguModern.Utils.toast(msg);
      }
    },

    _injectCSS: function () {
      if (document.getElementById('ms-fav-css')) return;
      var s = document.createElement('style');
      s.id = 'ms-fav-css';
      s.textContent = `
        .ms-fav-btn {
          position:absolute; top:0.5rem; right:0.5rem;
          width:36px; height:36px; border-radius:50%;
          background:rgba(255,255,255,0.95); border:none;
          font-size:1.1rem; cursor:pointer; z-index:5;
          opacity:0.7; transition: all 0.2s;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);
        }
        .ms-fav-btn:hover { opacity:1; transform:scale(1.1); }
        .ms-fav-btn.active { opacity:1; background:#fff0f0; }
        .ms-fav-btn.active::before { content:''; position:absolute; inset:0; border-radius:50%; box-shadow:0 0 0 2px #ce1126 inset; }
      `;
      document.head.appendChild(s);
    }
  };

  window.MSFavoris = Favoris;

  /* ═══════════════ STATS VENDEUR ═══════════════ */
  var StatsVendeur = {
    afficher: function (containerId, telephone) {
      var c = document.getElementById(containerId);
      if (!c) return;
      c.innerHTML = '<p style="text-align:center;padding:2rem">⏳ Chargement des statistiques...</p>';

      Promise.all([
        db.collection('produits').where('vendeur_telephone', '==', telephone).get(),
        db.collection('commandes').where('vendeur_telephone', '==', telephone).get()
      ]).then(function (results) {
        var produits = results[0];
        var commandes = results[1];

        // Calculs
        var totalProduits = produits.size;
        var totalCommandes = commandes.size;
        var totalCa = 0;
        var commandesParStatut = {};
        var avisCount = 0, avisSomme = 0;
        var produitsParCategorie = {};
        var signalements = 0;

        produits.forEach(function (d) {
          var p = d.data();
          if (p.avis) {
            p.avis.forEach(function (a) { avisCount++; avisSomme += a.note || 0; });
          }
          if (p.signalements) signalements += p.signalements.length;
          if (p.categorie) produitsParCategorie[p.categorie] = (produitsParCategorie[p.categorie] || 0) + 1;
        });

        commandes.forEach(function (d) {
          var cmd = d.data();
          if (cmd.statut === 'paye' || cmd.statut === 'livre') totalCa += Number(cmd.produit_prix) || 0;
          commandesParStatut[cmd.statut] = (commandesParStatut[cmd.statut] || 0) + 1;
        });

        var noteMoyenne = avisCount > 0 ? (avisSomme / avisCount).toFixed(1) : '–';

        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem">' +
          StatsVendeur._stat('📦', 'Produits publiés', totalProduits, '#14a44d') +
          StatsVendeur._stat('🛒', 'Commandes reçues', totalCommandes, '#1a73e8') +
          StatsVendeur._stat('💰', 'CA total', Number(totalCa).toLocaleString('fr-FR') + ' FCFA', '#fcd116', '#1a1a1a') +
          StatsVendeur._stat('⭐', 'Note moyenne', noteMoyenne + ' / 5', '#ff9500') +
          StatsVendeur._stat('💬', 'Avis clients', avisCount, '#9c27b0') +
          StatsVendeur._stat('🚩', 'Signalements', signalements, signalements > 0 ? '#ce1126' : '#888') +
        '</div>';

        // Catégories
        if (Object.keys(produitsParCategorie).length > 0) {
          html += '<h3 style="margin-top:2rem;color:#0d7a38">📊 Produits par catégorie</h3><div style="background:#fff;border:1px solid #e0ebe3;border-radius:12px;padding:1rem">';
          Object.entries(produitsParCategorie).sort(function(a,b){return b[1]-a[1];}).forEach(function (e) {
            var pct = ((e[1] / totalProduits) * 100).toFixed(0);
            html += '<div style="margin-bottom:0.75rem">' +
              '<div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:0.25rem"><span>' + e[0] + '</span><span style="color:#888">' + e[1] + ' (' + pct + '%)</span></div>' +
              '<div style="background:#eef2ef;border-radius:6px;height:8px;overflow:hidden"><div style="background:#14a44d;height:100%;width:' + pct + '%"></div></div>' +
            '</div>';
          });
          html += '</div>';
        }

        // Statuts commandes
        if (Object.keys(commandesParStatut).length > 0) {
          html += '<h3 style="margin-top:2rem;color:#0d7a38">📋 Statut des commandes</h3><div style="display:flex;flex-wrap:wrap;gap:0.5rem">';
          var COULEURS = {
            en_attente_paiement: '#ffa500', en_attente_livraison: '#ff9500',
            paye: '#1a73e8', preparee: '#9c27b0', expediee: '#3f51b5',
            livre: '#14a44d', annule: '#ce1126', echec_paiement: '#ce1126'
          };
          Object.entries(commandesParStatut).forEach(function (e) {
            html += '<span style="background:' + (COULEURS[e[0]] || '#888') + ';color:#fff;padding:0.35rem 0.7rem;border-radius:6px;font-size:0.8rem;font-weight:600">' + e[0].replace(/_/g, ' ') + ': ' + e[1] + '</span>';
          });
          html += '</div>';
        }

        c.innerHTML = html;
      }).catch(function (e) {
        c.innerHTML = '<p style="color:#ce1126">Erreur : ' + e.message + '</p>';
      });
    },

    _stat: function (icon, label, value, bg, color) {
      return '<div style="background:' + (bg || '#14a44d') + ';color:' + (color || '#fff') + ';border-radius:12px;padding:1.25rem">' +
        '<div style="font-size:1.8rem">' + icon + '</div>' +
        '<div style="font-size:0.85rem;opacity:0.9;margin-top:0.25rem">' + label + '</div>' +
        '<div style="font-size:1.6rem;font-weight:800;margin-top:0.25rem">' + value + '</div>' +
      '</div>';
    }
  };

  window.MSStatsVendeur = StatsVendeur;
  window.MSDarkMode = DarkMode;

  document.addEventListener('DOMContentLoaded', function () {
    DarkMode.init();
    setTimeout(function () { Favoris.init(); }, 1500);
  });
})();
