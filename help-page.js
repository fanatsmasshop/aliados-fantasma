const items = [...document.querySelectorAll('.help-item')];
const search = document.querySelector('#help-search');
const filters = [...document.querySelectorAll('.help-filter')];
const empty = document.querySelector('#help-empty');
let category = 'all';

function applyFilters() {
  const query = (search?.value || '').trim().toLowerCase();
  let visible = 0;
  items.forEach(item => {
    const matchesCategory = category === 'all' || item.dataset.category === category;
    const matchesSearch = !query || item.textContent.toLowerCase().includes(query);
    const show = matchesCategory && matchesSearch;
    item.hidden = !show;
    if (show) visible += 1;
  });
  if (empty) empty.hidden = visible > 0;
}

filters.forEach(button => button.addEventListener('click', () => {
  category = button.dataset.filter;
  filters.forEach(current => current.classList.toggle('active', current === button));
  applyFilters();
}));
search?.addEventListener('input', applyFilters);

document.querySelectorAll('.help-question').forEach(button => {
  button.addEventListener('click', () => {
    const item = button.closest('.help-item');
    const open = item.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
});
applyFilters();
