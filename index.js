const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PORT = 9886;
const DB_FILE = path.join(__dirname, 'tasks.json');

// Memory state
let tasks = {};

// Load tasks from disk
try {
  if (fs.existsSync(DB_FILE)) {
    tasks = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
} catch (e) {
  console.error("Error loading tasks database:", e);
}

// Save tasks to disk
function saveTasks() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (e) {
    console.error("Error saving tasks database:", e);
  }
}

// SSE Clients
let clients = [];

function broadcast(type, data) {
  const payload = JSON.stringify({ type, data });
  clients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

// Server logic
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // SSE Endpoint
  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // Send immediate initial state
    res.write(`data: ${JSON.stringify({ type: 'init', data: tasks })}\n\n`);
    clients.push(res);

    req.on('close', () => {
      clients = clients.filter(c => c !== res);
    });
    return;
  }

  // API to fetch tasks
  if (pathname === '/api/tasks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(tasks));
    return;
  }

  // API to clear tasks
  if (pathname === '/api/clear' && (req.method === 'POST' || req.method === 'GET')) {
    tasks = {};
    saveTasks();
    broadcast('init', tasks);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Static files server
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = path.extname(filePath);
  let contentType = 'text/html';
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Start HTTP Server
server.listen(PORT, () => {
  console.error(`Dashboard server running at http://localhost:${PORT}`);
});

// --- MCP STDIO INTERFACE ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    handleRequest(request);
  } catch (err) {
    sendError(null, -32700, "Parse error: " + err.message);
  }
});

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    result
  }) + "\n");
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  }) + "\n");
}

function handleRequest(req) {
  const { method, params, id } = req;

  if (method === 'initialize') {
    return sendResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: {},
      serverInfo: {
        name: "task-tracker-mcp",
        version: "1.0.0"
      }
    });
  }

  if (method === 'tools/list') {
    return sendResponse(id, {
      tools: [
        {
          name: "start_task",
          description: "Initialize and start a main task to track. Displays on the dashboard.",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The unique name/title of the task"
              },
              description: {
                type: "string",
                description: "Brief summary of the goal of this task"
              },
              estimated_minutes: {
                type: "number",
                description: "Estimated duration for the entire task in minutes"
              }
            },
            required: ["name"]
          }
        },
        {
          name: "add_subtask",
          description: "Add a specific subtask/job item under an active main task.",
          inputSchema: {
            type: "object",
            properties: {
              task_name: {
                type: "string",
                description: "The unique name of the parent task"
              },
              subtask_name: {
                type: "string",
                description: "Unique title for this specific subtask"
              },
              estimated_minutes: {
                type: "number",
                description: "Estimated duration in minutes for this subtask"
              }
            },
            required: ["task_name", "subtask_name"]
          }
        },
        {
          name: "update_progress",
          description: "Update progress of a subtask. Automatically updates overall task state.",
          inputSchema: {
            type: "object",
            properties: {
              task_name: {
                type: "string",
                description: "Name of the parent task"
              },
              subtask_name: {
                type: "string",
                description: "Name of the subtask"
              },
              progress_percent: {
                type: "number",
                description: "Progress from 0 to 100"
              },
              status: {
                type: "string",
                enum: ["pending", "running", "completed", "failed"],
                description: "Current state of the subtask"
              },
              status_message: {
                type: "string",
                description: "Status message/log details"
              }
            },
            required: ["task_name", "subtask_name", "progress_percent", "status"]
          }
        },
        {
          name: "complete_task",
          description: "Mark an entire task and all its subtasks as completed.",
          inputSchema: {
            type: "object",
            properties: {
              task_name: {
                type: "string",
                description: "Name of the task to mark as completed"
              }
            },
            required: ["task_name"]
          }
        },
        {
          name: "clear_tasks",
          description: "Clear all tasks and history from the server and dashboard.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    return handleToolCall(id, name, args);
  }

  // Handle other JSON-RPC requests
  return sendResponse(id, {});
}

