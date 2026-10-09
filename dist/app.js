const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const storageKey = id => `ordna:${id}:v1`;
let modules = [];
let activeModule = null;
let cards = [];
let scores = {};
let view = 'learn';
let queue = [];
let currentId = null;
let answerState = null;
let flashIndex = 0;
let flashBack = false;
let editId = null;

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3500); }
function normalize(text) { return String(text || '').trim().toLocaleLowerCase().replace(/[.,!?;:()]/g, '').replace(/\s+/g, ' '); }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function persist() { localStorage.setItem(storageKey(activeModule.id), JSON.stringify({cards, scores})); }
function makeCards(raw) { return raw.map((item, index) => Array.isArray(item) ? {id:`seed-${index+1}`, term:item[0], definition:item[1], termNote:'', definitionNote:''} : item); }
async function init() {
  try {
    modules = await (await fetch('modules/index.json')).json();
    renderModuleNav();
    await loadModule(modules[0].id);
  } catch (error) { $('#question-card').innerHTML = '<p>Не удалось загрузить модуль. Откройте сайт через веб-сервер.</p>'; }
}
function renderModuleNav() { $('#module-nav').innerHTML = modules.map(module => `<button class="module-link ${module.id===activeModule?.id?'selected':''}" data-module="${esc(module.id)}"><span class="module-icon">S</span><span><strong>${esc(module.title)}</strong><small>${esc(module.subtitle)}</small></span><span class="module-arrow">↗</span></button>`).join(''); }
async function loadModule(id) {
  const meta = modules.find(item => item.id === id);
  if (!meta) return;
  const raw = await (await fetch(meta.path)).json();
  activeModule = meta;
  const saved = JSON.parse(localStorage.getItem(storageKey(id)) || 'null');
  cards = saved?.cards?.length ? saved.cards : makeCards(raw.cards);
  scores = saved?.scores || {};
  queue = [];
  currentId = null;
  answerState = null;
  flashIndex = 0;
  flashBack = false;
  $('#module-title').textContent = meta.title;
  $('#module-subtitle').textContent = meta.subtitle;
  $('#crumb-title').textContent = meta.title;
  renderModuleNav();
  renderAll();
}
function renderAll() { updateStats(); renderQuestion(); renderFlash(); renderEditor(); }
function updateStats() {
  const total = cards.length, mastered = cards.filter(card => (scores[card.id] || 0) >= 2).length;
  const pct = total ? Math.round(mastered / total * 100) : 0;
  $('#card-count').textContent = `${total} ${total%10===1&&total%100!==11?'карточка':total%10>=2&&total%10<=4&&(total%100<12||total%100>14)?'карточки':'карточек'}`;
  $('#progress-copy').textContent = `${mastered} из ${total} освоено`;
  $('#progress-percent').textContent = `${pct}%`;
  $('#progress-fill').style.width = `${pct}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(pct));
  $('#aside-total').textContent = total;
  $('#aside-mastered').textContent = mastered;
  $('#aside-remaining').textContent = total-mastered;
}
function nextQuestion() {
  const remaining = cards.filter(card => (scores[card.id] || 0) < 2);
  if (!remaining.length) { currentId = null; return; }
  if (!queue.length) queue = shuffle(remaining.map(card => card.id));
  currentId = queue.shift();
  answerState = null;
}
function questionCard() { return cards.find(card => card.id === currentId); }
function distractors(card) {
  const alternatives = [...new Set(cards.filter(item => item.id !== card.id && item.definition !== card.definition).map(item => item.definition))];
  const isShort = card.definition.length <= 8;
  const similar = alternatives.filter(item => (item.length <= 8) === isShort);
  return shuffle([card.definition, ...shuffle(similar.length >= 3 ? similar : alternatives).slice(0,3)]);
}
function renderQuestion() {
  if (!cards.length) { $('#question-card').innerHTML = '<div class="empty-state">Добавьте первую карточку в редакторе.</div>'; return; }
  if (!currentId || (!answerState && !cards.some(card => card.id === currentId && (scores[card.id]||0)<2))) nextQuestion();
  if (!currentId) { $('#question-card').innerHTML = '<div class="completed"><span>✳</span><h3>Все карточки освоены!</h3><p>Вы прошли весь модуль. Можно начать заново или повторить карточки.</p><button class="primary-button" id="completed-reset">Начать заново</button></div>'; return; }
  const card = questionCard();
  const stage = (scores[card.id] || 0) === 0 ? 'choice' : 'write';
  const position = cards.filter(item => (scores[item.id] || 0) >= 2).length + 1;
  const top = `<div class="question-head"><span class="question-number">ВОПРОС ${position} <span>/ ${cards.length}</span></span><span class="question-stage">${stage==='choice'?'Выберите перевод':'Напишите перевод'}</span></div><div class="term-label">ТЕРМИН</div><div class="question-term">${esc(card.term)}</div>${card.termNote?`<div class="term-note">${esc(card.termNote)}</div>`:''}<div class="question-divider"></div>`;
  if (answerState) {
    const good = answerState.correct;
    $('#question-card').innerHTML = top + `<div class="result ${good?'correct':'wrong'}"><span class="result-icon">${good?'✓':'↺'}</span><div><strong>${good?'Верно!':'Запомните ответ'}</strong><p>${good?'Отлично, двигаемся дальше.':'Эта карточка вернётся в повторение.'}</p></div></div><div class="answer-reveal"><span>ПЕРЕВОД</span><strong>${esc(card.definition)}</strong>${card.definitionNote?`<p>${esc(card.definitionNote)}</p>`:''}</div><button id="next-question" class="primary-button next-button">Следующий вопрос <span>→</span></button>`;
    return;
  }
  if (stage === 'choice') {
    const options = distractors(card);
    $('#question-card').innerHTML = top + `<div class="prompt-label">Выберите правильный ответ</div><div class="options">${options.map((text,index)=>`<button class="option" data-answer="${esc(text)}"><span>${String.fromCharCode(65+index)}</span>${esc(text)}</button>`).join('')}</div><button id="skip-question" class="skip-button">Не уверены? Показать ответ</button>`;
  } else {
    $('#question-card').innerHTML = top + `<label class="prompt-label" for="typed-answer">Введите перевод</label><form id="answer-form"><input id="typed-answer" autocomplete="off" placeholder="Ваш ответ…" aria-label="Ваш ответ"><button class="primary-button" type="submit">Ответить →</button></form><button id="skip-question" class="skip-button">Не уверены? Показать ответ</button>`;
  }
}
function respond(response, skipped=false) {
  if (answerState) return;
  const card = questionCard();
  const accepted = card.definition.split(/[,;]/).map(normalize);
  const correct = !skipped && (normalize(response) === normalize(card.definition) || accepted.includes(normalize(response)));
  scores[card.id] = correct ? Math.min(2, (scores[card.id] || 0)+1) : 0;
  answerState = {correct};
  persist(); updateStats(); renderQuestion();
}
function advance() { currentId = null; answerState = null; renderQuestion(); }
function renderFlash() {
  if (!cards.length) { $('#flash-text').textContent = 'Пока нет карточек'; return; }
  flashIndex = Math.max(0, Math.min(flashIndex, cards.length-1));
  const card = cards[flashIndex];
  $('#flash-label').textContent = flashBack ? 'ПЕРЕВОД' : 'ТЕРМИН';
  $('#flash-text').textContent = flashBack ? card.definition : card.term;
  $('#flash-note').textContent = flashBack ? card.definitionNote : card.termNote;
  $('#flash-index').textContent = $('#flash-position').textContent = `${flashIndex+1} / ${cards.length}`;
  $('#flash-prev').disabled = flashIndex === 0;
  $('#flash-next').disabled = flashIndex === cards.length-1;
}
function switchView(next) {
  view = next;
  document.querySelectorAll('.tab').forEach(tab => { const selected=tab.dataset.view===next; tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected)); });
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('hidden', section.id !== `${next}-view`));
  if (next==='edit') renderEditor();
  history.replaceState(null,'',`#${next}`);
}
function renderEditor() {
  $('#editor-list').innerHTML = cards.map((card,index) => `<div class="editor-item"><div class="editor-item-head"><span class="editor-num">${String(index+1).padStart(2,'0')}</span><div><strong>${esc(card.term)}</strong><small>${esc(card.definition)}</small></div><button class="edit-toggle" data-edit="${esc(card.id)}" aria-label="Редактировать ${esc(card.term)}">${editId===card.id?'Свернуть −':'Редактировать ↗'}</button></div>${editId===card.id?`<form class="edit-form" data-id="${esc(card.id)}"><div class="edit-grid"><div class="edit-side"><span class="edit-side-label">01 / ШВЕДСКИЙ</span><label>Термин<input name="term" required value="${esc(card.term)}"></label><label>Аннотация или пример<textarea name="termNote" rows="3" placeholder="Например: Hon bryter av grenar.">${esc(card.termNote)}</textarea></label></div><div class="edit-side"><span class="edit-side-label">02 / РУССКИЙ</span><label>Перевод<input name="definition" required value="${esc(card.definition)}"></label><label>Аннотация или комментарий<textarea name="definitionNote" rows="3" placeholder="Пояснение, ассоциация, комментарий…">${esc(card.definitionNote)}</textarea></label></div></div><div class="edit-actions"><button class="danger-button" type="button" data-delete="${esc(card.id)}">Удалить карточку</button><button class="primary-button" type="submit">Сохранить изменения</button></div></form>`:''}</div>`).join('');
}
document.addEventListener('click', async event => {
  const moduleButton = event.target.closest('[data-module]'); if (moduleButton) { await loadModule(moduleButton.dataset.module); $('#mobile-menu').classList.remove('open'); $('.sidebar').classList.remove('open'); return; }
  const tab = event.target.closest('.tab'); if (tab) { switchView(tab.dataset.view); return; }
  const option = event.target.closest('.option'); if (option) { respond(option.dataset.answer); return; }
  if (event.target.closest('#skip-question')) { respond('', true); return; }
  if (event.target.closest('#next-question')) { advance(); return; }
  if (event.target.closest('#completed-reset') || event.target.closest('#reset-progress')) { if (confirm('Сбросить прогресс заучивания этого модуля?')) { scores={}; queue=[];currentId=null;answerState=null;persist();renderAll();toast('Прогресс сброшен'); } return; }
  if (event.target.closest('#flashcard')) { flashBack=!flashBack;renderFlash();return; }
  if (event.target.closest('#flash-prev')) { flashIndex--;flashBack=false;renderFlash();return; }
  if (event.target.closest('#flash-next')) { flashIndex++;flashBack=false;renderFlash();return; }
  const edit = event.target.closest('[data-edit]'); if (edit) { editId=editId===edit.dataset.edit?null:edit.dataset.edit;renderEditor();return; }
  if (event.target.closest('#add-card')) { const id=`custom-${Date.now()}`;cards.unshift({id,term:'',definition:'',termNote:'',definitionNote:''});editId=id;persist();renderAll();$('#editor-list').scrollIntoView({behavior:'smooth'});return; }
  const del = event.target.closest('[data-delete]'); if (del && confirm('Удалить эту карточку?')) { cards=cards.filter(card=>card.id!==del.dataset.delete);delete scores[del.dataset.delete];editId=null;currentId=null;queue=[];persist();renderAll();toast('Карточка удалена');return; }
  if (event.target.closest('#mobile-menu')) { $('.sidebar').classList.toggle('open');return; }
  if (event.target.closest('#export-button')) { const data={format:'ordna-v1',module:activeModule.id,cards,scores};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ordna-${activeModule.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Файл сохранён'); }
});
document.addEventListener('submit', event => {
  if (event.target.id==='answer-form') { event.preventDefault();respond($('#typed-answer').value);return; }
  if (event.target.matches('.edit-form')) { event.preventDefault();const form=event.target;const card=cards.find(item=>item.id===form.dataset.id);const data=new FormData(form);const term=String(data.get('term')).trim(), definition=String(data.get('definition')).trim();if (!term||!definition) { toast('Укажите термин и перевод');return; }Object.assign(card,{term,definition,termNote:String(data.get('termNote')).trim(),definitionNote:String(data.get('definitionNote')).trim()});editId=null;persist();renderAll();toast('Карточка сохранена'); }
});
$('#import-input').addEventListener('change', async event => { const file=event.target.files[0];if(!file)return;try { const data=JSON.parse(await file.text());if(data.format!=='ordna-v1'||data.module!==activeModule.id||!Array.isArray(data.cards))throw Error();if(!confirm('Заменить карточки и прогресс этого модуля данными из файла?'))return;cards=data.cards;scores=data.scores||{};currentId=null;queue=[];persist();renderAll();toast('Данные загружены');}catch {toast('Не удалось прочитать файл этого модуля');}event.target.value=''; });
document.addEventListener('keydown', event => { if (view!=='cards'||/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;if(event.key==='ArrowLeft'&&flashIndex>0){flashIndex--;flashBack=false;renderFlash();}if(event.key==='ArrowRight'&&flashIndex<cards.length-1){flashIndex++;flashBack=false;renderFlash();}if(event.code==='Space'){event.preventDefault();flashBack=!flashBack;renderFlash();} });
init().then(()=>{const hash=location.hash.slice(1);if(['learn','cards','edit'].includes(hash))switchView(hash);});
