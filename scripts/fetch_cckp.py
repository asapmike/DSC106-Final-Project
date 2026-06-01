#!/usr/bin/env python3
"""Fetch CCKP CMIP6 California change-signal and apply (delta method) to San Diego's real ERA5 baseline.
Output: San Diego future seasonal temp/precip with median + p10/p90 uncertainty, per SSP and period."""
import json, urllib.request, time, sys

GEO = "USA.2593218"  # California (finest US unit in CCKP)
BASE = "https://cckpapi.worldbank.org/cckp/v1"
SUF  = "ensemble_all_mean"
SEASON = {"01":"Winter","04":"Spring","07":"Summer","10":"Fall"}
SEASONS = ["Winter","Spring","Summer","Fall"]
SSP = {"ssp126":"SSP1-2.6","ssp245":"SSP2-4.5","ssp585":"SSP5-8.5"}
PERIODS = {"2040-2059":"2050","2080-2099":"2080s"}
HIST = "1995-2014"
PCTLS = ["median","p10","p90"]

def get(var, period, pctl, scenario):
    url = f"{BASE}/cmip6-x0.25_climatology_{var}_climatology_seasonal_{period}_{pctl}_{scenario}_{SUF}/{GEO}?_format=json"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.load(r)["data"]
            if not data:
                raise ValueError("empty data")
            vals = list(data.values())[0]          # {"2040-01":x, "2040-04":y, ...}
            out = {SEASON[k.split("-")[1]]: v for k, v in vals.items()}
            time.sleep(0.25)
            return out
        except Exception as e:
            print(f"  retry {var}/{period}/{pctl}/{scenario}: {e}", file=sys.stderr); time.sleep(4)
    raise RuntimeError(f"FAILED {url}")

# 1) Historical baseline (CA, median)
print("Fetching CCKP California historical baseline (1995-2014)...")
hist_tas = get("tas", HIST, "median", "historical")
hist_pr  = get("pr",  HIST, "median", "historical")
print("  CA hist tas:", {s: round(hist_tas[s],1) for s in SEASONS})
print("  CA hist pr :", {s: round(hist_pr[s],0)  for s in SEASONS})

# 2) San Diego real ERA5 baseline
era5 = json.load(open("/tmp/era5_present.json"))
sd = era5["San Diego"]

# 3) Future: per scenario, per period, per percentile -> delta applied to SD baseline
result = {}  # result[scenario_label][period_label] = {temp:{med,lo,hi per season}, precip:{...}}
for ssp_code, ssp_label in SSP.items():
    for per_code, per_label in PERIODS.items():
        fut_tas = {p: get("tas", per_code, p, ssp_code) for p in PCTLS}
        fut_pr  = {p: get("pr",  per_code, p, ssp_code) for p in PCTLS}
        temp = {"median":{}, "lo":{}, "hi":{}}
        precip = {"median":{}, "lo":{}, "hi":{}}
        for s in SEASONS:
            # temperature: additive delta (degC)
            dT = {p: fut_tas[p][s] - hist_tas[s] for p in PCTLS}
            temp["median"][s] = round(sd["temp"][s] + dT["median"], 1)
            temp["lo"][s]     = round(sd["temp"][s] + dT["p10"], 1)
            temp["hi"][s]     = round(sd["temp"][s] + dT["p90"], 1)
            # precip: multiplicative percent-change delta
            base = hist_pr[s] if hist_pr[s] else 1e-6
            dP = {p: (fut_pr[p][s] - hist_pr[s]) / base for p in PCTLS}
            precip["median"][s] = max(0, round(sd["precip"][s] * (1 + dP["median"]), 0))
            precip["lo"][s]     = max(0, round(sd["precip"][s] * (1 + dP["p10"]), 0))
            precip["hi"][s]     = max(0, round(sd["precip"][s] * (1 + dP["p90"]), 0))
        result.setdefault(ssp_label, {})[per_label] = {"temp":temp, "precip":precip}
        dTsum = round(fut_tas["median"]["Summer"] - hist_tas["Summer"], 1)
        print(f"{ssp_label} {per_label}: SummerΔT(med)=+{dTsum}°C  -> SD summer temp {temp['median']['Summer']}°C "
              f"(band {temp['lo']['Summer']}-{temp['hi']['Summer']})")

json.dump({"hist_ca_tas":hist_tas,"hist_ca_pr":hist_pr,"sd_baseline":sd,"future":result},
          open("/tmp/sd_future.json","w"), indent=2)
print("\nWrote /tmp/sd_future.json")