function handleToolCall(id, name, args) {
  const now = Date.now();

  if (name === 'start_task') {
    const { name: taskName, description = '', estimated_minutes = 30 } = args;
    
    tasks[taskName] = {
      name: taskName,
      description,
      status: 'running',
      created_at: now,
      updated_at: now,
      estimated_minutes,
      subtasks: []
    };
    
    saveTasks();
    broadcast('update', { task: tasks[taskName] });
    return sendResponse(id, {
      content: [{ type: "text", text: `Started task "${taskName}". Track progress at http://localhost:${PORT}` }]
    });
  }

  if (name === 'add_subtask') {
    const { task_name, subtask_name, estimated_minutes = 10 } = args;
    
    if (!tasks[task_name]) {
      return sendError(id, -32602, `Parent task "${task_name}" not found. Start it first.`);
    }

    // Check if subtask already exists
    const existingIdx = tasks[task_name].subtasks.findIndex(s => s.name === subtask_name);
    const subtaskObj = {
      name: subtask_name,
      status: 'pending',
      progress_percent: 0,
      estimated_minutes,
      status_message: 'Initialized',
      created_at: now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      tasks[task_name].subtasks[existingIdx] = subtaskObj;
    } else {
      tasks[task_name].subtasks.push(subtaskObj);
    }
    
    tasks[task_name].updated_at = now;
    saveTasks();
    broadcast('update', { task: tasks[task_name] });
    return sendResponse(id, {
      content: [{ type: "text", text: `Added subtask "${subtask_name}" to task "${task_name}".` }]
    });
  }

  if (name === 'update_progress') {
    const { task_name, subtask_name, progress_percent, status, status_message = '' } = args;

    if (!tasks[task_name]) {
      return sendError(id, -32602, `Parent task "${task_name}" not found.`);
    }

    const subtask = tasks[task_name].subtasks.find(s => s.name === subtask_name);
    if (!subtask) {
      return sendError(id, -32602, `Subtask "${subtask_name}" not found under task "${task_name}".`);
    }

    subtask.progress_percent = progress_percent;
    subtask.status = status;
    subtask.status_message = status_message;
    subtask.updated_at = now;
    if (status === 'completed') {
      subtask.progress_percent = 100;
      subtask.completed_at = now;
    }

    // Automatically recalculate overall task progress and state
    tasks[task_name].updated_at = now;
    
    const allCompleted = tasks[task_name].subtasks.every(s => s.status === 'completed');
    const anyFailed = tasks[task_name].subtasks.some(s => s.status === 'failed');
    
    if (allCompleted && tasks[task_name].subtasks.length > 0) {
      tasks[task_name].status = 'completed';
    } else if (anyFailed) {
      tasks[task_name].status = 'failed';
    } else {
      tasks[task_name].status = 'running';
    }

    saveTasks();
    broadcast('update', { task: tasks[task_name] });
    return sendResponse(id, {
      content: [{ type: "text", text: `Updated subtask "${subtask_name}" to ${progress_percent}% (${status}).` }]
    });
  }

  if (name === 'complete_task') {
    const { task_name } = args;
    
    if (!tasks[task_name]) {
      return sendError(id, -32602, `Task "${task_name}" not found.`);
    }

    tasks[task_name].status = 'completed';
    tasks[task_name].updated_at = now;
    
    // Complete all subtasks too
    tasks[task_name].subtasks.forEach(subtask => {
      subtask.status = 'completed';
      subtask.progress_percent = 100;
      subtask.completed_at = now;
      subtask.updated_at = now;
    });

    saveTasks();
    broadcast('update', { task: tasks[task_name] });
    return sendResponse(id, {
      content: [{ type: "text", text: `Completed task "${task_name}" and all subtasks.` }]
    });
  }

  if (name === 'clear_tasks') {
    tasks = {};
    saveTasks();
    broadcast('init', tasks);
    return sendResponse(id, {
      content: [{ type: "text", text: "Cleared all tasks from history." }]
    });
  }

  return sendError(id, -32601, `Method not found: ${name}`);
}
