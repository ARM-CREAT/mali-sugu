// =============================================================
// firebase-mobile.ts — MALI SUGU App Android (a0.dev / Expo)
// Remplacement complet de Convex par Firebase Firestore
// =============================================================
//
// INSTALLATION :
//   npx expo install firebase
//
// Retourne exactement les mêmes structures de données
// que les fonctions Convex, pour un remplacement sans
// modifier les composants React Native.
//
// UTILISATION (dans vos composants, remplacez) :
//   import { api } from '@/convex/_generated/api'
//   import { useQuery, useMutation } from 'convex/react'
//
// PAR :
//   import { useListAnnonces, useCreateAnnonce, ... } from '@/firebase-mobile'
// =============================================================

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection, addDoc, onSnapshot,
  doc, setDoc, deleteDoc, updateDoc,
  getDoc, getDocs, query, where,
  orderBy, limit, DocumentData,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from 'firebase/auth';
import {
  getStorage, ref as storageRef,
  uploadBytes, getDownloadURL,
} from 'firebase/storage';
import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================
// CONFIG — même projet Firebase que le site web mali-sugu
// =============================================================
const firebaseConfig = {
  apiKey:            'AIzaSyAwoMG6EiciOTBawqMN4p-A-20BJHf4v3U',
  authDomain:        'mali-sugu-ed117.firebaseapp.com',
  projectId:         'mali-sugu-ed117',
  storageBucket:     'mali-sugu-ed117.firebasestorage.app',
  messagingSenderId: '583727735875',
  appId:             '1:583727735875:web:7c9143aa2b04b8137fa0f6',
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db      = getFirestore(firebaseApp);
export const auth    = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);

// =============================================================
// HELPERS
// =============================================================

function safeTimestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Convertit un document Firestore annonce → format attendu par l'app React Native */
function normalizeProduct(data: DocumentData, id: string) {
  const d = data;
  const createdAt = safeTimestamp(d.createdAt, Date.now());
  const updatedAt = safeTimestamp(d.updatedAt, createdAt);

  // imageUrl peut être tableau (app Android) ou chaîne (site web)
  const rawImages: string[] = Array.isArray(d.imageUrl)
    ? d.imageUrl
    : d.imageUrl ? [d.imageUrl] : [];
  const images = rawImages.filter(
    (u: string) => typeof u === 'string'
      && !u.startsWith('blob:')
      && !u.startsWith('file:')
      && !u.startsWith('content:'),
  );

  const status =
    d.status === 'vendu'   ? 'sold'     :
    d.status === 'inactif' ? 'inactive' : 'active';

  return {
    _id:                id,
    _creationTime:      createdAt,
    id,
    title:              d.titre        || d.title        || '',
    description:        d.description  || d.desc         || '',
    price:              Number(d.prix  || d.price        || 0),
    currency:           'XOF' as const,
    images,
    category:           d.categorie    || d.category     || '',
    condition:          d.condition    || d.etat         || 'good',
    seller: {
      id:           d.sellerd      || d.sellerId     || '',
      name:         d.sellerName   || d.vendeur      || 'Vendeur',
      avatar:       d.sellerAvatar || '',
      location:     d.ville        || d.location     || '',
      phone:        d.sellerPhone  || d.tel          || '',
      email:        d.sellerEmail  || '',
      rating:       d.sellerRating || 0,
      reviewCount:  0,
      memberSince:  new Date(createdAt).toISOString(),
      isVerified:   false,
      isOnline:     false,
      productsCount: 0,
      soldCount:    0,
    },
    location:           d.ville        || d.location     || '',
    coordinates:        undefined,
    createdAt:          new Date(createdAt).toISOString(),
    updatedAt:          new Date(updatedAt).toISOString(),
    views:              d.views        || 0,
    favorites:          d.favorites    || 0,
    isFavorite:         false,
    isNegotiable:       d.isNegotiable        ?? true,
    isShippingAvailable: d.isShippingAvailable ?? true,
    shippingPrice:      undefined,
    tags:               d.searchekeywords || [],
    status,
    paymentMethods:     d.paymentMethods  || [],
    imageNeedsReupload: d.imageNeedsReupload ?? false,
  };
}

