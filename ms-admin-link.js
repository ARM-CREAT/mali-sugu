/* =============================================================
   MALI SUGU — Icône Admin discrète
   Affiche un petit ⚙️ en bas de page qui mène à admin.html
   Quasiment invisible pour les visiteurs normaux
   ============================================================= */
(function () {
  'use strict';

  // Attendre le chargement complet
  document.addEventListener('DOMContentLoaded', function () {
    // Crée l'icône
    var icon = document.createElement('a');
    icon.href = '/admin.html';
    icon.title = 'Administration';
    icon.style.cssText = [
      'position: fixed',
      'bottom: 8px',
      'right: 8px',
      'width: 22px',
      'height: 22px',
      'background: rgba(20, 164, 77, 0.15)',
      'color: #14a44d',
      'border-radius: 50%',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'font-size: 11px',
      'text-decoration: none',
      'z-index: 100',
      'opacity: 0.3',
      'transition: opacity 0.3s, background 0.3s',
      'border: 1px solid rgba(20, 164, 77, 0.2)'
    ].join(';');

    icon.innerHTML = '⚙';

    // Devient légèrement plus visible au survol (pour toi qui sais)
    icon.addEventListener('mouseenter', function () {
      icon.style.opacity = '1';
      icon.style.background = 'rgba(20, 164, 77, 0.9)';
      icon.style.color = '#fff';
    });
    icon.addEventListener('mouseleave', function () {
      icon.style.opacity = '0.3';
      icon.style.background = 'rgba(20, 164, 77, 0.15)';
      icon.style.color = '#14a44d';
    });

    document.body.appendChild(icon);
  });
})();
