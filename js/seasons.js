// Seasons from the farm's hemisphere and today's date — pure code.

export function autoSeason(farm, date = new Date()){
  const lat = farm.location?.lat;
  if(lat == null) return null;
  const m = date.getMonth(); // 0 = Jan
  const north = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
  const south = ['summer','summer','autumn','autumn','autumn','winter','winter','winter','spring','spring','spring','summer'];
  return (lat < 0 ? south : north)[m];
}

export function currentSeason(farm){
  if(farm.season && farm.season !== 'auto') return farm.season;
  return autoSeason(farm) || 'summer';
}

export function groundColor(season){
  return { spring:'#7fb069', summer:'#a9b56b', autumn:'#93995a', winter:'#6f8f62' }[season];
}

export function canopyLook(habit, s){
  if(habit === 'conifer') return { color:'#2a5e36' };
  if(habit === 'evergreen') return { color: s === 'spring' ? '#4e9a45' : '#357a3a' };
  if(habit === 'deciduous') return {
    spring:{ color:'#9bd36f' }, summer:{ color:'#3f8f3a' }, autumn:{ color:'#d9822b' },
    winter:{ color:'#7a5c40', bare:true } }[s];
  if(habit === 'fruit') return {
    spring:{ color:'#f2c3d6' }, summer:{ color:'#4a9a3e', fruit:'#d8412a' },
    autumn:{ color:'#c9a23a', fruit:'#d8412a' }, winter:{ color:'#7a5c40', bare:true } }[s];
  return { color:'#357a3a' };
}

export function seasonLabel(farm){
  const s = currentSeason(farm);
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  if(farm.season && farm.season !== 'auto') return cap + ' · preview';
  if(!farm.location) return cap + ' · set location';
  return `${cap} · ${farm.location.lat < 0 ? 'Southern' : 'Northern'} Hemisphere`;
}
