/* =============================================================
   MALI SUGU — Authentification sécurisée
   ✅ Email/password (Firebase Auth)
   ✅ Google sign-in
   ✅ Téléphone + OTP SMS
   ✅ Gestion session + protection routes
   ============================================================= */
(function () {
  'use strict';
  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.warn('[MS Auth] Firebase Auth requis');
    return;
  }

  var auth = firebase.auth();
  var db = firebase.firestore();

  window.MSAuth = {
    user: null,
    profil: null,
    listeners: [],

    init: function () {
      var self = this;
      auth.onAuthStateChanged(function (user) {
        self.user = user;
        if (user) {
          db.collection('utilisateurs').doc(user.uid).get().then(function (doc) {
            self.profil = doc.exists ? doc.data() : null;
            self._notif();
            self._updateUI();
          });
        } else {
          self.profil = null;
          self._notif();
          self._updateUI();
        }
      });
      this._injectCSS();
    },

    onChange: function (cb) { this.listeners.push(cb); },
    _notif: function () {
      var self = this;
      this.listeners.forEach(function (cb) { try { cb(self.user, self.profil); } catch (e) {} });
    },

    ouvrirModal: function (mode) {
      mode = mode || 'connexion';
      var existing = document.getElementById('ms-auth-modal');
      if (existing) existing.remove();

      var self = this;
      var overlay = document.createElement('div');
      overlay.id = 'ms-auth-modal';
      overlay.className = 'ms-auth-overlay';
      overlay.innerHTML = this._tpl(mode);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('.ms-auth-close').addEventListener('click', function () { overlay.remove(); });

      // Switch entre connexion/inscription
      overlay.querySelectorAll('[data-switch]').forEach(function (link) {
        link.addEventListener('click', function () {
          overlay.remove();
          self.ouvrirModal(link.dataset.switch);
        });
      });

      // Méthodes alternatives
      overlay.querySelector('.ms-auth-google').addEventListener('click', function () { self._google(overlay); });
      overlay.querySelector('.ms-auth-phone').addEventListener('click', function () {
        overlay.remove();
        self._modalPhone();
      });

      // Form submit
      overlay.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target;
        var btn = f.querySelector('button[type=submit]');
        var err = overlay.querySelector('.ms-auth-error');
        btn.disabled = true; btn.textContent = '...';
        err.style.display = 'none';

        if (mode === 'connexion') {
          auth.signInWithEmailAndPassword(f.email.value, f.password.value)
            .then(function () { overlay.remove(); self._toast('Bienvenue !'); })
            .catch(function (e) { err.textContent = self._err(e); err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Se connecter'; });
        } else {
          auth.createUserWithEmailAndPassword(f.email.value, f.password.value)
            .then(function (cred) {
              return db.collection('utilisateurs').doc(cred.user.uid).set({
                uid: cred.user.uid,
                email: f.email.value,
                nom: f.nom.value,
                telephone: f.telephone.value,
                role: 'utilisateur',
                statut: 'actif',
                created_at: firebase.firestore.FieldValue.serverTimestamp()
              });
            })
            .then(function () { overlay.remove(); self._toast('Compte créé !'); })
            .catch(function (e) { err.textContent = self._err(e); err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Créer'; });
        }
      });
    },

    _tpl: function (mode) {
      var isC = mode === 'connexion';
      return '<div class="ms-auth-box">' +
        '<button class="ms-auth-close">×</button>' +
        '<h2 class="ms-auth-titre">' + (isC ? '🔐 Connexion' : '✨ Créer un compte') + '</h2>' +
        '<div class="ms-auth-error" style="display:none"></div>' +
        '<button class="ms-auth-social ms-auth-google">' +
          '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33C2.44 16.04 5.48 18 9 18z"/><path fill="#FBBC04" d="M3.95 10.7c-.18-.54-.28-1.12-.28-1.7s.1-1.16.28-1.7V4.97H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 1.96.96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>' +
          ' Continuer avec Google</button>' +
        '<button class="ms-auth-social ms-auth-phone">📱 Continuer avec téléphone</button>' +
        '<div class="ms-auth-sep">ou</div>' +
        '<form>' +
          (isC ? '' : '<div class="ms-auth-field"><label>Nom complet</label><input type="text" name="nom" required></div>') +
          '<div class="ms-auth-field"><label>Email</label><input type="email" name="email" required></div>' +
          (isC ? '' : '<div class="ms-auth-field"><label>Téléphone</label><input type="tel" name="telephone" placeholder="+223..."></div>') +
          '<div class="ms-auth-field"><label>Mot de passe (min 6)</label><input type="password" name="password" required minlength="6"></div>' +
          '<button type="submit" class="ms-auth-btn">' + (isC ? 'Se connecter' : 'Créer mon compte') + '</button>' +
        '</form>' +
        '<p class="ms-auth-switch">' + (isC ? 'Pas de compte ? <a data-switch="inscription">Créer un compte</a>' : 'Déjà inscrit ? <a data-switch="connexion">Se connecter</a>') + '</p>' +
      '</div>';
    },

    _google: function (overlay) {
      var provider = new firebase.auth.GoogleAuthProvider();
      var self = this;
      auth.signInWithPopup(provider)
        .then(function (result) {
          var user = result.user;
          return db.collection('utilisateurs').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            nom: user.displayName,
            photo: user.photoURL,
            telephone: user.phoneNumber || '',
            role: 'utilisateur',
            statut: 'actif',
            provider: 'google',
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        })
        .then(function () { overlay.remove(); self._toast('Connecté avec Google !'); })
        .catch(function (e) {
          var err = overlay.querySelector('.ms-auth-error');
          err.textContent = self._err(e);
          err.style.display = 'block';
        });
    },

    _modalPhone: function () {
      var self = this;
      var overlay = document.createElement('div');
      overlay.className = 'ms-auth-overlay';
      overlay.innerHTML = '<div class="ms-auth-box">' +
        '<button class="ms-auth-close">×</button>' +
        '<h2 class="ms-auth-titre">📱 Connexion par téléphone</h2>' +
        '<div class="ms-auth-error" style="display:none"></div>' +
        '<div id="ms-phone-step1">' +
          '<div class="ms-auth-field"><label>Numéro</label><input type="tel" id="ms-phone-num" placeholder="+22377..." required></div>' +
          '<div id="recaptcha-container" style="margin-bottom:1rem"></div>' +
          '<button class="ms-auth-btn" id="ms-phone-send">Envoyer le code SMS</button>' +
        '</div>' +
        '<div id="ms-phone-step2" style="display:none">' +
          '<div class="ms-auth-field"><label>Code reçu par SMS</label><input type="text" id="ms-phone-code" placeholder="123456" maxlength="6" required></div>' +
          '<button class="ms-auth-btn" id="ms-phone-verify">Vérifier</button>' +
        '</div>' +
      '</div>';
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('.ms-auth-close').addEventListener('click', function () { overlay.remove(); });

      var confirmationResult = null;

      try {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'normal' });
        window.recaptchaVerifier.render();
      } catch (e) {
        console.warn('reCAPTCHA:', e);
      }

      overlay.querySelector('#ms-phone-send').addEventListener('click', function () {
        var num = overlay.querySelector('#ms-phone-num').value.trim();
        if (!num.startsWith('+')) num = '+223' + num.replace(/\D/g, '');
        auth.signInWithPhoneNumber(num, window.recaptchaVerifier)
          .then(function (r) {
            confirmationResult = r;
            overlay.querySelector('#ms-phone-step1').style.display = 'none';
            overlay.querySelector('#ms-phone-step2').style.display = 'block';
            self._toast('Code SMS envoyé');
          })
          .catch(function (e) {
            var err = overlay.querySelector('.ms-auth-error');
            err.textContent = self._err(e);
            err.style.display = 'block';
          });
      });

      overlay.querySelector('#ms-phone-verify').addEventListener('click', function () {
        var code = overlay.querySelector('#ms-phone-code').value.trim();
        if (!confirmationResult) return;
        confirmationResult.confirm(code).then(function (result) {
          var user = result.user;
          return db.collection('utilisateurs').doc(user.uid).set({
            uid: user.uid,
            telephone: user.phoneNumber,
            role: 'utilisateur',
            statut: 'actif',
            provider: 'phone',
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }).then(function () {
          overlay.remove();
          self._toast('Connecté !');
        }).catch(function (e) {
          var err = overlay.querySelector('.ms-auth-error');
          err.textContent = 'Code incorrect';
          err.style.display = 'block';
        });
      });
    },

    deconnexion: function () { return auth.signOut(); },

    _err: function (e) {
      var c = e.code || '';
      if (c.indexOf('email-already-in-use') >= 0) return 'Email déjà utilisé';
      if (c.indexOf('weak-password') >= 0) return 'Mot de passe trop faible';
      if (c.indexOf('invalid-email') >= 0) return 'Email invalide';
      if (c.indexOf('user-not-found') >= 0 || c.indexOf('wrong-password') >= 0) return 'Email ou mot de passe incorrect';
      return e.message || 'Erreur';
    },

    _toast: function (msg) {
      if (window.MaliSuguModern && window.MaliSuguModern.Utils) {
        window.MaliSuguModern.Utils.toast(msg);
      }
    },

    _updateUI: function () {
      document.querySelectorAll('[data-ms-show="logged-in"]').forEach(function (e) { e.style.display = this.user ? '' : 'none'; }.bind(this));
      document.querySelectorAll('[data-ms-show="logged-out"]').forEach(function (e) { e.style.display = this.user ? 'none' : ''; }.bind(this));
    },

    _injectCSS: function () {
      if (document.getElementById('ms-auth-css')) return;
      var s = document.createElement('style');
      s.id = 'ms-auth-css';
      s.textContent = `
        .ms-auth-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9500; padding:1rem }
        .ms-auth-box { background:#fff; border-radius:16px; padding:2rem; max-width:400px; width:100%; position:relative; max-height:90vh; overflow-y:auto }
        .ms-auth-close { position:absolute; top:1rem; right:1rem; background:none; border:none; font-size:1.5rem; cursor:pointer; color:#888 }
        .ms-auth-titre { color:#0d7a38; margin:0 0 1.25rem }
        .ms-auth-error { background:#fee; color:#ce1126; padding:0.65rem; border-radius:8px; font-size:0.85rem; margin-bottom:1rem }
        .ms-auth-social { width:100%; padding:0.75rem; border:1px solid #ddd; border-radius:10px; background:#fff; font-weight:600; cursor:pointer; margin-bottom:0.6rem; display:flex; align-items:center; justify-content:center; gap:0.5rem }
        .ms-auth-social:hover { background:#f8f8f8 }
        .ms-auth-sep { text-align:center; color:#888; margin:1rem 0; position:relative }
        .ms-auth-sep::before { content:''; position:absolute; left:0; top:50%; width:40%; height:1px; background:#ddd }
        .ms-auth-sep::after { content:''; position:absolute; right:0; top:50%; width:40%; height:1px; background:#ddd }
        .ms-auth-field { margin-bottom:0.85rem }
        .ms-auth-field label { display:block; font-size:0.82rem; font-weight:600; margin-bottom:0.3rem; color:#444 }
        .ms-auth-field input { width:100%; padding:0.7rem 0.9rem; border:1px solid #ddd; border-radius:10px; font-size:0.95rem; box-sizing:border-box; font-family:inherit }
        .ms-auth-field input:focus { outline:2px solid #14a44d; border-color:#14a44d }
        .ms-auth-btn { width:100%; padding:0.85rem; background:#14a44d; color:#fff; border:none; border-radius:10px; font-weight:700; cursor:pointer; font-size:0.95rem }
        .ms-auth-btn:hover { background:#0d7a38 }
        .ms-auth-btn:disabled { background:#ccc; cursor:not-allowed }
        .ms-auth-switch { text-align:center; margin-top:1rem; font-size:0.9rem; color:#666 }
        .ms-auth-switch a { color:#14a44d; cursor:pointer; text-decoration:underline; font-weight:600 }
      `;
      document.head.appendChild(s);
    }
  };

  document.addEventListener('DOMContentLoaded', function () { window.MSAuth.init(); });
})();
