'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cloud, CloudRain, CloudSnow, Sun, Wind, Droplets,
  Thermometer, Eye, Gauge, RefreshCw, MapPin, AlertTriangle,
  CheckCircle2, XCircle, Sprout, FlaskConical, Leaf,
  ChevronRight, Clock, Sunrise, Sunset, CloudLightning,
  CloudDrizzle, CloudFog, Snowflake, Bug
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ── Farm locations (Moonlight Fresco context, editable) ─────
const FARM_LOCATIONS = [
  { id: 'main', name: 'Main Farm — Accra', lat: 5.6037, lon: -0.1870, timezone: 'Africa/Accra' },
  { id: 'north', name: 'North Block — Kumasi', lat: 6.6885, lon: -1.6244, timezone: 'Africa/Accra' },
  { id: 'coast', name: 'Coastal Block — Takoradi', lat: 4.8845, lon: -1.7554, timezone: 'Africa/Accra' },
];

// ── WMO weather code → label + icon mapping ──────────────────
function decodeWMO(code: number): { label: string; icon: string; lucide: any; color: string } {
  if (code === 0) return { label: 'Clear Sky', icon: '☀️', lucide: Sun, color: 'text-yellow-500' };
  if (code <= 2) return { label: 'Partly Cloudy', icon: '⛅', lucide: Cloud, color: 'text-blue-400' };
  if (code === 3) return { label: 'Overcast', icon: '☁️', lucide: Cloud, color: 'text-slate-500' };
  if (code <= 49) return { label: 'Foggy', icon: '🌫️', lucide: CloudFog, color: 'text-slate-400' };
  if (code <= 57) return { label: 'Drizzle', icon: '🌦️', lucide: CloudDrizzle, color: 'text-blue-400' };
  if (code <= 67) return { label: 'Rain', icon: '🌧️', lucide: CloudRain, color: 'text-blue-600' };
  if (code <= 77) return { label: 'Snow', icon: '❄️', lucide: Snowflake, color: 'text-sky-400' };
  if (code <= 82) return { label: 'Rain Showers', icon: '🌦️', lucide: CloudRain, color: 'text-blue-500' };
  if (code <= 86) return { label: 'Snow Showers', icon: '🌨️', lucide: CloudSnow, color: 'text-sky-400' };
  if (code <= 99) return { label: 'Thunderstorm', icon: '⛈️', lucide: CloudLightning, color: 'text-purple-600' };
  return { label: 'Unknown', icon: '🌡️', lucide: Thermometer, color: 'text-gray-400' };
}

// ── Farm advisory engine ─────────────────────────────────────
interface FarmAdvisory {
  type: 'spray' | 'irrigation' | 'harvest' | 'planting' | 'pest' | 'general';
  severity: 'good' | 'caution' | 'warning' | 'danger';
  title: string;
  message: string;
  icon: any;
}