function normalizeUser(data: DocumentData, id: string) {
  const createdAt = safeTimestamp(data.createdAt);
  return {
    _id:         id,
    _creationTime: createdAt,
    uid:         data.uid,
    nom:         data.nom  || data.name || '',
    email:       data.email || '',
    tel:         data.tel   || '',
    photoURL:    data.photoURL || data.image || '',
    location:    data.location || '',
    orangeMoney: data.orangeMoney || '',
    sellerMode:  data.sellerMode ?? false,
    createdAt,
    updatedAt:   safeTimestamp(data.updatedAt, createdAt),
  };
}

function normalizeChat(data: DocumentData, id: string) {
  return {
    _id:             id,
    _creationTime:   safeTimestamp(data.createdAt),
    participants:    data.participants    || [],
    participantA:    data.participantA    || '',
    participantB:    data.participantB    || '',
    participantsKey: data.participantsKey || '',
    productId:       data.productId       || null,
    productTitle:    data.productTitle    || null,
    productImageUrl: data.productImageUrl || null,
    lastMessage:     data.lastMessage     || '',
    lastMessageAt:   data.lastMessageAt   || 0,
    lastSenderId:    data.lastSenderId    || '',
    unreadBy:        data.unreadBy        || {},
    createdAt:       safeTimestamp(data.createdAt),
    updatedAt:       safeTimestamp(data.updatedAt),
  };
}

function normalizeMessage(data: DocumentData, id: string) {
  return {
    _id:         id,
    _creationTime: safeTimestamp(data.createdAt),
    chatId:      data.chatId || data.conversationId || '',
    senderId:    data.senderId   || '',
    receiverId:  data.receiverId || '',
    text:        data.text       || data.content || '',
    type:        data.type       || 'text',
    read:        data.read       ?? false,
    offerAmount: data.offerAmount || null,
    imageUrl:    data.imageUrl    || null,
    createdAt:   safeTimestamp(data.createdAt),
  };
}

function normalizeOrder(data: DocumentData, id: string) {
  return {
    _id:           id,
    _creationTime: safeTimestamp(data.createdAt),
    acheteurId:    data.acheteurId  || '',
    vendeurId:     data.vendeurId   || '',
    annoncesIds:   data.annoncesIds || [],
    total:         data.total       || 0,
    statut:        data.statut      || 'pending',
    paymentMethod: data.paymentMethod || 'cash',
    createdAt:     safeTimestamp(data.createdAt),
  };
}

function normalizeNotification(data: DocumentData, id: string) {
  return {
    _id:       id,
    _creationTime: safeTimestamp(data.createdAt),
    uid:       data.uid      || '',
    type:      data.type     || 'system',
    title:     data.title    || '',
    subtitle:  data.subtitle || '',
    read:      data.read     ?? false,
    relatedId: data.relatedId || null,
    createdAt: safeTimestamp(data.createdAt),
  };
}

// =============================================================
// UPLOAD IMAGE → Firebase Storage
// =============================================================

/**
 * Remplace generateUploadUrl + upload Convex.
 * Utilisation :
 *   const url = await uploadImageToStorage(localUri, `annonces/${Date.now()}.jpg`);
 */
export async function uploadImageToStorage(uri: string, path: string): Promise<string> {
  const response = await fetch(uri);
  const blob     = await response.blob();
  const ref_     = storageRef(storage, path);
  await uploadBytes(ref_, blob);
  return getDownloadURL(ref_);
}

// =============================================================
// HOOKS — remplacent useQuery / useMutation de Convex
// =============================================================

/** Hook générique pour un snapshot Firestore temps réel */
function useSnapshot<T>(
  subscribe: (cb: (data: T) => void) => () => void,
  deps: any[] = [],
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  useEffect(() => {
    const unsub = subscribe(setData);
    return unsub;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

// =============================================================
// ANNONCES — HOOKS
// =============================================================

/** Remplace : useQuery(api.products.listAnnonces) */
export function useListAnnonces() {
  return useSnapshot<ReturnType<typeof normalizeProduct>[]>(cb => {
    const q = query(
      collection(db, 'annonces'),
      where('status', '==', 'disponible'),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => normalizeProduct(d.data(), d.id)));
    });
  });
}

/** Remplace : useQuery(api.products.listAnnoncesByCategory, { categorie }) */
export function useListAnnoncesByCategory(categorie: string | null) {
  return useSnapshot<ReturnType<typeof normalizeProduct>[]>(cb => {
    const q = categorie
      ? query(collection(db, 'annonces'), where('categorie', '==', categorie), where('status', '==', 'disponible'), orderBy('createdAt', 'desc'), limit(200))
      : query(collection(db, 'annonces'), where('status', '==', 'disponible'), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => normalizeProduct(d.data(), d.id)));
    });
  }, [categorie]);
}

