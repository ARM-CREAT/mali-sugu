// =============================================================
// firebase-config.js — MALI SUGU
// =============================================================
// PROJET FIREBASE DÉDIÉ MALI SUGU (séparé de ARM)
//
// Ce backend est PARTAGÉ entre :
//   - MALI SUGU Web      (ce site)
//   - MALI SUGU Android  (app mobile a0.dev / React Native)
//
// → Les annonces publiées depuis l'app mobile apparaissent
//   sur le site web en temps réel, et inversement.
//
// COLLECTIONS (sans préfixe, projet dédié) :
//   - produits   (annonces)
//   - users      (comptes acheteurs/vendeurs)
//   - commandes  (commandes passées)
//   - messages   (chat acheteur/vendeur)
//   - avis       (notations vendeurs)
//
// CONFIGURATION À METTRE :
// 1. Créez le projet Firebase "mali-sugu" sur console.firebase.google.com
// 2. Ajoutez une Web App, copiez la firebaseConfig
// 3. Remplacez les valeurs ci-dessous
// 4. Activez Firestore + Anonymous Auth + Email/Password
// 5. Publiez les règles Firestore (voir bas de fichier)
// =============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc,
  deleteDoc, updateDoc, getDoc, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// =============================================================
// CONFIGURATION FIREBASE OFFICIELLE MALI SUGU
// =============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAwoMG6EiciOTBawqMN4p-A-20BJHf4v3U",
  authDomain: "mali-sugu-ed117.firebaseapp.com",
  projectId: "mali-sugu-ed117",
  storageBucket: "mali-sugu-ed117.firebasestorage.app",
  messagingSenderId: "583727735875",
  appId: "1:583727735875:web:7c9143aa2b04b8137fa0f6",
  measurementId: "G-4R0JPDBE6B"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// API CLOUD exposée à index.html
window.CLOUD = {
  active: true, signedIn: false, user: null, db, auth,

  // Authentification
  loginAnonyme: async () => signInAnonymously(auth),
  loginEmail: async (email, pwd) => signInWithEmailAndPassword(auth, email, pwd),
  inscriptionEmail: async (email, pwd, nom) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    if(nom) await updateProfile(cred.user, { displayName: nom });
    return cred;
  },
  logout: async () => signOut(auth),

  // CRUD annonces — écrit avec le schéma mobile (compatible app Android)
  publierProduit: async (item) => {
    const sellerId = auth.currentUser ? auth.currentUser.uid : '';
    // Document au format mobile (compatible avec l'app Android)
    const doc = {
      titre: item.titre || '',
      categorie: item.cat || 'autre',
      prix: String(item.prix || 0),
      ville: item.ville || item.region || '',
      imageUrl: item.photo || '',
      status: 'disponible',
      sellerd: sellerId,
      searchekeywords: [
        (item.titre||'').toLowerCase(),
        (item.cat||'').toLowerCase(),
        (item.ville||'').toLowerCase(),
        (item.region||'').toLowerCase()
      ].filter(Boolean),
      createdAt: new Date(),
      // Champs additionnels (web seulement, mobile les ignore)
      description: item.desc || '',
      region: item.region || '',
      etat: item.etat || '',
      vendeur: item.vendeur || '',
      tel: item.tel || '',
      whatsapp: item.whatsapp || '',
      gps: item.gps || ''
    };
    return (await addDoc(collection(db, 'annonces'), doc)).id;
  },
  supprimerProduit: async (cid) => deleteDoc(doc(db, 'annonces', cid)),
  modifierProduit: async (cid, patch) => updateDoc(doc(db, 'annonces', cid), patch),

  // CRUD commandes
  passerCommande: async (cmd) => {
    const clean = JSON.parse(JSON.stringify(cmd));
    if(auth.currentUser) clean.acheteurId = auth.currentUser.uid;
    return (await addDoc(collection(db, 'commandes'), clean)).id;
  },

  // Profil utilisateur
  saveProfil: async (data) => {
    if(!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid), data, { merge: true });
  }
};

