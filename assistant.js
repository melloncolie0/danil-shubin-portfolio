(() => {
  'use strict';
  const host=document.querySelector('.portrait-assistant');
  if(!host) return;
  const canvas=host.querySelector('canvas');
  const bubble=host.querySelector('.assistant-bubble');
  const text=host.querySelector('.assistant-text');
  const live=host.querySelector('.assistant-live');
  const choices=host.querySelector('.assistant-choices');
  const contact=host.querySelector('.assistant-contact');
  const avatar=host.querySelector('.assistant-avatar');
  const muteButton=host.querySelector('.assistant-mute');
  const dialog=document.querySelector('.lightbox');
  const slot=dialog?.querySelector('.lightbox-assistant-slot');
  const home=host.parentElement;
  const sandboxPage=document.body?.dataset.page==='sandbox';
  let timer=0, arrivalTimer=0, contextTimer=0, contextFrame=0, token=0;
  let currentText='', cardText='', currentContext='', introduced=false, showChoices=true, showContact=false;
  let pendingSpeech=null, muted=false;
  try { muted=localStorage.getItem('portfolio-assistant-muted')==='true'; } catch { /* The control also works without storage. */ }
  const greeting=sandboxPage
    ? 'Привет, я Данил. Это моя песочница. Здесь интерактивные эффекты, которые можно добавить на сайт или в приложение.'
    : 'Привет, я Данил. Здесь мои сайты и карточки. На отдельной странице «Песочница» собраны интерактивные эффекты, которые можно добавить на сайт или в приложение.';
  const messages={
    hero:greeting,
    websites:'Это мои сайты. Нажми на любое превью, чтобы открыть проект целиком в новой вкладке.',
    cards:'Здесь карточки для маркетплейсов. Выбери категорию или открой карточку, и я расскажу о её оформлении.',
    misc:'Здесь частицы, связи, ткань, линза и 3D-локация. Эти эффекты можно добавить на сайт или в приложение.',
    kinetic:'Потяни точку в UX/UI. Она потянет соседние, а затем надпись вернётся на место. На телефоне нажми «Попробовать».',
    particle:'Проведи курсором по имени, чтобы рассыпать частицы. Убери курсор, и они соберутся обратно. На телефоне нажми «Попробовать».',
    cloth:'Схвати серебристую ткань и потяни. Складки двигаются с инерцией, а после отпускания успокаиваются. На телефоне нажми «Попробовать».',
    lens:'Подвигай стеклянную линзу над надписью. Она увеличивает и преломляет буквы. На телефоне нажми «Попробовать».',
    portal:'Загляни в Backrooms, там кейвмен. Нажми на портал или потяни его край. Ходи через WASD и поворачивай взгляд мышью. На телефоне двигай джойстик и осматривайся пальцем.',
    footer:'Спасибо, что посмотрел мои работы. Заходи ещё, я буду добавлять новые проекты и эксперименты. Если хочешь обсудить проект, напиши мне в Telegram.'
  };
  const areas=[
    ['portal',document.getElementById('scene-portal')],
    ['lens',document.getElementById('glass-lens')],
    ['cloth',document.getElementById('metal-cloth')],
    ['kinetic',document.getElementById('kinetic')],
    ['particle',document.getElementById('particle-text')],
    ['websites',document.getElementById('websites')],
    ['cards',document.getElementById('cards')],
    ['misc',document.getElementById('misc')],
    ['hero',document.querySelector('.hero-sequence')]
  ].filter(([,element])=>element);
  function detectContext() {
    const footer=document.querySelector('.footer');
    if(footer && footer.getBoundingClientRect().top<innerHeight &&
       scrollY+innerHeight>=document.documentElement.scrollHeight-24) return 'footer';
    const center=innerHeight*.48;
    for(const [key,element] of areas) {
      const bounds=element.getBoundingClientRect();
      if(bounds.top<=center && bounds.bottom>center) return key;
    }
    return '';
  }
  function syncMute() {
    host.dataset.muted=String(muted);
    if(muteButton) {
      muteButton.textContent=muted?'Говори':'Помолчи';
      muteButton.setAttribute('aria-label',muted?'Включить реплики помощника':'Выключить реплики помощника');
    }
    avatar.setAttribute('aria-label',muted?'Помощник молчит. Реплики включаются кнопкой «Говори»':'Открыть помощника');
  }
  function stop() {
    clearTimeout(timer); token++;
    if(canvas.portrait) canvas.portrait.speaking=false;
    host.dataset.typing='false';
  }
  function finish(value) {
    stop();
    if(muted) return;
    text.textContent=value; live.textContent=value;
    choices.hidden=!showChoices;
    if(contact) contact.hidden=!showContact;
  }
  function say(value,withChoices=true,withContact=false) {
    if(muted || document.hidden) return;
    if(document.documentElement.dataset.motion!=='off' &&
       (document.documentElement.dataset.portraitEntry==='pending' || canvas.dataset.entry==='playing')) {
      pendingSpeech={value,withChoices,withContact}; return;
    }
    pendingSpeech=null;
    if(!introduced && !value.startsWith('Привет, я Данил.')) value='Привет, я Данил. '+value;
    introduced=true;
    stop(); currentText=value; showChoices=withChoices; showContact=withContact;
    bubble.hidden=false; avatar.setAttribute('aria-expanded','true');
    choices.hidden=true; if(contact) contact.hidden=true;
    text.textContent=''; live.textContent='';
    if(document.documentElement.dataset.motion==='off') { finish(value); return; }
    const id=token; let index=0;
    host.dataset.typing='true';
    const type=()=> {
      if(id!==token || muted) return;
      if(document.hidden) { finish(value); return; }
      text.textContent=value.slice(0,++index);
      if(canvas.portrait) canvas.portrait.speaking=true;
      if(index>=value.length) { finish(value); return; }
      const character=value[index-1];
      if(/[.!?]/.test(character)) {
        if(canvas.portrait) canvas.portrait.speaking=false;
        timer=setTimeout(type,260);
      } else timer=setTimeout(type,character===','?90:18);
    };
    type();
  }
  function close() {
    pendingSpeech=null;
    clearTimeout(arrivalTimer); clearTimeout(contextTimer);
    stop(); bubble.hidden=true;
    if(contact) contact.hidden=true;
    avatar.setAttribute('aria-expanded','false');
  }
  function sayContext(key) {
    if(!messages[key]) return;
    let value=messages[key];
    if(!introduced && key!=='hero') value=greeting+'\n\n'+value;
    say(value,['hero','websites','cards'].includes(key) || sandboxPage && key==='misc',key==='footer');
  }
  function updateContext() {
    contextFrame=0;
    if(document.hidden || dialog?.open || cardText) { clearTimeout(contextTimer); return; }
    const next=detectContext();
    if(next===currentContext) return;
    close(); currentContext=next; host.dataset.section=next;
    if(!next || muted) return;
    contextTimer=setTimeout(()=> {
      if(!muted && !document.hidden && !dialog?.open && detectContext()===next) sayContext(next);
    },600);
  }
  function requestContext() {
    if(!contextFrame) contextFrame=requestAnimationFrame(updateContext);
  }
  const speakAfterArrival=()=> {
    if(!pendingSpeech || muted) return;
    clearTimeout(arrivalTimer);
    arrivalTimer=setTimeout(()=> {
      if(!pendingSpeech || muted || document.hidden) return;
      const {value,withChoices,withContact}=pendingSpeech;
      say(value,withChoices,withContact);
    },320);
  };
  canvas.addEventListener('portrait-ready',()=> {
    canvas.portrait.speaking=!muted && host.dataset.typing==='true' && !bubble.hidden;
  });
  canvas.addEventListener('portrait-entered',speakAfterArrival);
  document.addEventListener('portrait-entry-fallback',speakAfterArrival);
  host.querySelector('.assistant-close').addEventListener('click',close);
  muteButton?.addEventListener('click',()=> {
    muted=!muted;
    try { localStorage.setItem('portfolio-assistant-muted',String(muted)); } catch { /* Keep the current choice in this page. */ }
    close(); syncMute();
    if(!muted) {
      currentContext=detectContext(); host.dataset.section=currentContext;
      cardText?say(cardText,false):sayContext(currentContext || 'hero');
    }
  });
  avatar.addEventListener('click',()=> {
    if(muted) { muteButton?.focus(); return; }
    if(!bubble.hidden) { close(); return; }
    currentContext=detectContext(); host.dataset.section=currentContext;
    cardText?say(cardText,false):sayContext(currentContext || 'hero');
  });
  host.addEventListener('keydown',event=> {
    if(event.key==='Escape' && !bubble.hidden && !dialog?.open) { close(); avatar.focus(); }
  });
  host.querySelectorAll('[data-assistant-topic]').forEach(button=>button.addEventListener('click',()=> {
    const topic=button.dataset.assistantTopic;
    if(topic==='help') {
      say(sandboxPage
        ? 'Двигай мышью или потяни эффект. На телефоне нажми «Попробовать» у эффекта, а в Backrooms просто коснись портала. Я подскажу управление, когда перейдёшь к следующему эффекту.'
        : 'Сайты открываются по нажатию на превью. Карточки можно рассмотреть крупнее. Эффекты находятся на отдельной странице «Песочница», ссылка есть в меню.'); return;
    }
    document.getElementById(topic)?.scrollIntoView({behavior:document.documentElement.dataset.motion==='off'?'auto':'smooth'});
    sayContext(topic);
  }));
  for(const [key,element] of areas.filter(([key])=>['kinetic','particle','cloth','lens','portal'].includes(key))) {
    const explain=()=> {
      if(muted || dialog?.open || currentContext===key && !bubble.hidden) return;
      close(); currentContext=key; host.dataset.section=key; sayContext(key);
    };
    element.addEventListener('focusin',explain);
    element.querySelector('canvas')?.addEventListener('pointerdown',explain);
  }
  document.addEventListener('motion-preference-change',()=> {
    if(host.dataset.typing==='true') finish(currentText);
    if(pendingSpeech && !muted && document.documentElement.dataset.motion==='off') {
      const {value,withChoices,withContact}=pendingSpeech;
      say(value,withChoices,withContact);
    }
  });
  document.addEventListener('visibilitychange',()=> {
    if(document.hidden && host.dataset.typing==='true') finish(currentText);
    if(!document.hidden) {
      requestContext();
      if(pendingSpeech && !muted && canvas.dataset.entry!=='playing' && document.documentElement.dataset.portraitEntry!=='pending') speakAfterArrival();
    }
  });
  document.addEventListener('portfolio-card-open',event=> {
    if(!slot) return;
    close(); cardText=event.detail.comment || `Открой изображение «${event.detail.title}», чтобы рассмотреть его оформление.`;
    host.dataset.context='card'; host.dataset.activeCard=event.detail.id;
    slot.append(host); say(cardText,false);
    if(canvas.portrait) { canvas.portrait.visible=true; canvas.portrait.resize(); if(!muted) canvas.portrait.nod(); }
  });
  document.addEventListener('portfolio-card-close',()=> {
    close(); cardText='';
    delete host.dataset.context; delete host.dataset.activeCard;
    home.append(host);
    if(canvas.portrait) { canvas.portrait.visible=true; canvas.portrait.resize(); }
    currentContext=detectContext(); host.dataset.section=currentContext;
  });
  window.addEventListener('scroll',requestContext,{passive:true});
  window.addEventListener('resize',requestContext,{passive:true});
  syncMute(); requestContext();
})();
