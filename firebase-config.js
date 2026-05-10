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

  // ====== ÉCOUTE TEMPS RÉEL : PRODUITS (visible par tous) ======
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

  // ====== MONKEY-PATCH des fonctions write ======
  // Délègue la validation au code original (qui a une bonne validation par champ)
  // et ajoute la sync cloud après une publication locale réussie.
  const _publierProduit = window.publierProduit;
  if(_publierProduit){
    window.publierProduit = async function(){
      const before = (window.state.produits||[]).length;
      // Appel de la fonction originale (validation + sauvegarde locale + modal de succès)
      _publierProduit();
      // Si l'item a bien été ajouté localement, on le pousse au cloud
      const after = (window.state.produits||[]).length;
      if(after > before){
        const newItem = window.state.produits[after - 1];
        try {
          if(!auth.currentUser){
            await signInAnonymously(auth);
          }
          await window.CLOUD.publierProduit(newItem);
          // Le listener Firestore mettra à jour la liste avec le _cid automatiquement
        } catch(e){
          console.error('cloud publish', e);
          window.toast('⚠️ Annonce locale (erreur cloud : '+(e.code||e.message||'inconnue')+')');
        }
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