function indic(text, color='#14a44d'){
  let el = document.getElementById('cloudIndic');
  if(!el){
    el = document.createElement('div');
    el.id = 'cloudIndic';
    el.style.cssText = 'display:none';
    document.body.appendChild(el);
  }
  el.style.background = color; el.textContent = text;
}

function whenReady(fn){
  if(window.state && window.renderAll) fn();
  else setTimeout(()=>whenReady(fn), 50);
}

whenReady(() => {
  indic('☁️ Cloud actif');

  // ====== HELPERS DE CONVERSION (schéma mobile ↔ schéma web) ======

  // Convertit une URL gs:// (Firebase Storage) en URL https publique
  function gsToHttps(gsUrl){
    if(!gsUrl || typeof gsUrl !== 'string') return '';
    if(gsUrl.startsWith('http')) return gsUrl;
    if(gsUrl.startsWith('gs://')){
      const m = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if(m){
        const bucket = m[1], path = m[2];
        return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
      }
    }
    return gsUrl;
  }

  // Convertit un document mobile en format web pour affichage
  function mobileToWeb(doc, cid){
    const d = doc || {};
    let dateMs = Date.now();
    if(d.createdAt){
      if(d.createdAt.toMillis) dateMs = d.createdAt.toMillis();
      else if(typeof d.createdAt === 'number') dateMs = d.createdAt;
      else if(d.createdAt.seconds) dateMs = d.createdAt.seconds * 1000;
    } else if(d.date){
      dateMs = d.date;
    }
    return {
      _cid: cid,
      id: cid,
      // Champs principaux (mapping mobile → web)
      titre:   d.titre || d.title || '',
      cat:     d.categorie || d.category || d.cat || 'autre',
      prix:    parseFloat(d.prix || d.price || 0) || 0,
      // imageUrl peut être un tableau (app Android) ou une chaîne (web)
      photo:   gsToHttps(Array.isArray(d.imageUrl) ? (d.imageUrl[0]||'') : (d.imageUrl || d.photo || d.image || '')),
      photos:  Array.isArray(d.imageUrl) ? d.imageUrl.map(gsToHttps) : (d.imageUrl ? [gsToHttps(d.imageUrl)] : []),
      ville:   d.ville || d.city || d.location || '',
      desc:    d.description || d.desc || d.descripcion || d.titre || '',
      region:  d.region || d.area || '',
      etat:    d.etat || d.condition || d.status === 'disponible' ? (d.etat || 'bon') : (d.etat || 'bon'),
      vendeur: d.vendeur || d.seller || d.sellerName || '',
      tel:     d.tel || d.phone || d.telephone || '',
      whatsapp: d.whatsapp || d.wa || '',
      sellerId: d.sellerd || d.sellerId || d.userId || '',
      status:  d.status || 'disponible',
      gps:     d.gps || '',
      date:    dateMs,
      // Garder les champs originaux pour ne rien perdre
      _raw: d
    };
  }

  // ====== ÉCOUTE TEMPS RÉEL : ANNONCES (mobile + web) ======
  onSnapshot(collection(db, 'annonces'), snap => {
    const arr = [];
    snap.forEach(d => arr.push(mobileToWeb(d.data(), d.id)));
    arr.sort((a,b) => (b.date||0) - (a.date||0));
    if(arr.length > 0 || window.firstSync){
      window.state.produits = arr;
      window.renderAll();
    }
    window.firstSync = true;
  }, e => console.warn('listen annonces', e));

  // Cache des profils vendeurs pour résoudre les noms
  const sellerCache = {};
  async function resolveSeller(sellerId){
    if(!sellerId || sellerCache[sellerId]) return sellerCache[sellerId] || {};
    try {
      const snap = await getDoc(doc(db, 'users', sellerId));
      const data = snap.data() || {};
      sellerCache[sellerId] = {
        nom: data.nom || data.name || data.displayName || 'Vendeur',
        tel: data.tel || data.phone || data.telephone || '',
        whatsapp: data.whatsapp || data.wa || ''
      };
    } catch(e){ sellerCache[sellerId] = {}; }
    return sellerCache[sellerId];
  }
  // Rendre disponible globalement pour usage dans index.html
  window.resolveSeller = resolveSeller;
  window.gsToHttps = gsToHttps;

  // ====== AUTH STATE & SYNC PROFIL ======
  let unsubProfile=null, unsubCommandes=null;
  onAuthStateChanged(auth, async user => {
    window.CLOUD.signedIn = !!user;
    window.CLOUD.user = user;
    // Désabonner les anciennes écoutes
    if(unsubProfile){ unsubProfile(); unsubProfile=null; }
    if(unsubCommandes){ unsubCommandes(); unsubCommandes=null; }

    if(user){
      const label = (user.displayName||user.email||user.uid.slice(0,8));
      indic('☁️ Connecté · '+label, '#0a3d1f');

      // Sync profil utilisateur depuis Firestore
      unsubProfile = onSnapshot(doc(db, 'users', user.uid), snap => {
        const data = snap.data();
        if(data){
          window.state.user = { ...data, uid: user.uid };
        } else if(user.email){
          // Première connexion : créer le profil de base
          setDoc(doc(db, 'users', user.uid), {
            nom: user.displayName || user.email.split('@')[0],
            email: user.email,
            tel: '',
            date: Date.now()
          }, { merge: true });
        }
        window.save && window.save();
        window.renderAll();
      });

      // Sync commandes de l'utilisateur connecté
      unsubCommandes = onSnapshot(query(collection(db, 'commandes'), where('acheteurId','==',user.uid)), snap => {
        const arr = [];
        snap.forEach(d => arr.push({ ...d.data(), _cid: d.id, id: d.id }));
        arr.sort((a,b) => (b.date||0) - (a.date||0));
        window.state.commandes = arr;
        window.renderAll();
      });
    } else {
      indic('☁️ Cloud actif');
      // Pas connecté : on garde juste les infos locales
    }
  });

  // ====== MONKEY-PATCH avec DIAGNOSTIC complet ======
  const _publierProduit = window.publierProduit;
  if(_publierProduit){
    window.publierProduit = async function(){
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🟡 [Étape 0] Bouton "Publier" cliqué');

      const before = (window.state.produits||[]).length;
      console.log('🟡 [Étape 1] Validation locale et sauvegarde...');
      _publierProduit();

      const after = (window.state.produits||[]).length;
      if(after <= before){
        console.log('🔴 [Étape 1 ÉCHEC] Validation locale échouée — l\'item n\'a pas été ajouté.');
        console.log('💡 Vérifiez que tous les champs obligatoires sont remplis.');
        return;
      }

      const newItem = window.state.produits[after - 1];
      console.log('🟢 [Étape 1 OK] Item ajouté localement :', newItem);

      // Étape 2 : authentification
      console.log('🟡 [Étape 2] Connexion anonyme à Firebase...');
      if(!auth.currentUser){
        try {
          const cred = await signInAnonymously(auth);
          console.log('🟢 [Étape 2 OK] Connecté anonymement, UID :', cred.user.uid);
        } catch(e){
          console.error('🔴 [Étape 2 ÉCHEC] Auth anonyme refusée :', e.code, e.message);
          window.toast('❌ Auth anonyme bloquée : '+e.code+'. Activez "Anonymous" dans Firebase Console > Authentication > Sign-in method');
          return;
        }
      } else {
        console.log('🟢 [Étape 2 OK] Déjà connecté, UID :', auth.currentUser.uid);
      }

      // Étape 3 : écriture cloud
      console.log('🟡 [Étape 3] Écriture du document dans Firestore (collection "annonces")...');
      try {
        const docId = await window.CLOUD.publierProduit(newItem);
        console.log('🟢 [Étape 3 OK] Document créé dans Firestore avec ID :', docId);
        console.log('🎉 SUCCÈS ! L\'annonce est maintenant visible sur tous les appareils.');
        window.toast('☁️ Annonce synchronisée avec le cloud ! ID: '+docId.slice(0,8));
      } catch(e){
        console.error('🔴 [Étape 3 ÉCHEC] Écriture refusée :', e.code, e.message);
        if(e.code === 'permission-denied'){
          window.toast('❌ Règles Firestore bloquent l\'écriture. Vérifiez les rules pour /annonces');
        } else {
          window.toast('❌ Cloud erreur : '+e.code+' — '+(e.message||'').slice(0,80));
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    };
  }

  const _supprimerAnnonce = window.supprimerAnnonce;
  if(_supprimerAnnonce){
    window.supprimerAnnonce = async function(id){
      if(!confirm('Supprimer cette annonce ?')) return;
      const item = window.state.produits.find(p=>p.id===id || p._cid===id);
      if(item && item._cid){
        try { await window.CLOUD.supprimerProduit(item._cid); window.toast('🗑️ Annonce supprimée'); }
        catch(e){ window.toast('⚠️ Erreur : '+e.code); }
      } else {
        window.state.produits = window.state.produits.filter(p=>p.id!==id);
        window.toast('🗑️ Annonce supprimée localement');
      }
      window.fermerModal && window.fermerModal();
      window.renderAll();
    };
  }

  const _confirmerCommande = window.confirmerCommande;
  if(_confirmerCommande){
    window.confirmerCommande = async function(){
      if(!auth.currentUser){
        try { await signInAnonymously(auth); } catch(e){ console.warn(e); }
      }
      const v = id => (document.getElementById(id).value||'').trim();
      const nom=v('cNom'), tel=v('cTel'), region=v('cRegion'), ville=v('cVille'), adresse=v('cAdresse');
      if(!nom||!tel||!ville){ window.toast('⚠️ Complétez les champs obligatoires'); return; }
      const pm = document.querySelector('input[name=pm]:checked').value;
      const total = window.totalPanier();
      const cmd = {
        date: Date.now(),
        items: window.state.panier.map(it=>({ ...it, p: window.state.produits.find(x=>x.id===it.id) })),
        total, statut: pm==='cash'?'En attente livraison':'En attente paiement',
        livraison: { nom, tel, region, ville, adresse }, paiement: pm
      };
      try {
        await window.CLOUD.passerCommande(cmd);
        window.state.panier = []; window.save();
        let msg = '';
        if(pm==='orange') msg = `<p>Composez maintenant <strong style="font-size:20px">#144#</strong> et envoyez <strong>${(total).toLocaleString('fr-FR')} FCFA</strong>.</p>`;
        else if(pm==='moov') msg = `<p>Allez dans Moov Money et envoyez <strong>${(total).toLocaleString('fr-FR')} FCFA</strong>.</p>`;
        else if(pm==='cash') msg = `<p>Le vendeur vous contactera. Préparez <strong>${(total).toLocaleString('fr-FR')} FCFA</strong> en espèces.</p>`;
        window.modal(`<h3>🎉 Commande passée !</h3>${msg}<button class="btn" onclick="fermerModal();go('commandes')">Voir mes commandes</button>`);
      } catch(e){
        console.error(e);
        _confirmerCommande();
      }
    };
  }

  // ====== CRÉATION DE COMPTE ====== (Firebase Auth + profil Firestore)
  const _creerCompte = window.creerCompte;
  if(_creerCompte){
    window.creerCompte = async function(){
      const v = id => (document.getElementById(id).value||'').trim();
      const nom=v('uNom'), email=v('uMail'), tel=v('uTel');
      if(!nom||!tel){ window.toast('⚠️ Nom et téléphone obligatoires'); return; }

      try {
        let cred;
        if(email){
          // Si email fourni : créer un compte Firebase Email/Password
          // Mot de passe par défaut = téléphone (l'utilisateur peut le changer après)
          const pwd = tel.replace(/[^0-9]/g,'')+'!';
          try {
            cred = await createUserWithEmailAndPassword(auth, email, pwd);
          } catch(e){
            // Si email déjà utilisé, essayer de se connecter avec
            if(e.code==='auth/email-already-in-use'){
              cred = await signInWithEmailAndPassword(auth, email, pwd);
            } else throw e;
          }
          if(cred && nom){ try{ await updateProfile(cred.user, { displayName: nom }); }catch(e){} }
        } else {
          // Pas d'email : compte anonyme
          cred = await signInAnonymously(auth);
        }

        // Sauvegarder le profil dans Firestore
        if(cred && cred.user){
          await setDoc(doc(db, 'users', cred.user.uid), {
            nom, email, tel, date: Date.now()
          }, { merge: true });
        }
        window.toast('🎉 Compte créé et synchronisé !');
        // Le profil sera mis à jour automatiquement par le listener onSnapshot
      } catch(e){
        console.error('creerCompte', e);
        window.toast('⚠️ '+(e.code==='auth/invalid-email'?'Email invalide':e.message||e.code));
        // Fallback : sauvegarde locale
        _creerCompte();
      }
    };
  }

  // ====== MODIFICATION DE PROFIL ======
  const _enregistrerProfil = window.enregistrerProfil;
  if(_enregistrerProfil){
    window.enregistrerProfil = async function(){
      const v = id => (document.getElementById(id).value||'').trim();
      const data = { nom: v('mfNom'), email: v('mfMail'), tel: v('mfTel') };
      if(auth.currentUser){
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), data, { merge: true });
          if(data.nom) await updateProfile(auth.currentUser, { displayName: data.nom });
          window.toast('☁️ Profil synchronisé');
          window.fermerModal && window.fermerModal();
        } catch(e){
          console.error(e);
          _enregistrerProfil();
        }
      } else {
        _enregistrerProfil();
      }
    };
  }

  // ====== DÉCONNEXION ======
  const _deconnexion = window.deconnexion;
  if(_deconnexion){
    window.deconnexion = async function(){
      if(!confirm('Vous déconnecter ?')) return;
      try { await signOut(auth); } catch(e){}
      window.state.user = null;
      window.state.commandes = [];
      window.save();
      window.renderCompte && window.renderCompte();
      window.renderCommandes && window.renderCommandes();
      window.toast('👋 Déconnecté');
    };
  }

  console.log('🔥 MALI SUGU connecté à Firebase mali-sugu-ed117 — TOUT en temps réel : produits, commandes, comptes, profils');
});

