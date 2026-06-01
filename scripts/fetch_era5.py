#!/usr/bin/env python3
"""Step 1 of the pipeline: fetch real ERA5 (1991-2020) seasonal climatology for each
project city via the Open-Meteo archive API (no key required). Writes /tmp/era5_present.json.
Run order: fetch_era5.py -> fetch_cckp.py -> build_data.py (and build_geo.py for the map)."""
import json, urllib.request, urllib.parse, time, sys

# Project cities (the comparison pool) with coordinates.
CITIES = {
    "San Diego": (32.7157, -117.1611),
    "Los Angeles": (34.0522, -118.2437),
    "Riverside": (33.9806, -117.3755),
    "Phoenix": (33.4484, -112.0740),
    "Fresno": (36.7378, -119.7871),
    "Tucson": (32.2226, -110.9747),
    "Seattle": (47.6062, -122.3321),
    "Las Vegas": (36.1699, -115.1398),
    "Sacramento": (38.5816, -121.4944),
    "San Francisco": (37.7749, -122.4194),
}

SEASON_OF = {12: "Winter", 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring",
             6: "Summer", 7: "Summer", 8: "Summer", 9: "Fall", 10: "Fall", 11: "Fall"}
SEASONS = ["Winter", "Spring", "Summer", "Fall"]

def fetch(lat, lon):
    qs = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "start_date": "1991-01-01", "end_date": "2020-12-31",
        "daily": "temperature_2m_mean,precipitation_sum", "timezone": "auto",
    })
    url = f"https://archive-api.open-meteo.com/v1/archive?{qs}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)["daily"]
        except Exception as e:
            print(f"  retry: {e}", file=sys.stderr)
            time.sleep(10)  # back off — the free tier rate-limits bursts
    raise RuntimeError(f"FAILED {url}")

out = {}
for city, (lat, lon) in CITIES.items():
    d = fetch(lat, lon)
    t_sum = {s: 0.0 for s in SEASONS}; t_n = {s: 0 for s in SEASONS}; p_sum = {s: 0.0 for s in SEASONS}
    for ds, t, p in zip(d["time"], d["temperature_2m_mean"], d["precipitation_sum"]):
        s = SEASON_OF[int(ds[5:7])]
        if t is not None: t_sum[s] += t; t_n[s] += 1
        if p is not None: p_sum[s] += p
    temp = {s: round(t_sum[s] / t_n[s], 1) for s in SEASONS}
    precip = {s: round(p_sum[s] / 30.0, 0) for s in SEASONS}   # 30-year average seasonal total
    out[city] = {"lat": lat, "lon": lon, "temp": temp, "precip": precip}
    print(f"{city:16s} T={[temp[s] for s in SEASONS]}  P={[precip[s] for s in SEASONS]}")
    time.sleep(6)  # gentle pacing between cities

json.dump(out, open("/tmp/era5_present.json", "w"), indent=2)
print(f"\nWrote {len(out)} cities to /tmp/era5_present.json")
