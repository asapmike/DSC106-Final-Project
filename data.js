window.CLIMATE_DATA = {
  "metadata": {
    "project": "Finding San Diego's Future Climate Twin",
    "group": "Thunder4Champ",
    "team_members": [
      "Zonglin Zhang",
      "La Li",
      "Vincent Gao"
    ],
    "present_day_source": "ERA5 reanalysis (1991-2020 climatology) via Open-Meteo Archive API, sampled at each city's coordinates",
    "future_source": "CMIP6 multi-model ensemble via World Bank Climate Change Knowledge Portal (CCKP, cmip6-x0.25), California (USA.2593218)",
    "method": "Delta downscaling: San Diego's future = its real ERA5 seasonal baseline + the CCKP CMIP6 California change signal (additive for temperature, multiplicative percent-change for precipitation). Uncertainty band spans the ensemble p10-p90.",
    "scenarios": [
      "SSP1-2.6",
      "SSP2-4.5",
      "SSP5-8.5"
    ],
    "periods": {
      "2050": "2040-2059",
      "2080s": "2080-2099"
    },
    "baseline_period": "1991-2020 (ERA5) / 1995-2014 (CCKP reference)",
    "variables": [
      "seasonal mean temperature (degC)",
      "seasonal precipitation (mm)"
    ],
    "data_status": "REAL public data (no placeholders). Regenerate with fetch_era5.py + fetch_cckp.py + build_data.py."
  },
  "seasons": [
    "Winter",
    "Spring",
    "Summer",
    "Fall"
  ],
  "scenarios": [
    "SSP1-2.6",
    "SSP2-4.5",
    "SSP5-8.5"
  ],
  "periods": [
    "2050",
    "2080s"
  ],
  "cities": {
    "San Diego": {
      "lat": 32.7157,
      "lon": -117.1611,
      "present": {
        "temp": {
          "Winter": 12.9,
          "Spring": 15.4,
          "Summer": 20.0,
          "Fall": 18.5
        },
        "precip": {
          "Winter": 180.0,
          "Spring": 82.0,
          "Summer": 7.0,
          "Fall": 42.0
        }
      }
    },
    "Los Angeles": {
      "lat": 34.0522,
      "lon": -118.2437,
      "present": {
        "temp": {
          "Winter": 12.2,
          "Spring": 16.4,
          "Summer": 23.4,
          "Fall": 19.6
        },
        "precip": {
          "Winter": 219.0,
          "Spring": 84.0,
          "Summer": 5.0,
          "Fall": 40.0
        }
      }
    },
    "Riverside": {
      "lat": 33.9806,
      "lon": -117.3755,
      "present": {
        "temp": {
          "Winter": 10.9,
          "Spring": 16.0,
          "Summer": 24.4,
          "Fall": 19.4
        },
        "precip": {
          "Winter": 268.0,
          "Spring": 107.0,
          "Summer": 7.0,
          "Fall": 57.0
        }
      }
    },
    "Phoenix": {
      "lat": 33.4484,
      "lon": -112.074,
      "present": {
        "temp": {
          "Winter": 12.2,
          "Spring": 22.6,
          "Summer": 34.1,
          "Fall": 23.9
        },
        "precip": {
          "Winter": 99.0,
          "Spring": 38.0,
          "Summer": 49.0,
          "Fall": 63.0
        }
      }
    },
    "Fresno": {
      "lat": 36.7378,
      "lon": -119.7871,
      "present": {
        "temp": {
          "Winter": 9.3,
          "Spring": 17.1,
          "Summer": 27.9,
          "Fall": 19.2
        },
        "precip": {
          "Winter": 227.0,
          "Spring": 124.0,
          "Summer": 7.0,
          "Fall": 59.0
        }
      }
    },
    "Tucson": {
      "lat": 32.2226,
      "lon": -110.9747,
      "present": {
        "temp": {
          "Winter": 11.5,
          "Spring": 21.0,
          "Summer": 31.0,
          "Fall": 22.3
        },
        "precip": {
          "Winter": 89.0,
          "Spring": 26.0,
          "Summer": 74.0,
          "Fall": 63.0
        }
      }
    },
    "Seattle": {
      "lat": 47.6062,
      "lon": -122.3321,
      "present": {
        "temp": {
          "Winter": 4.4,
          "Spring": 9.5,
          "Summer": 17.6,
          "Fall": 11.1
        },
        "precip": {
          "Winter": 469.0,
          "Spring": 322.0,
          "Summer": 118.0,
          "Fall": 387.0
        }
      }
    },
    "Las Vegas": {
      "lat": 36.1699,
      "lon": -115.1398,
      "present": {
        "temp": {
          "Winter": 8.9,
          "Spring": 19.4,
          "Summer": 31.9,
          "Fall": 20.5
        },
        "precip": {
          "Winter": 71.0,
          "Spring": 28.0,
          "Summer": 17.0,
          "Fall": 26.0
        }
      }
    },
    "Sacramento": {
      "lat": 38.5816,
      "lon": -121.4944,
      "present": {
        "temp": {
          "Winter": 8.9,
          "Spring": 15.6,
          "Summer": 24.0,
          "Fall": 17.7
        },
        "precip": {
          "Winter": 344.0,
          "Spring": 158.0,
          "Summer": 6.0,
          "Fall": 92.0
        }
      }
    },
    "San Francisco": {
      "lat": 37.7749,
      "lon": -122.4194,
      "present": {
        "temp": {
          "Winter": 10.0,
          "Spring": 12.8,
          "Summer": 16.3,
          "Fall": 15.0
        },
        "precip": {
          "Winter": 286.0,
          "Spring": 129.0,
          "Summer": 5.0,
          "Fall": 70.0
        }
      }
    }
  },
  "sanDiego": {
    "present": {
      "temp": {
        "Winter": 12.9,
        "Spring": 15.4,
        "Summer": 20.0,
        "Fall": 18.5
      },
      "precip": {
        "Winter": 180.0,
        "Spring": 82.0,
        "Summer": 7.0,
        "Fall": 42.0
      }
    },
    "future": {
      "SSP1-2.6": {
        "2050": {
          "temp": {
            "median": {
              "Winter": 14.1,
              "Spring": 16.6,
              "Summer": 21.4,
              "Fall": 20.2
            },
            "lo": {
              "Winter": 13.4,
              "Spring": 15.8,
              "Summer": 20.7,
              "Fall": 19.2
            },
            "hi": {
              "Winter": 14.9,
              "Spring": 17.2,
              "Summer": 22.4,
              "Fall": 21.4
            }
          },
          "precip": {
            "median": {
              "Winter": 193.0,
              "Spring": 87.0,
              "Summer": 7.0,
              "Fall": 43.0
            },
            "lo": {
              "Winter": 161.0,
              "Spring": 77.0,
              "Summer": 6.0,
              "Fall": 33.0
            },
            "hi": {
              "Winter": 211.0,
              "Spring": 92.0,
              "Summer": 9.0,
              "Fall": 47.0
            }
          }
        },
        "2080s": {
          "temp": {
            "median": {
              "Winter": 14.2,
              "Spring": 16.7,
              "Summer": 21.5,
              "Fall": 20.1
            },
            "lo": {
              "Winter": 13.4,
              "Spring": 15.8,
              "Summer": 20.7,
              "Fall": 19.1
            },
            "hi": {
              "Winter": 15.1,
              "Spring": 17.6,
              "Summer": 22.8,
              "Fall": 21.7
            }
          },
          "precip": {
            "median": {
              "Winter": 195.0,
              "Spring": 86.0,
              "Summer": 8.0,
              "Fall": 43.0
            },
            "lo": {
              "Winter": 161.0,
              "Spring": 71.0,
              "Summer": 6.0,
              "Fall": 35.0
            },
            "hi": {
              "Winter": 218.0,
              "Spring": 97.0,
              "Summer": 9.0,
              "Fall": 49.0
            }
          }
        }
      },
      "SSP2-4.5": {
        "2050": {
          "temp": {
            "median": {
              "Winter": 14.2,
              "Spring": 16.7,
              "Summer": 21.7,
              "Fall": 20.3
            },
            "lo": {
              "Winter": 13.5,
              "Spring": 16.0,
              "Summer": 21.0,
              "Fall": 19.4
            },
            "hi": {
              "Winter": 15.1,
              "Spring": 17.6,
              "Summer": 22.8,
              "Fall": 21.5
            }
          },
          "precip": {
            "median": {
              "Winter": 187.0,
              "Spring": 82.0,
              "Summer": 7.0,
              "Fall": 43.0
            },
            "lo": {
              "Winter": 165.0,
              "Spring": 72.0,
              "Summer": 6.0,
              "Fall": 39.0
            },
            "hi": {
              "Winter": 210.0,
              "Spring": 88.0,
              "Summer": 9.0,
              "Fall": 51.0
            }
          }
        },
        "2080s": {
          "temp": {
            "median": {
              "Winter": 15.0,
              "Spring": 17.5,
              "Summer": 22.6,
              "Fall": 21.6
            },
            "lo": {
              "Winter": 14.2,
              "Spring": 16.6,
              "Summer": 21.7,
              "Fall": 20.2
            },
            "hi": {
              "Winter": 16.3,
              "Spring": 18.4,
              "Summer": 23.9,
              "Fall": 22.7
            }
          },
          "precip": {
            "median": {
              "Winter": 186.0,
              "Spring": 85.0,
              "Summer": 8.0,
              "Fall": 42.0
            },
            "lo": {
              "Winter": 163.0,
              "Spring": 74.0,
              "Summer": 6.0,
              "Fall": 39.0
            },
            "hi": {
              "Winter": 214.0,
              "Spring": 94.0,
              "Summer": 10.0,
              "Fall": 52.0
            }
          }
        }
      },
      "SSP5-8.5": {
        "2050": {
          "temp": {
            "median": {
              "Winter": 14.5,
              "Spring": 17.2,
              "Summer": 22.3,
              "Fall": 21.0
            },
            "lo": {
              "Winter": 13.9,
              "Spring": 16.5,
              "Summer": 21.5,
              "Fall": 20.2
            },
            "hi": {
              "Winter": 15.6,
              "Spring": 17.7,
              "Summer": 23.1,
              "Fall": 22.1
            }
          },
          "precip": {
            "median": {
              "Winter": 195.0,
              "Spring": 82.0,
              "Summer": 7.0,
              "Fall": 40.0
            },
            "lo": {
              "Winter": 178.0,
              "Spring": 73.0,
              "Summer": 6.0,
              "Fall": 33.0
            },
            "hi": {
              "Winter": 222.0,
              "Spring": 97.0,
              "Summer": 9.0,
              "Fall": 48.0
            }
          }
        },
        "2080s": {
          "temp": {
            "median": {
              "Winter": 16.8,
              "Spring": 19.6,
              "Summer": 25.1,
              "Fall": 24.0
            },
            "lo": {
              "Winter": 15.5,
              "Spring": 18.4,
              "Summer": 24.3,
              "Fall": 21.9
            },
            "hi": {
              "Winter": 18.1,
              "Spring": 20.7,
              "Summer": 27.3,
              "Fall": 26.0
            }
          },
          "precip": {
            "median": {
              "Winter": 201.0,
              "Spring": 79.0,
              "Summer": 8.0,
              "Fall": 41.0
            },
            "lo": {
              "Winter": 172.0,
              "Spring": 69.0,
              "Summer": 6.0,
              "Fall": 33.0
            },
            "hi": {
              "Winter": 228.0,
              "Spring": 89.0,
              "Summer": 13.0,
              "Fall": 52.0
            }
          }
        }
      }
    }
  }
};
