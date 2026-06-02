// Global state
let tasks = {};
let eventSource = null;

// DOM Elements
const connStatus = document.getElementById('conn-status');
const clearBtn = document.getElementById('clear-btn');
const statActive = document.getElementById('stat-active');
const statCompleted = document.getElementById('stat-completed');
const statSpeed = document.getElementById('stat-speed');
const taskContainer = document.getElementById('task-container');
const emptyState = document.getElementById('empty-state');

// Formatter utilities
function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return '0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

// Setup EventSource for SSE
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  // Use the origin's /events endpoint
  eventSource = new EventSource('/events');

  eventSource.onopen = () => {
    connStatus.className = 'connection-badge status-connected';
    connStatus.querySelector('.status-text').textContent = 'Connected';
  };

  eventSource.onerror = (e) => {
    connStatus.className = 'connection-badge status-disconnected';
    connStatus.querySelector('.status-text').textContent = 'Offline (Reconnecting)';
    console.error('SSE connection lost. Reconnecting in 5s...', e);
    setTimeout(connectSSE, 5000);
  };

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const { type, data } = payload;
      
      if (type === 'init') {
        tasks = data;
      } else if (type === 'update') {
        tasks[data.task.name] = data.task;
      }
      
      renderDashboard();
    } catch (err) {
      console.error('Failed to parse SSE payload:', err);
    }
  };
}

// Setup clear button
clearBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all tasks from the workspace?')) {
    try {
      await fetch('/api/clear');
    } catch (err) {
      console.error('Failed to clear tasks:', err);
    }
  }
});