/** Remplace : useQuery(api.products.listUserAnnonces, { uid }) */
export function useListUserAnnonces(uid: string) {
  return useSnapshot<ReturnType<typeof normalizeProduct>[]>(cb => {
    if (!uid) { cb([]); return () => {}; }
    const q = query(collection(db, 'annonces'), where('sellerd', '==', uid), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => normalizeProduct(d.data(), d.id)));
    });
  }, [uid]);
}

/** Remplace : useQuery(api.products.getAnnonceById, { id }) */
export function useGetAnnonceById(id: string | null) {
  const [data, setData] = useState<ReturnType<typeof normalizeProduct> | null>(null);
  useEffect(() => {
    if (!id) { setData(null); return; }
    return onSnapshot(doc(db, 'annonces', id), snap => {
      setData(snap.exists() ? normalizeProduct(snap.data(), snap.id) : null);
    });
  }, [id]);
  return data;
}

// =============================================================
// ANNONCES — MUTATIONS
// =============================================================

/** Remplace : useMutation(api.products.createAnnonce) */
export async function createAnnonce(args: {
  titre: string; categorie: string; prix: string; ville: string;
  description?: string; imageUrl: string[]; imageStorageIds?: string[];
  sellerd: string; sellerName?: string; sellerAvatar?: string;
  sellerPhone?: string; sellerEmail?: string; sellerRating?: number;
  status?: 'disponible' | 'vendu' | 'inactif';
  condition?: string; paymentMethods?: string[];
  isShippingAvailable?: boolean; isNegotiable?: boolean;
}): Promise<string> {
  const now = Date.now();
  const search = [args.titre, args.categorie, args.ville, args.description || '']
    .join(' ').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 30);
  const ref_ = await addDoc(collection(db, 'annonces'), {
    ...args,
    status:              args.status || 'disponible',
    searchekeywords:     search,
    views:               0,
    favorites:           0,
    isNegotiable:        args.isNegotiable        ?? true,
    isShippingAvailable: args.isShippingAvailable ?? true,
    imageNeedsReupload:  false,
    createdAt:           now,
    updatedAt:           now,
  });
  return ref_.id;
}

/** Remplace : useMutation(api.products.updateAnnonce) */
export async function updateAnnonce(id: string, patch: Partial<DocumentData>) {
  await updateDoc(doc(db, 'annonces', id), { ...patch, updatedAt: Date.now() });
}

/** Remplace : useMutation(api.products.deleteAnnonce) */
export async function deleteAnnonce(id: string) {
  await deleteDoc(doc(db, 'annonces', id));
}

// =============================================================
// UTILISATEURS — HOOKS & MUTATIONS
// =============================================================

/** Remplace : useQuery(api.products.getUserProfile, { uid }) */
export function useGetUserProfile(uid: string | null) {
  return useSnapshot<ReturnType<typeof normalizeUser> | null>(cb => {
    if (!uid) { cb(null); return () => {}; }
    const q = query(collection(db, 'users'), where('uid', '==', uid), limit(1));
    return onSnapshot(q, snap => {
      if (snap.empty) { cb(null); return; }
      const d = snap.docs[0];
      cb(normalizeUser(d.data(), d.id));
    });
  }, [uid]);
}

/** Remplace : useMutation(api.products.upsertUserProfile) */
export async function upsertUserProfile(args: {
  uid: string; nom: string; email: string;
  tel?: string; photoURL?: string; location?: string;
  orangeMoney?: string; sellerMode?: boolean;
}) {
  const now = Date.now();
  // Chercher si le profil existe déjà
  const q = query(collection(db, 'users'), where('uid', '==', args.uid), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { ...args, updatedAt: now });
  } else {
    await addDoc(collection(db, 'users'), { ...args, createdAt: now, updatedAt: now });
  }
}

// =============================================================
// CHATS & MESSAGES — HOOKS & MUTATIONS
// =============================================================