// =============================================================
// RÈGLES FIRESTORE À PUBLIER (web + app Android Mali Sugu)
// =============================================================
// Console Firebase → Firestore Database → Règles → coller ceci :
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//
//     // Annonces (catalogue partagé web + Android)
//     match /annonces/{docId} {
//       allow read: if true;
//       allow create: if request.auth != null;
//       allow update, delete: if request.auth != null
//                          && request.auth.uid == resource.data.sellerd;
//     }
//
//     // Profils utilisateurs
//     match /users/{userId} {
//       allow read: if true;
//       allow write: if request.auth != null
//                 && request.auth.uid == userId;
//     }
//
//     // Commandes
//     match /commandes/{docId} {
//       allow read: if request.auth != null
//                && (request.auth.uid == resource.data.acheteurId
//                ||  request.auth.uid == resource.data.vendeurId);
//       allow create: if request.auth != null;
//       allow update: if request.auth != null
//                  && (request.auth.uid == resource.data.acheteurId
//                  ||  request.auth.uid == resource.data.vendeurId);
//     }
//
//     // Conversations (app Android)
//     match /chats/{chatId} {
//       allow read, write: if request.auth != null
//                       && request.auth.uid in resource.data.participants;
//       allow create: if request.auth != null;
//     }
//
//     // Messages dans les conversations
//     match /messages/{docId} {
//       allow read, create: if request.auth != null;
//     }
//
//     // Favoris
//     match /favoris/{docId} {
//       allow read, write: if request.auth != null
//                       && request.auth.uid == resource.data.uid;
//       allow create: if request.auth != null;
//     }
//
//     // Avis / notations
//     match /avis/{docId} {
//       allow read: if true;
//       allow create: if request.auth != null;
//     }
//
//     // Notifications
//     match /notifications/{docId} {
//       allow read, write: if request.auth != null
//                       && request.auth.uid == resource.data.uid;
//       allow create: if request.auth != null;
//     }
//   }
// }
// =============================================================
//
// ⚠️  Auth anonyme activée : Firebase Console → Authentication
//      → Sign-in method → Anonyme → Activer
// =============================================================
