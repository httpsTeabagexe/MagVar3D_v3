function initializeSidebarInteractions() {
                const sidebarItems = document.querySelectorAll('.sidebar-item');
                const contentPanels = document.querySelectorAll('.sidebar-content-panel');
                const hideButtons = document.querySelectorAll('.hide-panel-button');
                const toggleTopBarButton = document.getElementById('toggle-top-bar');
                const toggleWidgetPanelButton = document.getElementById('toggle-widget-panel');
                const bodyElement = document.body;

                let lastOpenedPanelId = null;
                const defaultPanelId = 'search-panel';

                if (!sidebarItems.length || !contentPanels.length) {
                    console.error("Sidebar items or content panels not found.");
                    return;
                }

                function setActiveWidgetButtonState(isActive) {
                    toggleWidgetPanelButton?.classList.toggle('active', isActive);
                }

                function hideActivePanel() {
                    document.querySelector('.sidebar-item.active')?.classList.remove('active');
                    document.querySelector('.sidebar-content-panel.visible')?.classList.remove('visible');
                    bodyElement.classList.remove('panel-visible');
                    setActiveWidgetButtonState(false);
                }

                function showPanel(targetPanelId) {
                    const targetPanel = document.getElementById(targetPanelId);
                    if (!targetPanel) return console.warn(`Panel "${targetPanelId}" not found.`);

                    sidebarItems.forEach(i => i.classList.remove('active'));
                    contentPanels.forEach(panel => panel.classList.remove('visible'));

                    document.querySelector(`.sidebar-item[data-panel="${targetPanelId}"]`)?.classList.add('active');
                    targetPanel.classList.add('visible');
                    bodyElement.classList.add('panel-visible');
                    setActiveWidgetButtonState(true);
                }

                sidebarItems.forEach(item => {
                    item.addEventListener('click', () => {
                        const targetPanelId = item.dataset.panel;
                        if (!targetPanelId) return;
                        item.classList.contains('active') ? hideActivePanel() : showPanel(targetPanelId);
                        lastOpenedPanelId = targetPanelId;
                    });
                });

                hideButtons.forEach(button => button.addEventListener('click', hideActivePanel));

                toggleTopBarButton?.addEventListener('click', () => {
                    bodyElement.classList.toggle('top-bar-hidden');
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
                });

                toggleWidgetPanelButton?.addEventListener('click', () => {
                    const isPanelVisible = document.querySelector('.sidebar-content-panel.visible');
                    isPanelVisible ? hideActivePanel() : showPanel(lastOpenedPanelId || defaultPanelId);
                });

                const initiallyVisiblePanel = document.querySelector('.sidebar-content-panel.visible');
                const initiallyActiveItem = document.querySelector('.sidebar-item.active');

                if (initiallyVisiblePanel && initiallyActiveItem) {
                    bodyElement.classList.add('panel-visible');
                    setActiveWidgetButtonState(true);
                    lastOpenedPanelId = initiallyVisiblePanel.id;
                } else {
                    bodyElement.classList.remove('panel-visible');
                    setActiveWidgetButtonState(false);
                }

                bodyElement.classList.remove('top-bar-hidden');
            }

            document.addEventListener('DOMContentLoaded', initializeSidebarInteractions);