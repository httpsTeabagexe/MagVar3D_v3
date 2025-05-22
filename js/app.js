/**
 * app.js - Main application logic (adapted from Cambecc's earth.js)
 */

// Assume all necessary libraries (d3, underscore, backbone, topojson, when, geomagnetism, micro, globes, products, svg-globe-cambecc, magvar-canvas-overlay) are loaded globally via script tags in index.html

(function() {
    "use strict";

    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const HOUR = 60 * MINUTE;
    const MAX_TASK_TIME = 100; // amount of time before a task yields control (millis)
    const MIN_SLEEP_TIME = 25; // amount of time a task waits before resuming (millis)
    const MIN_MOVE = 4; // slack before a drag operation beings (pixels)
    const MOVE_END_WAIT = 1000; // time to wait for a move operation to be considered done (millis)

    // Use the globally available utility functions and objects
    const view = µ.view();
    const log = µ.log();

    // report object will be initialized within DOMContentLoaded
    let report = null;

    // Simplified Agent pattern using when.js Promises and basic event triggering
    function newAgent() {
        // Check if when.js is properly loaded before creating promises
        if (typeof when === 'undefined' || typeof when.defer !== 'function') {
            const errorMsg = "when.js library is not properly loaded. Agent system cannot be initialized.";
            console.error(errorMsg);
            // Do not proceed with agent creation if when.js is missing
            // Throwing an error here will stop the script execution early if the dependency is not met
            throw new Error(errorMsg);
        }

        // Use when.js resolve to start the promise chain
        // Initialize with a resolved promise that handles potential initial errors
        let currentPromise = when.resolve().catch(error => {
             console.error("Initial agent promise chain error:", error);
             // Return a resolved promise to allow the chain to continue with submits
             return when.resolve();
        });

        let cancelRequested = false;
        const listeners = {};
        let currentValue = undefined; // Store the last resolved value

        const agent = {
            submit: function(task, ...args) {
                cancelRequested = true; // Cancel previous task

                // Use when.js promise chain for task submission
                currentPromise = currentPromise.then(() => { // Chain tasks sequentially
                    cancelRequested = false;
                    const cancel = { requested: false };
                    const d = when.defer(); // Use when.defer for the current task's promise

                    try {
                        // Execute task and resolve/reject the deferred based on task result
                        when.resolve(task.call({ cancel: cancel }, ...args)) // Wrap task result in a promise
                            .then(result => {
                                // Task completed successfully
                                if (!cancel.requested) {
                                    currentValue = result; // Update cached value
                                    agent.trigger("update", result); // Trigger update event
                                    d.resolve(result); // Resolve the deferred
                                } else {
                                    d.reject("canceled"); // Reject if canceled
                                }
                            })
                            .catch(error => {
                                // Task failed
                                if (!cancel.requested) {
                                    agent.trigger("reject", error); // Trigger reject event
                                    if(report) report.error(error); else console.error("Error in agent task before report initialized:", error); // Report error
                                    d.reject(error); // Reject the deferred
                                } else {
                                    d.reject("canceled"); // Reject if canceled
                                }
                            });
                    } catch (error) {
                         // Handle synchronous errors during task execution
                         if(report) report.error(error); else console.error("Synchronous error in agent task before report initialized:", error);
                         d.reject(error); // Reject the deferred
                    }

                    return d.promise; // Return the promise from the deferred for chaining
                }).catch(error => { // Catch errors from the previous task in the chain
                     console.error("Error in agent promise chain step:", error);
                     // Return a resolved promise here to prevent the chain from breaking
                     // The individual task failure is handled by the previous .catch(error => { ... })
                     return when.resolve();
                });

                agent.trigger("submit"); // Trigger submit event
                return currentPromise; // Return the promise for external chaining if needed
            },
            cancel: function() { cancelRequested = true; },
            on: function(event, handler) { listeners[event] = listeners[event] || []; listeners[event].push(handler); },
            listenTo: function(otherAgent, events, handler) { otherAgent.on(events, handler); },
            value: function() { return currentValue; }, // Return the last resolved value
            trigger: function(eventName, ...args) { (listeners[eventName] || []).forEach(handler => handler(...args)); }
        };
        return agent;
    }

    // Simplified Configuration using Backbone.Model and hash fragment sync
    // Assumes Backbone is loaded globally
    const Configuration = Backbone.Model.extend({
         // Default attributes - adapt to your project's needs
        defaults: {
            projection: 'orthographic',
            overlayType: 'default',
            showGridPoints: true,
            date: 'current',
            hour: '',
            // Add default magnetic variation settings
            magvarResolution: 8,
            magvarYear: new Date().getFullYear(),
            showMagVarOverlay: true // Assuming checkbox is initially checked
        },

        // Sync with hash fragment (simplified)
        sync: function(method, model, options) {
            if (method === 'read') {
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const attributes = {};
                for (const [key, value] of params) {
                    attributes[key] = decodeURIComponent(value);
                }
                model.set(attributes, { silent: true });
                options.success(model);
            } else if (method === 'update') {
                 if (options.source !== 'moveEnd') { // Prevent hash change on drag end
                    const attributes = model.toJSON();
                    const hash = Object.keys(attributes)
                        .map(key => `${key}=${encodeURIComponent(attributes[key])}`)
                        .join('&');
                    window.location.hash = hash;
                }
                options.success(model);
            } else {
                options.error('Sync method not supported');
            }
        }
    });
    const configuration = new Configuration();

    // Agents
    let meshAgent;
    let globeAgent;
    let magneticModelAgent;
    let rendererAgent;

    // --- Adapted from earth.js core functions ---

    function buildInputController(globe) {
        // Simplified input controller using D3 drag and zoom directly on the #display element
        const displayElement = d3.select('#display');

        // Ensure zoom behavior is created only once per globe
        if (displayElement.__on__('wheel.zoom')) { // Check if zoom is already attached
            displayElement.on('.zoom', null); // Remove existing zoom handlers
        }

        const zoom = d3.behavior.zoom()
            .scaleExtent(globe.scaleExtent())
            .on("zoom", function() {
                const event = d3.event;
                const currentMouse = d3.mouse(this);
                const currentScale = event.scale;

                // Apply zoom and get the new rotation (simplified manipulator logic)
                const newRotation = globe.manipulator(currentMouse, currentScale).move(currentMouse, currentScale);
                globe.projection.rotate(newRotation);

                 // Trigger rendering updates on move
                rendererAgent.trigger("render"); // Trigger the main render function
            });

         // Attach zoom behavior to the display element
        displayElement.call(zoom);

         // Handle click events for location details
        displayElement.on("click", function() {
            const mouse = d3.mouse(this);
            const coord = globe.projection.invert(mouse);
             // showLocationDetails is not implemented in this simplified version
             // You can add logic here to display clicked coordinates if needed
             console.log('Clicked at screen coordinates:', mouse, 'geographic coordinates:', coord);
             const coordDisplay = document.getElementById('clicked-coordinates');
             if (coordDisplay && coord) coordDisplay.textContent = `Lat: ${coord[1]?.toFixed(2)}°, Lon: ${coord[0]?.toFixed(2)}°`;
        });

        // Simplified dispatch - mainly for moveEnd to save orientation
        const dispatch = {
            globe: function(_) { if (_) { globe = _; zoom.scaleExtent(globe.scaleExtent()).scale(globe.projection.scale()); } return globe; },
            trigger: function(eventName, ...args) { console.log(`Input controller event: ${eventName}`, ...args); }
        };

        // Debounce moveEnd to save orientation after user stops interacting
        const signalEnd = _.debounce(function() {
            if (globe) {
                 // Save orientation after a move ends
                 configuration.save({orientation: globe.projection.rotate()}, {source: "moveEnd"});
                 dispatch.trigger("moveEnd"); // Trigger moveEnd event
            }
        }, MOVE_END_WAIT);

        // Trigger signalEnd on zoomend (end of drag or zoom)
        zoom.on("zoomend", signalEnd);

        return dispatch;
    }

    /**
     * @param resource the GeoJSON resource's URL
     * @returns {Object} a promise for GeoJSON topology features (simplified: just returns fetched data)
     */
    function buildMesh(resource) {
        if(report) report.status("Downloading land data..."); else console.log("Downloading land data...");
        // Use globally available fetch
        return fetch(resource)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch mesh data');
                return response.json();
            })
            .then(topo => {
                if(report) report.status(""); else console.log("Finished downloading land data.");
                 // Return the fetched topojson data
                return topo;
            })
            .catch(error => { if(report) report.error(error); else console.error("Error in buildMesh before report initialized:", error); throw error; }); // Report error here
    }

    /**
     * @param {String} projectionName the desired projection's name.
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName) {
        if(report) report.status("Building globe..."); else console.log("Building globe...");
         // Use the globally available globes object and its get method
        const builder = globes.get(projectionName);

        if (!builder) {
             const errorMsg = "Unknown projection: " + projectionName;
            if(report) report.error(errorMsg); else console.error(errorMsg);
            return when.reject(errorMsg); // Use when.reject
        }

         // Use the builder function from globes.js to create the globe object
        const globe = builder(µ.view());

        if(report) report.status(""); else console.log("Finished building globe.");
        return when.resolve(globe); // Use when.resolve
    }

    // Function to load and initialize the magnetic model
    function loadMagneticModel() {
         console.log('loadMagneticModel called');
         // Call the globally available updateMagneticModel from magvar-canvas-overlay.js
         if (window.updateMagneticModel) {
            window.updateMagneticModel();
            return when.resolve(true); // Use when.resolve
         } else {
             const errorMsg = "updateMagneticModel not available globally.";
             console.error(errorMsg);
            if(report) report.error(errorMsg); // Report error if report is initialized
            return when.reject(errorMsg); // Use when.reject
         }
    }

    // Main rendering function - called when globe or data updates
    function render() {
        console.log('Main render called');
        const mesh = meshAgent.value();
        const globe = globeAgent.value();

        if (!mesh || !globe) {
             console.log('Render: Mesh or Globe not available');
            return;
        }

        if(report) report.status("Rendering..."); else console.log("Rendering...");

        // Use setupSvgGlobe to render the basic globe features
        const displayContainer = document.getElementById('display');
        if (displayContainer) {
             // Pass the mesh data (topojson object) to setupSvgGlobe
             // setupSvgGlobe expects a GeoJSON object for land, so we might need to adapt this
             // For now, assuming setupSvgGlobe can handle the topojson object directly or expects a specific format.
            setupSvgGlobe(displayContainer, mesh);

             // Call the globally available renderMagvarOverlay to draw the magnetic variation
            if (window.renderMagvarOverlay) {
                 renderMagvarOverlay();
            } else {
                 const errorMsg = "renderMagvarOverlay not available globally.";
                 console.error(errorMsg);
                if(report) report.error(errorMsg); // Report error if report is initialized
            }

        } else {
             const errorMsg = "#display container not found for rendering.";
             console.error(errorMsg);
             if(report) report.error(errorMsg); // Report error if report is initialized
        }

        if(report) report.status(""); else console.log("Rendering finished.");
    }


    // --- Event Wiring (adapted from earth.js) ---

    // Initial setup when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired');

        // Initialize report object after DOM is ready
        report = (function() {
            const s = d3.select("#status"), p = d3.select("#progress"), total = 22;
            return {
                status: function(msg) { return s.classed("bad") ? s : s.text(msg); },
                error: function(err) { log.error(err); return s.classed("bad", true).text(err); },
                reset: function() { return s.classed("bad", false).text(""); },
                progress: function(amount) { if (0 <= amount && amount < 1) { const i = Math.ceil(amount * total); const bar = "▪".repeat(i) + "▫".repeat(total - i); return p.classed("invisible", false).text(bar); } return p.classed("invisible", true).text(""); }
            };
        })();
         console.log('Report object initialized.');

         // Check if when.js is properly loaded before proceeding with agent tasks
        if (typeof when === 'undefined' || typeof when.defer !== 'function') {
            const errorMsg = "when.js library is not properly loaded. Please ensure when.js is included via a script tag and exposes 'when' globally.";
            console.error(errorMsg);
            report.error(errorMsg); // Use the initialized report object
            return; // Stop execution if when.js is not available
        }
        console.log('when.js is loaded correctly.');

        // Initialize agents after when.js is confirmed to be loaded
        meshAgent = newAgent();
        globeAgent = newAgent();
        magneticModelAgent = newAgent();
        rendererAgent = newAgent();

        // Fetch initial configuration from hash
        configuration.fetch();

        // Build mesh data first
        meshAgent.submit(buildMesh, './MagVar3D_v3/ne_110m_land.geojson'); // Use your land data path

        // Build globe after mesh data is ready
        globeAgent.listenTo(meshAgent, 'update', (mesh) => {
            if (mesh) {
                 // Use the projection name from the configuration
                 globeAgent.submit(buildGlobe, configuration.get('projection'));
            }
        });

        // Initialize input controller after globe is built
        let inputController = null; // Declare inputController
        globeAgent.on('update', (globe) => {
            if (globe) {
                inputController = buildInputController(globe);
                 // Create the magvar overlay canvas after the globe is ready
                 const displayContainer = document.getElementById('display');
                 if (displayContainer && globe.projection) {
                     if (window.createMagvarOverlay) {
                         // Pass the display container and the globe's projection
                         window.createMagvarOverlay(displayContainer, globe.projection);
                     } else {
                          console.error("createMagvarOverlay not available globally.");
                     }
                 } else {
                      console.error("#display container or globe/projection not found for overlay creation.");
                 }

            }
        });

        // Load magnetic model after globe is built
        magneticModelAgent.listenTo(globeAgent, 'update', (globe) => {
            if (globe) {
                 magneticModelAgent.submit(loadMagneticModel);
            }
        });

        // Trigger rendering when globe, mesh data, or magnetic model updates
        // This is a simplified trigger - in a real app, rendering would be more orchestrated
        rendererAgent.listenTo(globeAgent, 'update', render);
        rendererAgent.listenTo(meshAgent, 'update', render);
        magneticModelAgent.on('update', render);

        // --- Sidebar and Control Wiring ---

         // Wire up the magvar toggle checkbox
        const magvarToggle = document.getElementById('toggle-magvar-overlay');
        if (magvarToggle) {
             console.log('Wiring up magvar toggle');
             // Set initial state based on config (assuming default is checked in HTML)
            magvarToggle.checked = configuration.get('showMagVarOverlay');

            magvarToggle.addEventListener('change', () => {
                const isChecked = magvarToggle.checked;
                console.log('Magvar toggle changed:', isChecked);
                 // Call the globally available toggleMagvarOverlay
                if (window.toggleMagvarOverlay) {
                     window.toggleMagvarOverlay(isChecked);
                }
                 // Update config
                configuration.save({showMagVarOverlay: isChecked});
            });
        }

         // Wire up year input
        const yearInput = document.getElementById('magvar-year');
        if (yearInput) {
             console.log('Wiring up year input');
             // Set initial value based on config
             yearInput.value = configuration.get('magvarYear') || new Date().getFullYear();

            yearInput.addEventListener('change', () => {
                const year = parseInt(yearInput.value);
                if (year >= 1900 && year <= 2030) {
                    console.log('Year changed to:', year);
                     // Call the globally available setMagvarYear
                    if (window.setMagvarYear) {
                         window.setMagvarYear(year);
                         // render() is called within setMagvarYear via updateMagneticModel
                    }
                     // Update config
                    configuration.save({magvarYear: year});
                } else {
                    alert("Please enter a year between 1900 and 2030.");
                }
            });
        }

         // Wire up resolution slider
        const resolutionSlider = document.getElementById('magvar-resolution');
        if (resolutionSlider) {
             console.log('Wiring up resolution slider');
             // Set initial value based on config
             resolutionSlider.value = configuration.get('magvarResolution') || 8;

            resolutionSlider.addEventListener('input', () => {
                const resolution = parseInt(resolutionSlider.value);
                console.log('Resolution changed to:', resolution);
                 // Call the globally available setMagvarResolution
                if (window.setMagvarResolution) {
                     window.setMagvarResolution(resolution);
                     // render() is called within setMagvarResolution
                }
                 // Update config
                configuration.save({magvarResolution: resolution});
            });
        }

        // --- Sidebar Panel Functionality (Adapt your previous logic) ---
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        const panels = document.querySelectorAll('.sidebar-content-panel');
        const hidePanelButtons = document.querySelectorAll('.hide-panel-button');
        const body = document.body;

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetPanelId = item.dataset.panel;

                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                panels.forEach(panel => panel.classList.remove('visible'));

                const targetPanel = document.getElementById(`panel-${targetPanelId}`);
                if (targetPanel) {
                    targetPanel.classList.add('visible');
                }

                body.classList.add('panel-visible');
            });
        });

        hidePanelButtons.forEach(button => {
            button.addEventListener('click', () => {
                panels.forEach(panel => panel.classList.remove('visible'));

                sidebarItems.forEach(i => i.classList.remove('active'));

                body.classList.remove('panel-visible');
            });
        });

    });

    // --- Start the application by fetching initial config ---
    // This is done within the DOMContentLoaded listener

})();
