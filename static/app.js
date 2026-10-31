'use strict';
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { user:null, catalog:null, logs:[], stats:null, config:null, googleInitialized:false, token:localStorage.getItem('fitpath_token'), tab:'today', filter:'all', authMode:'login', workout:null, chatOpen:false, chatBusy:false, chat:[{role:'model',text:'Hi! I’m your FitPath coach. I can help explain exercise steps and share general fitness ideas. What would you like to work on today?'}] };
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
function showAuth(){ $('auth').hidden=false;$('main-app').hidden=true;$('legal-footer').hidden=false;switchMode(state.authMode);}
function showMain(){ $('auth').hidden=true;$('main-app').hidden=false;$('legal-footer').hidden=false;render();}
function switchMode(mode){state.authMode=mode;const registering=mode==='register';$('auth').classList.toggle('is-registering',registering);$('auth-form').classList.toggle('registering',registering);$('registration-extra').hidden=!registering;$('registration-consent').required=registering;$('login-switch').classList.toggle('active',!registering);$('register-switch').classList.toggle('active',registering);$('auth-submit').innerHTML=registering?'Create my account <span>→</span>':'Sign in <span>→</span>';$('auth-password').autocomplete=registering?'new-password':'current-password';$('auth-name').required=registering;$('auth-error').hidden=true;renderGoogleButtons();}
$('login-switch').addEventListener('click',()=>switchMode('login'));
$('register-switch').addEventListener('click',()=>switchMode('register'));
async function acceptSession(result){
 state.token=result.token;localStorage.setItem('fitpath_token',result.token);state.user=result.user;
 try{
  const [logs,stats]=await Promise.all([api('/api/logs'),api(`/api/stats?today=${encodeURIComponent(todayLocal())}`)]);
  state.logs=logs.logs;state.stats=stats;state.tab='today';showMain();
 }catch(error){logout(false);throw error;}
}
$('auth-form').addEventListener('submit',async event=>{
 event.preventDefault(); const btn=$('auth-submit');btn.disabled=true;$('auth-error').hidden=true;
 try{
  const payload={email:$('auth-email').value.trim(),password:$('auth-password').value};
  if(state.authMode==='register')Object.assign(payload,{name:$('auth-name').value.trim(),level:$('auth-level').value,goal:$('auth-goal').value,diet_pref:$('auth-diet').value});
  const result=await api(state.authMode==='login'?'/api/login':'/api/register',{method:'POST',body:JSON.stringify(payload)});
  await acceptSession(result);
 }catch(error){$('auth-error').textContent=error.message;$('auth-error').hidden=false;}finally{btn.disabled=false;}
});
function logout(callServer=true){const token=state.token;if(callServer&&token)api('/api/logout',{method:'POST'}).catch(()=>{});state.token=null;state.user=null;state.logs=[];state.stats=null;state.chatOpen=false;localStorage.removeItem('fitpath_token');showAuth();}
function isDone(exerciseId,date=todayLocal()){return state.logs.some(l=>l.exercise_id===exerciseId&&l.performed_on===date);}
async function updateStats(){state.stats=await api(`/api/stats?today=${encodeURIComponent(todayLocal())}`);}
async function googleCredential(result){
 $('google-error').hidden=true;
 if(!state.user&&!googleConsentGiven()){$('google-error').textContent='Please agree to the Terms and read the Privacy Policy before continuing.';$('google-error').hidden=false;return;}
 try{
  const linking=Boolean(state.user);
  const response=await api(linking?'/api/auth/google/link':'/api/auth/google',{method:'POST',body:JSON.stringify({credential:result.credential})});
  if(linking){state.user=response.user;render();toast('Google account connected.');}
  else await acceptSession(response);
 }catch(error){$('google-error').textContent=error.message;$('google-error').hidden=false;}
}
function googleConsentGiven(){return state.authMode==='register'?!$('registration-extra').hidden&&$('registration-consent').checked:$('google-consent').checked;}
function renderGoogleButtons(){
 if(!state.config?.googleClientId||!window.google?.accounts?.id)return;
 $('google-unavailable').hidden=true;
 if(!state.googleInitialized){
  window.google.accounts.id.initialize({client_id:state.config.googleClientId,callback:googleCredential});
  state.googleInitialized=true;
 }
 const authButton=$('google-button');
 const consentGiven=googleConsentGiven();
 authButton.hidden=false;
 authButton.classList.toggle('needs-consent',!consentGiven);
 authButton.setAttribute('aria-disabled',String(!consentGiven));
 if(!authButton.hidden&&!authButton.dataset.ready){
  window.google.accounts.id.renderButton(authButton,{type:'standard',theme:'filled_black',size:'large',text:'continue_with',shape:'pill',width:280});
  authButton.dataset.ready='true';
 }
 const linkButton=$('google-link-button');
 if(linkButton&&!linkButton.dataset.ready){
  window.google.accounts.id.renderButton(linkButton,{type:'standard',theme:'filled_black',size:'medium',text:'continue_with',shape:'pill',width:260});
  linkButton.dataset.ready='true';
 }
}
function loadGoogleSignIn(){
 if(!state.config?.googleClientId)return;
 $('google-unavailable').textContent='Loading Google sign-in…';
 const script=document.createElement('script');
 script.src='https://accounts.google.com/gsi/client';
 script.async=true;
 script.onload=renderGoogleButtons;
 script.onerror=()=>{$('google-unavailable').textContent='Google sign-in could not be loaded. Check your connection.';$('google-unavailable').hidden=false;};
 document.head.append(script);
}
function todaysExercises(){const set=state.catalog.exercises.filter(e=>e.level===state.user.level); const n=new Date().getDay();const shift=state.user.goal==='strength'?1:state.user.goal==='weight-management'?2:0;return [0,1,2].map(i=>set[(i+n+shift)%set.length]);}
function exerciseCard(e){const done=isDone(e.id);return `<article class="exercise-card"><div class="exercise-top"><span class="exercise-emoji">${escapeHtml(e.emoji)}</span><span class="tag">${e.duration_min} min</span></div><h3>${escapeHtml(e.name)}</h3><div class="exercise-meta">${escapeHtml(e.body_part)} · ${escapeHtml(e.sets)} sets × ${escapeHtml(e.reps)}</div><div class="exercise-actions"><button class="outline-btn" data-detail="${escapeHtml(e.id)}">View steps</button><button class="done-btn ${done?'is-done':''}" data-done="${escapeHtml(e.id)}">${done?'✓ Done':'+ Log'}</button></div></article>`;}
function metrics(){const dates=new Set(state.logs.map(l=>l.performed_on));const current=new Date();let activeDays=0;for(let i=0;i<7;i++){const d=new Date(current.getFullYear(),current.getMonth(),current.getDate()-i), p=n=>String(n).padStart(2,'0');if(dates.has(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`))activeDays++;}return {activeDays,total:state.logs.length,today:state.logs.filter(l=>l.performed_on===todayLocal()).length};}
function header(title,kicker,description){return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${description}</p></div><span class="small-badge">${escapeHtml(niceLevel(state.user.level))}</span></div>`;}
function todayView(){const m=metrics(),workout=todaysExercises();const minutes=workout.reduce((s,e)=>s+e.duration_min,0),completed=workout.filter(e=>isDone(e.id)).length,currentStreak=state.stats?.current_streak??0;return `${header(`${greeting()}, ${escapeHtml(state.user.name.split(' ')[0])}.`,'YOUR DAILY DASHBOARD','Small steps, consistent progress.')}
  <div class="hero-card"><span class="hero-symbol">↗</span><p class="eyebrow">TODAY'S MOVE</p><h2>Your ${escapeHtml(niceLevel(state.user.level))} routine</h2><p>Three simple guided activities chosen from your current level. Go at your own pace.</p><div class="hero-footer"><span class="tag">◷ About ${minutes} minutes · ${completed}/${workout.length} done</span><button class="primary-btn" data-start-workout>${completed?'Continue workout':'Start workout'} <span>→</span></button></div><button class="ghost-btn" data-tab="exercises">Browse all exercises</button></div>
  <div class="metrics"><div class="metric streak-metric"><strong>🔥 ${currentStreak} day${currentStreak===1?'':'s'}</strong><span>Current streak · best ${state.stats?.longest_streak??0}</span></div><div class="metric"><strong>${m.activeDays}/7</strong><span>Active days</span></div><div class="metric"><strong>${m.total}</strong><span>Total exercises</span></div></div>
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
 <div class="profile-streak"><span>🔥</span><div><strong>${state.stats?.current_streak??0} day current streak</strong><p>Personal best: ${state.stats?.longest_streak??0} days · ${state.stats?.active_days??0} active days total</p></div></div>
 <form id="profile-form" class="profile-fields"><label>Full name<input name="name" required minlength="2" maxlength="80" value="${escapeHtml(u.name)}"></label>
 <label>Age (optional, 18+)<input name="age" type="number" min="18" max="100" value="${u.age??''}" placeholder="Not set"></label>
 <label>Fitness level<select name="level">${levels.map(s=>`<option value="${s}" ${u.level===s?'selected':''}>${niceLevel(s)}</option>`).join('')}</select></label>
 <label>Primary goal<select name="goal"><option value="general" ${u.goal==='general'?'selected':''}>General fitness</option><option value="strength" ${u.goal==='strength'?'selected':''}>Build strength</option><option value="weight-management" ${u.goal==='weight-management'?'selected':''}>Weight management</option></select></label>
 <label>Diet preference<select name="diet_pref">${state.catalog.plans.map(p=>`<option value="${p.id}" ${u.diet_pref===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></label><button type="submit" class="primary-btn full">Save changes →</button></form>
 <div class="google-link-area"><strong>Google sign-in</strong><p>${u.google_connected?'This account is connected to Google.':'Connect Google using the same email address as your FitPath account.'}</p>${u.google_connected?'':'<div id="google-link-button"></div>'}</div>
 <button class="ghost-btn profile-logout" data-logout>Sign out</button></div>
 <div class="section-title"><h2>Activity history</h2><p>${m.total} logged</p></div>${recent.length?recent.map(l=>{const e=state.catalog.exercises.find(e=>e.id===l.exercise_id);return `<div class="history-row"><span>✓ ${escapeHtml(e?.name||'Exercise')}</span><small>${formattedDate(l.performed_on)}</small></div>`;}).join(''):'<div class="empty">Your activity log will appear here.</div>'}
 <p class="fine-note">FitPath stores your account and workout log on your own server. For backups, follow the README instructions.</p>`;}
function render(){if(!state.user||!state.catalog)return;const views={today:todayView,exercises:exercisesView,diet:dietView,profile:profileView};$('content').innerHTML=views[state.tab]();document.querySelectorAll('[data-tab].selected').forEach(b=>b.classList.remove('selected'));document.querySelectorAll(`.bottom-nav [data-tab="${state.tab}"]`).forEach(b=>b.classList.add('selected'));renderGoogleButtons();if(state.chatOpen)renderChat();}
function renderChat(){
 $('chat-widget').innerHTML=`<div class="chat-header"><div><strong>FitPath coach</strong><small>General fitness support</small></div><button type="button" class="close-modal" data-chat-close aria-label="Close chat">×</button></div><div class="chat-messages" aria-live="polite">${state.chat.map(message=>`<div class="chat-message ${message.role==='user'?'chat-user':'chat-coach'}">${escapeHtml(message.text)}</div>`).join('')}${state.chatBusy?'<div class="chat-message chat-coach">Thinking…</div>':''}</div><p class="chat-note">${state.config?.chatEnabled?'General information only. Don’t share medical or sensitive personal details.':'Chat replies are unavailable until the server is configured with a Gemini API key.'}</p><form id="chat-form" class="chat-form"><textarea name="message" maxlength="1200" placeholder="Ask about an exercise…" aria-label="Message the FitPath coach" required ${state.chatBusy||!state.config?.chatEnabled?'disabled':''}></textarea><button class="primary-btn" type="submit" ${state.chatBusy||!state.config?.chatEnabled?'disabled':''}>Send</button></form>`;
 const messages=$('chat-widget').querySelector('.chat-messages');
 messages.scrollTop=messages.scrollHeight;
}
async function submitChat(form){
 const message=String(new FormData(form).get('message')||'').trim();
 if(!message||state.chatBusy)return;
 const history=state.chat.slice(-8).map(item=>({role:item.role,text:item.text}));
 state.chat.push({role:'user',text:message});state.chatBusy=true;renderChat();
 try{
  const result=await api('/api/chat',{method:'POST',body:JSON.stringify({message,history})});
  state.chat.push({role:'model',text:result.reply});
 }catch(error){state.chat.push({role:'model',text:error.message});}
 finally{state.chatBusy=false;renderChat();}
}
function exerciseVisual(exercise){
 const drawings={
  'wall-pushup':['Wall push-up: standing facing a wall, body straight, hands supported at chest height.','<path class="equipment" d="M173 14V126"/><g class="move move-wall"><circle class="head" cx="105" cy="31" r="10"/><path class="body-line" d="M104 43L101 81M104 51L132 57L169 55M103 62L134 78L169 80M101 81L83 123M101 81L122 123"/></g>'],
  'chair-squat':['Chair squat: hips move back toward a stable chair as knees bend.','<path class="equipment" d="M124 68V112M124 75H157V112M128 112V127M153 112V127"/><g class="move move-squat"><circle class="head" cx="75" cy="25" r="10"/><path class="body-line" d="M75 37L74 78M75 50L48 62L41 76M75 50L101 62L112 75M74 78L91 100L108 122M74 78L55 100L40 122"/></g>'],
  'march':['March in place: upright posture while alternating a comfortable knee lift.','<g class="move move-march"><circle class="head" cx="91" cy="23" r="10"/><path class="body-line" d="M91 35V76M91 45L70 63M91 45L112 63M91 76L76 112L69 124M91 76L108 98L120 92"/></g>'],
  'bird-dog':['Bird dog: hands and knees with opposite arm and leg reaching long.','<path class="equipment" d="M26 121H177"/><g class="move move-bird"><circle class="head" cx="48" cy="61" r="9"/><path class="body-line" d="M57 69L111 82M64 72L36 101L28 119M81 76L75 103L69 120M111 82L140 62L171 57M111 82L139 103L164 119"/></g>'],
  'incline-pushup':['Incline push-up: straight body, hands on a stable elevated support.','<path class="equipment" d="M151 68H181V115H151M157 115V127M175 115V127"/><g class="move move-incline"><circle class="head" cx="47" cy="42" r="9"/><path class="body-line" d="M56 46L106 62L149 72M68 50L64 78L80 87M106 62L117 85L145 91"/></g>'],
  'reverse-lunge':['Reverse lunge: step one foot back while keeping the torso upright.','<g class="move move-lunge"><circle class="head" cx="91" cy="23" r="10"/><path class="body-line" d="M91 35V76M91 45L72 63M91 45L110 63M91 76L111 99L122 122M91 76L68 99L47 109L39 122"/></g>'],
  'plank':['Forearm plank: straight line from shoulders through hips to heels.','<path class="equipment" d="M22 124H180"/><g class="move move-plank"><circle class="head" cx="47" cy="73" r="9"/><path class="body-line" d="M57 76L107 82L154 86L176 111M73 78L67 105L62 122M108 82L130 102L154 86"/></g>'],
  'stepup':['Low step-up: step onto a stable low platform with control.','<path class="equipment" d="M113 91H177V124H113ZM124 124V129M168 124V129"/><g class="move move-step"><circle class="head" cx="79" cy="25" r="10"/><path class="body-line" d="M79 37V76M79 47L60 64M79 47L98 64M79 76L99 91L123 91M79 76L65 100L61 122"/></g>'],
  'pushup':['Floor push-up: hands under shoulders, body braced in a straight line.','<path class="equipment" d="M20 124H184"/><g class="move move-pushup"><circle class="head" cx="41" cy="66" r="9"/><path class="body-line" d="M51 69L101 77L154 83L177 111M68 71L67 98L63 121M105 78L121 102L154 83"/></g>'],
  'split-squat':['Split squat: lower and rise in a staggered stance with control.','<g class="move move-split"><circle class="head" cx="92" cy="23" r="10"/><path class="body-line" d="M92 35V77M92 46L73 63M92 46L111 63M92 77L112 98L123 122M92 77L70 99L50 117L47 124"/></g>'],
  'side-plank':['Side plank: shoulder stacked over elbow, hips lifted and body aligned.','<path class="equipment" d="M23 124H183"/><g class="move move-side"><circle class="head" cx="63" cy="77" r="9"/><path class="body-line" d="M70 84L105 78L143 68L174 70M79 82L63 105L53 121M104 78L119 101L149 111"/></g>'],
  'mountain-climber':['Slow mountain climber: supported high plank with one knee driving forward.','<path class="equipment" d="M20 124H184"/><g class="move move-climber"><circle class="head" cx="42" cy="65" r="9"/><path class="body-line" d="M52 68L103 77L157 82L179 111M69 71L65 99L61 122M107 77L132 94L146 116"/></g>']
 };
 const [label,body]=drawings[exercise.id]||drawings.plank;
 return `<div class="exercise-visual"><svg class="exercise-illustration" viewBox="0 0 205 145" role="img" aria-label="${escapeHtml(label)}"><path class="visual-ground" d="M15 130H190"/>${body}</svg><span>Animated form preview · simplified guide</span></div>`;
}
function detail(exerciseId){const e=state.catalog.exercises.find(e=>e.id===exerciseId);if(!e)return;const done=isDone(exerciseId);$('modal-content').innerHTML=`<div class="modal-head"><span class="exercise-emoji">${escapeHtml(e.emoji)}</span><button class="close-modal" data-close aria-label="Close">×</button></div><h2>${escapeHtml(e.name)}</h2><p class="muted">${escapeHtml(e.description)}</p>${exerciseVisual(e)}<div class="filters"><span class="tag">${escapeHtml(niceLevel(e.level))}</span><span class="tag">${escapeHtml(e.body_part)}</span><span class="tag">${e.duration_min} minutes</span></div><div class="section-title"><h2>Step-by-step</h2></div><ol>${e.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol><div class="info-block"><strong>Suggested volume:</strong> ${escapeHtml(e.sets)} sets · ${escapeHtml(e.reps)}<br><strong>Equipment:</strong> ${escapeHtml(e.equipment)}</div><div class="info-block"><strong>Safety:</strong> ${escapeHtml(e.safety)}</div><button class="primary-btn full" data-done="${escapeHtml(e.id)}">${done?'Undo today’s log':'✓ Mark completed today'}</button>`;$('modal').hidden=false;}
function closeModal(){state.workout=null;$('modal').hidden=true;}
function startWorkout(){
 const exercises=todaysExercises().filter(Boolean);
 if(!exercises.length){toast('No exercises are available for your current level.');return;}
 const firstIncomplete=exercises.findIndex(e=>!isDone(e.id));
 state.workout={exercises,index:firstIncomplete<0?exercises.length:firstIncomplete};
 renderWorkout();
 $('modal').hidden=false;
}
function renderWorkout(){
 const workout=state.workout;
 if(!workout)return;
 const {exercises,index}=workout;
 const completed=exercises.filter(e=>isDone(e.id)).length;
 if(index>=exercises.length){
  const message=completed===exercises.length?'Your routine is complete. Great work—take a moment to cool down and recover.':`You logged ${completed} of ${exercises.length} activities. You can finish skipped exercises later.`;
  $('modal-content').innerHTML=`<div class="modal-head"><span class="exercise-emoji">🎉</span><button class="close-modal" data-workout-close aria-label="Close workout">×</button></div><p class="eyebrow">TODAY'S ROUTINE</p><h2>Session finished</h2><p class="muted">${message}</p><div class="session-progress-label">${completed} of ${exercises.length} activities completed</div><progress class="session-progress" aria-label="Workout completion" max="${exercises.length}" value="${completed}"></progress><button class="primary-btn full" data-workout-close>Done</button>`;
  return;
 }
 const exercise=exercises[index];
 const done=isDone(exercise.id);
 $('modal-content').innerHTML=`<div class="modal-head"><span class="exercise-emoji">${escapeHtml(exercise.emoji)}</span><button class="close-modal" data-workout-close aria-label="End workout">×</button></div><p class="eyebrow">GUIDED WORKOUT · ${index+1} OF ${exercises.length}</p><progress class="session-progress" aria-label="Workout progress" max="${exercises.length}" value="${index+1}"></progress><h2>${escapeHtml(exercise.name)}</h2><p class="muted">${escapeHtml(exercise.description)}</p>${exerciseVisual(exercise)}<div class="filters"><span class="tag">${escapeHtml(exercise.duration_min)} min</span><span class="tag">${escapeHtml(exercise.sets)} sets · ${escapeHtml(exercise.reps)}</span><span class="tag">${escapeHtml(exercise.equipment)}</span></div><div class="section-title"><h2>How to do it</h2></div><ol>${exercise.steps.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol><div class="info-block"><strong>Safety:</strong> ${escapeHtml(exercise.safety)}</div><button class="primary-btn full" data-workout-complete="${escapeHtml(exercise.id)}">${done?'Continue':'Mark complete & continue'} <span>→</span></button><button class="session-skip" data-workout-skip>Skip this exercise</button>`;
}
async function completeWorkoutExercise(id){
 const workout=state.workout;
 const exercise=workout?.exercises[workout.index];
 if(!workout||!exercise||exercise.id!==id)return;
 const button=document.querySelector('[data-workout-complete]');
 if(button)button.disabled=true;
 try{
  if(!isDone(id)){
   const date=todayLocal();
   await api('/api/logs',{method:'POST',body:JSON.stringify({exerciseId:id,date})});
   state.logs.unshift({exercise_id:id,performed_on:date});
   await updateStats();
   toast('Exercise completed and logged.');
  }
  workout.index+=1;
  render();
  renderWorkout();
 }catch(error){if(button)button.disabled=false;toast(error.message);}
}
async function toggleLog(id){try{const date=todayLocal();if(isDone(id)) {await api(`/api/logs/${encodeURIComponent(id)}?date=${encodeURIComponent(date)}`,{method:'DELETE'});state.logs=state.logs.filter(l=>!(l.exercise_id===id&&l.performed_on===date));toast('Removed from today’s log');}else{await api('/api/logs',{method:'POST',body:JSON.stringify({exerciseId:id,date})});state.logs.unshift({exercise_id:id,performed_on:date});toast('Great work! Exercise logged.');}await updateStats();render();if(!$('modal').hidden)detail(id);}catch(error){toast(error.message);}}
async function updateProfile(values){try{const r=await api('/api/me',{method:'PATCH',body:JSON.stringify(values)});state.user=r.user;render();toast('Profile updated!');}catch(e){toast(e.message);}}
document.addEventListener('click',async e=>{
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.tab){state.tab=target.dataset.tab;render();window.scrollTo(0,0);}
 else if(target.id==='chat-launcher'){state.chatOpen=!state.chatOpen;$('chat-widget').hidden=!state.chatOpen;if(state.chatOpen)renderChat();}
 else if(target.dataset.chatClose!==undefined){state.chatOpen=false;$('chat-widget').hidden=true;}
 else if(target.dataset.startWorkout!==undefined){startWorkout();}
 else if(target.dataset.workoutComplete){await completeWorkoutExercise(target.dataset.workoutComplete);}
 else if(target.dataset.workoutSkip){target.disabled=true;state.workout.index+=1;renderWorkout();}
 else if(target.dataset.workoutClose!==undefined){closeModal();}
 else if(target.dataset.filter){state.filter=target.dataset.filter;render();}
 else if(target.dataset.detail){detail(target.dataset.detail);}
 else if(target.dataset.close!==undefined){closeModal();}
 else if(target.dataset.done){await toggleLog(target.dataset.done);}
 else if(target.dataset.plan){await updateProfile({diet_pref:target.dataset.plan});}
 else if(target.dataset.logout!==undefined){logout();}
});
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();state.chatOpen=false;$('chat-widget').hidden=true;}});
(async function boot(){try{const [catalog,config]=await Promise.all([api('/api/catalog'),api('/api/config')]);state.catalog=catalog;state.config=config;if(config.googleClientId)loadGoogleSignIn();if(state.token){try{const [me,logs,stats]=await Promise.all([api('/api/me'),api('/api/logs'),api(`/api/stats?today=${encodeURIComponent(todayLocal())}`)]);state.user=me.user;state.logs=logs.logs;state.stats=stats;showMain();}catch{logout(false);}}else showAuth();}catch(e){$('auth').hidden=false;$('main-app').hidden=true;$('auth-error').hidden=false;$('auth-error').textContent=e.message;}})();
document.addEventListener('submit',async e=>{
 if(e.target.id==='profile-form'){e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());await updateProfile(d);}
 else if(e.target.id==='chat-form'){e.preventDefault();await submitChat(e.target);}
});
$('google-consent').addEventListener('change',renderGoogleButtons);
$('registration-consent').addEventListener('change',renderGoogleButtons);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
