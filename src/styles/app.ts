/**
 * CSS того, чего в Python-версии не было: поле ввода, хранилище, предупреждения
 * о нераспознанных аккордах. Цвета — только переменные из baseCss(), чтобы новое
 * не отличалось от старого.
 */

/** Общий для всего приложения. */
export const APP_CSS = `
/* React-корень не должен ломать раскладку: .top и .layout остаются прямыми
   flex-детьми body, как в страницах, которые собирал Python */
#root{display:contents}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#151b19;
  border:1px solid var(--line);border-radius:5px;padding:0 4px;color:var(--fg);white-space:pre-wrap}
`;

/** Главная и правка источника. */
export const APP_CSS_HOME = `
.wrap > h2:first-child{margin-top:4px}
.editor{display:flex;flex-direction:column;gap:10px}
.editor textarea{width:100%;min-height:clamp(170px,34vh,380px);resize:vertical;background:#0d1211;
  color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:8}
.editor textarea:focus{outline:none;border-color:var(--tone)}
.editor textarea::placeholder{color:var(--dim)}
.erow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.erow input[type=text]{flex:1 1 200px;min-width:0}
.einfo{font-size:13px;color:var(--muted);min-height:20px;line-height:1.5}
.sum b{color:var(--fg);font-weight:600}
.sum.dim{color:var(--dim)}
.sum-unk,.sum-unk b{color:var(--extra)}
.howto{font-size:13px;color:var(--muted);line-height:1.6;border:1px solid var(--line);
  border-radius:12px;padding:8px 14px;background:var(--panel)}
.howto summary{cursor:pointer;color:var(--fg)}
.howto p{margin:8px 0}
.howto b{color:var(--fg);font-weight:600}
.storage{margin-top:8px}
.storage p{font-size:13.5px;color:var(--muted);margin:0 0 10px;line-height:1.55}
.empty a{color:var(--tone)}
`;

/** Страница разбора. */
export const APP_CSS_ANALYSIS = `
/* аккорд, которого нет в таблице: виден в тексте, но схемы не получает */
.u .c.unk,.line.only .u .c.unk,.sec.instr .u .c.unk{color:var(--extra);
  text-decoration:underline dotted;text-underline-offset:3px}
.unk-note{color:var(--extra);font-size:12.5px;margin:0 0 10px;line-height:1.5}
.unk-note b{color:var(--extra)}
.unk-note a{color:var(--tone)}
.ctl > .btn,.ctl > button{padding:4px 10px;font-size:12.5px}
`;
