// Global client-side JavaScript

// Auto-dismiss flash messages after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[role="alert"]').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 5000);
  });
});

// Confirm dangerous actions
document.querySelectorAll('form[data-confirm]').forEach(form => {
  form.addEventListener('submit', (e) => {
    if (!confirm(form.dataset.confirm)) {
      e.preventDefault();
    }
  });
});
