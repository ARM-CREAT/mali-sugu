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

  // CRUD produits
  publierProduit: async (item) => {
    const clean = JSON.parse(JSON.stringify(item));
    delete clean._cid;
    if(auth.currentUser) clean.userId = auth.currentUser.uid;
    return (await addDoc(collection(db, 'produits'), clean)).id;
  },
  supprimerProduit: async (cid) => deleteDoc(doc(db, 'produits', cid)),
  modifierProduit: async (cid, patch) => updateDoc(doc(db, 'produits', cid), patch),

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
    el.style.cssText = 'position:fixed;top:42px;right:6px;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;z-index:1000;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,.2);font-family:sans-serif';
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

  // Écoute temps réel des produits (publics)
  onSnapshot(collection(db, 'produits'), snap => {
    const arr = [];
    snap.forEach(d => arr.push({ ...d.data(), _cid: d.id, id: d.id }));
    arr.sort((a,b) => (b.date||0) - (a.date||0));
    if(arr.length > 0 || window.firstSync){
      window.state.produits = arr;
      window.renderAll();
    }
    window.firstSync = true;
  }, e => console.warn('listen produits', e));

  // Auth state
  onAuthStateChanged(auth, async user => {
    window.CLOUD.signedIn = !!user;
    window.CLOUD.user = user;
    if(user){
      indic('☁️ Connecté · '+(user.displayName||user.email||'').split('@')[0], '#0a3d1f');
      onSnapshot(query(collection(db, 'commandes'), where('acheteurId','==',user.uid)), snap => {
        const arr = [];
        snap.forEach(d => arr.push({ ...d.data(), _cid: d.id, id: d.id }));
        arr.sort((a,b) => (b.date||0) - (a.date||0));
        window.state.commandes = arr;
        window.renderAll();
      });
    } else {
      indic('☁️ Cloud actif');
    }
  });

  // ====== MONKEY-PATCH des fonctions write ======
  const _publierProduit = window.publierProduit;
  if(_publierProduit){
    window.publierProduit = async function(){
      const photo = document.getElementById('pPreview').dataset.photo || '';
      const gps = document.getElementById('gpsInfo').dataset.gps || '';
      const v = id => (document.getElementById(id).value||'').trim();
      const p = {
        date: Date.now(),
        titre: v('pTitre'), cat: v('pCat'), prix: +v('pPrix'),
        etat: v('pEtat'), photo, desc: v('pDesc'),
        region: v('pRegion'), ville: v('pVille'), gps,
        vendeur: v('pVendeur'), tel: v('pTel'), whatsapp: v('pWA')
      };
      if(!p.titre||!p.cat||!p.prix||!p.desc||!p.region||!p.vendeur||!p.tel){
        window.toast('⚠️ Champs obligatoires manquants'); return;
      }
      if(!auth.currentUser){
        try { await signInAnonymously(auth); } catch(e){ console.warn(e); }
      }
      try {
        await window.CLOUD.publierProduit(p);
        window.toast('☁️ Annonce publiée et synchronisée !');
        document.querySelector('#page-vendre form').reset();
        document.getElementById('pPreview').innerHTML='';
        document.getElementById('pPreview').dataset.photo='';
        document.getElementById('gpsInfo').textContent='';
        document.getElementById('gpsInfo').dataset.gps='';
        window.modal(`<h3>🎉 Annonce publiée et synchronisée !</h3>
          <p>Votre annonce <strong>« ${p.titre} »</strong> est visible par tous les utilisateurs MALI SUGU (web + Android) en temps réel.</p>
          <button class="btn" onclick="fermerModal();go('catalogue')">Voir le catalogue</button>`);
      } catch(e){
        console.error(e);
        window.toast('⚠️ Erreur cloud, sauvegarde locale');
        _publierProduit();
      }
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

  console.log('🔥 MALI SUGU connecté à Firebase mali-sugu — sync temps réel web ↔ mobile');
});

// =============================================================
// RÈGLES FIRESTORE À PUBLIER
// =============================================================
// Console Firebase → Firestore Database → Règles → coller ceci :
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /produits/{doc} {
//       allow read: if true;
//       allow create: if request.auth != null;
//       allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
//     }
//     match /users/{doc} {
//       allow read: if true;
//       allow write: if request.auth != null && request.auth.uid == doc;
//     }
//     match /commandes/{doc} {
//       allow read, create: if request.auth != null;
//       allow update: if request.auth != null;
//     }
//     match /messages/{doc} {
//       allow read, create: if request.auth != null;
//     }
//     match /avis/{doc} {
//       allow read: if true;
//       allow create: if request.auth != null;
//     }
//   }
// }
// =============================================================
