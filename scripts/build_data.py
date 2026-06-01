#!/usr/bin/env python3
"""Build real data.js + real CSV from fetched ERA5 (present) and CCKP CMIP6 (future) data."""
import json, csv

REPO = "/Users/generalclasher/Documents/dsc106/finalproj/DSC106-Final-Project"
SEASONS = ["Winter","Spring","Summer","Fall"]
SSPS = ["SSP1-2.6","SSP2-4.5","SSP5-8.5"]
PERIODS = ["2050","2080s"]

era5 = json.load(open("/tmp/era5_present.json"))
fut  = json.load(open("/tmp/sd_future.json"))

# ---- cities block (all 10, present-day ERA5) ----
cities = {}
for city, d in era5.items():
    cities[city] = {"lat": d["lat"], "lon": d["lon"],
                    "present": {"temp": d["temp"], "precip": d["precip"]}}

# ---- San Diego future (delta-method, with uncertainty band) ----
sd_future = {}
for ssp in SSPS:
    sd_future[ssp] = {}
    for per in PERIODS:
        f = fut["future"][ssp][per]
        sd_future[ssp][per] = {
            "temp":   {"median": f["temp"]["median"],   "lo": f["temp"]["lo"],   "hi": f["temp"]["hi"]},
            "precip": {"median": f["precip"]["median"], "lo": f["precip"]["lo"], "hi": f["precip"]["hi"]},
        }

data = {
    "metadata": {
        "project": "Finding San Diego's Future Climate Twin",
        "group": "Thunder4Champ",
        "team_members": ["Zonglin Zhang", "La Li", "Vincent Gao"],
        "present_day_source": "ERA5 reanalysis (1991-2020 climatology) via Open-Meteo Archive API, sampled at each city's coordinates",
        "future_source": "CMIP6 multi-model ensemble via World Bank Climate Change Knowledge Portal (CCKP, cmip6-x0.25), California (USA.2593218)",
        "method": "Delta downscaling: San Diego's future = its real ERA5 seasonal baseline + the CCKP CMIP6 California change signal (additive for temperature, multiplicative percent-change for precipitation). Uncertainty band spans the ensemble p10-p90.",
        "scenarios": SSPS,
        "periods": {"2050": "2040-2059", "2080s": "2080-2099"},
        "baseline_period": "1991-2020 (ERA5) / 1995-2014 (CCKP reference)",
        "variables": ["seasonal mean temperature (degC)", "seasonal precipitation (mm)"],
        "data_status": "REAL public data (no placeholders). Regenerate with fetch_era5.py + fetch_cckp.py + build_data.py.",
    },
    "seasons": SEASONS,
    "scenarios": SSPS,
    "periods": PERIODS,
    "cities": cities,
    "sanDiego": {"present": cities["San Diego"]["present"], "future": sd_future},
}

with open(f"{REPO}/data.js", "w") as f:
    f.write("window.CLIMATE_DATA = ")
    json.dump(data, f, indent=2)
    f.write(";\n")
print("Wrote data.js")

# ---- Real long-format CSV (dataset deliverable: >=100 rows, >=5 cols, non-synthetic) ----
rows = []
for city, d in cities.items():
    rows.append(["city_location", city, d["lat"], d["lon"], "", "", "", "", "", "", "ERA5/Open-Meteo"])
    for s in SEASONS:
        rows.append(["present_profile", city, d["lat"], d["lon"], "Historical", "1991-2020", s, "seasonal_mean_temp_c", "median", d["present"]["temp"][s], "ERA5/Open-Meteo"])
        rows.append(["present_profile", city, d["lat"], d["lon"], "Historical", "1991-2020", s, "seasonal_precip_mm", "median", d["present"]["precip"][s], "ERA5/Open-Meteo"])
sd = cities["San Diego"]
for ssp in SSPS:
    for per in PERIODS:
        f = sd_future[ssp][per]
        for s in SEASONS:
            for bound in ["median","lo","hi"]:
                rows.append(["future_profile", "San Diego", sd["lat"], sd["lon"], ssp, per, s, "seasonal_mean_temp_c", bound, f["temp"][bound][s], "CCKP-CMIP6/WorldBank"])
                rows.append(["future_profile", "San Diego", sd["lat"], sd["lon"], ssp, per, s, "seasonal_precip_mm", bound, f["precip"][bound][s], "CCKP-CMIP6/WorldBank"])

header = ["record_type","city","lat","lon","scenario","period","season","metric","bound","value","source"]
with open(f"{REPO}/data/thunder4champ_climate_dataset.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(header); w.writerows(rows)
print(f"Wrote CSV with {len(rows)} data rows, {len(header)} columns")
