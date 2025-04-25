// js/sidebar-ui.js

function initializeSidebarInteractions() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const contentPanels = document.querySelectorAll('.sidebar-content-panel');
    const hideButtons = document.querySelectorAll('.hide-panel-button');
    const toggleTopBarButton = document.getElementById('toggle-top-bar');
    const toggleWidgetPanelButton = document.getElementById('toggle-widget-panel');
    const bodyElement = document.body; // Needed for panel-visible and top-bar toggle

    let lastOpenedPanelId = null;
    const defaultPanelId = 'search-panel';

    // --- DOM Element Checks ---
    if (!sidebarItems.length || !contentPanels.length) {
        console.error("Sidebar items or content panels not found."); return;
    }
    if (!toggleTopBarButton) console.warn("Top bar toggle button not found.");
    if (!toggleWidgetPanelButton) console.warn("Widget panel toggle button (#toggle-widget-panel) not found.");


    // --- Helper Functions ---

    function setActiveWidgetButtonState(isActive) {
        if (toggleWidgetPanelButton) {
            toggleWidgetPanelButton.classList.toggle('active', isActive);
        }
    }

    function hideActivePanel() {
        const activeItem = document.querySelector('.sidebar-item.active');
        const visiblePanel = document.querySelector('.sidebar-content-panel.visible');

        if (activeItem) activeItem.classList.remove('active');
        if (visiblePanel) visiblePanel.classList.remove('visible');
        bodyElement.classList.remove('panel-visible'); // <-- REINSTATED
        setActiveWidgetButtonState(false);
        console.log("Panel hidden.");
    }

    function showPanel(targetPanelId) {
        const targetPanel = document.getElementById(targetPanelId);
        if (!targetPanel) {
            console.warn(`Target panel with ID "${targetPanelId}" not found.`);
            return;
        }
        const targetSidebarItem = document.querySelector(`.sidebar-item[data-panel="${targetPanelId}"]`);

        // Deactivate previous items/panels
        sidebarItems.forEach(i => i.classList.remove('active'));
        contentPanels.forEach(panel => panel.classList.remove('visible'));

        // Activate target item/panel
        if (targetSidebarItem) targetSidebarItem.classList.add('active');
        targetPanel.classList.add('visible');
        bodyElement.classList.add('panel-visible'); // <-- REINSTATED
        setActiveWidgetButtonState(true);

        console.log(`Panel shown: ${targetPanelId}`);
    }

    // --- Event Listeners ---

    // Sidebar Item Clicks
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPanelId = item.dataset.panel;
            if (!targetPanelId) return;
            const isAlreadyActive = item.classList.contains('active');
            if (isAlreadyActive) {
                hideActivePanel();
            } else {
                lastOpenedPanelId = targetPanelId; // Still useful for widget toggle
                showPanel(targetPanelId);
            }
        });
    });

    // Hide Button (X) Clicks
    hideButtons.forEach(button => {
        button.addEventListener('click', () => {
            hideActivePanel();
        });
    });

    // Top Bar Toggle Click
    if (toggleTopBarButton) {
        toggleTopBarButton.addEventListener('click', () => {
            bodyElement.classList.toggle('top-bar-hidden');
            console.log(`Top bar hidden: ${bodyElement.classList.contains('top-bar-hidden')}`);
            // Trigger resize after transition to ensure globe resizes correctly
            setTimeout(() => window.dispatchEvent(new Event('resize')), 260); // Slightly longer than CSS transition
        });
    }

    // Widget Panel Toggle Button Click (#toggle-widget-panel)
    if (toggleWidgetPanelButton) {
        toggleWidgetPanelButton.addEventListener('click', () => {
            // Check visibility based on panel's class
            const isPanelVisible = document.querySelector('.sidebar-content-panel.visible');

            if (isPanelVisible) {
                hideActivePanel();
            } else {
                const panelToShow = lastOpenedPanelId || defaultPanelId;
                const itemToActivate = document.querySelector(`.sidebar-item[data-panel="${panelToShow}"]`);
                if (itemToActivate) {
                    showPanel(panelToShow); // Handles activating item and button
                } else {
                    console.warn(`Cannot open panel: Sidebar item for panel ID "${panelToShow}" not found.`);
                }
            }
        });
    }


    // --- Initial State Check ---
    const initiallyVisiblePanel = document.querySelector('.sidebar-content-panel.visible');
    const initiallyActiveItem = document.querySelector('.sidebar-item.active');

    if (initiallyVisiblePanel && initiallyActiveItem) {
        bodyElement.classList.add('panel-visible'); // <-- REINSTATED
        setActiveWidgetButtonState(true);
        lastOpenedPanelId = initiallyVisiblePanel.id;
        if (initiallyActiveItem.dataset.panel !== initiallyVisiblePanel.id) {
            console.warn("Initial active item and visible panel mismatch.");
            // Optionally correct state here if needed
            const correctItem = document.querySelector(`.sidebar-item[data-panel="${initiallyVisiblePanel.id}"]`);
            if(initiallyActiveItem) initiallyActiveItem.classList.remove('active');
            if(correctItem) correctItem.classList.add('active');
            else initiallyVisiblePanel.classList.remove('visible'); // Hide panel if no matching item
        }
    } else {
        bodyElement.classList.remove('panel-visible'); // <-- REINSTATED
        setActiveWidgetButtonState(false);
        if(initiallyActiveItem) initiallyActiveItem.classList.remove('active');
        if(initiallyVisiblePanel) initiallyVisiblePanel.classList.remove('visible');
    }

    // Ensure top bar is initially visible
    bodyElement.classList.remove('top-bar-hidden');

    console.log("Sidebar interactions initialized (with panel visibility logic).");
}

document.addEventListener('DOMContentLoaded', initializeSidebarInteractions);
