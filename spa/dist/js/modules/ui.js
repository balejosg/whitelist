/**
 * UI Management (Screens, Modals, Tabs)
 */
export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId)?.classList.remove('hidden');
}
export function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}
export function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}
export function initModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                closeModal(modal.id);
        });
    });
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });
}
//# sourceMappingURL=ui.js.map