/** Remplace : useQuery(api.products.listChats, { uid }) */
export function useListChats(uid: string) {
  const [chats, setChats] = useState<ReturnType<typeof normalizeChat>[]>([]);
  useEffect(() => {
    if (!uid) { setChats([]); return; }
    const map = new Map<string, ReturnType<typeof normalizeChat>>();
    const merge = () => {
      setChats(Array.from(map.values()).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)));
    };
    const qA = query(collection(db, 'chats'), where('participantA', '==', uid), orderBy('lastMessageAt', 'desc'), limit(100));
    const qB = query(collection(db, 'chats'), where('participantB', '==', uid), orderBy('lastMessageAt', 'desc'), limit(100));
    const unsubA = onSnapshot(qA, snap => { snap.docs.forEach(d => map.set(d.id, normalizeChat(d.data(), d.id))); merge(); });
    const unsubB = onSnapshot(qB, snap => { snap.docs.forEach(d => map.set(d.id, normalizeChat(d.data(), d.id))); merge(); });
    return () => { unsubA(); unsubB(); };
  }, [uid]);
  return chats;
}

/** Remplace : useQuery(api.products.listMessages, { chatId }) */
export function useListMessages(chatId: string | null) {
  return useSnapshot<ReturnType<typeof normalizeMessage>[]>(cb => {
    if (!chatId) { cb([]); return () => {}; }
    const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('createdAt', 'asc'), limit(200));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => normalizeMessage(d.data(), d.id)));
    });
  }, [chatId]);
}

