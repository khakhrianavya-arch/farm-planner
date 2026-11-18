// Live weather from Open-Meteo (free, no key). Returns plain data; main.js draws it.

const WMO = {
  0:['Clear','☀️'],1:['Mostly clear','🌤️'],2:['Partly cloudy','⛅'],3:['Overcast','☁️'],
  45:['Fog','🌫️'],48:['Fog','🌫️'],51:['Light drizzle','🌦️'],53:['Drizzle','🌦️'],55:['Heavy drizzle','🌧️'],
  56:['Freezing drizzle','🌧️'],57:['Freezing drizzle','🌧️'],61:['Light rain','🌦️'],63:['Rain','🌧️'],65:['Heavy rain','🌧️'],
  66:['Freezing rain','🌧️'],67:['Freezing rain','🌧️'],71:['Light snow','🌨️'],73:['Snow','🌨️'],75:['Heavy snow','❄️'],
  77:['Snow grains','🌨️'],80:['Showers','🌦️'],81:['Showers','🌧️'],82:['Heavy showers','⛈️'],85:['Snow showers','🌨️'],
  86:['Snow showers','🌨️'],95:['Thunderstorm','⛈️'],96:['Storm & hail','⛈️'],99:['Storm & hail','⛈️']
};
const WET = [51,53,55,61,63,65,80,81,82,95,96,99];

export async function fetchWeather(loc){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&past_days=7&forecast_days=7&timezone=auto`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Weather service ' + r.status);
  const d = await r.json();
  const c = d.current, dl = d.daily, today = 7;
  const sum = (a, b) => dl.precipitation_sum.slice(a, b).reduce((s, v) => s + (v || 0), 0);
  const [cond, icon] = WMO[c.weather_code] || ['—', '🌡️'];
  const wet = c.precipitation > 0 || WET.includes(c.weather_code);
  return {
    sky: wet ? 'rain' : (c.weather_code >= 3 ? 'cloudy' : 'clear'),
    raining: wet,
    chips: [
      [cond, `${icon} ${Math.round(c.temperature_2m)}°C`, true],
      ['Feels like', `${Math.round(c.apparent_temperature)}°`],
      ['Today', `${Math.round(dl.temperature_2m_min[today])}° – ${Math.round(dl.temperature_2m_max[today])}°`],
      ['Rain now', `${c.precipitation.toFixed(1)} mm`],
      ['Rain today', `${(dl.precipitation_sum[today] || 0).toFixed(1)} mm`],
      ['Last 7 days', `${sum(0, today).toFixed(1)} mm`],
      ['Next 7 days', `${sum(today + 1, today + 8).toFixed(1)} mm`],
      ['Humidity', `${c.relative_humidity_2m}%`],
      ['Wind', `${Math.round(c.wind_speed_10m)} km/h`],
    ]
  };
}

const iso = d => d.toISOString().slice(0, 10);

// Daily history (92 days) + 7-day forecast, plus 12 months of monthly rainfall.
export async function fetchClimate(loc){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}`
    + `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration,wind_gusts_10m_max,relative_humidity_2m_mean`
    + `&past_days=92&forecast_days=7&timezone=auto`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Weather service ' + r.status);
  const d = (await r.json()).daily;
  const daily = { dates: d.time, rain: d.precipitation_sum, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min,
    et0: d.et0_fao_evapotranspiration, gust: d.wind_gusts_10m_max, hum: d.relative_humidity_2m_mean || [] };

  // Monthly totals for the past year from the archive (it lags a few days), topped up with recent days.
  const monthly = {};
  try{
    const end = new Date(Date.now() - 6 * 86400000), start = new Date(Date.now() - 366 * 86400000);
    const a = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}`
      + `&start_date=${iso(start)}&end_date=${iso(end)}&daily=precipitation_sum&timezone=auto`);
    if(a.ok){
      const ad = (await a.json()).daily;
      ad.time.forEach((t, i) => { const m = t.slice(0, 7); monthly[m] = (monthly[m] || 0) + (ad.precipitation_sum[i] || 0); });
      var lastArchived = ad.time[ad.time.length - 1];
    }
  }catch(e){ /* the chart just shows less */ }
  const todayStr = d.time[92];
  d.time.forEach((t, i) => {
    if(t > todayStr || (lastArchived && t <= lastArchived)) return;
    const m = t.slice(0, 7); monthly[m] = (monthly[m] || 0) + (d.precipitation_sum[i] || 0);
  });
  const months = Object.keys(monthly).sort().slice(-12).map(m => ({ month: m, rain: monthly[m] }));
  return { daily, today: 92, months, fetchedAt: Date.now() };
}

export async function searchPlaces(q){
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  if(!r.ok) throw new Error('Search ' + r.status);
  const d = await r.json();
  return (d.results || []).map(p => ({
    name: [p.name, p.admin1].filter(Boolean).join(', '),
    detail: [p.admin1, p.country].filter(Boolean).join(', '),
    short: p.name, lat: p.latitude, lon: p.longitude
  }));
}
