import {setupSvgGlobe} from "./svg-globe-cambecc.js";
import {loadAllData} from './data.js';
import {config} from './config.js';

let svg, globeGroup, loadingText;

            function getSidebarWidth() {
                return document.getElementById('left-sidebar')?.offsetWidth || 0;
            }

            function showLoadingMessage(message, isError = false) {
                if (!svg) return console.warn("SVG not ready for loading message.");
                if (!loadingText) {
                    loadingText = svg.append('text')
                        .attr('class', 'loading-text')
                        .attr('x', config.width / 2)
                        .attr('y', config.height / 2)
                        .attr('text-anchor', 'middle')
                        .attr('dy', '0.35em')
                        .attr('fill', isError ? '#ff8888' : config.themes.light.landColor || '#ffffff');
                }
                loadingText.text(message).attr('fill', isError ? '#ff8888' : config.themes.light.landColor || '#ffffff').style('display', 'block');
            }

            function hideLoadingMessage() {
                loadingText?.style('display', 'none');
            }

            function setupGlobeWithData(landData) {
                setupSvgGlobe(
                    document.getElementById("globe-container"),
                    landData,
                    {
                        width: config.width || 900,
                        height: config.height || 900,
                        landColor: config.landColor || "#72B092",
                        oceanColor: config.oceanColor || "#001D3D",
                        landStrokeColor: config.landStrokeColor || "#333",
                        graticuleColor: config.graticuleColor || "#888",
                        graticuleOpacity: config.graticuleOpacity ?? 0.7
                    }
                );
            }

            function withLandData(action) {
                fetch("MagVar3D_v3/ne_110m_land.geojson")
                    .then(res => res.json())
                    .then(action);
            }

            function handleResize() {
                config.width = window.innerWidth - getSidebarWidth();
                config.height = window.innerHeight;

                if (svg) {
                    svg.attr('viewBox', `0 0 ${config.width} ${config.height}`);
                    globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);
                    withLandData(setupGlobeWithData);
                }
            }

            function init() {
                console.log("Initializing WGS84 Globe...");
                config.width = window.innerWidth - getSidebarWidth();
                config.height = window.innerHeight;

                showLoadingMessage('Loading Earth Data...');
                window.addEventListener('resize', handleResize);

                loadAllData()
                    .then(initialDataAvailable => {
                        if (initialDataAvailable) {
                            hideLoadingMessage();
                            withLandData(setupGlobeWithData);

                            let rotation = 0, rotationSpeed = 0;
                            document.getElementById('rotation-speed').addEventListener('input', (e) => {
                                rotationSpeed = e.target.value / 10;
                            });

                            function animate() {
                                if (rotationSpeed > 0) {
                                    rotation += rotationSpeed;
                                    globe.rotate(rotation, 0);
                                }
                                requestAnimationFrame(animate);
                            }
                            animate();
                        } else {
                            throw new Error("Essential low-resolution land data failed to load.");
                        }
                    })
                    .catch(error => {
                        console.error("Failed to initialize application:", error);
                        hideLoadingMessage();
                        showLoadingMessage('Error loading data. Please refresh.', true);
                    });
            }

            document.addEventListener('DOMContentLoaded', init);