/** Remplace : useMutation(api.products.ensureChat) → retourne l'ID du chat */
export async function ensureChat(args: {
  currentUserId: string; otherUserId: string;
  productId?: string; productTitle?: string; productImageUrl?: string;
}): Promise<string> {
  const participants = [args.currentUserId, args.otherUserId].sort();
  const participantsKey = participants.join('_');
  const q = query(collection(db, 'chats'), where('participantsKey', '==', participantsKey), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;
  const now = Date.now();
  const ref_ = await addDoc(collection(db, 'chats'), {
    participants,
    participantA:    participants[0],
    participantB:    participants[1],
    participantsKey,
    productId:       args.productId       || null,
    productTitle:    args.productTitle     || null,
    productImageUrl: args.productImageUrl  || null,
    lastMessage:     '',
    lastMessageAt:   now,
    lastSenderId:    args.currentUserId,
    unreadBy:        { [args.currentUserId]: 0, [args.otherUserId]: 0 },
    createdAt:       now,
    updatedAt:       now,
  });
  return ref_.id;
}

/** Remplace : useMutation(api.products.sendMessage) */
export async function sendMessage(args: {
  chatId: string; senderId: string; receiverId: string;
  text: string; type?: 'text' | 'image' | 'offer';
  offerAmount?: number; imageUrl?: string;
}) {
  const now = Date.now();
  await addDoc(collection(db, 'messages'), {
    chatId:       args.chatId,
    conversationId: args.chatId,
    senderId:     args.senderId,
    receiverId:   args.receiverId,
    text:         args.text,
    content:      args.text,
    type:         args.type || 'text',
    offerAmount:  args.offerAmount || null,
    imageUrl:     args.imageUrl    || null,
    read:         false,
    createdAt:    now,
  });
  const chatRef = doc(db, 'chats', args.chatId);
  const chatSnap = await getDoc(chatRef);
  if (chatSnap.exists()) {
    const unreadBy = { ...(chatSnap.data().unreadBy || {}), [args.receiverId]: (chatSnap.data().unreadBy?.[args.receiverId] || 0) + 1 };
    await updateDoc(chatRef, { lastMessage: args.text, lastMessageAt: now, lastSenderId: args.senderId, unreadBy, updatedAt: now });
  }
}

// =============================================================
// FAVORIS — HOOKS & MUTATIONS
// =============================================================

/** Remplace : useQuery(api.products.listFavorites, { uid }) */
export function useListFavorites(uid: string) {
  const [favorites, setFavorites] = useState<ReturnType<typeof normalizeProduct>[]>([]);
  useEffect(() => {
    if (!uid) { setFavorites([]); return; }
    const q = query(collection(db, 'favoris'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(q, async snap => {
      const results: ReturnType<typeof normalizeProduct>[] = [];
      for (const fav of snap.docs) {
        const annonce = await getDoc(doc(db, 'annonces', fav.data().annonceId));
        if (annonce.exists()) results.push(normalizeProduct(annonce.data(), annonce.id));
      }
      setFavorites(results);
    });
  }, [uid]);
  return favorites;
}

/** Remplace : useMutation(api.products.toggleFavorite) → retourne true si ajouté, false si retiré */
export async function toggleFavorite(args: { uid: string; annonceId: string }): Promise<boolean> {
  const favId = `${args.uid}_${args.annonceId}`;
  const favRef = doc(db, 'favoris', favId);
  const snap = await getDoc(favRef);
  if (snap.exists()) {
    await deleteDoc(favRef);
    return false; // retiré
  }
  await setDoc(favRef, { uid: args.uid, annonceId: args.annonceId, createdAt: Date.now() });
  return true; // ajouté
}

// =============================================================
// COMMANDES — HOOKS & MUTATIONS
// =============================================================

/** Remplace : useQuery(api.products.listOrders, { uid }) */
export function useListOrders(uid: string) {
  const [orders, setOrders] = useState<ReturnType<typeof normalizeOrder>[]>([]);
  useEffect(() => {
    if (!uid) { setOrders([]); return; }
    const map = new Map<string, ReturnType<typeof normalizeOrder>>();
    const merge = () => setOrders(Array.from(map.values()));
    const qB = query(collection(db, 'commandes'), where('acheteurId', '==', uid), orderBy('createdAt', 'desc'), limit(100));
    const qV = query(collection(db, 'commandes'), where('vendeurId', '==', uid), orderBy('createdAt', 'desc'), limit(100));
    const unsubB = onSnapshot(qB, s => { s.docs.forEach(d => map.set(d.id, normalizeOrder(d.data(), d.id))); merge(); });
    const unsubV = onSnapshot(qV, s => { s.docs.forEach(d => map.set(d.id, normalizeOrder(d.data(), d.id))); merge(); });
    return () => { unsubB(); unsubV(); };
  }, [uid]);
  return orders;
}

// =============================================================
// NOTIFICATIONS — HOOK
// =============================================================

/** Remplace : useQuery(api.products.listNotifications, { uid }) */
export function useListNotifications(uid: string) {
  return useSnapshot<ReturnType<typeof normalizeNotification>[]>(cb => {
    if (!uid) { cb([]); return () => {}; }
    const q = query(collection(db, 'notifications'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => normalizeNotification(d.data(), d.id)));
    });
  }, [uid]);
}

// =============================================================
// AUTH — connexion / inscription / déconnexion
// =============================================================

export async function connexionEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function inscriptionEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function deconnexion() {
  return signOut(auth);
}

export function onAuthChange(callback: (user: any) => void) {
  return onAuthStateChanged(auth, callback);
}

export function useCurrentUser() {
  const [user, setUser] = useState(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

// =============================================================
// TABLE DE CORRESPONDANCE CONVEX → FIREBASE
// =============================================================
// Pour référence lors de la migration des composants :
//
// useQuery(api.products.listAnnonces)
//   → useListAnnonces()
//
// useQuery(api.products.listAnnoncesByCategory, { categorie })
//   → useListAnnoncesByCategory(categorie)
//
// useQuery(api.products.listUserAnnonces, { uid })
//   → useListUserAnnonces(uid)
//
// useQuery(api.products.getAnnonceById, { id })
//   → useGetAnnonceById(id)
//
// useMutation(api.products.createAnnonce)
//   → createAnnonce(args)   [appel direct, pas de hook]
//
// useMutation(api.products.generateUploadUrl)
// + storageUpload
//   → uploadImageToStorage(localUri, `annonces/${uid}/${Date.now()}.jpg`)
//
// useQuery(api.products.getUserProfile, { uid })
//   → useGetUserProfile(uid)
//
// useMutation(api.products.upsertUserProfile)
//   → upsertUserProfile(args)
//
// useQuery(api.products.listChats, { uid })
//   → useListChats(uid)
//
// useQuery(api.products.listMessages, { chatId })
//   → useListMessages(chatId)
//
// useMutation(api.products.ensureChat)
//   → ensureChat(args)
//
// useMutation(api.products.sendMessage)
//   → sendMessage(args)
//
// useQuery(api.products.listFavorites, { uid })
//   → useListFavorites(uid)
//
// useMutation(api.products.toggleFavorite)
//   → toggleFavorite(args)
//
// useQuery(api.products.listOrders, { uid })
//   → useListOrders(uid)
//
// useQuery(api.products.listNotifications, { uid })
//   → useListNotifications(uid)
// =============================================================
