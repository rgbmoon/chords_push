/**
 * CSS приложения — дословно из Python-версии (webapp.py, push_grid.py, songpage.py,
 * song.py, findpage.py, homepage.py). Шаблоны с питоновскими плейсхолдерами
 * заполняются pyFormat из палитры и пропорций в data.ts — ровно как это делал Python.
 */
import { COLS, PALETTE, RENDER } from "../core/data";
import { fmtG, pyFormat } from "../core/py";

// Пол и потолок ширины схемы в колонке со схемами.
// Пол держит схему читаемой: вторая колонка появляется только тогда, когда каждая
// схема останется шире минимума. Замерено на 42 типах x 3 тониках: ниже 315 у
// `Gb b13` подпись упирается в край пэда.
// Потолок нужен не меньше пола: без него одинокая колонка растягивает схему на
// весь сайдбар, схема становится выше — и в экран перестаёт влезать следующий ряд.
// ВАЖНО: потолок нельзя ставить в minmax() — auto-fit посчитает число колонок по
// нему и схлопнет всё в одну колонку. Он вешается на сам элемент.
export const CARD_MIN = 315;
export const CARD_MAX = 330;

const st = PALETTE.states;
const BASE_TPL = `
*,*::before,*::after{box-sizing:border-box}
:root{--bg:%(bg)s;--panel:#121715;--panel2:#0f1412;--line:#1f2724;--fg:#e9efeb;
  --muted:#8d9a94;--dim:#5f6b66;--tone:%(tone)s;--root:%(root)s;--extra:%(extra)s;
  --gut:clamp(18px,2.2vw,34px);--card-min:%(cardmin)dpx;--card-max:%(cardmax)dpx}
html,body{margin:0;padding:0;height:100%%}
body{background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
  font:15px/1.55 -apple-system,'SF Pro Text','Helvetica Neue',Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit}

/* --- шапка: одна строка, минимум высоты --- */
.top{background:var(--panel2);border-bottom:1px solid var(--line);
  padding:0 clamp(12px,3vw,36px);flex:0 0 auto}
.topin{max-width:1600px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;
  gap:6px 16px;min-height:48px;padding:7px 0}
h1{margin:0;font-size:clamp(15px,1.7vw,19px);letter-spacing:-.015em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
h1 small{font-size:.78em;font-weight:400;color:var(--muted);letter-spacing:0;
  margin-left:8px}
.back{color:var(--muted);text-decoration:none;font-size:13px;white-space:nowrap}
.back:hover{color:var(--fg)}
.chips{display:flex;flex-wrap:wrap;gap:3px 12px;color:var(--muted);font-size:12.5px;
  white-space:nowrap}
.chips b{color:var(--fg);font-weight:600}
.ctl{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}

/* --- органы управления --- */
button,.btn{background:#1b2320;color:var(--fg);border:1px solid var(--line);
  border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;
  text-decoration:none;display:inline-block;line-height:1.3}
button:hover,.btn:hover{border-color:var(--tone);color:#fff}
button:disabled{opacity:.45;cursor:default;border-color:var(--line);color:var(--muted)}
button.pri{background:var(--tone);color:#04212e;border-color:var(--tone);font-weight:600}
button.pri:hover{color:#04212e;filter:brightness(1.08)}
button.pri:disabled{background:#1b2320;color:var(--muted);filter:none}
input[type=text]{background:#0d1211;color:var(--fg);border:1px solid var(--line);
  border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;min-width:180px}
input[type=text]:focus{outline:none;border-color:var(--tone)}
/* переключатель размера (кегль текста в песне, размер схем в song.py) */
.sizer{display:flex;gap:5px;align-items:center;font-size:12.5px;color:var(--muted)}
.sizer button{border-radius:7px;padding:3px 9px;font-size:12.5px}
.sizer button[aria-pressed=true]{background:var(--tone);color:#04212e;
  border-color:var(--tone);font-weight:600}
.st{font-size:12.5px;color:var(--root);opacity:0;transition:opacity .25s}
.st.on{opacity:1}
.st.err{color:var(--extra)}

/* --- сетка из схем: и в сайдбаре песни, и в подборе --- */
.cards{display:grid;gap:8px;align-items:start;justify-items:start;
  grid-template-columns:repeat(auto-fit,minmax(min(100%%,var(--card-min)),1fr))}
.cards > .pg{width:100%%;max-width:var(--card-max)}
`;