// Calculate metrics and update UI
function renderDashboard() {
  const taskIds = Object.keys(tasks);
  
  // Update stats
  let activeCount = 0;
  let completedCount = 0;
  
  taskIds.forEach(id => {
    const status = tasks[id].status;
    if (status === 'running') activeCount++;
    if (status === 'completed') completedCount++;
  });
  
  statActive.textContent = activeCount;
  statCompleted.textContent = completedCount;
  
  // Calculate a mock "speed factor" based on completed tasks versus their estimates
  let totalSavedTime = 0;
  let completions = 0;
  taskIds.forEach(id => {
    const t = tasks[id];
    if (t.status === 'completed' && t.created_at && t.updated_at) {
      const actualDurationMin = (t.updated_at - t.created_at) / 60000;
      const saved = t.estimated_minutes - actualDurationMin;
      totalSavedTime += saved;
      completions++;
    }
  });
  
  if (completions > 0) {
    const speed = Math.max(0.5, 1 + (totalSavedTime / (completions * 10)));
    statSpeed.textContent = `${speed.toFixed(1)}x`;
  } else {
    statSpeed.textContent = '1.0x';
  }

  // Handle empty state
  if (taskIds.length === 0) {
    emptyState.style.display = 'flex';
    // Remove other elements
    document.querySelectorAll('.task-card').forEach(el => el.remove());
    return;
  } else {
    emptyState.style.display = 'none';
  }

  // Render/Update Task Cards
  taskIds.forEach(id => {
    const task = tasks[id];
    let card = document.getElementById(`task-card-${id}`);
    
    if (!card) {
      card = document.createElement('div');
      card.id = `task-card-${id}`;
      card.className = 'task-card glass';
      taskContainer.appendChild(card);
    }
    
    // Calculate overall average progress
    let overallProgress = 0;
    if (task.status === 'completed') {
      overallProgress = 100;
    } else if (task.subtasks.length > 0) {
      const totalPct = task.subtasks.reduce((sum, s) => sum + s.progress_percent, 0);
      overallProgress = Math.round(totalPct / task.subtasks.length);
    }

    // Build subtasks HTML
    let subtasksHtml = '';
    if (task.subtasks && task.subtasks.length > 0) {
      subtasksHtml = `
        <div class="subtasks-section">
          <div class="subtasks-title">Subtasks / Work Items (${task.subtasks.length})</div>
          <div class="subtasks-list">
            ${task.subtasks.map(s => {
              let statusClass = `indicator-${s.status}`;
              let fillClass = s.status === 'completed' ? 'subtask-fill-completed' : '';
              return `
                <div class="subtask-item">
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span class="subtask-status-indicator ${statusClass}"></span>
                    <div class="subtask-info">
                      <span class="subtask-name">${s.name}</span>
                      <span class="subtask-msg">${s.status_message || ''}</span>
                    </div>
                  </div>
                  <div class="subtask-progress-block">
                    <div class="subtask-track">
                      <div class="subtask-fill ${fillClass}" style="width: ${s.progress_percent}%"></div>
                    </div>
                    <span class="subtask-pct">${s.progress_percent}%</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const badgeClass = `badge-${task.status}`;
    const fillTypeClass = task.status === 'completed' ? 'progress-fill-completed' : 
                          task.status === 'failed' ? 'progress-fill-failed' : 'progress-fill-running';
    
    card.innerHTML = `
      <div class="task-card-header">
        <div class="task-title-group">
          <h3>${task.name}</h3>
          <p class="task-desc">${task.description || 'No description provided'}</p>
        </div>
        <div class="task-metadata">
          <span class="badge ${badgeClass}">${task.status}</span>
        </div>
      </div>

      <div class="task-progress-section">
        <div class="progress-header">
          <span class="progress-label">Total Task Progress</span>
          <span class="progress-pct ${task.status === 'completed' ? 'progress-pct-completed' : 'progress-pct-running'}">${overallProgress}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillTypeClass}" style="width: ${overallProgress}%"></div>
        </div>
      </div>

      <!-- Time estimation dashboard details -->
      <div class="estimation-block">
        <div class="estimate-item">
          <span class="est-label">Time Elapsed</span>
          <span class="est-value" id="elapsed-${id}">Calculating...</span>
        </div>
        <div class="estimate-item">
          <span class="est-label">Estimated ETA / Remaining</span>
          <span class="est-value ${task.status === 'running' ? 'est-value-active' : ''}" id="remaining-${id}">Calculating...</span>
        </div>
        <div class="estimate-item">
          <span class="est-label">Original Estimate</span>
          <span class="est-value est-value-amber">${task.estimated_minutes}m 0s</span>
        </div>
      </div>

      ${subtasksHtml}
    `;
  });

  // Remove any deleted card
  document.querySelectorAll('.task-card').forEach(card => {
    const id = card.id.replace('task-card-', '');
    if (!tasks[id]) {
      card.remove();
    }
  });

  updateTimes();
}

// High frequency time tick for smooth counts
function updateTimes() {
  const now = Date.now();
  Object.keys(tasks).forEach(id => {
    const task = tasks[id];
    const elapsedEl = document.getElementById(`elapsed-${id}`);
    const remainingEl = document.getElementById(`remaining-${id}`);
    
    if (!elapsedEl || !remainingEl) return;

    let elapsedSeconds = 0;
    if (task.status === 'completed' || task.status === 'failed') {
      elapsedSeconds = Math.round(((task.updated_at || now) - task.created_at) / 1000);
      elapsedEl.textContent = formatTime(elapsedSeconds);
      remainingEl.className = 'est-value';
      remainingEl.textContent = task.status === 'completed' ? 'Finished' : 'Failed';
      return;
    }

    // Active tracking
    elapsedSeconds = Math.round((now - task.created_at) / 1000);
    elapsedEl.textContent = formatTime(elapsedSeconds);

    // Calculate progress rate
    let overallProgress = 0;
    if (task.subtasks.length > 0) {
      const totalPct = task.subtasks.reduce((sum, s) => sum + s.progress_percent, 0);
      overallProgress = Math.round(totalPct / task.subtasks.length);
    }

    let remainingSeconds = 0;
    if (overallProgress > 0) {
      // Linear extrapolation: Total time = elapsed / (progress/100)
      const totalEstSec = (elapsedSeconds * 100) / overallProgress;
      remainingSeconds = Math.max(0, Math.round(totalEstSec - elapsedSeconds));
    } else {
      // Fallback to estimated minutes subtracting elapsed time
      remainingSeconds = Math.max(0, Math.round((task.estimated_minutes * 60) - elapsedSeconds));
    }

    if (remainingSeconds === 0 && overallProgress < 100) {
      remainingEl.textContent = 'Awaiting update...';
      remainingEl.className = 'est-value';
    } else {
      remainingEl.textContent = formatTime(remainingSeconds);
    }
  });
}

// Run high-frequency timers for time calculations
setInterval(updateTimes, 1000);

// Initialize connection
connectSSE();
