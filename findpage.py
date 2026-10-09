# -*- coding: utf-8 -*-
"""Страница определения аккорда: слева сетка, справа собранный подбор.

Раскладка та же, что у страницы песни ([[webapp]]): две колонки с ручкой между
ними, каждая со своим скроллом. И схема в подборе — та же самая карточка, что
схема в песне: одна разметка (`push_grid.render_card_template`), один CSS
(`grid_css`), просто подписи проставляет JS, а не питон.

Сетка тут живая и пустая: кликается ЛЮБОЙ пэд, а не только ноты заранее
заданного аккорда. Что получилось, считает сервер (identify.py) — он и
возвращает символ, ступени для всех 12 классов высот и правильную запись нот.
"""
import json
from typing import Optional

from identify import MAX_NOTES
from push_grid import render_card_template
from webapp import esc, gutter, header, layout_css, page, LAYOUT_JS

_CSS = """
/* --- левая колонка: сетка и разбор --- */
.find{padding:14px clamp(12px,2vw,22px) 24px clamp(12px,3vw,36px);
  display:flex;flex-direction:column;gap:13px}
.gbox{min-width:0}
/* Сетка тут одна и она главная, поэтому кегль подписей растёт вместе с пэдом
   (в песне наоборот: там их пять штук в колонке и важна плотность).
   Ширину ограничивают две вещи сразу: ширина колонки и высота окна —
   1.343 это пропорция сетки 8x8 при пэде 69x50, а 300px — шапка, разбор под
   сеткой и отступы. Замерено в Chromium; правишь разбор — правь и число. */
.pg.big{width:100%;max-width:min(100%,calc((100dvh - 300px)*1.343))}
.pg.big .p b{font-size:clamp(13px,2.9cqw,23px)}
.pg.big .p u{font-size:clamp(9px,1.9cqw,14px)}
.pg.big .p u.l3{font-size:clamp(8.5px,1.75cqw,12.5px)}
.pg.free .p{cursor:pointer}
.pg.free .p.on,.pg.free .p.ex{cursor:pointer}
.pg.free .p:hover{filter:brightness(1.12)}
/* рут выбран — пэд под курсором показывает свою ступень от него. Подписи лежат
   в разметке у всех 64 пэдов, CSS их только раскрывает: JS ничего не сочиняет */
.pg.free.rooted .p:hover u{display:block}
/* набрано максимум нот: снять можно, добавить нельзя — и это видно по курсору */
.pg.free.full .p:not(.on):not(.ex){cursor:default}
.pg.free.full .p:not(.on):not(.ex):hover{filter:none}

.res{display:flex;flex-direction:column;gap:8px;min-width:0}
.rsym{font-size:clamp(24px,3vw,38px);font-weight:700;letter-spacing:-.025em;
  line-height:1.05;min-height:1.05em;word-break:break-word}
.rsym.none{color:var(--dim);font-weight:400;font-size:23px;letter-spacing:0}
.rname{color:var(--muted);font-size:13px;margin-top:-4px}
.rnote{font-size:13px;color:var(--muted);min-width:0;word-break:break-word}
.rnote b{color:var(--fg);font-weight:600;font-variant-numeric:tabular-nums}
.rnote .exd{color:var(--extra);font-weight:600}
.warn{color:var(--extra)}
.alts{display:flex;flex-wrap:wrap;gap:6px}
.alt{background:#151b19;border:1px solid var(--line);border-radius:7px;padding:4px 9px;
  font-size:12.5px;cursor:pointer;color:var(--muted);line-height:1.3}
.alt:hover{color:var(--fg)}
.alt.on{border-color:var(--tone);color:#fff;background:#16232a}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:3px}
.hint{font-size:12px;color:var(--dim);line-height:1.5}
.hint b{color:var(--muted);font-weight:600}

/* --- правая колонка: подбор --- */
.side{padding:12px clamp(10px,1.4vw,20px) 24px clamp(10px,1vw,14px)}
.sidehead{display:flex;align-items:center;gap:12px;font-size:12.5px;color:var(--muted);
  margin:0 0 9px;min-height:26px}
.sidehead b{color:var(--fg);font-weight:600}
.sidehead button{padding:3px 8px;font-size:12px}
.cards:empty::after{content:"Собери аккорд на сетке слева и нажми «добавить в подбор» — схемы встанут сюда";
  color:var(--dim);font-size:13px;line-height:1.5;display:block;max-width:280px}
/* карточка подбора кликается целиком: клик возвращает аккорд на большую сетку,
   поэтому сами пэды тут события не ловят */
.cards > .pg{cursor:pointer;position:relative}
.cards > .pg .pads{pointer-events:none}
.cards > .pg:hover{outline:1px solid #2b3733}
.cards > .pg.cur{outline:1px solid var(--tone)}
.cards > .pg.flash{animation:fl .55s ease-out}
@keyframes fl{from{background:#16241d}}
.pg .del{background:#1b2320;color:#cdd6d1;border:1px solid #26312d;border-radius:6px;
  font:inherit;font-size:11px;line-height:1;padding:3px 6px;cursor:pointer}
.pg .del:hover{border-color:var(--extra);color:#fff}
@media (max-width:900px){
  /* на узком экране страница просто листается сверху вниз, и РАБОЧАЯ сетка идёт
     первой. В песне наоборот — там сверху лента схем, потому что читают текст */
  body{height:auto;overflow:auto}
  .layout{grid-template-rows:auto auto}
  .pane{overflow:visible}
  .find{padding-bottom:16px}
  .pg.big{max-width:100%}
  .side{order:0;border-bottom:0;border-top:1px solid var(--line);padding:12px 0 24px}
  .sidehead{padding:0 clamp(12px,3vw,36px)}
  .cards:empty::after{max-width:none;padding:0 clamp(12px,3vw,36px)}
}
"""

