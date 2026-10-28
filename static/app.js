'use strict';
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { user:null, catalog:null, logs:[], token:localStorage.getItem('fitpath_token'), tab:'today', filter:'all', authMode:'login' };
const levels=['beginner','intermediate','advanced'];
const niceLevel = s => s[0].toUpperCase()+s.slice(1);
const todayLocal=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
const formattedDate = (date)=>new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'});
let toastTimeout;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,2900);}
async function api(path,options={}){
 const headers={'Content-Type':'application/json',...(state.token?{Authorization:`Bearer ${state.token}`}:{})};
 let response;
 try{response=await fetch(path,{...options,headers:{...headers,...options.headers}});}catch{throw new Error('Cannot reach the server. Check your internet connection.');}
 let data={};try{data=await response.json();}catch{}
 if(!response.ok){if(response.status===401&&state.user){logout(false);throw new Error('Session expired. Sign in again.');}throw new Error(data.error||`Request failed (${response.status}).`);}
 return data;
}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
function showAuth(){ $('auth').hidden=false;$('main-app').hidden=true;switchMode(state.authMode);}
function showMain(){ $('auth').hidden=true;$('main-app').hidden=false;render();}
function switchMode(mode){state.authMode=mode;const registering=mode==='register';$('registration-extra').hidden=!registering;$('login-switch').classList.toggle('active',!registering);$('register-switch').classList.toggle('active',registering);$('auth-submit').innerHTML=registering?'Create my account <span>→</span>':'Sign in <span>→</span>';$('auth-password').autocomplete=registering?'new-password':'current-password';$('auth-name').required=registering;$('auth-error').hidden=true;}
$('login-switch').addEventListener('click',()=>switchMode('login'));
$('register-switch').addEventListener('click',()=>switchMode('register'));
$('auth-form').addEventListener('submit',async event=>{
 event.preventDefault(); const btn=$('auth-submit');btn.disabled=true;$('auth-error').hidden=true;
 try{
  const payload={email:$('auth-email').value.trim(),password:$('auth-password').value};
  if(state.authMode==='register')Object.assign(payload,{name:$('auth-name').value.trim(),level:$('auth-level').value,goal:$('auth-goal').value,diet_pref:$('auth-diet').value});
  const result=await api(state.authMode==='login'?'/api/login':'/api/register',{method:'POST',body:JSON.stringify(payload)});
  state.token=result.token;localStorage.setItem('fitpath_token',result.token);state.user=result.user;state.logs=(await api('/api/logs')).logs;state.tab='today';showMain();
 }catch(error){$('auth-error').textContent=error.message;$('auth-error').hidden=false;}finally{btn.disabled=false;}
});
function logout(callServer=true){const token=state.token;if(callServer&&token)api('/api/logout',{method:'POST'}).catch(()=>{});state.token=null;state.user=null;state.logs=[];localStorage.removeItem('fitpath_token');showAuth();}
function isDone(exerciseId,date=todayLocal()){return state.logs.some(l=>l.exercise_id===exerciseId&&l.performed_on===date);}
function todaysExercises(){const set=state.catalog.exercises.filter(e=>e.level===state.user.level); const n=new Date().getDay();const shift=state.user.goal==='strength'?1:state.user.goal==='weight-management'?2:0;return [0,1,2].map(i=>set[(i+n+shift)%set.length]);}
function exerciseCard(e){const done=isDone(e.id);return `<article class="exercise-card"><div class="exercise-top"><span class="exercise-emoji">${escapeHtml(e.emoji)}</span><span class="tag">${e.duration_min} min</span></div><h3>${escapeHtml(e.name)}</h3><div class="exercise-meta">${escapeHtml(e.body_part)} · ${escapeHtml(e.sets)} sets × ${escapeHtml(e.reps)}</div><div class="exercise-actions"><button class="outline-btn" data-detail="${escapeHtml(e.id)}">View steps</button><button class="done-btn ${done?'is-done':''}" data-done="${escapeHtml(e.id)}">${done?'✓ Done':'+ Log'}</button></div></article>`;}
function metrics(){const dates=new Set(state.logs.map(l=>l.performed_on));const current=new Date();let activeDays=0;for(let i=0;i<7;i++){const d=new Date(current.getFullYear(),current.getMonth(),current.getDate()-i), p=n=>String(n).padStart(2,'0');if(dates.has(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`))activeDays++;}return {activeDays,total:state.logs.length,today:state.logs.filter(l=>l.performed_on===todayLocal()).length};}
function header(title,kicker,description){return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${description}</p></div><span class="small-badge">${escapeHtml(niceLevel(state.user.level))}</span></div>`;}
function todayView(){const m=metrics(),workout=todaysExercises();const minutes=workout.reduce((s,e)=>s+e.duration_min,0);return `${header(`${greeting()}, ${escapeHtml(state.user.name.split(' ')[0])}.`,'YOUR DAILY DASHBOARD','Small steps, consistent progress.')}
  <div class="hero-card"><span class="hero-symbol">↗</span><p class="eyebrow">TODAY'S MOVE</p><h2>Your ${escapeHtml(niceLevel(state.user.level))} routine</h2><p>Three simple guided activities chosen from your current level. Go at your own pace.</p><div class="hero-footer"><span class="tag">◷ About ${minutes} minutes</span><button class="ghost-btn" data-tab="exercises">Browse all →</button></div></div>
  <div class="metrics"><div class="metric"><strong>${m.today}</strong><span>Logged today</span></div><div class="metric"><strong>${m.activeDays}/7</strong><span>Active days</span></div><div class="metric"><strong>${m.total}</strong><span>Total exercises</span></div></div>
  <div class="section-title"><h2>Today's exercise guides</h2><p>${workout.length} activities</p></div><div class="exercise-grid">${workout.map(exerciseCard).join('')}</div>
  <div class="section-title"><h2>Food for the day</h2><button data-tab="diet">See diet plan →</button></div>
  ${dietTeaser()}<p class="fine-note">Move within your ability and rest as needed. These activities and food ideas are general information for adults, not a medical treatment or individualized diet.</p>`;}
function dietTeaser(){const plan=state.catalog.plans.find(p=>p.id===state.user.diet_pref);return `<div class="plan-card current"><div><span class="tag">YOUR PLAN</span><h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description)}</p></div><span class="exercise-emoji">🥗</span></div>`;}
function exercisesView(){const all=state.catalog.exercises;const visible=all.filter(e=>state.filter==='all'||e.level===state.filter);return `${header('Movement library','LEARN THE BASICS','Simple steps, safety notes, and a way to track your effort.')}
 <div class="filters">${['all',...levels].map(s=>`<button class="filter ${state.filter===s?'active':''}" data-filter="${s}">${s==='all'?'All levels':niceLevel(s)}</button>`).join('')}</div>
 <div class="section-title"><h2>${visible.length} exercises</h2><p>Guided routines</p></div><div class="exercise-grid">${visible.map(exerciseCard).join('')}</div>
 <p class="fine-note">Warm up before activity. Adapt movements to your abilities. Seek qualified guidance for injuries, pregnancy, health conditions, or unusual symptoms.</p>`;}
function dietView(){const current=state.catalog.plans.find(p=>p.id===state.user.diet_pref);return `${header('Everyday nutrition','EAT TO FEEL GOOD','Simple meal ideas you can adapt to your preferences.')}
 <div class="diet-intro">🥦 These are food suggestions, not fixed calorie prescriptions. Adjust portions to your needs, allergies, budget, and professional advice.</div>
 <div class="section-title"><h2>Choose your plan</h2><p>${state.catalog.plans.length} simple options</p></div>
 ${state.catalog.plans.map(p=>`<div class="plan-card ${p.id===current.id?'current':''}"><div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p></div><button data-plan="${escapeHtml(p.id)}" ${p.id===current.id?'disabled':''}>${p.id===current.id?'✓ Active':'Choose'}</button></div>`).join('')}
 <div class="section-title"><h2>${escapeHtml(current.name)} meals</h2><p>Example day</p></div>
 ${current.meals.map(m=>`<div class="meal-card"><div class="meal-time">${escapeHtml(m.meal_type)}</div><div><h3>${escapeHtml(m.name)}</h3><p>${escapeHtml(m.description)}</p></div></div>`).join('')}
 <p class="fine-note">Drink water according to thirst and conditions. Food choices vary with allergies, culture, activity, and health. Ask a registered dietitian about individualized needs.</p>`;}
function profileView(){const u=state.user, m=metrics();const recent=state.logs.slice(0,8);return `${header('Your profile','PERSONAL SETTINGS','Your level and preferences shape your routine.')}
 <div class="profile-card"><div class="profile-summary"><div class="avatar">${escapeHtml(u.name.slice(0,1).toUpperCase())}</div><div><strong>${escapeHtml(u.name)}</strong><p>${escapeHtml(u.email)}</p></div></div>
 <form id="profile-form" class="profile-fields"><label>Full name<input name="name" required minlength="2" maxlength="80" value="${escapeHtml(u.name)}"></label>
 <label>Age (optional, 18+)<input name="age" type="number" min="18" max="100" value="${u.age??''}" placeholder="Not set"></label>
 <label>Fitness level<select name="level">${levels.map(s=>`<option value="${s}" ${u.level===s?'selected':''}>${niceLevel(s)}</option>`).join('')}</select></label>
 <label>Primary goal<select name="goal"><option value="general" ${u.goal==='general'?'selected':''}>General fitness</option><option value="strength" ${u.goal==='strength'?'selected':''}>Build strength</option><option value="weight-management" ${u.goal==='weight-management'?'selected':''}>Weight management</option></select></label>
 <label>Diet preference<select name="diet_pref">${state.catalog.plans.map(p=>`<option value="${p.id}" ${u.diet_pref===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></label><button type="submit" class="primary-btn full">Save changes →</button></form>
 <button class="ghost-btn" data-logout style="margin-top:14px;width:100%">Sign out</button></div>
 <div class="section-title"><h2>Activity history</h2><p>${m.total} logged</p></div>${recent.length?recent.map(l=>{const e=state.catalog.exercises.find(e=>e.id===l.exercise_id);return `<div class="history-row"><span>✓ ${escapeHtml(e?.name||'Exercise')}</span><small>${formattedDate(l.performed_on)}</small></div>`;}).join(''):'<div class="empty">Your activity log will appear here.</div>'}
 <p class="fine-note">FitPath stores your account and workout log on your own server. For backups, follow the README instructions.</p>`;}
function render(){if(!state.user||!state.catalog)return;const views={today:todayView,exercises:exercisesView,diet:dietView,profile:profileView};$('content').innerHTML=views[state.tab]();document.querySelectorAll('[data-tab].selected').forEach(b=>b.classList.remove('selected'));document.querySelectorAll(`.bottom-nav [data-tab="${state.tab}"]`).forEach(b=>b.classList.add('selected'));}
function detail(exerciseId){const e=state.catalog.exercises.find(e=>e.id===exerciseId);if(!e)return;const done=isDone(exerciseId);$('modal-content').innerHTML=`<div class="modal-head"><span class="exercise-emoji">${escapeHtml(e.emoji)}</span><button class="close-modal" data-close aria-label="Close">×</button></div><h2>${escapeHtml(e.name)}</h2><p class="muted">${escapeHtml(e.description)}</p><div class="filters"><span class="tag">${escapeHtml(niceLevel(e.level))}</span><span class="tag">${escapeHtml(e.body_part)}</span><span class="tag">${e.duration_min} minutes</span></div><div class="section-title"><h2>Step-by-step</h2></div><ol>${e.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol><div class="info-block"><strong>Suggested volume:</strong> ${escapeHtml(e.sets)} sets · ${escapeHtml(e.reps)}<br><strong>Equipment:</strong> ${escapeHtml(e.equipment)}</div><div class="info-block"><strong>Safety:</strong> ${escapeHtml(e.safety)}</div><button class="primary-btn full" data-done="${escapeHtml(e.id)}">${done?'Undo today’s log':'✓ Mark completed today'}</button>`;$('modal').hidden=false;}
async function toggleLog(id){try{const date=todayLocal();if(isDone(id)) {await api(`/api/logs/${encodeURIComponent(id)}?date=${encodeURIComponent(date)}`,{method:'DELETE'});state.logs=state.logs.filter(l=>!(l.exercise_id===id&&l.performed_on===date));toast('Removed from today’s log');}else{await api('/api/logs',{method:'POST',body:JSON.stringify({exerciseId:id,date})});state.logs.unshift({exercise_id:id,performed_on:date});toast('Great work! Exercise logged.');}render();if(!$('modal').hidden)detail(id);}catch(error){toast(error.message);}}
async function updateProfile(values){try{const r=await api('/api/me',{method:'PATCH',body:JSON.stringify(values)});state.user=r.user;render();toast('Profile updated!');}catch(e){toast(e.message);}}
document.addEventListener('click',async e=>{
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.tab){state.tab=target.dataset.tab;render();window.scrollTo(0,0);}
 else if(target.dataset.filter){state.filter=target.dataset.filter;render();}
 else if(target.dataset.detail){detail(target.dataset.detail);}
 else if(target.dataset.close!==undefined){$('modal').hidden=true;}
 else if(target.dataset.done){await toggleLog(target.dataset.done);}
 else if(target.dataset.plan){await updateProfile({diet_pref:target.dataset.plan});}
 else if(target.dataset.logout!==undefined){logout();}
});
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('modal').hidden=true;});
document.addEventListener('submit',async e=>{if(e.target.id!=='profile-form')return;e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());await updateProfile(d);});
(async function boot(){try{state.catalog=await api('/api/catalog');if(state.token){try{const [me,logs]=await Promise.all([api('/api/me'),api('/api/logs')]);state.user=me.user;state.logs=logs.logs;showMain();}catch{logout(false);}}else showAuth();}catch(e){$('auth').hidden=false;$('main-app').hidden=true;$('auth-error').hidden=false;$('auth-error').textContent=e.message;}})();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
