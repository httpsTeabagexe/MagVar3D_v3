// js/sidebar-ui.js

function initializeSidebarInteractions() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const contentPanels = document.querySelectorAll('.sidebar-content-panel');

    if (!sidebarItems.length || !contentPanels.length) {
        console.error("Sidebar items or content panels not found.");
        return;
    }

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPanelId = item.dataset.panel; // Get the ID from data-panel attribute
            if (!targetPanelId) {
                console.warn("Sidebar item clicked has no data-panel attribute:", item);
                return;
            }

            const targetPanel = document.getElementById(targetPanelId);

            if (!targetPanel) {
                console.warn(`Target panel with ID "${targetPanelId}" not found.`);
                return;
            }

            // 1. Update Active State for Sidebar Items
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 2. Update Visibility for Content Panels
            contentPanels.forEach(panel => {
                if (panel.id === targetPanelId) {
                    panel.classList.add('visible');
                } else {
                    panel.classList.remove('visible');
                }
            });
        });
    });

    // Optional: Ensure the initial state is correct (though HTML should handle it)
    // const initialActiveItem = document.querySelector('.sidebar-item.active');
    // const initialVisiblePanel = document.querySelector('.sidebar-content-panel.visible');
    // if (initialActiveItem && !initialVisiblePanel) {
    //     const initialPanelId = initialActiveItem.dataset.panel;
    //     const panelToShow = document.getElementById(initialPanelId);
    //     if (panelToShow) panelToShow.classList.add('visible');
    // } else if (!initialActiveItem && initialVisiblePanel) {
    //     // This case is less likely if HTML is set up correctly
    //     initialVisiblePanel.classList.remove('visible');
    // }

    console.log("Sidebar interactions initialized.");
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeSidebarInteractions);

// Note: No need to export anything unless called from another module