_JS = r"""
(function(){
  var P=window.__PICK||null;
  function $(id){return document.getElementById(id);}
  var big=document.querySelector('.pg.big'), tpl=$('tpl');
  var strip=$('strip');

  function midi(p){return 36+5*((p/8)|0)+(p%8);}
  function oct(m){return Math.floor(m/12)-2;}
  function byM(a,b){return midi(a)-midi(b);}
  function pl(n,a,b,c){var m=n%10,h=n%100;
    if(m===1&&h!==11) return a;
    if(m>=2&&m<=4&&(h<12||h>14)) return b;
    return c;}

  // имя ноты по умолчанию у каждого пэда — читаем один раз, сетки все одинаковые
  var NAME={}, PADS={}, PCNAME={};
  big.querySelectorAll('.p').forEach(function(el){
    var i=+el.dataset.p;
    NAME[i]=el.dataset.n; PADS[i]=el; PCNAME[midi(i)%12]=el.dataset.n;});

  // ------------------------------------------------------------------------
  // ОДНА функция раскрашивает и большую сетку, и каждую карточку подбора.
  // st = {pads, root_pc, degrees, spelling}: ноты аккорда голубые, рут зелёный,
  // всё, чего в аккорде нет, — фиолетовое, ровно как в схемах песни.
  // ------------------------------------------------------------------------
  function known(st){return !!(st&&st.spelling&&Object.keys(st.spelling).length);}
  function inChord(st,pc){return known(st)&&st.spelling[pc]!==undefined;}

  function paint(pg,st,ghosts){
    var on={}, pcs={};
    st.pads.forEach(function(p){on[p]=1;pcs[midi(p)%12]=1;});
    pg.querySelectorAll('.p').forEach(function(el){
      var i=+el.dataset.p, pc=midi(i)%12, sel=!!on[i], mine=inChord(st,pc);
      var isOn=sel&&(mine||!known(st)), isEx=sel&&!isOn;
      var gh=ghosts&&!sel&&!!pcs[pc]&&mine;
      el.classList.toggle('on',isOn);
      el.classList.toggle('ex',isEx);
      el.classList.toggle('gh',gh);
      el.classList.toggle('rt',(isOn||gh)&&st.root_pc!==null&&pc===st.root_pc);
      var nm=(known(st)&&st.spelling[pc])||NAME[i];
      var b=el.firstChild, u=el.lastChild;
      if(b.textContent!==nm) b.textContent=nm;
      // Ступень пишем всем пэдам, а не только выбранным: под курсором её
      // раскрывает CSS, и тогда видно, чем нота станет в этом аккорде.
      // Нота аккорда говорит на языке аккорда, всё остальное меряется от рута
      // по реальному расстоянию — пэд октавой выше это 9, а не 2.
      var d=mine?(st.degrees[pc]||'')
              :(((st.padDeg||{})[i])||(known(st)?(st.degrees[pc]||''):''));
      if(u.textContent!==d) u.textContent=d;
      u.className=(d.length>2)?'l3':'';
    });
  }

  // ноты и ступени под сеткой — тоже одни и те же и в карточке, и в разборе
  function parts(st){
    var o={notes:[],extra:[],deg:[],edeg:[]};
    st.pads.slice().sort(byM).forEach(function(p){
      var pc=midi(p)%12, mine=inChord(st,pc)||!known(st);
      var nm=((known(st)&&st.spelling[pc])||NAME[p])+oct(midi(p));
      var dg=known(st)?(st.degrees[pc]||''):'';
      (mine?o.notes:o.extra).push(nm);
      var into=mine?o.deg:o.edeg;
      if(dg&&into.indexOf(dg)<0) into.push(dg);
    });
    return o;
  }
  function subHtml(pt){
    return pt.notes.join(' · ')
      +(pt.extra.length?' <span class="exd">+ '+pt.extra.join(' · ')+'</span>':'');
  }
  function degHtml(pt){
    if(!pt.deg.length&&!pt.edeg.length) return '';
    return 'ступени <b>'+pt.deg.join(' · ')+'</b>'
      +(pt.edeg.length?' <span class="exd">+ '+pt.edeg.join(' · ')+'</span>':'');
  }

  function fillCard(pg,st){
    paint(pg,st,true);
    var pt=parts(st);
    pg.querySelector('.sym').textContent=st.sym||'?';
    pg.querySelector('.sub').innerHTML=subHtml(pt);
    pg.querySelector('.pgm').innerHTML=degHtml(pt);
  }

  // ------------------------------------------------------------- состояние --
  // sel[0] — РУТ: первый нажатый пэд. Аккорд строится от него, а не от баса.
  // lockPc — рут в классах высот; меняется, только если человек сам выбрал
  // другой вариант в списке снизу (тогда это его рут).
  var sel=[], cand=[], ci=0, iv='', cur=-1, lockPc=null, padDeg={};
  var MAX=window.__MAX||6;
  var items=(P&&P.chords)||[], slug=(P&&P.slug)||'';
  function notes(list){
    var o={}; list.forEach(function(p){o[midi(p)%12]=1;});
    return Object.keys(o).length;}
  // Рут ЗАЛОЧЕН: заголовок берём только у аккорда от него. Если от этого рута
  // аккорда нет — заголовка нет тоже (ci=-1), а найденное от других рутов
  // остаётся списком вариантов внизу. Иначе рут молча уезжал: C C# E — от C
  // аккорда нет, и страница показывала C#mMaj7/C, перекрашивая рут на C#.
  function choose(prefer){
    var idx=-1;
    if(prefer) cand.forEach(function(x,i){if(idx<0&&x.sym===prefer) idx=i;});
    if(idx<0&&lockPc!==null)
      cand.forEach(function(x,i){if(idx<0&&x.root_pc===lockPc) idx=i;});
    return idx;
  }

  function state(){
    var c=cand[ci]||null;
    return {pads:sel, sym:c&&c.sym, root_pc:c?c.root_pc:lockPc,
            degrees:c?c.degrees:{}, spelling:c?c.spelling:{}, padDeg:padDeg};
  }

  function show(){
    var c=cand[ci]||null, st=state(), pt=parts(st);
    paint(big,st,true);
    $('sym').textContent=c?c.sym:(sel.length?'?':'—');
    $('sym').className='rsym'+(c?'':' none');
    var sub;
    if(c){sub=c.name; if(c.inv) sub+=' · '+c.inv+'-е обращение';}
    else if(!sel.length) sub='кликай по пэдам — сетка сама скажет, что получилось';
    else if(notes(sel)<2){
      // одна нота — это ещё не «аккорда нет», это заявленный рут
      $('sym').textContent='—'; $('sym').className='rsym none';
      sub='рут '+(PCNAME[lockPc]||'')+' — добавляй ноты';}
    else if(cand.length) sub='от '+(PCNAME[lockPc]||'этой ноты')
      +' такого аккорда в таблице нет — но есть варианты ниже';
    else if(iv) sub='интервал: '+iv;
    else sub='такого аккорда в таблице нет';
    $('nm2').textContent=sub;
    $('notes').innerHTML=sel.length?('<b>'+pt.notes.join('</b> · <b>')+'</b>'
      +(pt.extra.length?' <span class="exd">+ '+pt.extra.join(' · ')+'</span>':'')):'';
    $('degs').innerHTML=degHtml(pt);
    // лишние ноты и так видно фиолетовым в списке — тут только «чего не хватает»
    $('warn').textContent=(c&&c.missing.length)?('без '+c.missing.join(', ')):'';
    big.classList.toggle('full',notes(sel)>=MAX);
    big.classList.toggle('rooted',lockPc!==null);

    var a=$('alts'); a.innerHTML='';
    // один кандидат уже написан большими буквами — чип-дубль не нужен.
    // Но если заголовка нет (аккорда от залоченного рута не нашлось), показываем
    // даже единственный вариант: иначе выбрать его нечем
    ((cand.length>1||ci<0)?cand:[]).forEach(function(x,i){
      var b=document.createElement('button');
      b.className='alt'+(i===ci?' on':'');
      b.textContent=x.sym; b.title=x.name;
      // выбрал другой вариант — рут стал его: дальше аккорд строится от него
      b.addEventListener('click',function(){ci=i;lockPc=x.root_pc;show();});
      a.appendChild(b);});
    $('add').disabled=!sel.length;
  }

  var seq=0;
  function analyze(prefer){
    show();                                   // пэды перекрашиваются сразу
    if(!sel.length){cand=[];ci=0;iv='';padDeg={};show();return;}
    var my=++seq;
    fetch('/api/identify',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pads:sel,root_pc:lockPc})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(my!==seq) return;                  // ответ на устаревший клик
        cand=d.candidates||[]; iv=d.interval||''; padDeg=d.pad_degrees||{};
        ci=choose(prefer);
        show();})
      .catch(function(){if(my===seq){cand=[];show();}});
  }

  function limitHint(){
    $('warn').textContent='в аккорде не больше '+MAX+' нот — сними лишнюю';
    clearTimeout(limitHint._t);
    limitHint._t=setTimeout(show,2600);}

  big.addEventListener('click',function(e){
    var el=e.target.closest('.p'); if(!el) return;
    var i=+el.dataset.p, j=sel.indexOf(i);
    if(sel.length&&i===sel[0]){
      // сняли рут — снимаем всё: аккорд читается заново, а не пересчитывается
      sel=[]; lockPc=null; cur=-1; markCur(); analyze(); return;}
    if(j>=0){
      sel.splice(j,1);
    }else{
      if(notes(sel)>=MAX){limitHint(); return;}
      sel.push(i);
      if(sel.length===1) lockPc=midi(i)%12;   // первый пэд и есть рут
    }
    cur=-1; markCur(); analyze();});

  // ---------------------------------------------------------------- подбор --
  function renderItems(flash){
    strip.innerHTML='';
    items.forEach(function(it,idx){
      var pg=tpl.content.firstElementChild.cloneNode(true);
      pg.dataset.i=idx; pg.draggable=true;
      if(flash===idx) pg.classList.add('flash');
      fillCard(pg,it);
      strip.appendChild(pg);});
    $('cnt').textContent=items.length
      ? ('Подбор: '+items.length+' '+pl(items.length,'аккорд','аккорда','аккордов'))
      : 'Подбор пуст';
    $('wipe').disabled=!items.length;
    markCur();
    if(flash!==undefined&&strip.children[flash])
      strip.children[flash].scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function markCur(){
    Array.prototype.forEach.call(strip.children,function(el,i){
      el.classList.toggle('cur',i===cur);});
  }

  $('add').addEventListener('click',function(){
    if(!sel.length) return;
    var c=cand[ci]||null, st=state();
    items.push({sym:c?c.sym:'?', pads:sel.slice().sort(byM), kind:c?c.kind:'',
                root:sel[0], root_pc:c?c.root_pc:lockPc,
                degrees:st.degrees, spelling:st.spelling, padDeg:st.padDeg});
    cur=items.length-1;
    renderItems(cur);});
  $('clr').addEventListener('click',function(){sel=[];lockPc=null;cur=-1;analyze();});
  $('wipe').addEventListener('click',function(){
    if(items.length&&!confirm('Убрать все аккорды из подбора?')) return;
    items=[];cur=-1;renderItems();});

  strip.addEventListener('click',function(e){
    var pg=e.target.closest('.pg'); if(!pg) return;
    var i=+pg.dataset.i;
    if(e.target.classList.contains('del')){
      items.splice(i,1); if(cur===i) cur=-1; else if(cur>i) cur--;
      renderItems(); return;}
    cur=i; load(items[i]);});

  function load(it){
    var r=(it.root!==undefined&&it.pads.indexOf(it.root)>=0)?it.root:it.pads[0];
    sel=[r].concat(it.pads.filter(function(p){return p!==r;}));
    lockPc=(it.root_pc===undefined||it.root_pc===null)?midi(r)%12:it.root_pc;
    analyze(it.sym);}

  var dragI=-1;
  strip.addEventListener('dragstart',function(e){
    var pg=e.target.closest('.pg'); if(!pg) return;
    dragI=+pg.dataset.i; pg.style.opacity='.35';
    e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','');});
  strip.addEventListener('dragover',function(e){e.preventDefault();});
  strip.addEventListener('drop',function(e){
    e.preventDefault();
    var pg=e.target.closest('.pg'); if(!pg||dragI<0) return;
    var to=+pg.dataset.i;
    if(to!==dragI){
      var it=items.splice(dragI,1)[0]; items.splice(to,0,it);
      if(cur===dragI) cur=to; else cur=-1;}
    dragI=-1; renderItems();});
  strip.addEventListener('dragend',function(){if(dragI>=0){dragI=-1;renderItems();}});

  // ----------------------------------------------------------- сохранение --
  function status(t,err){
    var s=$('st'); s.textContent=t; s.className='st on'+(err?' err':'');
    clearTimeout(status._t);
    status._t=setTimeout(function(){s.className='st'+(err?' err':'');},2400);}

  $('save').addEventListener('click',function(){
    var nm=$('nm').value.trim();
    if(!nm){$('nm').focus(); status('нужно название',1); return;}
    if(!items.length){status('подбор пуст',1); return;}
    fetch('/api/picks',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm,slug:slug,chords:items})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.error){status(d.error,1);return;}
        slug=d.slug; status('сохранено');
        document.title=nm+' — подбор';
        history.replaceState(null,'','/find?pick='+encodeURIComponent(slug));})
      .catch(function(){status('не сохранилось',1);});});

  document.addEventListener('keydown',function(e){
    if(e.target.tagName==='INPUT') return;
    if(e.key==='Enter'&&sel.length){$('add').click(); e.preventDefault();}
    if(e.key==='Escape'&&sel.length){sel=[];lockPc=null;cur=-1;analyze();}});

  renderItems();
  if(items.length){cur=0; load(items[0]);}
  else show();
})();
"""


