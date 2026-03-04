(function () {
  // State
  let currentName = localStorage.getItem('datepicker_name') || '';
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth(); // 0-indexed, center month
  let allMonthData = {}; // { "YYYY-MM-DD": ["Alice", "Bob"] } spanning 3 months
  let selectedDay = null;
  let refreshTimer = null;

  // Drag state
  let isDragging = false;
  let dragMode = null; // 'add' or 'remove'
  let draggedDates = new Set();

  // DOM refs
  const nameInput = document.getElementById('name-input');
  const nameBtn = document.getElementById('name-btn');
  const modalBackdrop = document.getElementById('name-modal-backdrop');
  const modalCloseBtn = document.getElementById('modal-close');
  const userInfo = document.getElementById('user-info');
  const currentNameEl = document.getElementById('current-name');
  const changeNameBtn = document.getElementById('change-name-btn');
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');
  const monthTitle = document.getElementById('month-title');
  const calendarContainer = document.getElementById('calendar-container');
  const dayDetail = document.getElementById('day-detail');
  const detailDate = document.getElementById('detail-date');
  const detailPeople = document.getElementById('detail-people');
  const bestDatesList = document.getElementById('best-dates-list');
  const participantsList = document.getElementById('participants-list');

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const SHORT_MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // Helpers
  function getAdjacentMonths(year, month) {
    let prevMonth = month - 1, prevYear = year;
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }
    let nextMonth = month + 1, nextYear = year;
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }
    return [
      { year: prevYear, month: prevMonth },
      { year, month },
      { year: nextYear, month: nextMonth }
    ];
  }

  function formatYM(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  // Init
  function init() {
    if (currentName) {
      showUserInfo();
    } else {
      showModal();
    }
    renderCalendar();
    fetchAllMonthData();
    fetchPeople();

    // Modal events
    nameBtn.addEventListener('click', setName);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') setName();
    });
    modalCloseBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
    changeNameBtn.addEventListener('click', showModal);

    // Month navigation
    prevBtn.addEventListener('click', () => navigateMonth(-1));
    nextBtn.addEventListener('click', () => navigateMonth(1));

    // Drag selection - mouse
    calendarContainer.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Drag selection - touch
    calendarContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    // Prevent text selection during drag
    calendarContainer.addEventListener('selectstart', (e) => {
      if (isDragging) e.preventDefault();
    });

    // Auto-refresh every 30s
    refreshTimer = setInterval(() => {
      fetchAllMonthData();
      fetchPeople();
    }, 30000);
  }

  // Modal management
  function showModal() {
    modalBackdrop.classList.remove('hidden');
    nameInput.value = currentName;
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeModal() {
    modalBackdrop.classList.add('hidden');
  }

  function showUserInfo() {
    currentNameEl.textContent = currentName;
    userInfo.classList.remove('hidden');
  }

  function setName() {
    const name = nameInput.value.trim();
    if (!name) return;
    currentName = name;
    localStorage.setItem('datepicker_name', currentName);
    showUserInfo();
    closeModal();
    renderCalendar();
  }

  // Month navigation
  function navigateMonth(delta) {
    viewMonth += delta;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    } else if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    selectedDay = null;
    dayDetail.classList.add('hidden');
    renderCalendar();
    fetchAllMonthData();
  }

  // API calls
  async function fetchAllMonthData() {
    const months = getAdjacentMonths(viewYear, viewMonth);
    try {
      const results = await Promise.all(
        months.map(m =>
          fetch(`/api/dates?month=${formatYM(m.year, m.month)}`)
            .then(r => r.json())
        )
      );
      allMonthData = {};
      for (const result of results) {
        Object.assign(allMonthData, result.dates || {});
      }
      renderCalendar();
      renderBestDates();
      if (selectedDay) renderDayDetail(selectedDay);
    } catch (err) {
      console.error('Failed to fetch dates:', err);
    }
  }

  async function fetchPeople() {
    try {
      const res = await fetch('/api/people');
      const data = await res.json();
      renderParticipants(data.people || []);
    } catch (err) {
      console.error('Failed to fetch people:', err);
    }
  }

  async function toggleDate(dateStr) {
    if (!currentName) {
      showModal();
      return;
    }

    const people = allMonthData[dateStr] || [];
    const normalizedName = currentName.trim().toLowerCase();
    const isFree = people.some(n => n.trim().toLowerCase() === normalizedName);

    try {
      if (isFree) {
        await fetch('/api/dates', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: currentName, date: dateStr }),
        });
      } else {
        await fetch('/api/dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: currentName, date: dateStr }),
        });
      }
      await fetchAllMonthData();
      await fetchPeople();
    } catch (err) {
      console.error('Failed to toggle date:', err);
    }
  }

  // Drag selection
  function getDayCellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('.day-cell:not(.empty)');
  }

  function onDragStart(e) {
    if (!currentName) {
      showModal();
      return;
    }
    const cell = e.target.closest('.day-cell:not(.empty)');
    if (!cell) return;

    e.preventDefault();
    isDragging = true;
    draggedDates.clear();
    calendarContainer.classList.add('dragging');

    const dateStr = cell.dataset.date;
    const people = allMonthData[dateStr] || [];
    const normalizedName = currentName.trim().toLowerCase();
    const isOwn = people.some(n => n.trim().toLowerCase() === normalizedName);
    dragMode = isOwn ? 'remove' : 'add';

    draggedDates.add(dateStr);
    cell.classList.add('drag-preview');
    if (dragMode === 'remove') cell.classList.add('drag-remove');
  }

  function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const cell = e.target.closest('.day-cell:not(.empty)');
    if (!cell) return;

    const dateStr = cell.dataset.date;
    if (draggedDates.has(dateStr)) return;

    draggedDates.add(dateStr);
    cell.classList.add('drag-preview');
    if (dragMode === 'remove') cell.classList.add('drag-remove');
  }

  async function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    calendarContainer.classList.remove('dragging');

    document.querySelectorAll('.drag-preview').forEach(c => {
      c.classList.remove('drag-preview', 'drag-remove');
    });

    if (draggedDates.size === 0) return;

    // Single click - use toggle
    if (draggedDates.size === 1) {
      const dateStr = draggedDates.values().next().value;
      draggedDates.clear();
      await toggleDate(dateStr);
      return;
    }

    // Batch API calls
    const requests = [];
    for (const dateStr of draggedDates) {
      const method = dragMode === 'add' ? 'POST' : 'DELETE';
      requests.push(
        fetch('/api/dates', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: currentName, date: dateStr }),
        })
      );
    }

    try {
      await Promise.all(requests);
      await fetchAllMonthData();
      await fetchPeople();
    } catch (err) {
      console.error('Failed to batch toggle dates:', err);
    }

    draggedDates.clear();
  }

  // Touch handlers
  function onTouchStart(e) {
    if (!currentName) {
      showModal();
      return;
    }
    const touch = e.touches[0];
    const cell = getDayCellFromPoint(touch.clientX, touch.clientY);
    if (!cell) return;

    e.preventDefault();
    isDragging = true;
    draggedDates.clear();
    calendarContainer.classList.add('dragging');

    const dateStr = cell.dataset.date;
    const people = allMonthData[dateStr] || [];
    const normalizedName = currentName.trim().toLowerCase();
    const isOwn = people.some(n => n.trim().toLowerCase() === normalizedName);
    dragMode = isOwn ? 'remove' : 'add';

    draggedDates.add(dateStr);
    cell.classList.add('drag-preview');
    if (dragMode === 'remove') cell.classList.add('drag-remove');
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const touch = e.touches[0];
    const cell = getDayCellFromPoint(touch.clientX, touch.clientY);
    if (!cell) return;

    const dateStr = cell.dataset.date;
    if (draggedDates.has(dateStr)) return;

    draggedDates.add(dateStr);
    cell.classList.add('drag-preview');
    if (dragMode === 'remove') cell.classList.add('drag-remove');
  }

  function onTouchEnd() {
    onDragEnd();
  }

  // Rendering
  function renderCalendar() {
    calendarContainer.innerHTML = '';
    const months = getAdjacentMonths(viewYear, viewMonth);
    monthTitle.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    months.forEach((m, index) => {
      const panel = document.createElement('div');
      panel.className = 'month-panel ' + (index === 1 ? 'center' : 'side');

      const title = document.createElement('div');
      title.className = 'month-panel-title';
      title.textContent = index === 1
        ? `${MONTH_NAMES[m.month]} ${m.year}`
        : `${SHORT_MONTH_NAMES[m.month]} ${m.year}`;
      panel.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'month-grid';

      // Day labels
      for (const label of DAY_LABELS) {
        const el = document.createElement('div');
        el.className = 'day-label';
        el.textContent = label;
        grid.appendChild(el);
      }

      // Calculate days
      const firstDay = new Date(m.year, m.month, 1).getDay();
      const startOffset = firstDay === 0 ? 6 : firstDay - 1;
      const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();

      // Empty cells
      for (let i = 0; i < startOffset; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell empty';
        grid.appendChild(cell);
      }

      // Day cells
      const normalizedName = currentName ? currentName.trim().toLowerCase() : '';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const people = allMonthData[dateStr] || [];
        const count = people.length;
        const heat = Math.min(count, 4);
        const isOwn = normalizedName && people.some(n => n.trim().toLowerCase() === normalizedName);

        const cell = document.createElement('div');
        cell.className = 'day-cell';
        if (isOwn) cell.classList.add('own');
        if (dateStr === selectedDay) cell.classList.add('selected-detail');
        cell.dataset.heat = heat;
        cell.dataset.date = dateStr;

        const numEl = document.createElement('span');
        numEl.className = 'day-num';
        numEl.textContent = day;
        cell.appendChild(numEl);

        if (count > 0) {
          const countEl = document.createElement('span');
          countEl.className = 'day-count';
          countEl.textContent = count;
          cell.appendChild(countEl);
        }

        // Detail on hover (click handled by drag system)
        cell.addEventListener('mouseenter', () => {
          selectedDay = dateStr;
          renderDayDetail(dateStr);
          document.querySelectorAll('.day-cell.selected-detail').forEach(c => c.classList.remove('selected-detail'));
          cell.classList.add('selected-detail');
        });

        grid.appendChild(cell);
      }

      panel.appendChild(grid);
      calendarContainer.appendChild(panel);
    });
  }

  function renderDayDetail(dateStr) {
    const people = allMonthData[dateStr] || [];
    const d = new Date(dateStr + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    detailDate.textContent = `${dayNames[d.getDay()]}, ${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

    if (people.length === 0) {
      detailPeople.textContent = 'No one is free yet';
    } else {
      detailPeople.textContent = `Free: ${people.join(', ')} (${people.length})`;
    }

    dayDetail.classList.remove('hidden');
  }

  function renderBestDates() {
    const entries = Object.entries(allMonthData)
      .filter(([, people]) => people.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    const maxCount = entries.length > 0 ? entries[0][1].length : 0;

    if (entries.length === 0) {
      bestDatesList.innerHTML = '<li class="no-data">No overlapping dates yet</li>';
      return;
    }

    bestDatesList.innerHTML = '';
    for (const [dateStr, people] of entries) {
      const d = new Date(dateStr + 'T00:00:00');
      const label = `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="best-date-header">
          <span>${label}</span>
          <span>${people.length} ${people.length === 1 ? 'person' : 'people'}</span>
        </div>
        <div class="best-date-bar" style="width: ${(people.length / maxCount) * 100}%"></div>
        <div class="best-date-names">${people.join(', ')}</div>
      `;
      bestDatesList.appendChild(li);
    }
  }

  function renderParticipants(people) {
    if (people.length === 0) {
      participantsList.innerHTML = '<li class="no-data">No participants yet</li>';
      return;
    }
    participantsList.innerHTML = '';
    for (const name of people) {
      const li = document.createElement('li');
      li.textContent = name;
      participantsList.appendChild(li);
    }
  }

  // Start
  init();
})();
