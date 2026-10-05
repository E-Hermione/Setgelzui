import { api } from './api.js';

(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
  const money=n=>Number(n).toLocaleString('en-US').replace(/,/g,' ')+'₮';
  const pad=n=>String(n).padStart(2,'0');
  const hm=ms=>{const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())};
  const ymd=ms=>{const d=new Date(ms);return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`};

  /* ================= PLANS & CONFIG ================= */
  const PLAN_DEF=[
    {k:'week',name:'7 хоног',days:7,sample:25000,feat:['Өдөр бүр мессежээр зөвлөгөө','Түгшүүр, стрессийн дасгал','Хичээл, тест үнэгүй']},
    {k:'month',name:'1 сар',days:30,sample:79000,pop:true,feat:['Өдөр бүр мессежээр зөвлөгөө','Таны нөхцөлд тохирсон дасгалын төлөвлөгөө','7 хоног тутмын ахицын тойм']},
    {k:'quarter',name:'3 сар',days:90,sample:199000,feat:['1 сарын багцын бүх үйлчилгээ','Урт хугацааны дэмжлэг','Сард нэг удаа дэлгэрэнгүй тойм']}
  ];
  let config=null;
  const priceOf=p=>config&&config.prices&&config.prices[p.k]?config.prices[p.k]:null;
  function renderPlans(){
    const real=PLAN_DEF.some(p=>priceOf(p));
    $('plans').innerHTML=PLAN_DEF.map(p=>{const pr=priceOf(p)||p.sample;return `<div class="card plan ${p.pop?'pop':''}">
      ${p.pop?'<span class="chip badge" style="background:var(--accent);color:var(--on-accent)">Хамгийн их сонгодог</span>':''}
      <h3>${p.name}</h3>
      <div class="price">${money(pr)} <small>/ ${p.days} хоног</small></div>
      <ul>${p.feat.map(f=>`<li>${f}</li>`).join('')}</ul>
      <a class="btn ${p.pop?'':'light'}" href="#chat" data-plan="${p.k}">Сонгох</a></div>`}).join('');
    $('priceNote').innerHTML='Бүх багцад сэтгэл зүйчтэй өдөр тутмын мессеж, хичээл, тестүүд багтана.'+(real?'':' <span class="chip grey">Жишээ үнэ</span>');
    $('plans').querySelectorAll('[data-plan]').forEach(a=>a.addEventListener('click',()=>{chosenPlan=a.dataset.plan;renderApp()}));
  }
  let chosenPlan='month';
  renderPlans();

  /* ================= AUTH & CHAT ================= */
  let uid=null,isAdmin=false,meName='',profile=null;
  let chatDoc=null,sub=null,msgs=[],ready=false,listeners=[];
  const app=$('app');
  const active=()=>sub&&sub.until>Date.now();

  /* ---------- auth dialog ---------- */
  const dlg=$('authDlg'),authForm=$('authForm'),authMsg=$('authMsg');
  let authMode='login';
  const AUTH_ERR={
    'auth/email-already-in-use':'Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү.',
    'auth/invalid-email':'Имэйл хаяг буруу байна.',
    'auth/weak-password':'Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой.',
    'auth/invalid-credential':'Имэйл эсвэл нууц үг буруу байна.',
    'auth/wrong-password':'Имэйл эсвэл нууц үг буруу байна.',
    'auth/user-not-found':'Имэйл эсвэл нууц үг буруу байна.',
    'auth/too-many-requests':'Олон удаа оролдсон тул түр хүлээгээд дахин оролдоно уу.',
    'auth/network-request-failed':'Интернэт холболтоо шалгана уу.'
  };
  function authSay(t,err){authMsg.hidden=!t;authMsg.className='msg'+(err?' err':'');authMsg.textContent=t||''}
  function setAuthMode(m){
    authMode=m;
    $('tabLogin').setAttribute('aria-selected',String(m==='login'));
    $('tabReg').setAttribute('aria-selected',String(m==='reg'));
    $('regFields').hidden=m!=='reg';$('regConfirm').hidden=m!=='reg';
    $('authTitle').textContent=m==='reg'?'Шинээр бүртгүүлэх':'Тавтай морил';
    $('authSubmit').textContent=m==='reg'?'Бүртгүүлэх':'Нэвтрэх';
    $('aPass').setAttribute('autocomplete',m==='reg'?'new-password':'current-password');
    $('forgotBtn').hidden=m==='reg';
    authSay('');
  }
  function openAuth(m){
    setAuthMode(m||'login');
    try{dlg.showModal()}catch(e){dlg.setAttribute('open','')}
  }
  $('tabLogin').onclick=()=>setAuthMode('login');
  $('tabReg').onclick=()=>setAuthMode('reg');
  document.addEventListener('click',e=>{const b=e.target.closest('[data-auth]');if(b){e.preventDefault();openAuth(b.dataset.auth)}});
  authForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('aEmail').value.trim(),pass=$('aPass').value;
    if(!/^\S+@\S+\.\S+$/.test(email)){authSay('Имэйл хаягаа зөв оруулна уу.',true);return}
    if(pass.length<6){authSay('Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой.',true);return}
    const btn=$('authSubmit');btn.disabled=true;
    try{
      if(authMode==='reg'){
        const name=$('aName').value.trim(),phone=$('aPhone').value.trim();
        if(!name){authSay('Нэрээ оруулна уу.',true);return}
        if(!/^[0-9+\s-]{8,15}$/.test(phone)){authSay('Утасны дугаараа зөв оруулна уу.',true);return}
        if(pass!==$('aPass2').value){authSay('Нууц үг таарахгүй байна.',true);return}
        await api.register({name:name.slice(0,60),phone:phone.slice(0,20),email,password:pass});
      }else{
        await api.login(email,pass);
      }
      authForm.reset();dlg.close();
    }catch(err){authSay(AUTH_ERR[err&&err.code]||'Алдаа гарлаа. Дахин оролдоно уу.',true)}
    finally{btn.disabled=false}
  });
  $('forgotBtn').onclick=async()=>{
    const email=$('aEmail').value.trim();
    if(!/^\S+@\S+\.\S+$/.test(email)){authSay('Эхлээд имэйл хаягаа оруулна уу.',true);return}
    try{await api.resetPassword(email);authSay('Нууц үг сэргээх холбоосыг таны имэйл рүү илгээлээ.')}
    catch(err){authSay(err&&err.code==='demo/no-email'?'Демо горимд имэйл илгээгдэхгүй. Сервер холбогдсоны дараа ажиллана.':AUTH_ERR[err&&err.code]||'Илгээж чадсангүй. Дахин оролдоно уу.',true)}
  };
  $('logoutBtn').onclick=async()=>{try{await api.logout()}catch(e){}};

  /* ---------- chat ---------- */
  function renderApp(){
    if(!ready)return;
    if(!uid){
      app.innerHTML=`<div class="card gate"><span class="chip grey">Нэвтрээгүй</span><h3>Чат ашиглахын тулд нэвтэрнэ үү</h3>
        <p class="muted">Имэйл, нууц үгээрээ бүртгүүлээд багцаа идэвхжүүлбэл сэтгэл зүйчтэйгээ өдөр бүр чатлах боломжтой. Хичээл, тест үнэгүй.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" data-auth="reg">Бүртгүүлэх</button><button class="btn light" type="button" data-auth="login">Нэвтрэх</button></div></div>`;return;
    }
    if(active()){renderChat();return}
    const claim=chatDoc&&chatDoc.claim;
    if(claim){
      const p=PLAN_DEF.find(x=>x.k===claim.plan)||PLAN_DEF[1];
      app.innerHTML=`<div class="card gate"><span class="chip sun">Төлбөр шалгагдаж байна</span>
        <h3>Баярлалаа${chatDoc.name?', '+esc(chatDoc.name):''}!</h3>
        <p class="muted">Таны <b>${p.name}</b>-ийн багцын төлбөрийг сэтгэл зүйч шалгаж байна. Идэвхжмэгц энэ хэсэгт чат автоматаар нээгдэнэ.</p>
        <p class="note">Илгээсэн: ${ymd(claim.at)} ${hm(claim.at)}</p>
        <button class="btn light sm" type="button" id="cancelClaim">Багцаа өөрчлөх</button></div>`;
      $('cancelClaim').onclick=async()=>{try{await saveChat({claim:null})}catch(e){}};
      return;
    }
    const expired=sub&&sub.until<=Date.now();
    const bankOk=config&&config.account;
    const pre=chatDoc||profile||{};
    app.innerHTML=`<div class="card"><div class="pay-grid">
      <div style="display:grid;gap:14px">
        ${expired?`<span class="chip coral">Багц ${ymd(sub.until)}-нд дууссан</span>`:'<span class="chip">Шинэ багц</span>'}
        <h3>${expired?'Багцаа сунгах':'Багцаа сонгоод төлбөрөө төлнө үү'}</h3>
        <div class="plan-pick">${PLAN_DEF.map(p=>`<label><span><input type="radio" name="pp" id="pp-${p.k}" value="${p.k}" ${p.k===chosenPlan?'checked':''}> ${p.name}</span><b>${money(priceOf(p)||p.sample)}</b></label>`).join('')}</div>
        <div class="bank">${bankOk?`<span>Банк: <b>${esc(config.bank||'')}</b></span><span>Данс: <b>${esc(config.account)}</b></span><span>Хүлээн авагч: <b>${esc(config.holder||'')}</b></span>
          <span class="note">Гүйлгээний утга дээр утасны дугаараа бичнэ үү.</span>`:`<span><b>Дансны мэдээлэл удахгүй нэмэгдэнэ.</b></span><span class="note">Сэтгэл зүйч тохиргоог оруулсны дараа энд харагдана.</span>`}</div>
      </div>
      <form id="payForm" style="display:grid;gap:12px" novalidate>
        <label class="field"><span>Таны нэр</span><input id="pName" autocomplete="given-name" value="${esc(pre.name||meName)}"></label>
        <label class="field"><span>Утасны дугаар</span><input id="pPhone" type="tel" inputmode="tel" placeholder="8 оронтой дугаар" value="${esc(pre.phone||'')}"></label>
        <label class="field"><span>Юуны талаар ярилцмаар байна вэ? <span class="muted" style="font-weight:400">(заавал биш)</span></span><textarea id="pNote" rows="3" placeholder="Жишээ: Сүүлийн үед нойр муу, ажлын стресс их байна."></textarea></label>
        <div id="payMsg" hidden></div>
        <button class="btn" type="submit" ${bankOk?'':'disabled'}>Төлбөр төлсөн</button>
      </form></div></div>`;
    app.querySelectorAll('input[name=pp]').forEach(r=>r.onchange=()=>{chosenPlan=r.value});
    $('payForm').onsubmit=async e=>{
      e.preventDefault();
      const m=$('payMsg'),say=(t,err)=>{m.hidden=false;m.className='msg'+(err?' err':'');m.textContent=t};
      const name=$('pName').value.trim(),phone=$('pPhone').value.trim();
      if(!name){say('Нэрээ оруулна уу.',true);return}
      if(!/^[0-9+\s-]{8,15}$/.test(phone)){say('Утасны дугаараа зөв оруулна уу.',true);return}
      const note=$('pNote').value.trim().slice(0,1000);
      try{await saveChat({name:name.slice(0,60),phone:phone.slice(0,20),claim:{plan:chosenPlan,at:Date.now(),note}})}
      catch(err){say('Илгээж чадсангүй. Дахин оролдоно уу.',true)}
    };
  }

  async function saveChat(patch,targetUid,base){
    const cur=Object.assign({},base||chatDoc||{},patch,{updatedAt:Date.now()});
    await api.saveChat(targetUid||uid,cur);
  }
  const addMsg=(toUid,data)=>api.addMessage(toUid,data);

  function bubblesHtml(list,meSide){
    let out='',lastDay='';
    list.forEach(m=>{
      const d=ymd(m.at);if(d!==lastDay){out+=`<span class="day">${d}</span>`;lastDay=d}
      out+=`<div class="bub ${m.from===meSide?'me':'them'}">${esc(m.text).replace(/\n/g,'<br>')}<time>${hm(m.at)}</time></div>`;
    });
    return out;
  }

  function renderChat(){
    const p=PLAN_DEF.find(x=>x.k===sub.plan);
    const left=Math.max(0,Math.ceil((sub.until-Date.now())/864e5));
    if(!$('chatBody')){
      app.innerHTML=`<div class="card chat">
        <div class="chat-head"><div class="avatar" aria-hidden="true">СЗ</div>
          <div class="grow"><b>Таны сэтгэл зүйч</b><div class="note" id="subInfo"></div></div></div>
        <div class="chat-body" id="chatBody" aria-live="polite"></div>
        <div class="safety">Яаралтай аюултай үед чатыг хүлээлгүй <a href="#tuslamj">103 руу залгаарай</a>.</div>
        <form class="chat-foot" id="chatForm"><textarea id="chatInput" rows="1" placeholder="Мессеж бичих…" aria-label="Мессеж"></textarea><button class="btn" type="submit">Илгээх</button></form></div>`;
      const inp=$('chatInput');
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').requestSubmit()}});
      $('chatForm').onsubmit=async e=>{
        e.preventDefault();const text=inp.value.trim();if(!text)return;
        inp.value='';
        try{
          const at=Date.now();
          await addMsg(uid,{from:'user',text:text.slice(0,4000),at});
          await saveChat({lastAt:at,lastFrom:'user',lastText:text.slice(0,120)});
        }catch(err){inp.value=text}
      };
    }
    $('subInfo').textContent=`${p?p.name:''} багц · ${left} хоног үлдсэн (${ymd(sub.until)} хүртэл)`;
    const body=$('chatBody');
    body.innerHTML=msgs.length?bubblesHtml(msgs,'user'):`<p class="chat-empty">Сайн байна уу${meName?', '+esc(meName):''}! Өнөөдөр сэтгэл санаа тань ямар байна? Анхны мессежээ бичээрэй.</p>`;
    body.scrollTop=body.scrollHeight;
  }

  /* ---------- psychologist console ---------- */
  let threads=[],subsAll={},curThread=null,threadMsgs=[],unsubThread=null;
  function renderConsole(){
    const c=$('console');
    const sorted=threads.slice().sort((a,b)=>((b.d.claim?1e15:0)+(b.d.lastAt||b.d.updatedAt||0))-((a.d.claim?1e15:0)+(a.d.lastAt||a.d.updatedAt||0)));
    const list=sorted.length?sorted.map(t=>{
      const s=subsAll[t.id],act=s&&s.until>Date.now();
      const badge=t.d.claim?'<span class="chip sun">Төлбөр шалгах</span>':act?(t.d.lastFrom==='user'?'<span class="chip">Шинэ мессеж</span>':'<span class="chip grey">Идэвхтэй</span>'):'<span class="chip grey">Идэвхгүй</span>';
      return `<button type="button" data-id="${esc(t.id)}" aria-current="${t.id===curThread}"><span class="t1"><b>${esc(t.d.name||'Нэргүй')}</b>${badge}</span>
        <span class="t2">${esc(t.d.lastText||(t.d.claim?'Төлбөр төлсөн гэж мэдэгдсэн':''))}</span></button>`}).join('')
      :`<p class="note" style="padding:16px">Одоогоор хэрэглэгч алга. Хэрэглэгч багц сонгож төлбөр төлсөн гэж мэдэгдэхэд энд гарч ирнэ.</p>`;
    const t=threads.find(x=>x.id===curThread);
    let right=`<div class="chat" style="display:grid;place-items:center"><p class="chat-empty">Зүүн талаас хэрэглэгч сонгоно уу.</p></div>`;
    if(t){
      const s=subsAll[t.id],act=s&&s.until>Date.now(),cl=t.d.claim;
      const clPlan=cl&&PLAN_DEF.find(p=>p.k===cl.plan);
      right=`<div class="chat">
        <div class="chat-head"><div class="avatar" aria-hidden="true">${esc((t.d.name||'?').slice(0,1))}</div>
          <div class="grow"><b>${esc(t.d.name||'Нэргүй')}</b><div class="note">${esc(t.d.phone||'')} · ${act?`Багц ${ymd(s.until)} хүртэл`:'Багц идэвхгүй'}</div></div></div>
        <div class="activate">${cl?`<span><b>${clPlan?clPlan.name:''}</b> багцын төлбөр төлсөн гэж мэдэгдсэн (${ymd(cl.at)})${cl.note?' · «'+esc(cl.note)+'»':''}</span>`:'<span>Багц идэвхжүүлэх / сунгах:</span>'}
          <select id="actPlan">${PLAN_DEF.map(p=>`<option value="${p.k}" ${cl&&cl.plan===p.k?'selected':''}>${p.name}</option>`).join('')}</select>
          <button type="button" class="btn sm" id="actBtn">Идэвхжүүлэх</button>
          ${act?'<button type="button" class="btn sm light" id="stopBtn">Зогсоох</button>':''}</div>
        <div class="chat-body" id="psyBody">${threadMsgs.length?bubblesHtml(threadMsgs,'psy'):'<p class="chat-empty">Мессеж алга.</p>'}</div>
        <form class="chat-foot" id="psyForm"><textarea id="psyInput" rows="1" placeholder="Хариу бичих…" aria-label="Хариу"></textarea><button class="btn" type="submit">Илгээх</button></form></div>`;
    }
    const keep=$('psyInput')?$('psyInput').value:'';
    const hadFocus=document.activeElement&&document.activeElement.id==='psyInput';
    c.innerHTML=`<div class="threads">${list}</div>${right}`;
    c.querySelectorAll('.threads button').forEach(b=>b.onclick=()=>openThread(b.dataset.id));
    if(t){
      const pb=$('psyBody');pb.scrollTop=pb.scrollHeight;
      const pi=$('psyInput');pi.value=keep;if(hadFocus)pi.focus();
      pi.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('psyForm').requestSubmit()}});
      $('psyForm').onsubmit=async e=>{
        e.preventDefault();const text=pi.value.trim();if(!text)return;pi.value='';
        try{const at=Date.now();
          await addMsg(t.id,{from:'psy',text:text.slice(0,4000),at});
          await saveChat({lastAt:at,lastFrom:'psy',lastText:text.slice(0,120)},t.id,t.d);
        }catch(err){pi.value=text}
      };
      $('actBtn').onclick=async()=>{
        const p=PLAN_DEF.find(x=>x.k===$('actPlan').value);
        const s=subsAll[t.id],base=s&&s.until>Date.now()?s.until:Date.now();
        $('actBtn').disabled=true;
        try{await api.setSub(t.id,{plan:p.k,until:base+p.days*864e5,activatedAt:Date.now()});
          await saveChat({claim:null},t.id,t.d)}catch(err){$('actBtn').disabled=false}
      };
      if($('stopBtn'))$('stopBtn').onclick=async()=>{try{await api.setSub(t.id,Object.assign({},subsAll[t.id],{until:Date.now()}))}catch(e){}};
    }
  }
  function openThread(id){
    curThread=id;threadMsgs=[];
    if(unsubThread)unsubThread();
    unsubThread=api.watchMessages(id,list=>{threadMsgs=list;renderConsole()});
    renderConsole();
  }

  function fillSettings(){
    const c=config||{},p=c.prices||{};
    $('sWeek').value=p.week||'';$('sMonth').value=p.month||'';$('sQuarter').value=p.quarter||'';
    $('sBank').value=c.bank||'';$('sAcc').value=c.account||'';$('sHolder').value=c.holder||'';
  }
  $('settingsForm').onsubmit=async e=>{
    e.preventDefault();
    const num=id=>{const v=parseInt($(id).value.replace(/\D/g,''),10);return v>0?v:null};
    try{await api.saveConfig({prices:{week:num('sWeek'),month:num('sMonth'),quarter:num('sQuarter')},bank:$('sBank').value.trim().slice(0,60),account:$('sAcc').value.trim().slice(0,40),holder:$('sHolder').value.trim().slice(0,80)});
      $('sMsg').textContent='Хадгаллаа.'}catch(err){$('sMsg').textContent='Хадгалж чадсангүй. Дахин оролдоно уу.'}
  };

  /* ---------- session lifecycle ---------- */
  function stopListeners(){listeners.forEach(u=>{try{u()}catch(e){}});listeners=[];if(unsubThread){unsubThread();unsubThread=null}}
  function setHeader(){
    $('loginBtn').hidden=!!uid;$('userBox').hidden=!uid;
    if(uid)$('whoName').textContent=meName||'Миний бүртгэл';
  }
  function onUser(user){
    stopListeners();
    uid=user?user.uid:null;meName=user&&user.name||'';isAdmin=!!(user&&user.isAdmin);
    profile=user?{name:user.name,phone:user.phone}:null;
    chatDoc=null;sub=null;msgs=[];threads=[];subsAll={};curThread=null;
    $('consoleWrap').hidden=true;
    setHeader();
    if(!uid){ready=true;renderApp();return}
    ready=false;app.innerHTML=`<div class="card gate"><h3>Ачаалж байна…</h3></div>`;
    let gotChat=false,gotSub=false;
    const maybe=()=>{if(gotChat&&gotSub){ready=true;renderApp()}};
    listeners.push(api.watchChat(uid,d=>{chatDoc=d?Object.assign({},d):null;gotChat=true;if(!active()||!$('chatBody'))maybe();else renderChat()}));
    listeners.push(api.watchSub(uid,d=>{const was=active();sub=d;gotSub=true;if(was!==active()&&$('chatBody'))app.innerHTML='';maybe()}));
    listeners.push(api.watchMessages(uid,list=>{msgs=list;if(ready&&active())renderChat()}));
    if(isAdmin){
      $('consoleWrap').hidden=false;fillSettings();
      listeners.push(api.watchAllChats(list=>{threads=list;renderConsole()}));
      listeners.push(api.watchAllSubs(m=>{subsAll=m||{};renderConsole()}));
      renderConsole();
    }
  }

  setHeader();
  if(api.demo){$('demoBar').hidden=false;$('demoCreds').textContent=`${api.demoPsy.email} / ${api.demoPsy.password}`}
  api.watchConfig(d=>{config=d;renderPlans();if(!active())renderApp();if(isAdmin)fillSettings()});
  api.onAuth(onUser);

  /* ================= COURSES ================= */
  const COURSES=[
    {id:'dep',color:'--accent',title:'Сэтгэл гутралаа даван туулах',desc:'Сэтгэл гутрал гэж юу болох, түүнээс гарах бодит алхмууд.',lessons:[
      {t:'Сэтгэл гутрал гэж юу вэ?',p:['Сэтгэл гутрал бол зүгээр нэг гунигтай байх биш. Энэ нь хоёр долоо хоногоос дээш үргэлжилж, нойр, хоолны дуршил, эрч хүч, анхаарал төвлөрөлтэй хамт өөрчлөгддөг байдал юм. Дэлхийд 280 сая гаруй хүн сэтгэл гутралтай амьдардаг гэж Дэлхийн эрүүл мэндийн байгууллага тооцдог.','Сэтгэл гутрал бол хүний сул тал, залхуурал биш. Тархины үйл ажиллагаа, амьдралын дарамт, удамшил зэрэг олон хүчин зүйл нөлөөлдөг бөгөөд эмчлэгддэг.'],
       l:['Ихэнх цагт гунигтай, хоосон санагдах','Өмнө нь таалагддаг байсан зүйлсийн сонирхол алга болох','Ядрах, нойр муудах эсвэл хэт их унтах','Өөрийгөө буруутгах, үнэ цэнэгүй санагдах'],
       task:'Өнөөдөр сэтгэл санаагаа 1-ээс 10 хүртэл оноогоор үнэлж, юу нөлөөлснийг нэг өгүүлбэрээр бичээрэй.'},
      {t:'Идэвхжүүлэх: бага ч гэсэн хөдлөх',p:['Сэтгэл гутралтай үед «хүсэл төрвөл хийнэ» гэж хүлээдэг. Гэвч ихэнхдээ эсрэгээрээ ажилладаг: эхлээд хийхэд хүсэл араас нь ирдэг. Үүнийг зан үйлийн идэвхжүүлэлт гэдэг.','Гол санаа нь маш жижиг алхмаас эхлэх. Цонхоо нээх, 5 минут алхах, найздаа мессеж бичих ч тооцогдоно.'],
       l:['Таашаал өгдөг 3 зүйл, ач холбогдолтой 3 зүйлийг жагсаа','Тус бүрийг 10 минут ч болов хийх цагаа товло','Хийснийхээ дараа сэтгэл санаагаа 1–10-аар үнэл'],
       task:'Маргааш хийх нэг жижиг таатай үйлдлийг сонгоод цагийг нь товло. Жишээ нь: «12:30-д 10 минут гадаа алхана».'},
      {t:'Бодлын хавхыг таних',p:['Сэтгэл гутрал бодлыг маань өнгөлдөг. «Би юу ч чадахгүй», «Хэзээ ч сайжрахгүй» гэх мэт автомат бодлууд бодит байдлаас илүү харанхуй дүр зураг зурдаг.'],
       l:['Хар цагаан сэтгэлгээ: «Төгс биш бол бүтэлгүй»','Хэт ерөнхийлөх: «Надад үргэлж ингэж тохиолддог»','Сүйрлийн сэтгэлгээ: «Энэ бол бүх зүйлийн төгсгөл»','Бодол уншигч: «Тэр намайг муу гэж бодож байгаа»'],
       task:'Өнөөдөр толгойд тань орж ирсэн нэг сөрөг бодлыг бичээд, аль хавхад орохыг тодорхойлоорой.'},
      {t:'Бодлоо шалгаж, тэнцвэржүүлэх',p:['Бодлыг таньсны дараа түүнийг шүүгч шиг шалгана. Зорилго нь хуурамчаар эерэг бодох биш, илүү бодитой харах юм.'],
       l:['Энэ бодлыг батлах ямар баримт байна?','Үүний эсрэг ямар баримт байна?','Найз маань ийм бодолтой байвал би юу гэж хэлэх вэ?','Илүү тэнцвэртэй бодол юу вэ?'],
       task:'Өмнөх хичээлд бичсэн бодлоо 4 асуултаар шалгаад шинэ бодлоо бичээрэй. «Би юу ч чадахгүй» → «Өнөөдөр хэцүү байсан ч өчигдөр ажлаа дуусгасан».'},
      {t:'Дэмжлэгийн сүлжээ ба цаашдын алхам',p:['Сэтгэл гутрал хүнийг бусдаас тусгаарлахыг хүсүүлдэг ч тусгаарлалт нь байдлыг улам хүндрүүлдэг. Итгэдэг нэг хүнтэй ярих нь эдгэрэлтийн чухал хэсэг.','2 долоо хоногоос дээш шинж тэмдэг үргэлжилж байвал мэргэжлийн тусламж хэрэгтэй.'],
       l:['Итгэдэг 2–3 хүнээ нэрлэ','Хэцүү үедээ хийх төлөвлөгөө гарга: хэнд залгах, юу хийх','Нойр, хоол, хөдөлгөөнөө тогтмолжуул'],
       task:'Итгэдэг нэг хүндээ өнөөдөр мессеж бичээрэй. Зүгээр мэндлэх ч холбоог сэргээдэг.'}]},
    {id:'anx',color:'--sun',title:'Түгшүүрээ номхотгох',desc:'Санаа зовнил, айдас, сандралыг ойлгож, зохицуулах.',lessons:[
      {t:'Түгшүүр яагаад бий болдог вэ?',p:['Түгшүүр бол биднийг аюулаас хамгаалдаг байгалийн дохиолол. Асуудал нь дохиолол хэт мэдрэг болж, аюулгүй нөхцөлд ч дуугардаг болсон үед үүсдэг.'],
       l:['Түгшүүр аюултай биш, тааламжгүй мэдрэмж','Биеийн шинж тэмдэг 10–20 минутад аяндаа намждаг','Зайлсхийх нь урт хугацаанд айдсыг өсгөдөг'],
       task:'Түгшүүр төрөх үед биеийн аль хэсэгт юу мэдрэгддэгийг ажиглаад бичээрэй.'},
      {t:'Биеэ тайвшруулах аргууд',p:['Удаан, гүн амьсгал мэдрэлийн системд «аюулгүй байна» гэсэн дохио өгдөг. Амьсгалаа гаргах хугацааг авахаас урт болгох нь хамгийн энгийн арга.'],
       l:['Хайрцган амьсгал: 4-4-4-4','5-4-3-2-1 арга: харж буй 5, сонсож буй 4, хүрч буй 3, үнэртэж буй 2, амталж буй 1 зүйлээ нэрлэ','Булчингаа ээлжлэн чангалж, сулла'],
       task:'Өдөрт 2 удаа, тайван үедээ хайрцган амьсгалыг 2 минут хийж дадаарай.'},
      {t:'Санаа зовнилтой ажиллах',p:['Санаа зовнил «Хэрэв ... бол яах вэ?» гэсэн асуултаар эхэлдэг бөгөөд хариулт олдохгүй тул тойрог үргэлжилдэг.'],
       l:['Өдөрт 15 минутын «санаа зовох цаг» товло','Шийдэж болох асуудал уу, үгүй юу гэдгийг ялга','Шийдэж болох бол эхний жижиг алхмыг бич'],
       task:'Санаа зовнилоо «шийдэж болох», «шийдэж болохгүй» гэсэн хоёр баганад хуваарил.'},
      {t:'Айдастайгаа аажмаар нүүр тулах',p:['Айдсаас зайлсхийх тусам тэр томордог. Айдастай нөхцөлтэйгээ бага багаар, аюулгүйгээр дахин дахин учрах нь үр дүнтэй.'],
       l:['Айдаг нөхцөлөө 0–10 оноогоор жагсаа','Хамгийн бага оноотойгоос эхэл','Түгшүүр буурах хүртэл үлдээд дараагийн шат руу шилж'],
       task:'Айдсын шатаа 5 алхмаар зохиогоод, хамгийн доод шатыг энэ долоо хоногт хийгээрэй.'}]},
    {id:'str',color:'--ok',title:'Стрессээ зохицуулах',desc:'Ажил, сургуулийн ачаалал, ядаргааг бууруулах.',lessons:[
      {t:'Стресс ба ядаргаа',p:['Богино хугацааны стресс биднийг төвлөрүүлдэг ч удаан үргэлжилбэл ядраадаг. Сэтгэлийн ядаргаа бол удаан хугацааны ажлын дарамтаас үүдсэн туйлдал юм.'],
       l:['Өглөө босоход хэцүү, ядарсан хэвээр байх','Ажилдаа хөндий хандах болох','Жижиг зүйлд амархан бухимдах'],task:'Сүүлийн 7 хоногт таныг хамгийн их стресстүүлсэн 3 зүйлийг бичээрэй.'},
      {t:'Хил хязгаар ба амралт',p:['Стрессийн эх үүсвэрийг бүрэн арилгах боломжгүй ч хил хязгаараа тогтоож болно. Жинхэнэ амралт гэдэг нь утас гүйлгэх биш, сэтгэлийг сэргээх үйл ажиллагаа юм.'],
       l:['Ажлын дараа мэдэгдэл хаах цагаа тогтоо','«Үгүй» гэж хэлэх эрхээ хүлээн зөвшөөр','Өдөр бүр 20 минут дэлгэцгүй цаг гарга'],task:'Энэ долоо хоногт хэрэгжүүлэх нэг хил хязгаараа сонгоорой.'},
      {t:'Биеэр дамжуулан тайвшрах',p:['Хөдөлгөөн бол стрессийн дааврыг бууруулах хамгийн хүчтэй байгалийн арга. Өдөрт 30 минут хөдлөх нь сэтгэл санааг мэдэгдэхүйц сайжруулдаг.'],
       l:['Таалагддаг хөдөлгөөнөө сонго','Байгальд гарах нь стрессийг хурдан бууруулдаг','Унтахын өмнө 5 минут амьсгалын дасгал хий'],task:'Өнөөдөр 15 минут алхаад, өмнө ба дараа стрессээ 1–10-аар үнэлээрэй.'}]},
    {id:'slp',color:'--mid',title:'Сайн нойр',desc:'Нойргүйдэл, шөнө сэрэх асуудлыг шийдэх.',lessons:[
      {t:'Нойр яагаад чухал вэ?',p:['Нойр дутагдах нь сэтгэл хөдлөлийг хянахад хэцүү болгож, түгшүүр, гутралыг нэмэгдүүлдэг. Насанд хүрэгчдэд шөнөдөө 7–9 цаг унтах шаардлагатай.'],
       l:['Нэг шөнө муу унтах нь маргаашийн бухимдлыг ихэсгэдэг','Удаан хугацааны нойр дутал гутралын эрсдэлийг нэмдэг'],task:'Нэг долоо хоног унтсан, сэрсэн цагаа тэмдэглээрэй.'},
      {t:'Нойрны эрүүл ахуй',p:['Тархи тогтмол байдлыг хайрладаг. Өдөр бүр ижил цагт босох нь нойрыг сайжруулах хамгийн чухал алхам.'],
       l:['Амралтын өдөр ч ижил цагт бос','Унтахаас 1 цагийн өмнө дэлгэцээ унтраа','Үдээс хойш кофе хэрэглэхгүй байх','Өрөөгөө сэрүүн, харанхуй байлга'],task:'Босох цагаа тогтоогоод долоо хоног мөрдөөрэй.'},
      {t:'Унтаж чадахгүй үед',p:['Орондоо 20 минутаас удаан сэрүүн хэвтвэл босоод бүдэг гэрэлд тайван зүйл хий. Ингэснээр тархи орыг нойртой холбож сурдаг.'],
       l:['Цаг руу харахгүй байх','Бодол их байвал цаасан дээр буулгах','Нойрмоглож эхлэхэд буцаж хэвт'],task:'Унтахын өмнө маргаашийн 3 ажлаа бичээд «маргааш шийднэ» гэж өөртөө хэлээрэй.'}]},
    {id:'est',color:'--coral',title:'Өөрийгөө үнэлэх, хайрлах',desc:'Өөрийгөө шүүмжлэхээ багасгаж, энэрэнгүй хандах.',lessons:[
      {t:'Дотоод шүүмжлэгч',p:['Бид өөртөө бусдад хэзээ ч хэлэхгүй хатуу үгээр ханддаг. Энэ дотоод шүүмжлэгч биднийг хамгаалах гэж оролддог ч ихэнхдээ урам хугалдаг.'],
       l:['Өөрийгөө шүүмжлэх үедээ ямар үг хэрэглэдгээ ажигла','Тэр дуу хэний дуу шиг сонсогддогийг бод'],task:'Өөрийгөө шүүмжилсэн нэг өгүүлбэрийг бичээд, үүнийг хайртай найздаа хэлэх үү гэж асуугаарай.'},
      {t:'Өөртөө энэрэнгүй хандах',p:['Кристин Неффийн судалгаагаар өөртөө энэрэнгүй ханддаг хүмүүс алдаанаасаа илүү сайн суралцаж, сэтгэл гутрал бага байдаг.'],
       l:['«Энэ үнэхээр хэцүү байна» гэж хүлээн зөвшөөрөх','«Ийм зүйл хүн бүрт тохиолддог»','«Би өөртөө эелдэг хандъя»'],task:'Хэцүү мөчид гараа цээжин дээрээ тавиад дээрх 3 өгүүлбэрийг чимээгүй хэлээрэй.'},
      {t:'Давуу талаа олох',p:['Тархи сөрөг зүйлийг илүү санах хандлагатай тул эерэг зүйлийг зориуд тэмдэглэх хэрэгтэй.'],
       l:['Өдөр бүр сайн болсон 3 зүйлээ бич','Бусдын магтсан үгийг тэмдэглэ','Өөрийн 5 давуу талыг жагсаа'],task:'Энэ долоо хоногт орой бүр «Өнөөдөр сайн болсон 3 зүйл»-ээ бичээрэй.'}]}
  ];
  let progress=store.get('stol-progress',{});
  const courseList=$('courseList'),reader=$('reader');
  const doneCount=c=>c.lessons.filter((_,i)=>progress[c.id+'-'+i]).length;
  const firstUndone=c=>{const i=c.lessons.findIndex((_,i)=>!progress[c.id+'-'+i]);return i<0?0:i};
  function renderCourses(){
    courseList.innerHTML=COURSES.map(c=>{const d=doneCount(c),n=c.lessons.length;return `<button type="button" class="card course" data-c="${c.id}">
      <span class="ic" style="background:color-mix(in srgb,var(${c.color}) 30%,var(--surface))"></span>
      <div class="meta"><span>${n} хичээл</span><span>${d?`${d}/${n} үзсэн`:'Эхлээгүй'}</span></div>
      <h3>${c.title}</h3><p>${c.desc}</p><div class="prog" aria-hidden="true"><i style="width:${d/n*100}%"></i></div></button>`}).join('');
    courseList.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{const c=COURSES.find(x=>x.id===b.dataset.c);openCourse(c.id,firstUndone(c))});
  }
  function openCourse(id,li){
    const c=COURSES.find(x=>x.id===id),L=c.lessons[li],isDone=!!progress[id+'-'+li];
    courseList.hidden=true;reader.hidden=false;
    reader.innerHTML=`<button class="back" type="button" id="backBtn">← Бүх сургалт</button>
      <div class="reader"><aside aria-label="${esc(c.title)}"><p class="kicker" style="padding:0 12px 6px">${c.title}</p>
        ${c.lessons.map((l,i)=>`<button type="button" data-i="${i}" aria-current="${i===li}"><b>${progress[id+'-'+i]?'✓':i+1}</b>${l.t}</button>`).join('')}</aside>
        <article class="card lesson"><span class="kicker">Хичээл ${li+1} / ${c.lessons.length}</span><h3>${L.t}</h3>
          ${L.p.map(p=>`<p>${p}</p>`).join('')}<ul>${L.l.map(x=>`<li>${x}</li>`).join('')}</ul>
          <div class="task"><span class="kicker" style="color:var(--ink)">Өнөөдрийн дасгал</span><p>${L.task}</p></div>
          <div class="lesson-nav"><button type="button" class="btn sm ${isDone?'light':''}" id="markBtn">${isDone?'✓ Үзсэн':'Үзсэн гэж тэмдэглэх'}</button>
            <div style="display:flex;gap:8px">${li>0?'<button type="button" class="btn sm light" id="prevBtn">← Өмнөх</button>':''}${li<c.lessons.length-1?'<button type="button" class="btn sm light" id="nextBtn">Дараах →</button>':''}</div></div>
          ${li===c.lessons.length-1?'<p class="note">Илүү дэмжлэг хэрэгтэй бол <a href="#chat">сэтгэл зүйчтэйгээ чатлаарай</a>.</p>':''}</article></div>`;
    const go=i=>{openCourse(id,i);$('hicheel').scrollIntoView()};
    $('backBtn').onclick=()=>{reader.hidden=true;courseList.hidden=false;renderCourses();$('hicheel').scrollIntoView()};
    reader.querySelectorAll('aside button').forEach(b=>b.onclick=()=>go(+b.dataset.i));
    $('markBtn').onclick=()=>{const k=id+'-'+li;progress[k]=!progress[k];store.set('stol-progress',progress);openCourse(id,li)};
    $('prevBtn')&&($('prevBtn').onclick=()=>go(li-1));
    $('nextBtn')&&($('nextBtn').onclick=()=>{progress[id+'-'+li]=true;store.set('stol-progress',progress);go(li+1)});
  }
  renderCourses();

  /* ================= TESTS ================= */
  const OPTS=['Огт үгүй','Хэдэн өдөр','Өдрийн талаас илүү','Бараг өдөр бүр'];
  const TESTS={
    phq9:{name:'Сэтгэл гутрал · PHQ-9',course:'dep',qs:['Юм хийх сонирхол, таашаал бага байх','Сэтгэл гутрах, гунигтай, найдваргүй санагдах','Унтаж чадахгүй, шөнө сэрэх эсвэл хэт их унтах','Ядарч сульдах, эрч хүч багатай байх','Хоолны дуршил буурах эсвэл хэт их идэх','Өөрийгөө муу, бүтэлгүй, гэр бүлээ урам хугалсан гэж санагдах','Ном унших, зурагт үзэхэд анхаарлаа төвлөрүүлэхэд хэцүү байх','Бусдад анзаарагдахуйц удаан хөдлөх, ярих, эсвэл тайван сууж чадахгүй байх','Үхсэн нь дээр гэх, эсвэл өөрийгөө гэмтээх бодол төрөх'],
      bands:[[4,'Хамгийн бага','--ok','Одоогоор сэтгэл гутралын шинж бага байна.'],[9,'Хөнгөн','--mid','Хөнгөн шинж тэмдэг байна. Өөртөө туслах хичээлүүд тустай.'],[14,'Дунд зэрэг','--warn','Дунд зэргийн шинж тэмдэг байна. Сэтгэл зүйчтэй ярилцахыг зөвлөж байна.'],[19,'Дунд-хүнд','--high','Шинж тэмдэг нэлээд хүчтэй байна. Мэргэжлийн тусламж удахгүй аваарай.'],[27,'Хүнд','--high','Шинж тэмдэг хүнд байна. Мэргэжлийн тусламжийг аль болох хурдан аваарай.']]},
    gad7:{name:'Түгшүүр · GAD-7',course:'anx',qs:['Сандрах, түгших, сэтгэл тавгүйрхэх','Санаа зовохоо зогсоож, хянаж чадахгүй байх','Янз бүрийн зүйлд хэт их санаа зовох','Тайвширч амрахад хэцүү байх','Тайван сууж чадахгүй тэвдэх','Амархан бухимдах, уурлах','Ямар нэг аймшигтай зүйл тохиолдох вий гэж айх'],
      bands:[[4,'Хамгийн бага','--ok','Түгшүүрийн шинж бага байна.'],[9,'Хөнгөн','--mid','Хөнгөн түгшүүр байна. Амьсгалын дасгал, хичээл тустай.'],[14,'Дунд зэрэг','--warn','Дунд зэргийн түгшүүр байна. Сэтгэл зүйчтэй ярилцахыг зөвлөж байна.'],[21,'Хүнд','--high','Түгшүүр хүчтэй байна. Мэргэжлийн тусламж аваарай.']]}
  };
  let cur='phq9';
  const tabs=$('testTabs'),tform=$('testForm'),tres=$('testRes');
  Object.entries(TESTS).forEach(([k,t])=>{const b=document.createElement('button');b.type='button';b.className='tab';b.setAttribute('role','tab');b.id='tab-'+k;b.textContent=t.name;b.onclick=()=>{cur=k;renderTest()};tabs.appendChild(b)});
  function renderTest(){
    const T=TESTS[cur];
    tabs.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',String(b.id==='tab-'+cur)));
    tform.innerHTML=T.qs.map((q,i)=>`<fieldset class="q"><legend>${i+1}. ${q}</legend><div class="opts">${OPTS.map((o,v)=>`<label><input type="radio" id="${cur}q${i}v${v}" name="q${i}" value="${v}"><span>${o}</span></label>`).join('')}</div></fieldset>`).join('')+'<div style="margin-top:10px"><button type="reset" class="btn sm light">Арилгах</button></div>';
    renderRes();
  }
  function renderRes(){
    const T=TESTS[cur],n=T.qs.length,max=n*3;
    const v=T.qs.map((_,i)=>{const c=tform.querySelector(`input[name=q${i}]:checked`);return c?+c.value:null});
    const done=v.filter(x=>x!==null).length,t=v.reduce((a,b)=>a+(b||0),0);
    const bi=T.bands.findIndex(b=>t<=b[0]),B=T.bands[bi];
    let lo=0;const segs=T.bands.map((b,i)=>{const r={w:b[0]-lo+1,l:`${lo}–${b[0]}`,c:b[2],on:done===n&&i===bi};lo=b[0]+1;return r});
    const course=COURSES.find(c=>c.id===T.course),crisis=cur==='phq9'&&v[8]>0;
    tres.innerHTML=`<span class="kicker">${T.name}</span><div class="score">${done?t:'–'}<small> / ${max}</small></div>
      ${crisis?'<div class="crisis"><b>Та ганцаараа биш.</b> Өөрийгөө гэмтээх бодол төрж байгаа бол одоо итгэдэг хүндээ хэлж, <b>103</b> руу залгаарай. <a href="#tuslamj">Яаралтай тусламж</a></div>':''}
      ${done<n?`<p class="note">${done} / ${n} асуултад хариулсан. Бүгдэд нь хариулахад үр дүн гарна.</p>`:`<p><b style="color:var(${B[2]})">${B[1]}</b> түвшин. ${B[3]}</p>`}
      <div><div class="scale">${segs.map(s=>`<div class="${s.on?'on':''}" style="flex:${s.w};background:var(${s.c})"></div>`).join('')}</div>
      <div class="scale-l">${segs.map(s=>`<span style="flex:${s.w}">${s.l}</span>`).join('')}</div></div>
      ${done===n?`<div class="rec"><b>Санал болгох алхам</b><a href="#hicheel" id="recCourse">«${course.title}» хичээл үзэх →</a>${bi>=2||crisis?'<a href="#chat">Сэтгэл зүйчтэй чатлах →</a>':''}</div>`:''}
      <p class="note">Энэ бол онош биш, эхний шалгалт. Эцсийн дүгнэлтийг мэргэжилтэн гаргана.</p>`;
    const rc=$('recCourse');if(rc)rc.onclick=()=>openCourse(course.id,firstUndone(course));
  }
  tform.addEventListener('change',renderRes);
  tform.addEventListener('reset',()=>setTimeout(renderRes,0));
  tform.addEventListener('submit',e=>e.preventDefault());
  renderTest();

  /* ================= MOOD ================= */
  const MOODS=[{k:5,t:'Маш сайн',c:'--ok'},{k:4,t:'Сайн',c:'--accent'},{k:3,t:'Дунд',c:'--sun'},{k:2,t:'Муу',c:'--warn'},{k:1,t:'Хэцүү',c:'--coral'}];
  const MSG={5:'Гайхалтай! Юу таныг ийм сайхан болгосныг тэмдэглээд аваарай.',4:'Сайхан байна. Энэ мэдрэмжээ үргэлжлүүлээрэй.',3:'Энгийн өдөр ч хангалттай. Өөртөө жаахан амралт өгөөрэй.',2:'Хүнд өдөр байна уу. Амьсгалын дасгалыг туршаад үзээрэй.',1:'Та ганцаараа биш. Сэтгэл зүйчтэйгээ эсвэл итгэдэг хүнтэйгээ яриарай.'};
  const DAYS=['Ня','Да','Мя','Лх','Пү','Ба','Бя'],dkey=d=>`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  let log=store.get('stol-mood',{});
  const moodsEl=$('moods');
  MOODS.forEach(m=>{const b=document.createElement('button');b.type='button';b.className='mood';b.id='mood-'+m.k;
    b.innerHTML=`<span class="dot" style="background:var(${m.c})"></span>${m.t}`;
    b.onclick=()=>{log[dkey(new Date())]=m.k;store.set('stol-mood',log);renderMood()};moodsEl.appendChild(b)});
  function renderMood(){
    const today=log[dkey(new Date())];
    moodsEl.querySelectorAll('.mood').forEach(b=>b.setAttribute('aria-pressed',String(b.id==='mood-'+today)));
    if(today)$('moodMsg').textContent=MSG[today];
    const has=Object.keys(log).length>0;$('sampleTag').hidden=has;
    const sample=[4,3,4,2,3,5,4],w=$('week');w.innerHTML='';
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);
      const v=has?log[dkey(d)]:sample[6-i],m=MOODS.find(x=>x.k===v);
      const el=document.createElement('div');el.className='bar';
      el.innerHTML=`<i style="height:${v?v*20:4}%;background:${m?`var(${m.c})`:'var(--line)'}" title="${m?m.t:'Тэмдэглээгүй'}"></i><span>${DAYS[d.getDay()]}</span>`;w.appendChild(el)}
  }
  renderMood();

  /* ================= BREATHING ================= */
  const orb=$('orb'),bBtn=$('bBtn'),PH=[['Амьсгаа ав',1.9],['Барь',1.9],['Гарга',1],['Барь',1]];
  let timer=null,phase=0,sec=4,cyc=0;
  function tick(){$('bState').textContent=PH[phase][0];$('bCount').textContent=sec;sec--;
    if(sec<1){phase=(phase+1)%4;sec=4;if(phase===0){cyc++;$('cycles').textContent='Мөчлөг: '+cyc}orb.style.transform=`scale(${PH[phase][1]})`}}
  bBtn.onclick=()=>{
    if(timer){clearInterval(timer);timer=null;bBtn.textContent='Эхлэх';orb.style.transform='scale(1)';$('bState').textContent='Бэлэн';$('bCount').textContent='';return}
    phase=0;sec=4;cyc=0;$('cycles').textContent='Мөчлөг: 0';orb.style.transform='scale(1.9)';bBtn.textContent='Зогсоох';tick();timer=setInterval(tick,1000)};
})();
