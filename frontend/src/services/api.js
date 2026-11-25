const API_BASE=import.meta.env.VITE_API_URL||'/api';
async function request(path,{method='GET',body,headers={},form=false}={}){
 const token=sessionStorage.getItem('mgo_access');
 const h={...headers};if(token)h.Authorization=`Bearer ${token}`;if(body&&!form)h['Content-Type']='application/json';
 let res=await fetch(`${API_BASE}${path}`,{method,headers:h,body:body?(form?body:JSON.stringify(body)):undefined,credentials:'include'});
 if(res.status===401&&path!='/auth/refresh'){
  const rr=await fetch(`${API_BASE}/auth/refresh`,{method:'POST',credentials:'include'});
  if(rr.ok){const r=await rr.json();sessionStorage.setItem('mgo_access',r.access_token);h.Authorization=`Bearer ${r.access_token}`;res=await fetch(`${API_BASE}${path}`,{method,headers:h,body:body?(form?body:JSON.stringify(body)):undefined,credentials:'include'});}
 }
 const type=res.headers.get('content-type')||'';const data=type.includes('application/json')?await res.json():await res.text();
 if(!res.ok){
  const detail=data?.detail;
  const message=Array.isArray(detail)
   ? detail.map(item=>{
      if(typeof item==='string') return item;
      const field=Array.isArray(item?.loc)?item.loc.filter(x=>x!=='body').join(' → '):'';
      return [field,item?.msg].filter(Boolean).join(': ') || JSON.stringify(item);
    }).join('; ')
   : detail && typeof detail==='object'
    ? (detail.message || detail.msg || JSON.stringify(detail))
    : detail;
  throw new Error(message || `Request failed (${res.status})`);
 }
 return data;
}
export const api={get:p=>request(p),post:(p,b)=>request(p,{method:'POST',body:b}),upload:(p,file,params='')=>{const f=new FormData();f.append('file',file);return request(p+params,{method:'POST',body:f,form:true})},delete:p=>request(p,{method:'DELETE'}),changePassword:b=>request('/auth/change-password',{method:'POST',body:b})};
export const apiBase=API_BASE;
