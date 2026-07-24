const KEY_PREFIX = 'af_active_context_';

export function contextKey(userId){ return `${KEY_PREFIX}${userId}`; }
export function getActiveContext(userId){
  try { return JSON.parse(localStorage.getItem(contextKey(userId)) || 'null'); }
  catch { return null; }
}
export function setActiveContext(userId, context){
  localStorage.setItem(contextKey(userId), JSON.stringify({...context, selectedAt:Date.now()}));
}
export function clearActiveContext(userId){
  if(userId) localStorage.removeItem(contextKey(userId));
}
export function clearAllContexts(){
  Object.keys(localStorage).filter(k=>k.startsWith(KEY_PREFIX)).forEach(k=>localStorage.removeItem(k));
}
export function contextHome(context){
  if(context?.type === 'admin') return 'dashboard.html';
  if(context?.type === 'owner') return `panel.html${context.businessId ? `?business=${encodeURIComponent(context.businessId)}` : ''}`;
  return 'login.html';
}
export function requireContext(userId, expectedType){
  const context = getActiveContext(userId);
  if(!context){ location.replace('login.html?choose=1'); return null; }
  if(context.type !== expectedType){ location.replace(contextHome(context)); return null; }
  return context;
}