def render_find(pick: Optional[dict] = None) -> str:
    name = (pick or {}).get("name", "")
    ctl = ('<input type="text" id="nm" placeholder="название подбора" value="%s">'
           '<button id="save" class="pri">Сохранить</button>'
           '<span class="st" id="st"></span>' % esc(name))

    left = ('<main class="pane find">'
            '<div class="gbox">%s</div>'
            '<div class="res">'
            '<div class="rsym none" id="sym">&mdash;</div>'
            '<div class="rname" id="nm2"></div>'
            '<div class="rnote" id="notes"></div>'
            '<div class="rnote" id="degs"></div>'
            '<div class="rnote warn" id="warn"></div>'
            '<div class="alts" id="alts"></div>'
            '<div class="acts">'
            '<button id="add" class="pri" disabled>Добавить в подбор</button>'
            '<button id="clr">Очистить сетку</button></div>'
            '<div class="hint">Первый нажатый пэд &mdash; <b>рут</b>: от него строится '
            'аккорд, повторный клик по нему сбрасывает сетку. Нот в аккорде не больше '
            '%d. Выбрал другое название из списка &mdash; рут стал его.<br>'
            'Enter &mdash; добавить в подбор, Esc &mdash; очистить. Клик по схеме '
            'справа возвращает её на сетку, перетаскивание меняет порядок.</div>'
            "</div></main>"
            % (render_card_template(cls="pg big free", caption=False), MAX_NOTES))

    right = ('<aside class="pane side">'
             '<div class="sidehead"><b id="cnt">Подбор пуст</b>'
             '<button id="wipe" disabled>убрать всё</button></div>'
             '<div class="cards" id="strip"></div></aside>')

    body = (header("Определение аккорда", ctl=ctl)
            + '<div class="layout">%s%s%s</div>' % (left, gutter(), right)
            + '<template id="tpl">%s</template>'
            % render_card_template(foot='<button class="del" title="убрать">&times;</button>'))

    head = "<script>window.__MAX=%d;%s</script>\n" % (
        MAX_NOTES,
        ("window.__PICK=%s;" % json.dumps(pick, ensure_ascii=False)
         .replace("<", "\\u003c")) if pick else "")
    title = (name + " — подбор") if name else "Определение аккорда"
    return page(title, body, layout_css() + _CSS, LAYOUT_JS + _JS,
                with_grid=True, head=head)
