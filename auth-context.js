const KEY_PREFIX = 'af_active_context_';

export function contextKey(userId){ return `${KEY_PREFIX}${userId}`; }

export function getActiveContext(userId){
  try{
    const value = JSON.parse(localStorage.getItem(contextKey(userId)) || 'null');
    if(!value || !['admin','owner'].includes(value.type)) return null;
    if(value.type === 'owner' && !value.businessId) return null;
    return value;
  }catch{
    return null;
  }
}

export function setActiveContext(userId, context){
  if(!userId) throw new Error('No se pudo guardar el contexto de acceso.');
  if(!context || !['admin','owner'].includes(context.type)) throw new Error('Contexto inválido.');
  if(context.type === 'owner' && !context.businessId) throw new Error('Falta el negocio seleccionado.');
  localStorage.setItem(contextKey(userId), JSON.stringify({...context, selectedAt:Date.now()}));
}

export function clearActiveContext(userId){
  if(userId) localStorage.removeItem(contextKey(userId));
}

export function clearAllContexts(){
  Object.keys(localStorage).filter(key=>key.startsWith(KEY_PREFIX)).forEach(key=>localStorage.removeItem(key));
}

export function contextHome(context){
  if(context?.type === 'admin') return 'dashboard.html';
  if(context?.type === 'owner') return `panel.html?business=${encodeURIComponent(context.businessId)}`;
  return 'login.html';
}

export function requireContext(userId, expectedType){
  const context = getActiveContext(userId);
  if(!context){
    location.replace('login.html?choose=1');
    return null;
  }
  if(context.type !== expectedType){
    location.replace(contextHome(context));
    return null;
  }
  return context;
}