function generateAdvisories(current: any, hourly: any, daily: any): FarmAdvisory[] {
  const advisories: FarmAdvisory[] = [];
  if (!current) return advisories;

  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const windSpeed = current.wind_speed_10m;
  const rain = current.precipitation ?? 0;
  const wmoCode = current.weather_code;
  const isRaining = wmoCode >= 51;
  const isThunderstorm = wmoCode >= 95;

  // Spray window advisory
  if (isThunderstorm) {
    advisories.push({ type: 'spray', severity: 'danger', icon: XCircle, title: 'DO NOT SPRAY — Thunderstorm', message: 'Active thunderstorm detected. All chemical application must cease immediately. Risk of chemical wash-off and worker safety.' });
  } else if (isRaining) {
    advisories.push({ type: 'spray', severity: 'danger', icon: XCircle, title: 'DO NOT SPRAY — Active Rain', message: 'Rain will wash chemicals off foliage before absorption. Wait at least 4 hours after rain stops before applying fungicides or insecticides.' });
  } else if (windSpeed > 20) {
    advisories.push({ type: 'spray', severity: 'warning', icon: AlertTriangle, title: 'Avoid Spraying — High Wind', message: `Wind speed at ${windSpeed.toFixed(1)} km/h exceeds safe spray threshold (20 km/h). Chemical drift risk. Wait for calmer conditions.` });
  } else if (windSpeed > 10) {
    advisories.push({ type: 'spray', severity: 'caution', icon: AlertTriangle, title: 'Spray with Caution — Moderate Wind', message: `Wind at ${windSpeed.toFixed(1)} km/h. Use low-drift nozzles. Avoid spraying near sensitive crops or water bodies.` });
  } else if (humidity > 90) {
    advisories.push({ type: 'spray', severity: 'caution', icon: AlertTriangle, title: 'Monitor After Spraying — High Humidity', message: `Relative humidity at ${humidity}% may slow drying. Allow extra absorption time before irrigation. Fungicide efficacy may be reduced.` });
  } else {
    advisories.push({ type: 'spray', severity: 'good', icon: CheckCircle2, title: 'Good Spray Window Now', message: `Conditions optimal: wind ${windSpeed.toFixed(1)} km/h, humidity ${humidity}%, no precipitation. Apply chemicals now for best absorption.` });
  }

  // Irrigation
  const next24hRain = hourly?.precipitation?.slice(0, 24).reduce((s: number, v: number) => s + v, 0) ?? 0;
  if (next24hRain > 10) {
    advisories.push({ type: 'irrigation', severity: 'caution', icon: Droplets, title: 'Reduce Irrigation — Rain Expected', message: `${next24hRain.toFixed(1)}mm of rain forecast in the next 24 hours. Reduce irrigation by 50–70% to avoid waterlogging and nutrient leaching.` });
  } else if (temp > 34 && humidity < 40) {
    advisories.push({ type: 'irrigation', severity: 'warning', icon: Droplets, title: 'Increase Irrigation — Heat & Dry', message: `High temperature (${temp.toFixed(1)}°C) combined with low humidity (${humidity}%) increases evapotranspiration. Irrigate more frequently to prevent crop stress.` });
  } else {
    advisories.push({ type: 'irrigation', severity: 'good', icon: CheckCircle2, title: 'Irrigation — Normal Schedule', message: 'Conditions within normal range. Maintain standard irrigation schedule.' });
  }

  // Disease / Pest pressure
  if (humidity > 80 && temp >= 20 && temp <= 30) {
    advisories.push({ type: 'pest', severity: 'warning', icon: Bug, title: 'High Fungal Disease Risk', message: `Warm (${temp.toFixed(0)}°C) and humid (${humidity}%) conditions are ideal for fungal spore germination. Increase scouting frequency. Consider preventive fungicide application.` });
  } else if (temp > 30 && humidity < 50) {
    advisories.push({ type: 'pest', severity: 'caution', icon: Bug, title: 'Elevated Spider Mite Risk', message: `Hot, dry conditions favour spider mite outbreaks. Inspect leaf undersides on Okra, Tomato, and Beans. Consider prophylactic miticide spray.` });
  }

  // Harvest window
  if (!isRaining && windSpeed < 15 && temp < 32) {
    advisories.push({ type: 'harvest', severity: 'good', icon: Leaf, title: 'Good Harvest Conditions', message: 'Dry, mild conditions suitable for harvesting. Harvested produce will store better and have lower disease risk.' });
  } else if (isRaining) {
    advisories.push({ type: 'harvest', severity: 'caution', icon: AlertTriangle, title: 'Avoid Harvesting in Rain', message: 'Wet produce increases risk of post-harvest rot. If harvesting is unavoidable, ensure proper drying before packing.' });
  }

  return advisories;
}

// ── Hourly forecast card ──────────────────────────────────────
function HourlyCard({ time, temp, precip, windspeed, code }: any) {
  const wx = decodeWMO(code);
  const WxIcon = wx.lucide;
  const hour = new Date(time).getHours();
  const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border bg-card min-w-[72px] text-center">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <WxIcon className={`w-5 h-5 ${wx.color}`} />
      <p className="text-sm font-bold">{temp.toFixed(0)}°</p>
      {precip > 0 && <p className="text-xs text-blue-500">{precip.toFixed(1)}mm</p>}
      <p className="text-xs text-muted-foreground">{windspeed.toFixed(0)} km/h</p>
    </div>
  );
}

