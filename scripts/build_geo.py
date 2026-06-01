#!/usr/bin/env python3
"""Build a real western-US geo.js (window.WEST_GEO) from real US-states GeoJSON.
Keeps the same shape the map code expects: FeatureCollection of Polygon features
with properties {name, abbr, clon, clat}."""
import json

REPO = "/Users/generalclasher/Documents/dsc106/finalproj/DSC106-Final-Project"
gj = json.load(open("/tmp/us-states.geojson"))

WEST = {
    "Washington":"WA","Oregon":"OR","California":"CA","Nevada":"NV","Idaho":"ID",
    "Utah":"UT","Arizona":"AZ","New Mexico":"NM","Colorado":"CO","Wyoming":"WY","Montana":"MT",
}

def largest_polygon(geom):
    """Return a single exterior+holes polygon (list of rings) for Polygon/MultiPolygon, picking the biggest part."""
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    # MultiPolygon: choose the polygon whose exterior ring has the most points (proxy for largest landmass)
    best = max(geom["coordinates"], key=lambda poly: len(poly[0]))
    return best

def round_ring(ring):
    return [[round(x, 3), round(y, 3)] for x, y in ring]

features = []
for f in gj["features"]:
    name = f["properties"].get("name")
    if name not in WEST:
        continue
    rings = largest_polygon(f["geometry"])
    rings = [round_ring(r) for r in rings]
    ext = rings[0]
    clon = round(sum(p[0] for p in ext) / len(ext), 2)
    clat = round(sum(p[1] for p in ext) / len(ext), 2)
    features.append({
        "type": "Feature",
        "properties": {"name": name, "abbr": WEST[name], "clon": clon, "clat": clat},
        "geometry": {"type": "Polygon", "coordinates": rings},
    })

# order west-to-east-ish for readability (optional)
features.sort(key=lambda f: f["properties"]["clon"])
out = {"type": "FeatureCollection", "features": features}

header = ("// Real western-US state outlines (US Census / public-domain GeoJSON),\n"
          "// filtered and lightly rounded for d3.geoMercator. Replaces the prior\n"
          "// hand-drawn block outlines. Properties carry abbr + label centroid.\n")
with open(f"{REPO}/geo.js", "w") as fp:
    fp.write(header + "window.WEST_GEO = ")
    json.dump(out, fp)
    fp.write(";\n")
print(f"Wrote geo.js with {len(features)} states:", ", ".join(f["properties"]["abbr"] for f in features))
print("bytes:", len(open(f"{REPO}/geo.js").read()))
