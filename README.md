# Antigravity Task Flow MCP Server

A beautiful, high-performance, and custom **Model Context Protocol (MCP) Server** that automatically launches a stunning real-time task visualization dashboard on [http://localhost:9886](http://localhost:9886). 

It is designed to give you (and the LLM agent) real-time insights into active jobs, subtask progress, and smart estimations of time remaining (ETA).

---

## 🎨 Premium Visual Aesthetics

The web application's dashboard is built with visual excellence using a modern glassmorphic look:
* **Glassmorphic UI**: Translucent cards utilizing high blur coefficients (`backdrop-filter: blur(20px)`) and subtle border reflections.
* **Ambient Backdrop Gradients**: Sleek, tailored neon color spectrums (Neon Purple `#8a2be2` to Vibrant Teal `#00f5d4`).
* **Fluid Micro-Animations**: Smooth keyframe transitions, pulsing connection badges, and responsive progress rings.

---

## 🛠️ MCP Tool Definitions

This server registers the following tools to manage task state:

* **`start_task`** — Launches tracking for a parent workflow task.
  * *Arguments*: `name` (string, required), `description` (string), `estimated_minutes` (number).
* **`add_subtask`** — Appends a specific job/work item under a parent task.
  * *Arguments*: `task_name` (string, required), `subtask_name` (string, required), `estimated_minutes` (number).
* **`update_progress`** — Real-time update for a subtask's progress and status messages.
  * *Arguments*: `task_name` (string, required), `subtask_name` (string, required), `progress_percent` (number, required), `status` (string, required: `pending`, `running`, `completed`, `failed`), `status_message` (string).
* **`complete_task`** — Completes the parent task and all associated subtasks.
  * *Arguments*: `task_name` (string, required).
* **`clear_tasks`** — Wipes the tracking data and resets the workspace dashboard.

---

## 🏗️ Architecture & SSE (Server-Sent Events)

* **Zero-Dependency Core**: The server uses 100% vanilla Node.js APIs (`http`, `fs`, `readline`, `path`) ensuring absolutely instant startup times, maximum stability, and no package manager installation failures.
* **Server-Sent Events (SSE)**: Synchronizes state in real-time between the backend and browser client via `new EventSource('/events')`.
* **Smart Estimation**: Computes dynamic remaining execution time utilizing progress velocity:
  $$\text{Remaining Seconds} = \text{Elapsed Seconds} \times \frac{100 - P}{P}$$
  (falling back to your initial estimate if $P = 0$).

---

## 🚀 Setup & Integration

### 1. For Antigravity IDE
Add the server entry to your custom IDE settings `mcp_config.json`:
```json
{
  "mcpServers": {
    "task-tracker": {
      "command": "node",
      "args": [
        "C:\\Users\\Mianjee\\.gemini\\antigravity-ide\\scratch\\task-tracker-mcp\\index.js"
      ]
    }
  }
}
```

### 2. For Claude Desktop / Claude Code
To use this custom server with the official Claude Desktop client or Claude Code CLI on Windows, append the configuration inside the global Claude config file located at:
`%APPDATA%\Claude\claude_desktop_config.json`
*(e.g., `C:\Users\Mianjee\AppData\Roaming\Claude\claude_desktop_config.json`)*:

```json
{
  "mcpServers": {
    "task-tracker": {
      "command": "node",
      "args": [
        "C:\\Users\\Mianjee\\.gemini\\antigravity-ide\\scratch\\task-tracker-mcp\\index.js"
      ]
    }
  }
}
```
*Note: Claude Code CLI automatically inherits custom MCP tool setups directly from your Claude Desktop settings config on startup!*

### 3. Manual Startup
You can boot up the dashboard server standalone by executing:
```bash
node index.js
```
Then open [http://localhost:9886](http://localhost:9886) in your browser.

---

## 📄 Apache-2.0 License

This project is licensed under the Apache License, Version 2.0. Copyright 2026 afnan-altaf.

Original rights, patent protections, and trademarks remain strictly with the author. You are free to redistribute, use, and modify under the conditions defined in the [LICENSE](LICENSE) file.