export function baseCss(): string {
  return pyFormat(BASE_TPL, {
    bg: PALETTE.background,
    tone: st.chord.stops[1],
    root: st.chord_root.stops[1],
    extra: st.extra.stops[1],
    cardmin: CARD_MIN,
    cardmax: CARD_MAX,
  });
}

/** Две колонки с ручкой между ними: страница не скроллится целиком. */
export const LAYOUT_CSS = `
/* Страница НЕ скроллится целиком: шапка стоит намертво, а две колонки —
   независимые области со своим скроллом. Раньше сайдбар был липким внутри
   общего скролла, и схемы не долистывались до конца, пока страница не уедет
   вверх вместе с шапкой. Слово-сторож в тестах — «sticky», поэтому в CSS его
   быть не должно даже в комментарии. */
body{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}

/* колонки 50/50 по умолчанию, ручка между ними тянется мышкой и стрелками */
.layout{flex:1 1 auto;min-height:0;width:100%;max-width:1600px;margin:0 auto;
  display:grid;gap:0;--split:50%;
  grid-template-columns:minmax(0,var(--split)) var(--gut) minmax(0,1fr)}
.gutter{position:relative;cursor:col-resize;touch-action:none;outline:none;
  display:flex;align-items:center;justify-content:center}
.gutter::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;
  margin-left:-.5px;background:var(--line)}
.gutter b{position:relative;display:block;width:5px;height:52px;
  border-radius:4px;background:#26312d;transition:background .15s}
.gutter:hover b,.gutter:focus-visible b,.gutter.drag b{background:var(--tone)}
.gutter:focus-visible::before{background:var(--tone)}
body.dragging{user-select:none;cursor:col-resize}

/* обе колонки скроллятся сами по себе; паддинги ставит уже страница */
.pane{overflow-y:auto;overflow-x:hidden;min-width:0;min-height:0;
  overscroll-behavior:contain;scrollbar-width:thin;
  scrollbar-color:#2b3733 transparent}
.pane::-webkit-scrollbar{width:8px}
.pane::-webkit-scrollbar-thumb{background:#2b3733;border-radius:8px}

@media (max-width:900px){
  /* схемы наверх узкой лентой, вторая колонка под ними — обе со своим скроллом */
  .layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
  .gutter{display:none}
  .side{order:-1;overflow:visible;padding:10px 0 0;
    border-bottom:1px solid var(--line)}
  .cards{display:flex;flex-direction:row;overflow-x:auto;scroll-snap-type:x mandatory;
    padding:0 clamp(12px,3vw,36px) 10px;gap:10px;
    -webkit-overflow-scrolling:touch}
  .cards > .pg{flex:0 0 min(88vw,var(--card-min));scroll-snap-align:start}
}
@media print{
  body{background:#fff;color:#000;height:auto;display:block;overflow:visible}
  .top,.gutter{display:none}
  .layout{display:block;max-width:none}
  .pane{overflow:visible;padding:0}
  .cards{display:grid;grid-template-columns:repeat(2,1fr)}
  .cards > .pg{break-inside:avoid}
}
`;

/** Тот же радиальный градиент пэда, что в SVG, только средствами CSS. */
function gradCss(stops: readonly string[]): string {
  const g = RENDER.gradient;
  const r = g.r * 100;
  const body = stops.map((s, i) => `${s} ${fmtG(g.offsets[i] * 100, 4)}%`).join(", ");
  return `radial-gradient(ellipse ${fmtG(r, 4)}% ${fmtG(r, 4)}% at ${fmtG(g.cx * 100, 4)}% ${fmtG(g.cy * 100, 4)}%, ${body})`;
}

