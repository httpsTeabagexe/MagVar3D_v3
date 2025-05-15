import * as d3 from "d3";

export function setupSvgGlobe(container, landGeoJson, options = {}) {
    const {
      width = 800,
      height = 800,
      landColor = "#72B092",
      oceanColor = "#001D3D",
      landStrokeColor = "#333",
      graticuleColor = "#888",
      graticuleOpacity = 0.7
    } = options;

    d3.select(container).select("svg").remove();

    const projection = d3.geoOrthographic()
      .scale(Math.min(width, height) / 2.1)
      .translate([width / 2, height / 2])
      .clipAngle(90);

    const path = d3.geoPath(projection);

    const svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("class", "earth-svg-cambecc");

    svg.append("path")
      .datum({ type: "Sphere" })
      .attr("class", "sphere")
      .attr("d", path)
      .attr("fill", oceanColor);

    svg.append("path")
      .datum(d3.geoGraticule10())
      .attr("class", "graticule")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", graticuleColor)
      .attr("stroke-width", 1)
      .attr("opacity", graticuleOpacity);

    svg.append("path")
      .datum(landGeoJson)
      .attr("class", "land")
      .attr("d", path)
      .attr("fill", landColor)
      .attr("stroke", landStrokeColor)
      .attr("stroke-width", 0.7);

    let isDragging = false, lastMouse = null, lastRotate = projection.rotate();

    svg.call(
      d3.drag()
        .on("start", (event) => {
          isDragging = true;
          lastMouse = [event.x, event.y];
          lastRotate = projection.rotate();
        })
        .on("drag", (event) => {
          if (!isDragging) return;
          const [dx, dy] = [event.x - lastMouse[0], event.y - lastMouse[1]];
          const rotation = [...lastRotate];
          rotation[0] += dx * 0.5;
          rotation[1] = Math.max(-90, Math.min(90, rotation[1] - dy * 0.5));
          projection.rotate(rotation);
          svg.selectAll("path").attr("d", path);
        })
        .on("end", () => { isDragging = false; })
    );

    svg.call(
      d3.zoom()
        .scaleExtent([width / 4, width * 2])
        .on("zoom", (event) => {
          projection.scale(event.transform.k);
          svg.selectAll("path").attr("d", path);
        })
    );

    return svg;
  }