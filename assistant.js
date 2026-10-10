(() => {
  'use strict';
  const host=document.querySelector('.portrait-assistant');
  if(!host) return;
  const canvas=host.querySelector('canvas');
  const bubble=host.querySelector('.assistant-bubble');
  const text=host.querySelector('.assistant-text');
  const live=host.querySelector('.assistant-live');
  const choices=host.querySelector('.assistant-choices');
  const avatar=host.querySelector('.assistant-avatar');
  const dialog=document.querySelector('.lightbox');
  const slot=dialog?.querySelector('.lightbox-assistant-slot');
  const home=host.parentElement;
  let timer=0, greetingTimer=0, token=0, currentText='', cardText='', dismissed=false, showChoices=true;
  const greeting='Привет! Пока в портфолио только сайты и карточки товаров. Другие работы добавлю позже. Сайты можно открыть целиком, а карточки рассмотреть крупнее.';
  canvas.addEventListener('portrait-ready',()=> {
    canvas.portrait.speaking=host.dataset.typing==='true' && !bubble.hidden;
  });
  function stop() {
    clearTimeout(timer); token++;
    if(canvas.portrait) canvas.portrait.speaking=false;
    host.dataset.typing='false';
  }
  function finish(value) {
    stop(); text.textContent=value; live.textContent=value; choices.hidden=!showChoices;
  }
  function say(value, withChoices=true) {
    stop(); currentText=value; showChoices=withChoices; dismissed=false; bubble.hidden=false;
    avatar.setAttribute('aria-expanded','true');
    choices.hidden=true; text.textContent=''; live.textContent='';
    if(document.documentElement.dataset.motion==='off') { finish(value); return; }
    const id=token; let index=0;
    host.dataset.typing='true';
    const type=()=> {
      if(id!==token) return;
      if(document.hidden) { finish(value); return; }
      index++;
      text.textContent=value.slice(0,index);
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
    dismissed=true; clearTimeout(greetingTimer); stop(); bubble.hidden=true;
    avatar.setAttribute('aria-expanded','false');
  }
  host.querySelector('.assistant-close').addEventListener('click',close);
  avatar.addEventListener('click',()=>bubble.hidden?say(cardText || greeting,!cardText):close());
  host.addEventListener('keydown',event=> {
    if(event.key==='Escape'&&!bubble.hidden&&!dialog?.open) { close(); avatar.focus(); }
  });
  host.querySelectorAll('[data-assistant-topic]').forEach(button=>button.addEventListener('click',()=> {
    const topic=button.dataset.assistantTopic;
    if(topic==='websites') {
      say('Нажми на превью, чтобы открыть сайт целиком в новой вкладке. Здесь есть ведущий мероприятий, дома, барбершоп, студия макияжа и магазин обуви.');
      document.getElementById('websites')?.scrollIntoView({behavior:document.documentElement.dataset.motion==='off'?'auto':'smooth'});
    } else if(topic==='cards') {
      say('Выбери категорию или открой любую карточку. Расскажу, что в ней можно рассмотреть.');
      const gallery=document.getElementById('cards');
      if(gallery) gallery.scrollIntoView({behavior:document.documentElement.dataset.motion==='off'?'auto':'smooth'});
      else location.href='./#cards';
    } else say('Сайт открывается в новой вкладке по нажатию на превью. Карточки можно рассмотреть крупнее и листать кнопками или стрелками клавиатуры. Закрыть просмотр можно крестиком или Escape.');
  }));
  document.addEventListener('motion-preference-change',()=> {
    if(host.dataset.typing==='true') finish(currentText);
  });
  document.addEventListener('visibilitychange',()=> {
    if(document.hidden&&host.dataset.typing==='true') finish(currentText);
  });
  document.addEventListener('portfolio-card-open',event=> {
    if(!slot) return;
    clearTimeout(greetingTimer);
    cardText=event.detail.comment || `Открой изображение «${event.detail.title}», чтобы рассмотреть его оформление.`;
    host.dataset.context='card';
    host.dataset.activeCard=event.detail.id;
    slot.append(host);
    say(cardText,false);
    if(canvas.portrait) { canvas.portrait.visible=true; canvas.portrait.resize(); canvas.portrait.nod(); }
  });
  document.addEventListener('portfolio-card-close',()=> {
    close(); cardText='';
    delete host.dataset.context;
    delete host.dataset.activeCard;
    home.append(host);
    if(canvas.portrait) { canvas.portrait.visible=true; canvas.portrait.resize(); }
  });
  const greet=()=>{if(!dismissed&&!document.hidden&&!host.hidden&&!cardText) say(greeting);};
  // Let the hero stay clear. Introduce the work when the first portfolio section appears.
  const gallery=document.getElementById('websites') || document.getElementById('cards');
  if(document.querySelector('.orbit-stage')&&gallery) {
    const introduction=new IntersectionObserver(entries=> {
      if(entries[0].isIntersecting) { introduction.disconnect(); greetingTimer=setTimeout(greet,650); }
    },{threshold:.12});
    introduction.observe(gallery);
  } else greetingTimer=setTimeout(greet,1800);
})();