const GRID_TPL = `
/* Схема — это ПЛОТНАЯ вещь: их на странице сразу столько, сколько аккордов в песне,
   и все должны быть видны без прокрутки. Отсюда два правила.
   1. Кегль НЕ привязан к ширине схемы (было clamp(...,3.1cqw,15px)) — иначе «сжать
      схему» автоматически значило «уменьшить текст». Имя ноты 14px, ступень 9-10px
      рядом с ним — и схема живёт в 300px вместо 380.
   2. Обвязка стоит дороже сетки: 94px хрома на 205px сетки. Поэтому имя аккорда и
      ступени сведены в ОДНУ строку над сеткой, а рамки-обёртки нет вовсе. */
.pg{%(vars)s container-type:inline-size;background:%(bg)s;border-radius:11px;
  padding:7px;font-family:%(ff)s;min-width:0}
/* подпись НАД сеткой: имя аккорда слева, ступени справа. ОБЕ половины обязаны
   уметь сжиматься (min-width:0) и переноситься — иначе аккорд с десятком
   выделенных руками нот распирает строку, а с ней и всю карточку */
.pg .pgcap{display:flex;flex-wrap:wrap;align-items:baseline;
  justify-content:space-between;gap:2px 10px;margin-bottom:6px}
.pg .pgh{display:flex;align-items:baseline;gap:7px;min-width:0;flex:1 1 auto}
.pg .sym{font-size:14px;font-weight:700;color:#eef2ef;letter-spacing:-.01em;
  flex:0 0 auto}
.pg .sub{font-size:11.5px;color:#8b9691;min-width:0;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.pg .pads{display:grid;grid-template-columns:repeat(%(cols)d,1fr);
  gap:%(gy).3gcqw %(gx).3gcqw}
/* grid, а не flex: у flex с align-items:baseline подпись прилипает к ВЕРХУ пэда
   (0px сверху, 13px снизу — так работает выравнивание по базовой линии). В гриде
   align-content:center центрирует саму строку, а align-items:baseline при этом
   продолжает сажать ступень на общую с именем базовую линию */
.pg .p{position:relative;aspect-ratio:%(pw).4g/%(ph).4g;border-radius:%(rad).3gcqw;
  display:grid;grid-auto-flow:column;align-content:center;justify-content:center;
  align-items:baseline;gap:1.5px;line-height:1;user-select:none;overflow:hidden}
.pg .p b{position:relative;z-index:1;font-weight:600;
  font-size:clamp(14px,3.1cqw,15px)}
/* ступень стоит СБОКУ от имени, а не под ним: снизу она упиралась в край пэда
   и обрезалась — скобки вылезают за строку при line-height:1. Скобок больше нет,
   они стоили 6px ширины, а её тут в обрез: «Bb bb7» у dim7 занимает 36px при
   пэде 36px */
.pg .p u{display:none;position:relative;z-index:1;text-decoration:none;
  font-weight:700;opacity:.8;letter-spacing:-.2px;
  font-size:clamp(9px,2.1cqw,10.5px)}
.pg .p u.l3{font-size:clamp(8.5px,1.95cqw,10px);letter-spacing:-.35px}
/* ступень подписана только там, где нота выбрана: у нот аккорда, у их обращений
   и у нот, добавленных руками. У остальных 64 пэдов подпись лежит в разметке
   наготове — JS её просто показывает, ничего не сочиняя */
.pg .p.on u,.pg .p.gh u,.pg .p.ex u{display:block}
.pg .p.b-root{background:var(--g-root);color:var(--l-root)}
.pg .p.b-in_key{background:var(--g-in_key);color:var(--l-in_key)}
.pg .p.b-off{background:var(--g-off);color:var(--l-off)}
.pg .p.on{background:var(--g-chord);color:var(--l-chord);
  box-shadow:inset 0 0 0 max(1px,.36cqw) rgba(255,255,255,.9)}
.pg .p.on.rt{background:var(--g-chord_root);color:var(--l-chord_root)}
.pg .p.gh::after{content:"";position:absolute;inset:0;border-radius:inherit;
  background:var(--g-chord);opacity:%(gop).2g}
.pg .p.gh.rt::after{background:var(--g-chord_root)}
.pg .p.gh{cursor:pointer}
.pg .p.gh:hover::after{opacity:.72}
.pg .p:focus-visible{outline:2px solid #8fdcff;outline-offset:1px}
/* нота, добавленная руками: НЕ из аккорда, поэтому и цвет не из палитры аккорда,
   и рамка не белая — сразу видно, что это отсебятина, а не часть гармонии */
.pg .p.ex{background:var(--g-extra);color:var(--l-extra);
  box-shadow:inset 0 0 0 max(1px,.36cqw) %(exedge)s}
.pg .p.ex::after{display:none}
.pg .pads{cursor:pointer}
.pg .p.on{cursor:default}   /* ноту аккорда снять нельзя — гармония не рушится */
.pg .pgf{display:flex;align-items:baseline;gap:7px;justify-content:flex-end;
  min-width:0;flex:0 1 auto;font-size:11.5px;color:#8b9691}
.pg .pgm{min-width:0}
.pg .pgm b{color:#e9efeb;font-weight:600}
.pg .pgm .exd{color:%(exedge)s;font-weight:600}
.pg .sub .exd{color:%(exedge)s}
.pg .rs{display:none;background:#1b2320;color:#cdd6d1;border:1px solid #26312d;
  border-radius:6px;font:inherit;font-size:11px;line-height:1;padding:3px 6px;
  cursor:pointer}
.pg .rs:hover{border-color:#3ea0cc;color:#eef2ef}
/* подпись обращения: пока схема такая, как её выбрал солвер, писать нечего —
   он бас не трогает. Появляется ровно тогда, когда бас переставили руками.
   Рамки вокруг изменённой схемы нет — она кричала на всю карточку. Вместо неё
   маленькая точка у имени аккорда */
.pg .vlab{display:none;color:#4fd98a;font-weight:600}
.pg.edited .rs,.pg.edited .vlab{display:inline-block}
.pg.edited .sym::after{content:"";display:inline-block;width:5px;height:5px;
  border-radius:50%%;background:#4fd98a;margin-left:5px;vertical-align:middle}
@media print{
  .pg .rs{display:none}
  .pg .p{box-shadow:none}
}
`;

