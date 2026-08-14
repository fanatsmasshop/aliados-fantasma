export const MEXICO_STATES = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro',
  'Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala',
  'Veracruz','Yucatán','Zacatecas'
];

export function populateStateSelect(select, { value = '', includeAll = false, available = null } = {}) {
  if (!select) return;
  const source = Array.isArray(available) && available.length
    ? MEXICO_STATES.filter(state => available.includes(state))
    : MEXICO_STATES;
  const first = includeAll ? 'Todos los estados' : 'Selecciona tu estado';
  select.innerHTML = `<option value="">${first}</option>` + source
    .map(state => `<option value="${state}">${state}</option>`).join('');
  if (value && !source.includes(value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value || '';
}

export function locationLabel(data = {}) {
  return [data.colonia, data.localidad, data.municipio, data.estado_region]
    .filter(Boolean).join(', ') || 'México';
}
