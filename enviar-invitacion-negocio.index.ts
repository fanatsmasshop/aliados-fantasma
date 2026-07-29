import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL=(Deno.env.get('PUBLIC_SITE_URL')||'https://aliados-fantasma.pages.dev').replace(/\/$/,'');

const allowedOrigins=new Set([
  'https://aliados-fantasma.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function corsHeaders(req:Request){
  const origin=req.headers.get('Origin')||'';
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://aliados-fantasma.pages.dev',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin'
  };
}

function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders(req),'Content-Type':'application/json; charset=utf-8'}
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders(req)});
  if(req.method!=='POST') return json(req,{ok:false,message:'Método no permitido'},405);

  try{
    const authorization=req.headers.get('Authorization');
    if(!authorization) return json(req,{ok:false,message:'Sesión requerida'},401);

    const caller=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
      global:{headers:{Authorization:authorization}},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });

    const {data:{user},error:userError}=await caller.auth.getUser();
    if(userError||!user) return json(req,{ok:false,message:'La sesión expiró. Inicia sesión nuevamente.'},401);

    const payload=await req.json().catch(()=>({}));
    const negocioId=String(payload.negocio_id||'').trim();
    const correo=String(payload.correo||'').trim().toLowerCase();
    const rol=String(payload.rol||'propietario').trim();

    if(!/^[0-9a-f-]{36}$/i.test(negocioId)) return json(req,{ok:false,message:'Negocio inválido'},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return json(req,{ok:false,message:'Correo inválido'},400);
    if(!['propietario','administrador','colaborador'].includes(rol)) return json(req,{ok:false,message:'Rol inválido'},400);

    // Esta RPC valida que el usuario sea administrador y crea el token interno.
    const {data:invitation,error:inviteDbError}=await caller.rpc('admin_crear_invitacion_negocio',{
      p_negocio_id:negocioId,
      p_correo:correo,
      p_rol:rol
    });
    if(inviteDbError) return json(req,{ok:false,message:inviteDbError.message},403);

    const {data:business}=await admin.from('negocios').select('nombre').eq('id',negocioId).maybeSingle();
    const negocioNombre=business?.nombre||'tu negocio';
    const link=`${PUBLIC_SITE_URL}/invitacion.html?token=${encodeURIComponent(invitation.token)}`;

    let emailSent=false;
    let deliveryMode='none';
    let emailWarning='';

    const {error:authInviteError}=await admin.auth.admin.inviteUserByEmail(correo,{
      redirectTo:link,
      data:{
        negocio_id:negocioId,
        negocio_nombre:negocioNombre,
        rol,
        invitacion_token:invitation.token,
        invitado_por:user.email||''
      }
    });

    if(!authInviteError){
      emailSent=true;
      deliveryMode='invite';
    }else{
      const text=(authInviteError.message||'').toLowerCase();
      const isExisting=text.includes('already')||text.includes('registered')||text.includes('exists');
      if(isExisting){
        // Para cuentas existentes enviamos un Magic Link que conserva el mismo destino.
        const mailClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
          auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
        });
        const {error:magicError}=await mailClient.auth.signInWithOtp({
          email:correo,
          options:{shouldCreateUser:false,emailRedirectTo:link}
        });
        if(!magicError){
          emailSent=true;
          deliveryMode='magiclink';
        }else{
          emailWarning=magicError.message;
        }
      }else{
        emailWarning=authInviteError.message;
      }
    }

    return json(req,{
      ok:true,
      correo:invitation.correo,
      rol:invitation.rol,
      vence_at:invitation.vence_at,
      link,
      email_sent:emailSent,
      delivery_mode:deliveryMode,
      warning:emailWarning||null
    });
  }catch(error){
    console.error(error);
    return json(req,{ok:false,message:error instanceof Error?error.message:'Error inesperado'},500);
  }
});
