/* =============================================================
   MALI SUGU — Module Caméra Vendeur
   ✅ Bouton "Prendre photo" sur tous les formulaires
   ✅ Caméra native (mobile + ordinateur)
   ✅ Multi-photos jusqu'à 5 par annonce
   ✅ Compression automatique (économie de données)
   ✅ Aperçu en direct
   ✅ Aucune modification du reste — détection auto
   ============================================================= */
(function () {
  'use strict';

  var CFG = {
    maxPhotos: 5,
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.85
  };

  /* ─────────── INJECTION CSS ─────────── */
  function injectCSS() {
    if (document.getElementById('ms-cam-css')) return;
    var s = document.createElement('style');
    s.id = 'ms-cam-css';
    s.textContent = `
      .ms-cam-zone {
        background: #f6faf7;
        border: 2px dashed #14a44d;
        border-radius: 14px;
        padding: 1.25rem;
        margin: 1rem 0;
        text-align: center;
      }
      html.ms-dark .ms-cam-zone { background: #1f1f1f; border-color: #14a44d; }
      .ms-cam-titre {
        font-weight: 700;
        color: #0d7a38;
        margin-bottom: 0.75rem;
        font-size: 1rem;
      }
      html.ms-dark .ms-cam-titre { color: #4ce080; }
      .ms-cam-buttons {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }
      .ms-cam-btn {
        background: #14a44d;
        color: #fff;
        border: none;
        padding: 0.7rem 1.25rem;
        border-radius: 10px;
        font-weight: 700;
        cursor: pointer;
        font-size: 0.95rem;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        transition: background 0.2s;
      }
      .ms-cam-btn:hover { background: #0d7a38; }
      .ms-cam-btn-secondary {
        background: #fff;
        color: #14a44d;
        border: 2px solid #14a44d;
      }
      .ms-cam-btn-secondary:hover { background: #14a44d; color: #fff; }
      .ms-cam-hint {
        font-size: 0.8rem;
        color: #666;
      }
      html.ms-dark .ms-cam-hint { color: #aaa; }
      .ms-cam-previews {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .ms-cam-preview {
        position: relative;
        aspect-ratio: 1;
        border-radius: 8px;
        overflow: hidden;
        background: #ddd;
        border: 1px solid #ccc;
      }
      .ms-cam-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .ms-cam-preview-remove {
        position: absolute;
        top: 4px; right: 4px;
        width: 24px; height: 24px;
        background: rgba(206, 17, 38, 0.9);
        color: #fff;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .ms-cam-preview-main {
        position: absolute;
        bottom: 4px; left: 4px;
        background: #fcd116;
        color: #1a1a1a;
        font-size: 0.65rem;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
      }
      .ms-cam-uploading {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.6);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
      }
      .ms-cam-counter {
        font-size: 0.8rem;
        color: #888;
        margin-top: 0.5rem;
      }
    `;
    document.head.appendChild(s);
  }

  /* ─────────── COMPRESSION IMAGE ─────────── */
  function compresserImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var ratio = Math.min(CFG.maxWidth / img.width, CFG.maxHeight / img.height, 1);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            resolve(blob);
          }, 'image/jpeg', CFG.quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ─────────── UPLOAD VERS FIREBASE STORAGE ─────────── */
  function uploaderPhoto(blob) {
    if (typeof firebase === 'undefined' || !firebase.storage) {
      // Fallback : data URL (stocké dans Firestore directement)
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) { resolve(e.target.result); };
        reader.readAsDataURL(blob);
      });
    }
    var storage = firebase.storage();
    var nom = 'produits/photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
    var ref = storage.ref(nom);
    return ref.put(blob, { contentType: 'image/jpeg' })
      .then(function (snap) { return snap.ref.getDownloadURL(); });
  }

  /* ─────────── ZONE CAMÉRA POUR UN FORMULAIRE ─────────── */
  function attacherZone(form) {
    if (form.dataset.msCamAttached) return;
    form.dataset.msCamAttached = '1';

    // Crée la zone caméra
    var zone = document.createElement('div');
    zone.className = 'ms-cam-zone';
    zone.innerHTML =
      '<div class="ms-cam-titre">📸 Photos du produit (jusqu\'à ' + CFG.maxPhotos + ')</div>' +
      '<div class="ms-cam-buttons">' +
        '<button type="button" class="ms-cam-btn" data-action="camera">📷 Prendre photo</button>' +
        '<button type="button" class="ms-cam-btn ms-cam-btn-secondary" data-action="gallery">🖼️ Galerie</button>' +
      '</div>' +
      '<div class="ms-cam-hint">Les photos sont automatiquement optimisées pour économiser les données</div>' +
      '<div class="ms-cam-previews" data-previews></div>' +
      '<div class="ms-cam-counter"><span data-count>0</span> / ' + CFG.maxPhotos + ' photos</div>' +
      '<input type="hidden" name="photos_urls" data-photos-input>';

    // Trouve où insérer la zone
    var photoInput = form.querySelector('input[type=file][accept*=image]') ||
                      form.querySelector('input[name*=photo i], input[name*=image i]');
    if (photoInput) {
      photoInput.parentElement.insertBefore(zone, photoInput);
      photoInput.style.display = 'none'; // Cache l'ancien input mais ne le supprime pas
    } else {
      // Pas trouvé : ajoute en haut du formulaire
      form.insertBefore(zone, form.firstChild);
    }

    var photos = [];
    var previewsEl = zone.querySelector('[data-previews]');
    var counterEl = zone.querySelector('[data-count]');
    var hiddenInput = zone.querySelector('[data-photos-input]');

    function majAffichage() {
      previewsEl.innerHTML = photos.map(function (p, i) {
        return '<div class="ms-cam-preview">' +
          '<img src="' + (p.url || p.dataUrl) + '">' +
          (i === 0 ? '<span class="ms-cam-preview-main">PRINCIPALE</span>' : '') +
          (p.uploading ? '<div class="ms-cam-uploading">⏳ ' + (p.progress || '') + '</div>' : '') +
          '<button type="button" class="ms-cam-preview-remove" data-idx="' + i + '">×</button>' +
        '</div>';
      }).join('');
      counterEl.textContent = photos.length;

      // URLs finales pour le formulaire (séparées par |)
      var urls = photos.filter(function (p) { return p.url; }).map(function (p) { return p.url; });
      hiddenInput.value = urls.join('|');

      // Si l'ancien input photo existe, on lui passe la première image pour compat
      if (photoInput && photos.length > 0 && photos[0].file) {
        var dt = new DataTransfer();
        photos.forEach(function (p) { if (p.file) dt.items.add(p.file); });
        photoInput.files = dt.files;
      }

      // Boutons supprimer
      previewsEl.querySelectorAll('.ms-cam-preview-remove').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var idx = Number(btn.dataset.idx);
          photos.splice(idx, 1);
          majAffichage();
        });
      });
    }

    function ajouterPhoto(file) {
      if (photos.length >= CFG.maxPhotos) {
        alert('Maximum ' + CFG.maxPhotos + ' photos atteint');
        return;
      }
      var photo = { uploading: true, progress: 'Optimisation...', file: file };
      var dataUrl = null;
      var reader = new FileReader();
      reader.onload = function (e) {
        photo.dataUrl = e.target.result;
        photos.push(photo);
        majAffichage();
      };
      reader.readAsDataURL(file);

      compresserImage(file)
        .then(function (blob) {
          photo.progress = 'Upload...';
          majAffichage();
          // Remplacer le file par le blob compressé
          var compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          photo.file = compressedFile;
          return uploaderPhoto(blob);
        })
        .then(function (url) {
          photo.url = url;
          photo.uploading = false;
          majAffichage();
        })
        .catch(function (err) {
          console.error('Photo upload:', err);
          photo.uploading = false;
          photo.url = photo.dataUrl; // Fallback data URL
          majAffichage();
        });
    }

    // Bouton CAMÉRA
    zone.querySelector('[data-action=camera]').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = function (e) {
        if (e.target.files[0]) ajouterPhoto(e.target.files[0]);
      };
      input.click();
    });

    // Bouton GALERIE (sélection multiple)
    zone.querySelector('[data-action=gallery]').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = function (e) {
        var files = Array.from(e.target.files).slice(0, CFG.maxPhotos - photos.length);
        files.forEach(ajouterPhoto);
      };
      input.click();
    });

    majAffichage();
  }

  /* ─────────── DÉTECTION FORMULAIRES ─────────── */
  function detecterFormulaires() {
    // Détecte les formulaires de publication de produit
    // Heuristique : forme qui contient "titre" et "prix" ou un input photo
    document.querySelectorAll('form:not([data-ms-cam-attached])').forEach(function (form) {
      var hasPrix = form.querySelector('input[name*=prix i], input[name*=price i]');
      var hasTitre = form.querySelector('input[name*=titre i], input[name*=title i], input[name*=nom i]');
      var hasPhoto = form.querySelector('input[type=file][accept*=image]');

      if ((hasPrix && hasTitre) || hasPhoto) {
        attacherZone(form);
      }
    });
  }

  /* ─────────── API PUBLIQUE ─────────── */
  window.MSCamera = {
    config: CFG,
    attacherZone: attacherZone,
    detecterFormulaires: detecterFormulaires
  };

  /* ─────────── INITIALISATION ─────────── */
  document.addEventListener('DOMContentLoaded', function () {
    injectCSS();
    setTimeout(detecterFormulaires, 1000);

    // Re-détecte si de nouveaux formulaires apparaissent
    new MutationObserver(function () { detecterFormulaires(); })
      .observe(document.body, { childList: true, subtree: true });

    console.log('[MS Camera] ✅ Module caméra activé');
  });

})();