/** CSS схемы. Цвета и пропорции берутся из data.ts, а не из головы. */
export function gridCss(): string {
  const R = RENDER;
  const W = R.margin * 2 + COLS * R.pad_w + (COLS - 1) * R.gap_x;
  const vars = Object.entries(st)
    .map(([k, v]) => `--g-${k}:${gradCss(v.stops)};--l-${k}:${v.label_color};`)
    .join("");
  return pyFormat(GRID_TPL, {
    vars,
    bg: PALETTE.background,
    cols: COLS,
    ff: R.label.font_family,
    pw: R.pad_w,
    ph: R.pad_h,
    rad: (R.corner_radius / W) * 100,
    gx: (R.gap_x / W) * 100,
    gy: (R.gap_y / W) * 100,
    gop: PALETTE.ghost_opacity,
    exedge: PALETTE.extra_edge,
  });
}

/** Страница песни: текст слева, схемы справа. */
export const SONG_CSS = `
:root{--lyric:clamp(16px,1.4vw,21px)}

/* --- текст с аккордами --- */
.sheet{padding:18px clamp(12px,2vw,22px) 40px clamp(12px,3vw,36px)}
/* сайдбару паддинги дороже, чем тексту: каждые 20px тут решают, встанут схемы
   в две колонки или в одну */
.side{padding:12px clamp(10px,1.4vw,20px) 12px clamp(10px,1vw,14px)}
.sec{margin:0 0 26px}
.sec h2{margin:0 0 10px;font-size:12.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--muted);font-weight:600;display:flex;align-items:center;gap:11px}
.sec h2::after{content:"";flex:1;height:1px;background:var(--line)}
.sec.instr h2{color:var(--dim)}
.line{margin:0 0 4px;font-size:var(--lyric);line-height:1.35}
.line.plain{padding-top:0}
.line.only{margin-bottom:10px}
.u{display:inline-block;vertical-align:bottom}
.u .c{display:block;color:var(--root);font-weight:700;font-size:.82em;line-height:1.45;
  letter-spacing:.01em;padding-right:.7em;white-space:nowrap;
  font-feature-settings:"tnum"}
.u .t{white-space:pre-wrap}
.line.only .u .c{color:var(--dim)}
.sec.instr .u .c{color:var(--dim)}
.blank{height:11px}

footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12.5px;line-height:1.7}
footer a{color:var(--tone)}
footer b{color:var(--fg);font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 12px;font-size:12.5px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:4px;
  margin-right:6px;vertical-align:-2px}
.legend span{white-space:nowrap}
.facts{display:flex;flex-wrap:wrap;gap:4px 18px;margin:0 0 12px}
.facts b{color:var(--fg);font-weight:600}

@media print{
  footer{display:none}
  .sec{break-inside:avoid}
}
`;

