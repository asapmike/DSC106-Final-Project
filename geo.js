// Simplified but recognizable western-US state outlines (lon, lat), authored for
// d3.geoMercator projection. Fidelity is intentionally light-weight (no external
// TopoJSON fetch needed) yet far more accurate than block polygons.
window.WEST_GEO = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Washington", abbr: "WA", clon: -120.4, clat: 47.4 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-124.73, 48.38], [-123.16, 48.16], [-122.92, 49.00], [-117.03, 49.00],
          [-117.04, 46.43], [-118.98, 46.00], [-121.20, 45.65], [-122.76, 45.65],
          [-123.95, 46.26], [-124.06, 46.86], [-124.73, 47.27], [-124.73, 48.38]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "Oregon", abbr: "OR", clon: -120.6, clat: 43.9 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-124.41, 42.00], [-124.14, 43.70], [-123.95, 46.26], [-122.76, 45.65],
          [-121.20, 45.65], [-119.60, 45.92], [-116.92, 45.99], [-117.03, 44.30],
          [-117.23, 43.83], [-117.03, 42.00], [-124.41, 42.00]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "California", abbr: "CA", clon: -119.6, clat: 37.2 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-124.21, 41.99], [-124.36, 40.44], [-123.83, 39.55], [-123.00, 38.30],
          [-122.40, 37.60], [-121.90, 36.60], [-121.28, 35.67], [-120.00, 34.46],
          [-118.40, 34.02], [-117.13, 32.53], [-114.72, 32.71], [-114.63, 33.43],
          [-114.52, 33.69], [-114.14, 34.30], [-114.38, 34.78], [-114.63, 35.00],
          [-120.00, 39.00], [-120.00, 42.00], [-124.21, 41.99]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "Nevada", abbr: "NV", clon: -117.0, clat: 39.4 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-120.00, 42.00], [-114.04, 42.00], [-114.04, 36.18], [-114.74, 36.05],
          [-114.57, 35.00], [-120.00, 39.00], [-120.00, 42.00]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "Utah", abbr: "UT", clon: -111.6, clat: 39.4 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-114.05, 41.99], [-111.05, 42.00], [-111.05, 40.99], [-109.05, 40.99],
          [-109.05, 37.00], [-114.05, 37.00], [-114.05, 41.99]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "Arizona", abbr: "AZ", clon: -111.6, clat: 34.2 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-114.05, 37.00], [-109.05, 37.00], [-109.05, 31.33], [-111.07, 31.33],
          [-114.81, 32.49], [-114.46, 33.03], [-114.52, 33.55], [-114.14, 34.30],
          [-114.63, 35.00], [-114.57, 36.15], [-114.04, 36.19], [-114.05, 37.00]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { name: "Idaho", abbr: "ID", clon: -114.6, clat: 44.4 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-117.03, 44.30], [-116.92, 45.99], [-116.46, 45.78], [-116.06, 46.10],
          [-114.32, 46.65], [-114.06, 46.64], [-113.80, 45.65], [-111.05, 44.48],
          [-111.05, 42.00], [-117.03, 42.00], [-117.23, 43.83], [-117.03, 44.30]
        ]]
      }
    }
  ]
};