// ── Daily forecast row ────────────────────────────────────────
function DailyRow({ date, maxTemp, minTemp, precip, precipProb, code }: any) {
  const wx = decodeWMO(code);
  const WxIcon = wx.lucide;
  const day = new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0 hover:bg-muted/30 px-2 rounded transition-colors">
      <p className="text-sm font-medium w-28">{day}</p>
      <div className="flex items-center gap-2 flex-1 justify-center">
        <WxIcon className={`w-5 h-5 ${wx.color}`} />
        <span className="text-sm text-muted-foreground hidden sm:inline">{wx.label}</span>
      </div>
      <div className="flex items-center gap-2 text-sm w-28 justify-end">
        {precipProb > 20 && (
          <span className="text-blue-500 text-xs flex items-center gap-0.5">
            <Droplets className="w-3 h-3" />{precipProb}%
          </span>
        )}
        <span className="text-muted-foreground">{minTemp.toFixed(0)}°</span>
        <span className="font-semibold">{maxTemp.toFixed(0)}°</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function WeatherPage() {
  const [selectedLocation, setSelectedLocation] = useState(FARM_LOCATIONS[0]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const fetchWeather = useCallback(async (loc: typeof FARM_LOCATIONS[0]) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', loc.lat.toString());
      url.searchParams.set('longitude', loc.lon.toString());
      url.searchParams.set('timezone', loc.timezone);
      url.searchParams.set('current', [
        'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
        'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
        'surface_pressure', 'visibility', 'uv_index', 'is_day',
      ].join(','));
      url.searchParams.set('hourly', [
        'temperature_2m', 'precipitation_probability', 'precipitation',
        'wind_speed_10m', 'weather_code', 'relative_humidity_2m', 'uv_index',
      ].join(','));
      url.searchParams.set('daily', [
        'weather_code', 'temperature_2m_max', 'temperature_2m_min',
        'precipitation_sum', 'precipitation_probability_max',
        'wind_speed_10m_max', 'sunrise', 'sunset', 'uv_index_max',
        'et0_fao_evapotranspiration',
      ].join(','));
      url.searchParams.set('forecast_days', '7');
      url.searchParams.set('wind_speed_unit', 'kmh');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setWeatherData(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather(selectedLocation);
    const interval = setInterval(() => fetchWeather(selectedLocation), 10 * 60 * 1000); // refresh every 10 min
    return () => clearInterval(interval);
  }, [selectedLocation, fetchWeather]);

  function handleCustomLocation() {
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (isNaN(lat) || isNaN(lon)) return;
    const loc = { id: 'custom', name: `Custom (${lat.toFixed(2)}, ${lon.toFixed(2)})`, lat, lon, timezone: 'Africa/Accra' };
    setSelectedLocation(loc);
    setShowCustom(false);
  }

  const current = weatherData?.current;
  const hourly = weatherData?.hourly;
  const daily = weatherData?.daily;

  const wx = current ? decodeWMO(current.weather_code) : null;
  const WxIcon = wx?.lucide ?? Cloud;
  const advisories = current ? generateAdvisories(current, hourly, daily) : [];

  // Get next 24 hours from now
  const nowHourIdx = hourly?.time?.findIndex((t: string) => new Date(t) >= new Date()) ?? 0;
  const next24h = hourly ? Array.from({ length: 24 }, (_, i) => ({
    time: hourly.time[nowHourIdx + i],
    temp: hourly.temperature_2m[nowHourIdx + i],
    precip: hourly.precipitation[nowHourIdx + i],
    windspeed: hourly.wind_speed_10m[nowHourIdx + i],
    code: hourly.weather_code[nowHourIdx + i],
  })).filter(h => h.time) : [];

  const isDay = current?.is_day === 1;
  const bgGradient = isDay
    ? 'from-sky-400 via-blue-500 to-blue-600'
    : 'from-slate-800 via-slate-700 to-slate-600';

  const severityColors = {
    good: 'border-green-200 bg-green-50',
    caution: 'border-amber-200 bg-amber-50',
    warning: 'border-orange-200 bg-orange-50',
    danger: 'border-red-200 bg-red-50',
  };
  const severityText = {
    good: 'text-green-700',
    caution: 'text-amber-700',
    warning: 'text-orange-700',
    danger: 'text-red-700',
  };
  const severityIconColors = {
    good: 'text-green-500',
    caution: 'text-amber-500',
    warning: 'text-orange-500',
    danger: 'text-red-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-blue-500" /> Live Weather
          </h1>
          <p className="text-muted-foreground text-sm">Real-time conditions with farm-specific advisories — powered by Open-Meteo</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              <Clock className="w-3 h-3 inline mr-1" />Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchWeather(selectedLocation)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Location Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium mr-1">Farm Location:</span>
            {FARM_LOCATIONS.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedLocation.id === loc.id ? 'bg-green-600 text-white border-green-600' : 'border-border hover:bg-muted'}`}
              >
                {loc.name}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(s => !s)}
              className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-border hover:bg-muted transition-colors"
            >
              + Custom GPS
            </button>
          </div>
          {showCustom && (
            <div className="flex gap-2 mt-3 items-center">
              <input
                type="number" step="any" placeholder="Latitude" value={customLat}
                onChange={e => setCustomLat(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm w-36 bg-background"
              />
              <input
                type="number" step="any" placeholder="Longitude" value={customLon}
                onChange={e => setCustomLon(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm w-36 bg-background"
              />
              <Button size="sm" onClick={handleCustomLocation} disabled={!customLat || !customLon}>
                Load
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Weather data unavailable</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto border-red-300 text-red-700" onClick={() => fetchWeather(selectedLocation)}>Retry</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !weatherData && (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Main weather card */}
      {current && wx && (
        <div className={`rounded-2xl bg-gradient-to-br ${bgGradient} text-white p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {selectedLocation.name}
              </p>
              <div className="flex items-end gap-4 mt-2">
                <p className="text-7xl font-thin">{current.temperature_2m.toFixed(1)}°C</p>
                <div>
                  <p className="text-white/90 text-lg font-medium">{wx.label}</p>
                  <p className="text-white/70 text-sm">Feels like {current.apparent_temperature.toFixed(1)}°C</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <WxIcon className="w-20 h-20 text-white/80 ml-auto" />
              <p className="text-white/70 text-sm mt-1">{isDay ? 'Daytime' : 'Nighttime'}</p>
            </div>
          </div>

          {/* Sub-stats */}
          <div className="grid grid-cols-4 gap-3 mt-6">
            {[
              { icon: Droplets, label: 'Humidity', value: `${current.relative_humidity_2m}%` },
              { icon: Wind, label: 'Wind', value: `${current.wind_speed_10m.toFixed(1)} km/h` },
              { icon: Gauge, label: 'Pressure', value: `${current.surface_pressure?.toFixed(0) ?? '—'} hPa` },
              { icon: Eye, label: 'Visibility', value: current.visibility != null ? `${(current.visibility / 1000).toFixed(0)} km` : '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white/10 rounded-xl px-3 py-2 text-center backdrop-blur-sm">
                <Icon className="w-4 h-4 mx-auto mb-1 text-white/80" />
                <p className="text-xs text-white/70">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* Sunrise/Sunset */}
          {daily?.sunrise?.[0] && (
            <div className="flex gap-4 mt-4 text-white/80 text-sm">
              <span className="flex items-center gap-1.5">
                <Sunrise className="w-4 h-4" />
                {new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex items-center gap-1.5">
                <Sunset className="w-4 h-4" />
                {new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {current.uv_index != null && (
                <span className={`flex items-center gap-1.5 ${current.uv_index >= 8 ? 'text-red-300 font-semibold' : current.uv_index >= 6 ? 'text-orange-300' : ''}`}>
                  UV: {current.uv_index} {current.uv_index >= 8 ? '⚠ Very High' : current.uv_index >= 6 ? 'High' : current.uv_index >= 3 ? 'Moderate' : 'Low'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Farm Advisories */}
      {advisories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-green-600" /> Farm Advisories
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {advisories.map((adv, i) => {
              const AdIcon = adv.icon;
              return (
                <div key={i} className={`rounded-xl border p-4 ${severityColors[adv.severity]}`}>
                  <div className="flex items-start gap-3">
                    <AdIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${severityIconColors[adv.severity]}`} />
                    <div>
                      <p className={`font-semibold text-sm ${severityText[adv.severity]}`}>{adv.title}</p>
                      <p className={`text-xs mt-1 leading-relaxed ${severityText[adv.severity]} opacity-80`}>{adv.message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Hourly Forecast (next 24h) */}
        {next24h.length > 0 && (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" /> Next 24 Hours
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {next24h.map((h, i) => (
                  <HourlyCard key={i} {...h} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spray Window Calendar — next 7 days */}
        {daily && (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-green-600" /> 7-Day Spray Windows
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {daily.time.map((date: string, i: number) => {
                  const windMax = daily.wind_speed_10m_max[i];
                  const precipProb = daily.precipitation_probability_max[i];
                  const rain = daily.precipitation_sum[i];
                  const code = daily.weather_code[i];
                  const wx = decodeWMO(code);
                  const WxI = wx.lucide;

                  let sprayOk: 'good' | 'caution' | 'bad';
                  let sprayLabel: string;
                  if (rain > 5 || code >= 61 || precipProb > 70) {
                    sprayOk = 'bad'; sprayLabel = 'No Spray';
                  } else if (windMax > 20 || precipProb > 40 || rain > 1) {
                    sprayOk = 'caution'; sprayLabel = 'Caution';
                  } else {
                    sprayOk = 'good'; sprayLabel = 'Good Window';
                  }

                  const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
                  return (
                    <div key={date} className={`flex items-center gap-3 p-2.5 rounded-lg border ${sprayOk === 'good' ? 'bg-green-50 border-green-200' : sprayOk === 'caution' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="text-sm font-medium w-20 flex-shrink-0">{dayLabel}</p>
                      <WxI className={`w-4 h-4 ${wx.color} flex-shrink-0`} />
                      <div className="flex-1 text-xs text-muted-foreground">
                        <span>{daily.temperature_2m_min[i].toFixed(0)}–{daily.temperature_2m_max[i].toFixed(0)}°C</span>
                        <span className="mx-2">·</span>
                        <span>{precipProb}% rain</span>
                        <span className="mx-2">·</span>
                        <span className="flex items-center gap-0.5 inline-flex"><Wind className="w-3 h-3" /> {windMax.toFixed(0)} km/h</span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sprayOk === 'good' ? 'bg-green-200 text-green-800' : sprayOk === 'caution' ? 'bg-amber-200 text-amber-800' : 'bg-red-200 text-red-800'}`}>
                        {sprayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 7-Day Forecast */}
      {daily && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-500" /> 7-Day Forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {daily.time.map((date: string, i: number) => (
              <DailyRow key={date} date={date}
                maxTemp={daily.temperature_2m_max[i]}
                minTemp={daily.temperature_2m_min[i]}
                precip={daily.precipitation_sum[i]}
                precipProb={daily.precipitation_probability_max[i]}
                code={daily.weather_code[i]}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agronomy Data Panel */}
      {daily && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sprout className="w-4 h-4 text-green-600" /> Agronomy Data — This Week
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {daily.precipitation_sum.slice(0, 7).reduce((s: number, v: number) => s + v, 0).toFixed(1)} mm
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total Rainfall (7 days)</p>
              </div>
              <div className="border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-orange-500">
                  {Math.max(...daily.uv_index_max.slice(0, 7))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Peak UV Index</p>
              </div>
              <div className="border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {daily.et0_fao_evapotranspiration?.slice(0, 7).reduce((s: number, v: number) => s + v, 0).toFixed(1) ?? '—'} mm
                </p>
                <p className="text-xs text-muted-foreground mt-1">Evapotranspiration (ET₀)</p>
              </div>
              <div className="border rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-600">
                  {Math.max(...daily.wind_speed_10m_max.slice(0, 7)).toFixed(0)} km/h
                </p>
                <p className="text-xs text-muted-foreground mt-1">Max Wind Speed</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              ET₀ (Reference Evapotranspiration) indicates crop water demand. Use this to adjust your irrigation schedule — a higher ET₀ means crops need more water.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pb-2">
        Weather data from <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Open-Meteo</a> (open-source, no API key required) · Updates every 10 minutes
      </p>
    </div>
  );
}
