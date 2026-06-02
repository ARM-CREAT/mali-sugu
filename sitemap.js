// ============================================================
// MALI SUGU — Sitemap dynamique pour SEO
// Vercel function : api/sitemap.js
// Génère automatiquement le sitemap.xml avec tous les produits
// ============================================================
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
      })
    });
  } catch (e) { console.warn('Firebase Admin init:', e.message); }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const baseUrl = 'https://mali-sugu.vercel.app';
  let urls = [
    { loc: baseUrl + '/', priority: '1.0', changefreq: 'hourly' },
    { loc: baseUrl + '/#catalogue', priority: '0.9', changefreq: 'hourly' },
    { loc: baseUrl + '/#vendre', priority: '0.8', changefreq: 'daily' },
    { loc: baseUrl + '/privacy-policy.html', priority: '0.3', changefreq: 'monthly' },
    { loc: baseUrl + '/delete-account.html', priority: '0.3', changefreq: 'monthly' }
  ];

  // Ajouter les produits dynamiques depuis Firestore
  try {
    if (admin.apps.length) {
      const db = admin.firestore();
      const snap = await db.collection('produits')
        .where('statut', '==', 'actif')
        .orderBy('created_at', 'desc')
        .limit(500)
        .get();

      snap.forEach(doc => {
        const p = doc.data();
        urls.push({
          loc: `${baseUrl}/#produit-${doc.id}`,
          priority: '0.7',
          changefreq: 'weekly',
          lastmod: p.created_at ? p.created_at.toDate().toISOString().split('T')[0] : null
        });
      });
    }
  } catch (e) {
    console.warn('Sitemap Firestore error:', e.message);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? '\n    <lastmod>' + u.lastmod + '</lastmod>' : ''}
  </url>`).join('\n')}
</urlset>`;

  res.status(200).send(xml);
};