/** Страница голой последовательности: только схемы. */
export const SEQ_CSS = `
.wrap{max-width:1700px;margin:0 auto;padding:20px clamp(12px,3vw,36px) 72px}
.seq{margin:0 0 16px;color:var(--muted);font-size:clamp(13px,1.8vw,16px);
  font-variant-numeric:tabular-nums;word-break:break-word}
.seq b{color:var(--fg);font-weight:600}
.bar{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;
  margin:0 0 18px;padding:12px 14px;background:var(--panel);
  border:1px solid var(--line);border-radius:12px}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:13px;height:13px;border-radius:4px;
  margin-right:7px;vertical-align:-2px}
.legend span{white-space:nowrap}
/* схемы тут крупнее, чем в песне: страница только из них и состоит */
.cards{gap:clamp(14px,1.8vw,26px)}
footer{margin-top:36px;color:var(--muted);font-size:12.5px;line-height:1.7}
footer b{color:var(--fg);font-weight:600}
@media print{
  .bar,footer{display:none}
}
`;

/** Страница определения аккорда. */
export const FIND_CSS = `
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
`;

/** Главная. */
export const HOME_CSS = `
.wrap{max-width:1100px;margin:0 auto;padding:24px clamp(12px,3vw,36px) 70px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
  margin:28px 0 12px;font-weight:600;display:flex;align-items:baseline;gap:9px}
h2 span{text-transform:none;letter-spacing:0;color:var(--dim);font-weight:400}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:11px}
.card{position:relative;display:block;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:13px 15px;text-decoration:none;color:inherit}
.card:hover{border-color:var(--tone)}
.card b{display:block;font-size:15px;line-height:1.3;margin-bottom:4px;
  letter-spacing:-.01em;padding-right:14px}
.card i{display:block;font-style:normal;color:var(--muted);font-size:12.5px;
  line-height:1.45}
.card em{font-style:normal;color:var(--dim);font-size:12px;display:block;margin-top:6px}
.card .x{position:absolute;top:6px;right:6px;background:none;border:0;color:#39443f;
  font-size:15px;line-height:1;padding:3px 6px;cursor:pointer;border-radius:6px}
.card .x:hover{color:var(--extra);background:#1b2320}
.empty{color:var(--dim);font-size:13.5px;border:1px dashed var(--line);
  border-radius:12px;padding:16px 18px}
.new{background:transparent;border:1px dashed #2a3531;display:flex;align-items:center;
  justify-content:center;color:var(--muted);font-size:13.5px;min-height:74px}
.new:hover{border-color:var(--tone);color:var(--fg)}
`;
