self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?.text()||'Tienes una nueva oportunidad'};}
  const urgent=Boolean(data.urgent);
  const title=data.title||'Aliados Fantasma';
  const options={
    body:data.body||'Tienes una nueva notificación',
    icon:data.icon||'/aliados-fantasma-icono.webp',
    badge:data.badge||'/aliados-fantasma-icono.webp',
    tag:data.notificationId?`af-${data.notificationId}`:`af-${Date.now()}`,
    renotify:true,
    silent:false,
    vibrate:urgent?[240,90,240,90,340]:[180,80,220],
    requireInteraction:urgent,
    data:{url:data.url||'/oportunidades.html',notificationId:data.notificationId||null,type:data.type||'general'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/oportunidades.html',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('navigate' in client){
        try{await client.navigate(target);}catch{}
      }
      if('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
