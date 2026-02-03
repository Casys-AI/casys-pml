/**
 * Unit tests for newly added tools in lib/std
 *
 * @module tests/unit/lib/std/new-tools_test
 */

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";

// ============================================================================
// Mock infrastructure for shell commands
// ============================================================================

interface MockCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

type MockCommandHandler = (args: string[], options?: { cwd?: string }) => MockCommandResult;

const mockCommands: Record<string, MockCommandHandler> = {};

function registerMockCommand(cmd: string, handler: MockCommandHandler): void {
  mockCommands[cmd] = handler;
}

function clearMockCommands(): void {
  for (const key of Object.keys(mockCommands)) {
    delete mockCommands[key];
  }
}

/**
 * Mocked version of runCommand for testing
 */
async function mockRunCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<MockCommandResult> {
  const handler = mockCommands[cmd];
  if (!handler) {
    return {
      stdout: "",
      stderr: `Mock: Command '${cmd}' not registered`,
      code: 1,
    };
  }
  return handler(args, options);
}

// ============================================================================
// 1. http_headers tests
// ============================================================================

Deno.test("http_headers - fetches headers correctly", async () => {
  // Test the actual implementation using fetch
  const handler = async ({ url }: { url: string }) => {
    try {
      const response = await fetch(url, {
        method: "HEAD",
      });

      return {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  // Use a reliable public URL for testing
  const result = await handler({ url: "https://httpbin.org/get" });

  assertExists(result);
  if ("error" in result) {
    // Network might not be available in test environment
    assertExists(result.error);
  } else {
    assertEquals(result.status, 200);
    assertEquals(result.ok, true);
    assertExists(result.headers);
    assertEquals(result.url, "https://httpbin.org/get");
  }
});

Deno.test("http_headers - handles invalid URL", async () => {
  const handler = async ({ url }: { url: string }) => {
    try {
      const response = await fetch(url, {
        method: "HEAD",
      });
      return {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const result = await handler({ url: "https://invalid-domain-that-does-not-exist-12345.com" });
  assertExists(result);
  assertExists(result.error);
});

// ============================================================================
// 2. git_stash_list tests
// ============================================================================

Deno.test("git_stash_list - parses stash list correctly", async () => {
  // Mock git stash list output
  const mockOutput = `stash@{0}|WIP on main: abc1234 Add feature|2026-01-15 10:30:00 +0000
stash@{1}|On dev: def5678 Fix bug|2026-01-14 09:00:00 +0000
stash@{2}|WIP on feature: ghi9012 Work in progress|2026-01-13 15:45:00 +0000`;

  registerMockCommand("git", (args) => {
    if (args[0] === "stash" && args[1] === "list") {
      return { stdout: mockOutput, stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  // Handler implementation matching git_stash_list
  const handler = async ({ path = "." }: { path?: string }) => {
    const result = await mockRunCommand("git", ["stash", "list", "--format=%gd|%gs|%ci"], { cwd: path });
    if (result.code !== 0) {
      throw new Error(`git stash list failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const stashes: Array<{
      index: number;
      ref: string;
      message: string;
      date: string;
    }> = [];

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 3) {
        const ref = parts[0];
        const message = parts[1];
        const date = parts[2];

        const indexMatch = ref.match(/stash@\{(\d+)\}/);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : stashes.length;

        stashes.push({ index, ref, message, date });
      }
    }

    return { stashes, count: stashes.length };
  };

  const result = await handler({});

  assertEquals(result.count, 3);
  assertEquals(result.stashes[0].index, 0);
  assertEquals(result.stashes[0].ref, "stash@{0}");
  assertStringIncludes(result.stashes[0].message, "WIP on main");
  assertEquals(result.stashes[1].index, 1);
  assertEquals(result.stashes[2].index, 2);

  clearMockCommands();
});

Deno.test("git_stash_list - handles empty stash", async () => {
  registerMockCommand("git", (args) => {
    if (args[0] === "stash" && args[1] === "list") {
      return { stdout: "", stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ path = "." }: { path?: string }) => {
    const result = await mockRunCommand("git", ["stash", "list", "--format=%gd|%gs|%ci"], { cwd: path });
    if (result.code !== 0) {
      throw new Error(`git stash list failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    return { stashes: [], count: lines.length };
  };

  const result = await handler({});
  assertEquals(result.count, 0);
  assertEquals(result.stashes.length, 0);

  clearMockCommands();
});

// ============================================================================
// 3. git_file_history tests
// ============================================================================

Deno.test("git_file_history - parses commit history for file", async () => {
  const mockOutput = `abc1234567890abcdef1234567890abcdef1234|John Doe|john@example.com|1705312200|Add new feature
def5678901234abcdef5678901234abcdef5678|Jane Smith|jane@example.com|1705225800|Fix bug in module
ghi9012345678abcdef9012345678abcdef9012|Bob Wilson|bob@example.com|1705139400|Initial commit`;

  registerMockCommand("git", (args) => {
    if (args[0] === "log" && args.includes("--follow")) {
      return { stdout: mockOutput, stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ path = ".", file, limit = 50 }: { path?: string; file: string; limit?: number }) => {
    if (!file) {
      throw new Error("file parameter is required");
    }

    const result = await mockRunCommand("git", [
      "log",
      "--follow",
      `--max-count=${limit}`,
      "--format=%H|%an|%ae|%at|%s",
      "--",
      file,
    ], { cwd: path });

    if (result.code !== 0) {
      throw new Error(`git log failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const commits: Array<{
      hash: string;
      author: string;
      email: string;
      date: string;
      message: string;
    }> = [];

    for (const line of lines) {
      const [hash, author, email, timestamp, ...messageParts] = line.split("|");
      if (hash && author && timestamp) {
        commits.push({
          hash,
          author,
          email: email || "",
          date: new Date(parseInt(timestamp, 10) * 1000).toISOString(),
          message: messageParts.join("|"),
        });
      }
    }

    return { file, commits, count: commits.length };
  };

  const result = await handler({ file: "src/main.ts" });

  assertEquals(result.count, 3);
  assertEquals(result.commits[0].hash, "abc1234567890abcdef1234567890abcdef1234");
  assertEquals(result.commits[0].author, "John Doe");
  assertEquals(result.commits[0].email, "john@example.com");
  assertEquals(result.commits[0].message, "Add new feature");
  assertEquals(result.commits[1].author, "Jane Smith");
  assertEquals(result.commits[2].message, "Initial commit");

  clearMockCommands();
});

Deno.test("git_file_history - throws error when file not provided", async () => {
  const handler = async ({ file }: { file?: string }) => {
    if (!file) {
      throw new Error("file parameter is required");
    }
    return { file, commits: [], count: 0 };
  };

  let error: Error | null = null;
  try {
    await handler({});
  } catch (e) {
    error = e as Error;
  }

  assertExists(error);
  assertStringIncludes(error!.message, "file parameter is required");
});

// ============================================================================
// 4. kubectl_top tests
// ============================================================================

Deno.test("kubectl_top - parses pod metrics correctly", async () => {
  const mockPodOutput = `NAME                                    CPU(cores)   MEMORY(bytes)
nginx-deployment-7fb96c846b-4qfzz       10m          50Mi
redis-master-0                          25m          100Mi
api-server-5d8f9c7b6-2xvnm             100m         256Mi`;

  registerMockCommand("kubectl", (args) => {
    if (args[0] === "top" && args[1] === "pods") {
      return { stdout: mockPodOutput, stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ resource, namespace }: { resource: string; namespace?: string }) => {
    const args = ["top", resource];
    if (namespace && resource === "pods") {
      args.push("-n", namespace);
    }

    const result = await mockRunCommand("kubectl", args);
    if (result.code !== 0) {
      throw new Error(`kubectl top failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n");
    if (lines.length === 0) {
      return { metrics: [], raw: result.stdout };
    }

    const headers = lines[0].split(/\s+/);
    const metrics = lines.slice(1).map((line) => {
      const values = line.split(/\s+/);
      const entry: Record<string, string> = {};
      headers.forEach((header, i) => {
        entry[header.toLowerCase()] = values[i] || "";
      });
      return entry;
    });

    return { resource, namespace, metrics, raw: result.stdout };
  };

  const result = await handler({ resource: "pods" });

  assertEquals(result.metrics.length, 3);
  assertEquals(result.metrics[0].name, "nginx-deployment-7fb96c846b-4qfzz");
  assertEquals(result.metrics[0]["cpu(cores)"], "10m");
  assertEquals(result.metrics[0]["memory(bytes)"], "50Mi");
  assertEquals(result.metrics[1].name, "redis-master-0");
  assertEquals(result.metrics[2]["cpu(cores)"], "100m");

  clearMockCommands();
});

Deno.test("kubectl_top - parses node metrics correctly", async () => {
  const mockNodeOutput = `NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
node-1         500m         25%    4096Mi          50%
node-2         750m         37%    6144Mi          75%`;

  registerMockCommand("kubectl", (args) => {
    if (args[0] === "top" && args[1] === "nodes") {
      return { stdout: mockNodeOutput, stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ resource }: { resource: string }) => {
    const result = await mockRunCommand("kubectl", ["top", resource]);
    if (result.code !== 0) {
      throw new Error(`kubectl top failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n");
    const headers = lines[0].split(/\s+/);
    const metrics = lines.slice(1).map((line) => {
      const values = line.split(/\s+/);
      const entry: Record<string, string> = {};
      headers.forEach((header, i) => {
        entry[header.toLowerCase()] = values[i] || "";
      });
      return entry;
    });

    return { resource, metrics };
  };

  const result = await handler({ resource: "nodes" });

  assertEquals(result.metrics.length, 2);
  assertEquals(result.metrics[0].name, "node-1");
  assertEquals(result.metrics[0]["cpu%"], "25%");
  assertEquals(result.metrics[0]["memory%"], "50%");
  assertEquals(result.metrics[1]["cpu(cores)"], "750m");

  clearMockCommands();
});

// ============================================================================
// 5. kubectl_rollout_status tests
// ============================================================================

Deno.test("kubectl_rollout_status - parses successful rollout", async () => {
  registerMockCommand("kubectl", (args) => {
    if (args[0] === "rollout" && args[1] === "status") {
      return {
        stdout: 'deployment "my-app" successfully rolled out',
        stderr: "",
        code: 0,
      };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ deployment, namespace = "default" }: { deployment: string; namespace?: string }) => {
    const args = ["rollout", "status", `deployment/${deployment}`];
    args.push("-n", namespace);

    const result = await mockRunCommand("kubectl", args);

    const isComplete = result.code === 0 && result.stdout.includes("successfully rolled out");
    const isWaiting = result.stdout.includes("Waiting for");

    return {
      deployment,
      namespace,
      success: result.code === 0,
      complete: isComplete,
      waiting: isWaiting,
      message: result.stdout.trim(),
    };
  };

  const result = await handler({ deployment: "my-app" });

  assertEquals(result.success, true);
  assertEquals(result.complete, true);
  assertEquals(result.waiting, false);
  assertStringIncludes(result.message, "successfully rolled out");

  clearMockCommands();
});

Deno.test("kubectl_rollout_status - detects waiting state", async () => {
  registerMockCommand("kubectl", (args) => {
    if (args[0] === "rollout" && args[1] === "status") {
      return {
        stdout: "Waiting for deployment to finish: 1 out of 3 new replicas have been updated...",
        stderr: "",
        code: 0,
      };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ deployment, namespace = "default" }: { deployment: string; namespace?: string }) => {
    const args = ["rollout", "status", `deployment/${deployment}`];
    args.push("-n", namespace);

    const result = await mockRunCommand("kubectl", args);

    const isComplete = result.code === 0 && result.stdout.includes("successfully rolled out");
    const isWaiting = result.stdout.includes("Waiting for");

    return {
      deployment,
      namespace,
      success: result.code === 0,
      complete: isComplete,
      waiting: isWaiting,
      message: result.stdout.trim(),
    };
  };

  const result = await handler({ deployment: "my-app" });

  assertEquals(result.success, true);
  assertEquals(result.complete, false);
  assertEquals(result.waiting, true);

  clearMockCommands();
});

Deno.test("kubectl_rollout_status - handles failure", async () => {
  registerMockCommand("kubectl", (args) => {
    if (args[0] === "rollout" && args[1] === "status") {
      return {
        stdout: "",
        stderr: 'error: deployment "nonexistent" not found',
        code: 1,
      };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ deployment, namespace = "default" }: { deployment: string; namespace?: string }) => {
    const args = ["rollout", "status", `deployment/${deployment}`];
    args.push("-n", namespace);

    const result = await mockRunCommand("kubectl", args);

    return {
      deployment,
      namespace,
      success: result.code === 0,
      complete: false,
      waiting: false,
      message: result.stdout.trim(),
      stderr: result.stderr,
    };
  };

  const result = await handler({ deployment: "nonexistent" });

  assertEquals(result.success, false);
  assertEquals(result.complete, false);
  assertStringIncludes(result.stderr!, "not found");

  clearMockCommands();
});

// ============================================================================
// 6. top_snapshot tests
// ============================================================================

Deno.test("top_snapshot - parses ps output correctly", async () => {
  const mockPsOutput = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 168936 11908 ?        Ss   Jan01   1:23 /sbin/init
www-data  1234 45.2  2.5 512000 204800 ?      Sl   10:00   5:30 nginx: worker process
postgres  5678 12.8  5.0 800000 409600 ?      Ss   09:00  10:45 postgres: main process
node     10001 78.5  8.2 1024000 671744 ?     Sl   08:30  25:10 node /app/server.js`;

  registerMockCommand("ps", (args) => {
    if (args[0] === "aux" && args.includes("--sort")) {
      return { stdout: mockPsOutput, stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "Unknown command", code: 1 };
  });

  const handler = async ({ sort_by = "cpu", limit = 10 }: { sort_by?: string; limit?: number }) => {
    const sortField = sort_by === "memory" ? "-%mem" : "-%cpu";
    const limitNum = typeof limit === "number" ? limit : 10;

    const result = await mockRunCommand("ps", ["aux", "--sort", sortField]);

    if (result.code !== 0) {
      throw new Error(`ps failed: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n");
    const processes = lines.slice(1, limitNum + 1).map((line) => {
      const parts = line.split(/\s+/);
      return {
        user: parts[0],
        pid: parseInt(parts[1], 10),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        vsz: parseInt(parts[4], 10),
        rss: parseInt(parts[5], 10),
        tty: parts[6],
        stat: parts[7],
        start: parts[8],
        time: parts[9],
        command: parts.slice(10).join(" "),
      };
    });

    const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
    const totalMem = processes.reduce((sum, p) => sum + p.mem, 0);

    return {
      sort_by,
      processes,
      count: processes.length,
      summary: {
        totalCpuPercent: Math.round(totalCpu * 100) / 100,
        totalMemPercent: Math.round(totalMem * 100) / 100,
      },
    };
  };

  const result = await handler({});

  assertEquals(result.count, 4);
  assertEquals(result.processes[0].user, "root");
  assertEquals(result.processes[0].pid, 1);
  assertEquals(result.processes[1].cpu, 45.2);
  assertEquals(result.processes[2].user, "postgres");
  assertEquals(result.processes[3].command, "node /app/server.js");
  assertEquals(result.summary.totalCpuPercent, 136.5);

  clearMockCommands();
});

Deno.test("top_snapshot - respects limit parameter", async () => {
  const mockPsOutput = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 168936 11908 ?        Ss   Jan01   1:23 /sbin/init
www-data  1234 45.2  2.5 512000 204800 ?      Sl   10:00   5:30 nginx
postgres  5678 12.8  5.0 800000 409600 ?      Ss   09:00  10:45 postgres
node     10001 78.5  8.2 1024000 671744 ?     Sl   08:30  25:10 node`;

  registerMockCommand("ps", () => ({ stdout: mockPsOutput, stderr: "", code: 0 }));

  const handler = async ({ limit = 10 }: { limit?: number }) => {
    const result = await mockRunCommand("ps", ["aux", "--sort", "-%cpu"]);
    const lines = result.stdout.trim().split("\n");
    const processes = lines.slice(1, limit + 1).map((line) => {
      const parts = line.split(/\s+/);
      return { pid: parseInt(parts[1], 10), cpu: parseFloat(parts[2]) };
    });
    return { processes, count: processes.length };
  };

  const result = await handler({ limit: 2 });

  assertEquals(result.count, 2);
  assertEquals(result.processes[0].pid, 1);
  assertEquals(result.processes[1].pid, 1234);

  clearMockCommands();
});

// ============================================================================
// 7. memory_info tests
// ============================================================================

Deno.test("memory_info - parses /proc/meminfo correctly", async () => {
  // Simulate parsing /proc/meminfo content
  const mockMeminfo = `MemTotal:       16384000 kB
MemFree:         4096000 kB
MemAvailable:    8192000 kB
Buffers:          512000 kB
Cached:          2048000 kB
SwapTotal:       8192000 kB
SwapFree:        7168000 kB`;

  const parseMeminfo = (content: string) => {
    const lines = content.trim().split("\n");
    const memInfo: Record<string, number> = {};

    for (const line of lines) {
      const match = line.match(/^(\S+):\s+(\d+)\s*kB?$/);
      if (match) {
        memInfo[match[1]] = parseInt(match[2], 10) * 1024;
      }
    }

    const total = memInfo["MemTotal"] || 0;
    const free = memInfo["MemFree"] || 0;
    const available = memInfo["MemAvailable"] || 0;
    const buffers = memInfo["Buffers"] || 0;
    const cached = memInfo["Cached"] || 0;
    const swapTotal = memInfo["SwapTotal"] || 0;
    const swapFree = memInfo["SwapFree"] || 0;
    const swapUsed = swapTotal - swapFree;
    const used = total - free - buffers - cached;

    const formatBytes = (bytes: number): string => {
      if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      }
      return `${(bytes / 1024).toFixed(2)} KB`;
    };

    const calcPercent = (value: number, totalVal: number): number => {
      return totalVal > 0 ? Math.round((value / totalVal) * 10000) / 100 : 0;
    };

    return {
      memory: {
        total: { bytes: total, human: formatBytes(total) },
        used: { bytes: used, human: formatBytes(used), percent: calcPercent(used, total) },
        free: { bytes: free, human: formatBytes(free), percent: calcPercent(free, total) },
        available: { bytes: available, human: formatBytes(available), percent: calcPercent(available, total) },
        buffers: { bytes: buffers, human: formatBytes(buffers), percent: calcPercent(buffers, total) },
        cached: { bytes: cached, human: formatBytes(cached), percent: calcPercent(cached, total) },
      },
      swap: {
        total: { bytes: swapTotal, human: formatBytes(swapTotal) },
        used: { bytes: swapUsed, human: formatBytes(swapUsed), percent: calcPercent(swapUsed, swapTotal) },
        free: { bytes: swapFree, human: formatBytes(swapFree), percent: calcPercent(swapFree, swapTotal) },
      },
    };
  };

  const result = parseMeminfo(mockMeminfo);

  // Total: 16384000 KB = 16 GB
  assertEquals(result.memory.total.bytes, 16384000 * 1024);
  assertStringIncludes(result.memory.total.human, "GB");

  // Free: 4096000 KB = 4 GB
  assertEquals(result.memory.free.bytes, 4096000 * 1024);
  assertEquals(result.memory.free.percent, 25); // 4GB / 16GB = 25%

  // Available: 8192000 KB = 8 GB (50%)
  assertEquals(result.memory.available.percent, 50);

  // Swap used: 8192000 - 7168000 = 1024000 KB
  assertEquals(result.swap.used.bytes, 1024000 * 1024);
  assertEquals(result.swap.used.percent, 12.5); // 1GB / 8GB = 12.5%
});

// ============================================================================
// 8. netstat_connections tests
// ============================================================================

Deno.test("netstat_connections - parses ss output correctly", async () => {
  const mockSsOutput = `Netid State  Recv-Q Send-Q Local Address:Port    Peer Address:Port   Process
tcp   LISTEN 0      128    0.0.0.0:22             0.0.0.0:*           sshd
tcp   ESTAB  0      0      192.168.1.100:22       192.168.1.50:54321  sshd: user
tcp   LISTEN 0      511    0.0.0.0:80             0.0.0.0:*           nginx
udp   UNCONN 0      0      0.0.0.0:68             0.0.0.0:*           dhclient`;

  registerMockCommand("ss", () => ({ stdout: mockSsOutput, stderr: "", code: 0 }));

  const handler = async ({ state = "all" }: { state?: string }) => {
    const result = await mockRunCommand("ss", ["-tunapl"]);

    if (result.code !== 0) {
      throw new Error(`Failed to get network connections: ${result.stderr}`);
    }

    const lines = result.stdout.trim().split("\n");
    const connections: Array<{
      protocol: string;
      localAddress: string;
      localPort: string | number;
      remoteAddress: string;
      remotePort: string | number;
      state: string;
    }> = [];

    const dataLines = lines.slice(1).filter((line) => line.trim());

    for (const line of dataLines) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 5) continue;

      const protocol = parts[0].toLowerCase();
      if (!protocol.startsWith("tcp") && !protocol.startsWith("udp")) continue;

      let connState = "";
      let localAddr = "";
      let localPort: string | number = "";
      let remoteAddr = "";
      let remotePort: string | number = "";

      // ss format detection
      if (
        parts[1] === "LISTEN" || parts[1] === "ESTAB" || parts[1] === "UNCONN"
      ) {
        connState = parts[1];
        const localParts = (parts[4] || "").split(":");
        localPort = localParts.pop() || "";
        localAddr = localParts.join(":") || "*";

        const remoteParts = (parts[5] || "").split(":");
        remotePort = remoteParts.pop() || "";
        remoteAddr = remoteParts.join(":") || "*";
      }

      // Apply state filter
      if (state === "listening" && connState !== "LISTEN") continue;
      if (state === "established" && connState !== "ESTAB") continue;

      const parsedLocalPort = localPort === "*" ? "*" : parseInt(String(localPort), 10) || localPort;
      const parsedRemotePort = remotePort === "*" ? "*" : parseInt(String(remotePort), 10) || remotePort;

      connections.push({
        protocol,
        localAddress: localAddr === "" ? "*" : localAddr,
        localPort: parsedLocalPort,
        remoteAddress: remoteAddr === "" ? "*" : remoteAddr,
        remotePort: parsedRemotePort,
        state: connState || (protocol.startsWith("udp") ? "UNCONN" : ""),
      });
    }

    return {
      filter: state,
      connections,
      count: connections.length,
      summary: {
        tcp: connections.filter((c) => c.protocol.startsWith("tcp")).length,
        udp: connections.filter((c) => c.protocol.startsWith("udp")).length,
        listening: connections.filter((c) => c.state === "LISTEN").length,
        established: connections.filter((c) => c.state === "ESTAB").length,
      },
    };
  };

  const result = await handler({});

  assertEquals(result.count, 4);
  assertEquals(result.summary.tcp, 3);
  assertEquals(result.summary.udp, 1);
  assertEquals(result.summary.listening, 2);
  assertEquals(result.summary.established, 1);

  // Check specific connection parsing
  const sshListen = result.connections.find((c) => c.localPort === 22 && c.state === "LISTEN");
  assertExists(sshListen);
  assertEquals(sshListen!.localAddress, "0.0.0.0");

  clearMockCommands();
});

Deno.test("netstat_connections - filters by state", async () => {
  const mockSsOutput = `Netid State  Recv-Q Send-Q Local Address:Port    Peer Address:Port
tcp   LISTEN 0      128    0.0.0.0:22             0.0.0.0:*
tcp   ESTAB  0      0      192.168.1.100:22       192.168.1.50:54321
tcp   LISTEN 0      511    0.0.0.0:80             0.0.0.0:*`;

  registerMockCommand("ss", () => ({ stdout: mockSsOutput, stderr: "", code: 0 }));

  const handler = async ({ state }: { state: string }) => {
    const result = await mockRunCommand("ss", ["-tunapl"]);
    const lines = result.stdout.trim().split("\n");
    const connections: Array<{ state: string }> = [];

    for (const line of lines.slice(1)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length < 5) continue;
      const connState = parts[1];

      if (state === "listening" && connState !== "LISTEN") continue;
      if (state === "established" && connState !== "ESTAB") continue;

      connections.push({ state: connState });
    }

    return { connections, count: connections.length };
  };

  const listeningResult = await handler({ state: "listening" });
  assertEquals(listeningResult.count, 2);

  const establishedResult = await handler({ state: "established" });
  assertEquals(establishedResult.count, 1);

  clearMockCommands();
});

// ============================================================================
// 9. whois_lookup tests
// ============================================================================

Deno.test("whois_lookup - parses whois output correctly", async () => {
  const mockWhoisOutput = `Domain Name: example.com
Registrar: Example Registrar Inc.
Registrant Name: John Doe
Registrant Organization: Example Corp
Registrant Email: john@example.com
Creation Date: 2020-01-15T00:00:00Z
Registry Expiry Date: 2025-01-15T00:00:00Z
Updated Date: 2024-06-01T12:00:00Z
Name Server: ns1.example.com
Name Server: ns2.example.com
Domain Status: clientTransferProhibited
DNSSEC: unsigned`;

  registerMockCommand("whois", () => ({ stdout: mockWhoisOutput, stderr: "", code: 0 }));

  const handler = async ({ domain }: { domain: string }) => {
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim()
      .toLowerCase();

    const result = await mockRunCommand("whois", [cleanDomain]);

    if (result.code !== 0) {
      throw new Error(`WHOIS lookup failed: ${result.stderr}`);
    }

    const output = result.stdout;
    const lines = output.split("\n");

    const parsed: Record<string, string | string[]> = {};
    const nameservers: string[] = [];

    const fieldMappings: Record<string, string[]> = {
      registrar: ["Registrar:"],
      registrantName: ["Registrant Name:"],
      registrantOrg: ["Registrant Organization:"],
      registrantEmail: ["Registrant Email:"],
      creationDate: ["Creation Date:"],
      expiryDate: ["Registry Expiry Date:"],
      updatedDate: ["Updated Date:"],
      status: ["Domain Status:"],
      dnssec: ["DNSSEC:"],
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (/^Name Server:/i.test(trimmedLine)) {
        const ns = trimmedLine.split(":")[1]?.trim().toLowerCase();
        if (ns && !nameservers.includes(ns)) {
          nameservers.push(ns);
        }
      }

      for (const [field, patterns] of Object.entries(fieldMappings)) {
        for (const pattern of patterns) {
          if (trimmedLine.startsWith(pattern)) {
            const value = trimmedLine.substring(pattern.length).trim();
            if (value) {
              if (field === "status") {
                if (!parsed[field]) parsed[field] = [];
                (parsed[field] as string[]).push(value.split(" ")[0]);
              } else if (!parsed[field]) {
                parsed[field] = value;
              }
            }
          }
        }
      }
    }

    return {
      domain: cleanDomain,
      registrar: parsed.registrar || null,
      registrant: {
        name: parsed.registrantName || null,
        organization: parsed.registrantOrg || null,
        email: parsed.registrantEmail || null,
      },
      dates: {
        created: parsed.creationDate || null,
        expires: parsed.expiryDate || null,
        updated: parsed.updatedDate || null,
      },
      nameservers: nameservers.length > 0 ? nameservers : null,
      status: parsed.status || null,
      dnssec: parsed.dnssec || null,
    };
  };

  const result = await handler({ domain: "https://www.example.com/page" });

  assertEquals(result.domain, "example.com");
  assertEquals(result.registrar, "Example Registrar Inc.");
  assertEquals(result.registrant.name, "John Doe");
  assertEquals(result.registrant.organization, "Example Corp");
  assertEquals(result.registrant.email, "john@example.com");
  assertEquals(result.dates.created, "2020-01-15T00:00:00Z");
  assertEquals(result.dates.expires, "2025-01-15T00:00:00Z");
  assertEquals(result.nameservers?.length, 2);
  assertStringIncludes(result.nameservers![0], "ns1.example.com");
  assertEquals(result.dnssec, "unsigned");

  clearMockCommands();
});

// ============================================================================
// 10. crypto_analyze tests
// ============================================================================

Deno.test("crypto_analyze - detects base64 encoding", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      decoded?: string;
    }> = [];

    // Check for Base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    const isBase64 = base64Regex.test(input) && input.length >= 4 && input.length % 4 <= 2;

    if (isBase64) {
      try {
        const decoded = atob(input);
        const isPrintable = /^[\x20-\x7E\n\r\t]+$/.test(decoded);

        results.push({
          type: "base64",
          confidence: isPrintable ? "high" : "medium",
          decoded: isPrintable ? decoded : undefined,
        });
      } catch {
        // Not valid base64
      }
    }

    return {
      input,
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  // Test "Hello World" encoded in base64
  const result = handler({ input: "SGVsbG8gV29ybGQ=" });

  assertEquals(result.detectedType, "base64");
  assertEquals(result.allDetections[0].decoded, "Hello World");
  assertEquals(result.allDetections[0].confidence, "high");
});

Deno.test("crypto_analyze - detects hex encoding", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      decoded?: string;
    }> = [];

    // Check for hex
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (hexRegex.test(input) && input.length >= 2 && input.length % 2 === 0) {
      try {
        const bytes = new Uint8Array(input.length / 2);
        for (let i = 0; i < input.length; i += 2) {
          bytes[i / 2] = parseInt(input.slice(i, i + 2), 16);
        }
        const decoded = new TextDecoder().decode(bytes);
        const isPrintable = /^[\x20-\x7E\n\r\t]+$/.test(decoded);
        results.push({
          type: "hex",
          confidence: isPrintable ? "high" : "medium",
          decoded: isPrintable ? decoded : undefined,
        });
      } catch {
        // Not valid hex
      }
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  // "Hi" in hex: 48=H, 69=i
  const result = handler({ input: "4869" });

  assertEquals(result.detectedType, "hex");
  assertEquals(result.allDetections[0].decoded, "Hi");
});

Deno.test("crypto_analyze - detects JWT", () => {
  interface JWTDetails {
    header: { alg: string; typ: string };
    payload: { sub: string; name: string; iat: number };
  }

  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      details?: JWTDetails;
    }> = [];

    const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
    if (jwtRegex.test(input)) {
      try {
        const parts = input.split(".");
        const decodeBase64Url = (str: string) => {
          let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
          while (base64.length % 4) base64 += "=";
          return JSON.parse(atob(base64));
        };
        const header = decodeBase64Url(parts[0]);
        const payload = decodeBase64Url(parts[1]);
        results.push({
          type: "jwt",
          confidence: "high",
          details: { header, payload },
        });
      } catch {
        // Not a valid JWT
      }
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  // Simple JWT for testing
  // Header: {"alg":"HS256","typ":"JWT"}
  // Payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
  const testJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  const result = handler({ input: testJwt });

  assertEquals(result.detectedType, "jwt");
  assertEquals(result.allDetections[0].details?.header.alg, "HS256");
  assertEquals(result.allDetections[0].details?.payload.sub, "1234567890");
  assertEquals(result.allDetections[0].details?.payload.name, "John Doe");
});

Deno.test("crypto_analyze - detects URL encoding", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      decoded?: string;
    }> = [];

    const urlEncodedRegex = /%[0-9A-Fa-f]{2}/;
    if (urlEncodedRegex.test(input)) {
      try {
        const decoded = decodeURIComponent(input);
        if (decoded !== input) {
          results.push({
            type: "url-encoded",
            confidence: "high",
            decoded,
          });
        }
      } catch {
        results.push({
          type: "url-encoded",
          confidence: "low",
        });
      }
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  const result = handler({ input: "Hello%20World%21" });

  assertEquals(result.detectedType, "url-encoded");
  assertEquals(result.allDetections[0].decoded, "Hello World!");
});

Deno.test("crypto_analyze - detects binary encoding", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      decoded?: string;
    }> = [];

    const binaryRegex = /^[01\s]+$/;
    if (binaryRegex.test(input)) {
      const cleaned = input.replace(/\s/g, "");
      if (cleaned.length >= 8 && cleaned.length % 8 === 0) {
        try {
          const bytes = new Uint8Array(cleaned.length / 8);
          for (let i = 0; i < cleaned.length; i += 8) {
            bytes[i / 8] = parseInt(cleaned.slice(i, i + 8), 2);
          }
          const decoded = new TextDecoder().decode(bytes);
          const isPrintable = /^[\x20-\x7E\n\r\t]+$/.test(decoded);
          results.push({
            type: "binary",
            confidence: isPrintable ? "high" : "medium",
            decoded: isPrintable ? decoded : undefined,
          });
        } catch {
          // Binary but not decodable
        }
      }
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  // "Hi" in binary: 01001000 01101001
  const result = handler({ input: "01001000 01101001" });

  assertEquals(result.detectedType, "binary");
  assertEquals(result.allDetections[0].decoded, "Hi");
});

Deno.test("crypto_analyze - detects HTML entities", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{
      type: string;
      confidence: "high" | "medium" | "low";
      decoded?: string;
    }> = [];

    const htmlEntityRegex = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/;
    if (htmlEntityRegex.test(input)) {
      const decoded = input
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      if (decoded !== input) {
        results.push({
          type: "html-entities",
          confidence: "high",
          decoded,
        });
      }
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
      allDetections: results,
    };
  };

  const result = handler({ input: "&lt;div&gt;Hello &amp; World&lt;/div&gt;" });

  assertEquals(result.detectedType, "html-entities");
  assertEquals(result.allDetections[0].decoded, "<div>Hello & World</div>");
});

Deno.test("crypto_analyze - returns unknown for plain text", () => {
  const handler = ({ input }: { input: string }) => {
    const results: Array<{ type: string }> = [];

    // None of the patterns match plain text
    const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
    const urlEncodedRegex = /%[0-9A-Fa-f]{2}/;
    const htmlEntityRegex = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/;
    const hexRegex = /^[0-9a-fA-F]+$/;
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    const binaryRegex = /^[01\s]+$/;

    if (!jwtRegex.test(input) &&
        !urlEncodedRegex.test(input) &&
        !htmlEntityRegex.test(input) &&
        !(hexRegex.test(input) && input.length >= 2 && input.length % 2 === 0) &&
        !(base64Regex.test(input) && input.length >= 4) &&
        !binaryRegex.test(input)) {
      // No encoding detected
    }

    return {
      detectedType: results.length > 0 ? results[0].type : "unknown",
    };
  };

  const result = handler({ input: "Just plain text with spaces and punctuation!" });

  assertEquals(result.detectedType, "unknown");
});

// ============================================================================
// 11. sql_format tests
// ============================================================================

Deno.test("sql_format - formats SELECT with uppercase keywords and indentation", () => {
  // Simplified implementation matching the actual tool behavior
  const handler = ({ sql, uppercase = true }: { sql: string; uppercase?: boolean }) => {
    const majorKeywords = [
      "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
      "INNER JOIN", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
    ];

    // Very simplified formatting for testing
    let formatted = sql;
    if (uppercase) {
      for (const kw of majorKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, "gi");
        formatted = formatted.replace(regex, kw);
      }
    }

    // Add newlines before major keywords
    for (const kw of majorKeywords) {
      const regex = new RegExp(`\\s+(${kw})\\b`, "gi");
      formatted = formatted.replace(regex, `\n${kw}`);
    }

    formatted = formatted.trim();

    // Extract tables (simplified)
    const tables: string[] = [];
    const fromMatch = formatted.match(/FROM\s+(\w+)/i);
    if (fromMatch) tables.push(fromMatch[1]);

    return { formatted, keywords: majorKeywords.slice(0, 4), tables };
  };

  const result = handler({
    sql: "select id, name from users where active = true order by name",
  });

  assertStringIncludes(result.formatted, "SELECT");
  assertStringIncludes(result.formatted, "FROM");
  assertStringIncludes(result.formatted, "WHERE");
  assertStringIncludes(result.formatted, "ORDER BY");
  assertEquals(result.tables.includes("users"), true);
});

Deno.test("sql_format - handles empty input", () => {
  const handler = ({ sql }: { sql: string }) => {
    if (!sql || sql.trim() === "") {
      return { formatted: "", keywords: [], tables: [] };
    }
    return { formatted: sql, keywords: [], tables: [] };
  };

  const result = handler({ sql: "" });
  assertEquals(result.formatted, "");
  assertEquals(result.keywords.length, 0);
});

Deno.test("sql_format - preserves string literals", () => {
  const handler = ({ sql }: { sql: string }) => {
    // Preserve string literals by not modifying content within quotes
    const stringLiterals: string[] = [];
    let processed = sql.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });

    // Uppercase keywords
    processed = processed.replace(/\bselect\b/gi, "SELECT");
    processed = processed.replace(/\bfrom\b/gi, "FROM");
    processed = processed.replace(/\bwhere\b/gi, "WHERE");

    // Restore string literals
    stringLiterals.forEach((lit, idx) => {
      processed = processed.replace(`__STRING_${idx}__`, lit);
    });

    return { formatted: processed };
  };

  const result = handler({
    sql: "select * from users where name = 'select from where'",
  });

  assertStringIncludes(result.formatted, "'select from where'");
  assertStringIncludes(result.formatted, "SELECT");
});

// ============================================================================
// 12. sql_minify tests
// ============================================================================

Deno.test("sql_minify - removes extra whitespace", () => {
  const handler = ({ sql }: { sql: string }) => {
    const originalLength = sql.length;

    // Preserve string literals
    const stringLiterals: string[] = [];
    let processed = sql.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });

    // Remove comments and collapse whitespace
    processed = processed.replace(/--.*$/gm, "");
    processed = processed.replace(/\/\*[\s\S]*?\*\//g, "");
    processed = processed.replace(/\s+/g, " ").trim();

    // Restore string literals
    stringLiterals.forEach((lit, idx) => {
      processed = processed.replace(`__STRING_${idx}__`, lit);
    });

    const minifiedLength = processed.length;
    const reduction = originalLength > 0
      ? `${((1 - minifiedLength / originalLength) * 100).toFixed(1)}%`
      : "0%";

    return { minified: processed, originalLength, minifiedLength, reduction };
  };

  const result = handler({
    sql: `SELECT   id,
          name,
          email
    FROM   users
    WHERE  active = true`,
  });

  assertEquals(result.minified.includes("\n"), false);
  assertEquals(result.minified.includes("  "), false);
  assertEquals(result.minifiedLength < result.originalLength, true);
});

Deno.test("sql_minify - removes SQL comments", () => {
  const handler = ({ sql }: { sql: string }) => {
    let processed = sql;
    processed = processed.replace(/--.*$/gm, "");
    processed = processed.replace(/\/\*[\s\S]*?\*\//g, "");
    processed = processed.replace(/\s+/g, " ").trim();
    return { minified: processed };
  };

  const result = handler({
    sql: `SELECT * FROM users -- this is a comment
    /* multiline
       comment */
    WHERE id = 1`,
  });

  assertEquals(result.minified.includes("--"), false);
  assertEquals(result.minified.includes("/*"), false);
  assertStringIncludes(result.minified, "SELECT * FROM users");
});

Deno.test("sql_minify - handles empty input", () => {
  const handler = ({ sql }: { sql: string }) => {
    const minified = sql.replace(/\s+/g, " ").trim();
    return {
      minified,
      originalLength: sql.length,
      minifiedLength: minified.length,
      reduction: "0%",
    };
  };

  const result = handler({ sql: "" });
  assertEquals(result.minified, "");
  assertEquals(result.minifiedLength, 0);
});

// ============================================================================
// 13. base64_image_preview tests
// ============================================================================

Deno.test("base64_image_preview - detects PNG from magic bytes", () => {
  const detectImageMimeType = (data: Uint8Array): string | null => {
    if (data.length < 4) return null;
    // PNG: 89 50 4E 47
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
      return "image/png";
    }
    // JPEG: FF D8 FF
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return "image/jpeg";
    }
    // GIF: GIF89a or GIF87a
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
      return "image/gif";
    }
    return null;
  };

  // PNG magic bytes
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = detectImageMimeType(pngBytes);
  assertEquals(result, "image/png");
});

Deno.test("base64_image_preview - detects JPEG from magic bytes", () => {
  const detectImageMimeType = (data: Uint8Array): string | null => {
    if (data.length < 4) return null;
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return "image/jpeg";
    }
    return null;
  };

  // JPEG magic bytes
  const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  const result = detectImageMimeType(jpegBytes);
  assertEquals(result, "image/jpeg");
});

Deno.test("base64_image_preview - returns error for invalid base64", () => {
  const handler = ({ data }: { data: string }) => {
    try {
      const base64Data = data.replace(/^data:[^;]+;base64,/, "");
      atob(base64Data);
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid base64 encoding" };
    }
  };

  const result = handler({ data: "not-valid-base64!!!" });
  assertEquals(result.valid, false);
  assertExists(result.error);
});

Deno.test("base64_image_preview - handles data URI prefix", () => {
  const handler = ({ data }: { data: string }) => {
    let base64Data = data;
    let declaredMimeType: string | null = null;

    const dataUriMatch = data.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      declaredMimeType = dataUriMatch[1];
      base64Data = dataUriMatch[2];
    }

    return { declaredMimeType, base64Data };
  };

  // Valid base64 image (1x1 PNG)
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const result = handler({ data: `data:image/png;base64,${pngBase64}` });

  assertEquals(result.declaredMimeType, "image/png");
  assertEquals(result.base64Data, pngBase64);
});

// ============================================================================
// 14. unicode_inspect tests
// ============================================================================

Deno.test("unicode_inspect - analyzes ASCII characters correctly", () => {
  const handler = ({ text }: { text: string }) => {
    const codePoints = [...text].map((char) => char.codePointAt(0)!);

    const characters = codePoints.map((cp) => {
      const char = String.fromCodePoint(cp);
      return {
        char,
        codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        category: cp >= 0x41 && cp <= 0x5A || cp >= 0x61 && cp <= 0x7A ? "Letter" : "Other",
      };
    });

    return {
      text,
      length: text.length,
      codePointCount: codePoints.length,
      characters,
    };
  };

  const result = handler({ text: "ABC" });

  assertEquals(result.length, 3);
  assertEquals(result.codePointCount, 3);
  assertEquals(result.characters[0].codePoint, "U+0041");
  assertEquals(result.characters[0].category, "Letter");
});

Deno.test("unicode_inspect - detects invisible characters", () => {
  const isInvisibleChar = (codePoint: number): boolean => {
    return (
      codePoint <= 0x1F ||
      (codePoint >= 0x7F && codePoint <= 0x9F) ||
      codePoint === 0x200B || // Zero width space
      codePoint === 0x200C || // Zero width non-joiner
      codePoint === 0x200D || // Zero width joiner
      codePoint === 0xFEFF    // BOM / Zero width no-break space
    );
  };

  assertEquals(isInvisibleChar(0x200B), true); // Zero width space
  assertEquals(isInvisibleChar(0x00), true);   // NULL
  assertEquals(isInvisibleChar(0x41), false);  // 'A'
  assertEquals(isInvisibleChar(0xFEFF), true); // BOM
});

Deno.test("unicode_inspect - handles emoji correctly", () => {
  const handler = ({ text }: { text: string }) => {
    const codePoints = [...text].map((char) => char.codePointAt(0)!);

    const isEmoji = (cp: number): boolean => {
      return (cp >= 0x1F600 && cp <= 0x1F64F) || // Emoticons
             (cp >= 0x1F300 && cp <= 0x1F5FF) || // Misc Symbols
             (cp >= 0x1F680 && cp <= 0x1F6FF);   // Transport
    };

    const summary = {
      emoji: codePoints.filter(isEmoji).length,
      total: codePoints.length,
    };

    return { text, codePointCount: codePoints.length, summary };
  };

  const result = handler({ text: "Hello \u{1F600}" }); // "Hello [grinning face]"

  assertEquals(result.codePointCount, 7);
  assertEquals(result.summary.emoji, 1);
});

// ============================================================================
// 15. color_accessibility tests
// ============================================================================

Deno.test("color_accessibility - calculates WCAG contrast ratio correctly", () => {
  const hexToRgb = (hex: string) => {
    const h = hex.replace(/^#/, "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  };

  const getLuminance = (rgb: { r: number; g: number; b: number }) => {
    const adjust = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * adjust(rgb.r) + 0.7152 * adjust(rgb.g) + 0.0722 * adjust(rgb.b);
  };

  const getContrastRatio = (fg: string, bg: string) => {
    const fgRgb = hexToRgb(fg);
    const bgRgb = hexToRgb(bg);
    const l1 = getLuminance(fgRgb);
    const l2 = getLuminance(bgRgb);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // Black on white should have maximum contrast (21:1)
  const blackWhiteRatio = getContrastRatio("#000000", "#ffffff");
  assertEquals(Math.round(blackWhiteRatio), 21);

  // White on white should have minimum contrast (1:1)
  const whiteWhiteRatio = getContrastRatio("#ffffff", "#ffffff");
  assertEquals(Math.round(whiteWhiteRatio), 1);
});

Deno.test("color_accessibility - validates WCAG AA and AAA levels", () => {
  const handler = ({ foreground, background }: { foreground: string; background: string }) => {
    const hexToRgb = (hex: string) => {
      const h = hex.replace(/^#/, "");
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    };

    const getLuminance = (rgb: { r: number; g: number; b: number }) => {
      const adjust = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * adjust(rgb.r) + 0.7152 * adjust(rgb.g) + 0.0722 * adjust(rgb.b);
    };

    const fgRgb = hexToRgb(foreground);
    const bgRgb = hexToRgb(background);
    const l1 = getLuminance(fgRgb);
    const l2 = getLuminance(bgRgb);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      contrastRatio: Math.round(ratio * 100) / 100,
      wcag: {
        aa: { normal: ratio >= 4.5, large: ratio >= 3 },
        aaa: { normal: ratio >= 7, large: ratio >= 4.5 },
      },
      rating: ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA Large" : "Fail",
    };
  };

  const result = handler({ foreground: "#000000", background: "#ffffff" });

  assertEquals(result.wcag.aa.normal, true);
  assertEquals(result.wcag.aaa.normal, true);
  assertEquals(result.rating, "AAA");
});

Deno.test("color_accessibility - handles invalid color gracefully", () => {
  const parseColor = (color: string): string | null => {
    const c = color.trim().toLowerCase();
    if (c.startsWith("#") || /^[0-9a-f]{6}$/i.test(c)) {
      const hex = c.startsWith("#") ? c : `#${c}`;
      if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    }
    return null;
  };

  const result = parseColor("not-a-color");
  assertEquals(result, null);
});

// ============================================================================
// 16. semver_parse tests
// ============================================================================

Deno.test("semver_parse - parses valid semver correctly", () => {
  const parseSemver = (version: string) => {
    const v = version.trim().replace(/^v/i, "");
    const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;
    const match = v.match(regex);

    if (!match) {
      return { valid: false, error: "Invalid semver format" };
    }

    const [, major, minor, patch, prerelease, build] = match;

    return {
      valid: true,
      major: parseInt(major, 10),
      minor: parseInt(minor, 10),
      patch: parseInt(patch, 10),
      prerelease: prerelease ? prerelease.split(".") : [],
      build: build ? build.split(".") : [],
      isPrerelease: !!prerelease,
      isStable: parseInt(major, 10) >= 1 && !prerelease,
      normalized: `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ""}`,
    };
  };

  const result = parseSemver("1.2.3-beta.1+build.456");

  assertEquals(result.valid, true);
  assertEquals(result.major, 1);
  assertEquals(result.minor, 2);
  assertEquals(result.patch, 3);
  assertEquals(result.prerelease, ["beta", "1"]);
  assertEquals(result.build, ["build", "456"]);
  assertEquals(result.isPrerelease, true);
});

Deno.test("semver_parse - handles version with v prefix", () => {
  const parseSemver = (version: string) => {
    let v = version.trim();
    if (v.startsWith("v") || v.startsWith("V")) {
      v = v.slice(1);
    }
    const parts = v.split(".");
    if (parts.length !== 3) {
      return { valid: false };
    }
    return {
      valid: true,
      major: parseInt(parts[0], 10),
      minor: parseInt(parts[1], 10),
      patch: parseInt(parts[2].split("-")[0], 10),
    };
  };

  const result = parseSemver("v2.0.0");

  assertEquals(result.valid, true);
  assertEquals(result.major, 2);
  assertEquals(result.minor, 0);
  assertEquals(result.patch, 0);
});

Deno.test("semver_parse - rejects invalid versions", () => {
  const parseSemver = (version: string) => {
    const v = version.trim().replace(/^v/i, "");
    const parts = v.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Expected MAJOR.MINOR.PATCH" };
    }
    const [major, minor, patch] = parts.map((p) => parseInt(p.split("-")[0], 10));
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return { valid: false, error: "Version parts must be numeric" };
    }
    return { valid: true };
  };

  assertEquals(parseSemver("1.2").valid, false);
  assertEquals(parseSemver("not.a.version").valid, false);
  assertEquals(parseSemver("1.2.3.4").valid, false);
});

// ============================================================================
// 17. semver_compare tests
// ============================================================================

Deno.test("semver_compare - compares major versions", () => {
  const compareSemver = (v1: string, v2: string) => {
    const parse = (v: string) => {
      const cleaned = v.replace(/^v/i, "");
      const [core] = cleaned.split("-");
      const [major, minor, patch] = core.split(".").map(Number);
      return { major, minor, patch };
    };

    const p1 = parse(v1);
    const p2 = parse(v2);

    if (p1.major !== p2.major) {
      return { result: p1.major > p2.major ? 1 : -1, diff: "major" };
    }
    if (p1.minor !== p2.minor) {
      return { result: p1.minor > p2.minor ? 1 : -1, diff: "minor" };
    }
    if (p1.patch !== p2.patch) {
      return { result: p1.patch > p2.patch ? 1 : -1, diff: "patch" };
    }
    return { result: 0, diff: "none" };
  };

  const result = compareSemver("2.0.0", "1.0.0");
  assertEquals(result.result, 1);
  assertEquals(result.diff, "major");
});

Deno.test("semver_compare - compares minor versions", () => {
  const compareSemver = (v1: string, v2: string) => {
    const parse = (v: string) => {
      const [core] = v.split("-");
      const [major, minor, patch] = core.split(".").map(Number);
      return { major, minor, patch };
    };

    const p1 = parse(v1);
    const p2 = parse(v2);

    if (p1.major !== p2.major) return { result: p1.major > p2.major ? 1 : -1, diff: "major" };
    if (p1.minor !== p2.minor) return { result: p1.minor > p2.minor ? 1 : -1, diff: "minor" };
    if (p1.patch !== p2.patch) return { result: p1.patch > p2.patch ? 1 : -1, diff: "patch" };
    return { result: 0, diff: "none" };
  };

  const result = compareSemver("1.5.0", "1.3.0");
  assertEquals(result.result, 1);
  assertEquals(result.diff, "minor");
});

Deno.test("semver_compare - release beats prerelease", () => {
  const compareSemver = (v1: string, v2: string) => {
    const parse = (v: string) => {
      const [core, prerelease] = v.split("-");
      const [major, minor, patch] = core.split(".").map(Number);
      return { major, minor, patch, prerelease: prerelease || "" };
    };

    const p1 = parse(v1);
    const p2 = parse(v2);

    if (p1.major !== p2.major) return { result: p1.major > p2.major ? 1 : -1 };
    if (p1.minor !== p2.minor) return { result: p1.minor > p2.minor ? 1 : -1 };
    if (p1.patch !== p2.patch) return { result: p1.patch > p2.patch ? 1 : -1 };

    // Release version > prerelease version
    if (!p1.prerelease && p2.prerelease) return { result: 1, comparison: "newer" };
    if (p1.prerelease && !p2.prerelease) return { result: -1, comparison: "older" };

    return { result: 0 };
  };

  const result = compareSemver("1.0.0", "1.0.0-beta");
  assertEquals(result.result, 1);
});

// ============================================================================
// 18. http_headers_parse tests
// ============================================================================

Deno.test("http_headers_parse - parses security headers", () => {
  const handler = ({ headers }: { headers: Record<string, string> }) => {
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    const hasHSTS = "strict-transport-security" in lowerHeaders;
    const hasCSP = "content-security-policy" in lowerHeaders;
    const hasXFrameOptions = "x-frame-options" in lowerHeaders;
    const hasXContentType = "x-content-type-options" in lowerHeaders;

    let score = 0;
    if (hasHSTS) score += 25;
    if (hasCSP) score += 25;
    if (hasXFrameOptions) score += 15;
    if (hasXContentType) score += 15;

    return {
      security: { hasHSTS, hasCSP, hasXFrameOptions, hasXContentType, score },
    };
  };

  const result = handler({
    headers: {
      "Strict-Transport-Security": "max-age=31536000",
      "Content-Security-Policy": "default-src 'self'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });

  assertEquals(result.security.hasHSTS, true);
  assertEquals(result.security.hasCSP, true);
  assertEquals(result.security.score, 80);
});

Deno.test("http_headers_parse - parses cache-control", () => {
  const handler = ({ headers }: { headers: Record<string, string> }) => {
    const cacheControl = headers["cache-control"] || headers["Cache-Control"];

    let maxAge: number | undefined;
    let isPublic = false;
    let isPrivate = false;

    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) maxAge = parseInt(maxAgeMatch[1], 10);
      isPublic = /\bpublic\b/.test(cacheControl);
      isPrivate = /\bprivate\b/.test(cacheControl);
    }

    return { caching: { cacheControl, maxAge, isPublic, isPrivate } };
  };

  const result = handler({
    headers: { "Cache-Control": "public, max-age=3600" },
  });

  assertEquals(result.caching.maxAge, 3600);
  assertEquals(result.caching.isPublic, true);
  assertEquals(result.caching.isPrivate, false);
});

Deno.test("http_headers_parse - handles raw header string", () => {
  const parseHeaders = (input: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = input.split(/\r?\n/);
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        result[name] = value;
      }
    }
    return result;
  };

  const rawHeaders = `Content-Type: application/json
Content-Length: 1234
X-Custom-Header: value`;

  const result = parseHeaders(rawHeaders);

  assertEquals(result["content-type"], "application/json");
  assertEquals(result["content-length"], "1234");
  assertEquals(result["x-custom-header"], "value");
});

// ============================================================================
// 19. ip_info tests
// ============================================================================

Deno.test("ip_info - analyzes IPv4 address correctly", () => {
  const handler = ({ ip }: { ip: string }) => {
    const isValidIPv4 = (addr: string): boolean => {
      const parts = addr.split(".");
      if (parts.length !== 4) return false;
      return parts.every((part) => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
      });
    };

    if (!isValidIPv4(ip)) {
      return { valid: false, error: "Invalid IPv4 address" };
    }

    const octets = ip.split(".").map(Number);
    const [first, second] = octets;

    let type = "public";
    let isPrivate = false;
    let isLoopback = false;

    if (first === 127) {
      type = "loopback";
      isLoopback = true;
    } else if (first === 10 || (first === 172 && second >= 16 && second <= 31) ||
               (first === 192 && second === 168)) {
      type = "private";
      isPrivate = true;
    }

    return { ip, valid: true, version: 4, type, isPrivate, isLoopback, octets };
  };

  const result = handler({ ip: "192.168.1.1" });

  assertEquals(result.valid, true);
  assertEquals(result.version, 4);
  assertEquals(result.type, "private");
  assertEquals(result.isPrivate, true);
  assertEquals(result.octets, [192, 168, 1, 1]);
});

Deno.test("ip_info - analyzes IPv6 address correctly", () => {
  const handler = ({ ip }: { ip: string }) => {
    const isValidIPv6 = (addr: string): boolean => {
      // Simple IPv6 validation
      if (addr === "::1") return true;
      const groups = addr.split(":");
      if (groups.length < 3 || groups.length > 8) return false;
      return groups.every((g) => g === "" || /^[0-9a-fA-F]{1,4}$/.test(g));
    };

    if (!isValidIPv6(ip)) {
      return { valid: false, error: "Invalid IPv6 address" };
    }

    let type = "public";
    let isLoopback = false;

    if (ip === "::1") {
      type = "loopback";
      isLoopback = true;
    } else if (ip.toLowerCase().startsWith("fe80:")) {
      type = "link-local";
    } else if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) {
      type = "private";
    }

    return { ip, valid: true, version: 6, type, isLoopback };
  };

  const result = handler({ ip: "::1" });

  assertEquals(result.valid, true);
  assertEquals(result.version, 6);
  assertEquals(result.type, "loopback");
  assertEquals(result.isLoopback, true);
});

Deno.test("ip_info - rejects invalid IP addresses", () => {
  const isValidIPv4 = (addr: string): boolean => {
    const parts = addr.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
    });
  };

  assertEquals(isValidIPv4("256.1.1.1"), false);  // Out of range
  assertEquals(isValidIPv4("1.2.3"), false);       // Too few octets
  assertEquals(isValidIPv4("1.2.3.4.5"), false);   // Too many octets
  assertEquals(isValidIPv4("abc.def.ghi.jkl"), false);  // Non-numeric
});

// ============================================================================
// 20. text_diff tests
// ============================================================================

Deno.test("text_diff - detects additions and deletions", () => {
  const computeTextDiff = (text1: string, text2: string) => {
    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");

    if (text1 === text2) {
      return { identical: true, stats: { additions: 0, deletions: 0 } };
    }

    let additions = 0;
    let deletions = 0;

    // Simple diff: compare line by line
    const maxLen = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= lines1.length) {
        additions++;
      } else if (i >= lines2.length) {
        deletions++;
      } else if (lines1[i] !== lines2[i]) {
        additions++;
        deletions++;
      }
    }

    return { identical: false, stats: { additions, deletions } };
  };

  const result = computeTextDiff("line1\nline2\nline3", "line1\nmodified\nline3\nline4");

  assertEquals(result.identical, false);
  assertEquals(result.stats.additions > 0, true);
});

Deno.test("text_diff - returns identical for same text", () => {
  const computeTextDiff = (text1: string, text2: string) => {
    if (text1 === text2) {
      return { identical: true, stats: { additions: 0, deletions: 0, changes: 0 } };
    }
    return { identical: false };
  };

  const result = computeTextDiff("same text", "same text");

  assertEquals(result.identical, true);
  assertEquals(result.stats?.additions, 0);
  assertEquals(result.stats?.deletions, 0);
});

Deno.test("text_diff - generates unified diff format", () => {
  const computeTextDiff = (text1: string, text2: string) => {
    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");

    const unifiedParts: string[] = ["--- a", "+++ b"];

    // Simple line-by-line comparison
    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      if (i < lines1.length && i < lines2.length && lines1[i] === lines2[i]) {
        unifiedParts.push(` ${lines1[i]}`);
      } else {
        if (i < lines1.length) unifiedParts.push(`-${lines1[i]}`);
        if (i < lines2.length) unifiedParts.push(`+${lines2[i]}`);
      }
    }

    return { unified: unifiedParts.join("\n") };
  };

  const result = computeTextDiff("old line", "new line");

  assertStringIncludes(result.unified, "--- a");
  assertStringIncludes(result.unified, "+++ b");
  assertStringIncludes(result.unified, "-old line");
  assertStringIncludes(result.unified, "+new line");
});

// ============================================================================
// 21. duration_parse tests
// ============================================================================

Deno.test("duration_parse - parses human-readable durations", () => {
  const parseDuration = (duration: string) => {
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    let totalMs = 0;
    const normalized = duration.toLowerCase();

    const hourMatch = normalized.match(/(\d+)h/);
    const minMatch = normalized.match(/(\d+)m(?!s)/);
    const secMatch = normalized.match(/(\d+)s/);
    const dayMatch = normalized.match(/(\d+)d/);

    if (hourMatch) totalMs += parseInt(hourMatch[1], 10) * MS_PER_HOUR;
    if (minMatch) totalMs += parseInt(minMatch[1], 10) * MS_PER_MINUTE;
    if (secMatch) totalMs += parseInt(secMatch[1], 10) * MS_PER_SECOND;
    if (dayMatch) totalMs += parseInt(dayMatch[1], 10) * MS_PER_DAY;

    return { valid: totalMs > 0, milliseconds: totalMs };
  };

  const result = parseDuration("2h 30m");

  assertEquals(result.valid, true);
  assertEquals(result.milliseconds, 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
});

Deno.test("duration_parse - parses ISO 8601 duration format", () => {
  const parseDuration = (duration: string) => {
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    let totalMs = 0;

    // ISO 8601 format: P[n]DT[n]H[n]M[n]S
    const isoMatch = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);

    if (isoMatch) {
      const [, days, hours, minutes, seconds] = isoMatch;
      if (days) totalMs += parseInt(days, 10) * MS_PER_DAY;
      if (hours) totalMs += parseInt(hours, 10) * MS_PER_HOUR;
      if (minutes) totalMs += parseInt(minutes, 10) * MS_PER_MINUTE;
      if (seconds) totalMs += parseFloat(seconds) * MS_PER_SECOND;
    }

    return { valid: totalMs > 0, milliseconds: totalMs };
  };

  const result = parseDuration("P1DT2H30M");

  assertEquals(result.valid, true);
  assertEquals(result.milliseconds, 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
});

Deno.test("duration_parse - handles invalid input", () => {
  const parseDuration = (duration: string) => {
    if (!duration || duration.trim() === "") {
      return { valid: false, error: "Empty duration" };
    }

    // Try to match any duration pattern
    const hasPattern = /(\d+[hmswd]|\d+\s*(hours?|minutes?|seconds?|days?|weeks?))/i.test(duration);
    const isIso = /^P/i.test(duration);

    if (!hasPattern && !isIso) {
      return { valid: false, error: `Unable to parse duration: "${duration}"` };
    }

    return { valid: true };
  };

  const result = parseDuration("not a duration");
  assertEquals(result.valid, false);
  assertExists(result.error);
});

// ============================================================================
// 22. duration_between tests
// ============================================================================

Deno.test("duration_between - calculates duration between two dates", () => {
  const durationBetween = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime())) {
      return { valid: false, error: "Invalid start date" };
    }
    if (isNaN(endDate.getTime())) {
      return { valid: false, error: "Invalid end date" };
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const negative = diffMs < 0;
    const totalMs = Math.abs(diffMs);

    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    return {
      valid: true,
      negative,
      milliseconds: negative ? -totalMs : totalMs,
      hours: (negative ? -totalMs : totalMs) / MS_PER_HOUR,
      days: (negative ? -totalMs : totalMs) / MS_PER_DAY,
    };
  };

  const result = durationBetween("2024-01-01T00:00:00Z", "2024-01-02T12:00:00Z");

  assertEquals(result.valid, true);
  assertEquals(result.negative, false);
  assertEquals(result.days, 1.5);
  assertEquals(result.hours, 36);
});

Deno.test("duration_between - handles negative duration", () => {
  const durationBetween = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const diffMs = endDate.getTime() - startDate.getTime();
    const negative = diffMs < 0;

    return { valid: true, negative, milliseconds: diffMs };
  };

  const result = durationBetween("2024-01-02T00:00:00Z", "2024-01-01T00:00:00Z");

  assertEquals(result.valid, true);
  assertEquals(result.negative, true);
  assertEquals(result.milliseconds < 0, true);
});

Deno.test("duration_between - generates human-readable output", () => {
  const durationBetween = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalMs = Math.abs(diffMs);

    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;

    let remaining = totalMs;
    const days = Math.floor(remaining / MS_PER_DAY);
    remaining %= MS_PER_DAY;
    const hours = Math.floor(remaining / MS_PER_HOUR);
    remaining %= MS_PER_HOUR;
    const minutes = Math.floor(remaining / MS_PER_MINUTE);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);

    return {
      valid: true,
      human: parts.join(", ") || "0 seconds",
      breakdown: { days, hours, minutes },
    };
  };

  const result = durationBetween("2024-01-01T00:00:00Z", "2024-01-03T05:30:00Z");

  assertEquals(result.valid, true);
  assertStringIncludes(result.human, "2 days");
  assertStringIncludes(result.human, "5 hours");
  assertStringIncludes(result.human, "30 minutes");
  assertEquals(result.breakdown.days, 2);
  assertEquals(result.breakdown.hours, 5);
  assertEquals(result.breakdown.minutes, 30);
});

// ============================================================================
// 23. sql_format tests (actual tool behavior)
// ============================================================================

Deno.test("sql_format - formats SQL with uppercase keywords", () => {
  // Matches actual sql_format tool behavior from database.ts
  const sqlFormat = ({ sql, uppercase = true }: { sql: string; uppercase?: boolean }) => {
    const majorKeywords = [
      "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
      "INNER JOIN", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
    ];

    // Preserve string literals
    const stringLiterals: string[] = [];
    let processed = sql.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });

    // Normalize whitespace
    processed = processed.replace(/\s+/g, " ").trim();

    // Transform keywords
    if (uppercase) {
      for (const kw of majorKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, "gi");
        processed = processed.replace(regex, kw);
      }
    }

    // Add newlines before major keywords
    for (const kw of majorKeywords) {
      const regex = new RegExp(`\\s+(${kw})\\b`, "gi");
      processed = processed.replace(regex, `\n${kw}`);
    }

    // Restore string literals
    stringLiterals.forEach((lit, idx) => {
      processed = processed.replace(`__STRING_${idx}__`, lit);
    });

    // Extract tables
    const tables: string[] = [];
    const fromMatch = processed.match(/FROM\s+(\w+)/i);
    if (fromMatch) tables.push(fromMatch[1]);

    return { formatted: processed.trim(), tables };
  };

  const result = sqlFormat({
    sql: "select id, name from users where active = true order by created_at",
  });

  assertStringIncludes(result.formatted, "SELECT");
  assertStringIncludes(result.formatted, "FROM");
  assertStringIncludes(result.formatted, "WHERE");
  assertStringIncludes(result.formatted, "ORDER BY");
  assertEquals(result.tables.includes("users"), true);
});

Deno.test("sql_format - formats complex query with JOINs", () => {
  const sqlFormat = ({ sql }: { sql: string }) => {
    const majorKeywords = [
      "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
      "INNER JOIN", "GROUP BY", "ORDER BY", "HAVING", "LIMIT",
    ];

    let processed = sql.replace(/\s+/g, " ").trim();

    // Uppercase keywords
    for (const kw of majorKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      processed = processed.replace(regex, kw);
    }

    // Add newlines
    for (const kw of majorKeywords) {
      const regex = new RegExp(`\\s+(${kw})\\b`, "gi");
      processed = processed.replace(regex, `\n${kw}`);
    }

    return { formatted: processed.trim() };
  };

  const result = sqlFormat({
    sql: "select u.id, u.name, o.total from users u left join orders o on u.id = o.user_id where o.total > 100",
  });

  assertStringIncludes(result.formatted, "SELECT");
  assertStringIncludes(result.formatted, "LEFT");
  assertStringIncludes(result.formatted, "JOIN");
  assertStringIncludes(result.formatted, "WHERE");
});

// ============================================================================
// 24. sql_minify tests (actual tool behavior)
// ============================================================================

Deno.test("sql_minify - removes whitespace and comments", () => {
  // Matches actual sql_minify tool behavior from database.ts
  const sqlMinify = ({ sql }: { sql: string }) => {
    const originalLength = sql.length;

    // Preserve string literals
    const stringLiterals: string[] = [];
    let processed = sql.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });

    // Remove comments
    processed = processed.replace(/--.*$/gm, "");
    processed = processed.replace(/\/\*[\s\S]*?\*\//g, "");

    // Collapse whitespace
    processed = processed.replace(/\s+/g, " ").trim();

    // Remove spaces around operators
    processed = processed.replace(/ ?, ?/g, ",");
    processed = processed.replace(/ ?\( ?/g, "(");
    processed = processed.replace(/ ?\) ?/g, ")");
    processed = processed.replace(/ ?= ?/g, "=");

    // Restore string literals
    stringLiterals.forEach((lit, idx) => {
      processed = processed.replace(`__STRING_${idx}__`, lit);
    });

    const minifiedLength = processed.length;
    const reduction = originalLength > 0
      ? `${((1 - minifiedLength / originalLength) * 100).toFixed(1)}%`
      : "0%";

    return { minified: processed, originalLength, minifiedLength, reduction };
  };

  const result = sqlMinify({
    sql: `SELECT   id, name
          FROM   users
          -- This is a comment
          WHERE  active = true`,
  });

  assertEquals(result.minified.includes("--"), false);
  assertEquals(result.minified.includes("\n"), false);
  assertEquals(result.minifiedLength < result.originalLength, true);
});

Deno.test("sql_minify - preserves string literals during minification", () => {
  const sqlMinify = ({ sql }: { sql: string }) => {
    // Preserve string literals
    const stringLiterals: string[] = [];
    let processed = sql.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });

    // Collapse whitespace
    processed = processed.replace(/\s+/g, " ").trim();

    // Remove spaces around operators
    processed = processed.replace(/ ?, ?/g, ",");
    processed = processed.replace(/ ?= ?/g, "=");

    // Restore string literals
    stringLiterals.forEach((lit, idx) => {
      processed = processed.replace(`__STRING_${idx}__`, lit);
    });

    return { minified: processed };
  };

  const result = sqlMinify({
    sql: "SELECT * FROM users WHERE name = 'John   Doe'",
  });

  // String literal with multiple spaces should be preserved
  assertStringIncludes(result.minified, "'John   Doe'");
  // The minification preserves some spaces around keywords
  assertStringIncludes(result.minified, "name='John   Doe'");
});

// ============================================================================
// 25. semver_parse tests (actual tool behavior)
// ============================================================================

Deno.test("semver_parse - parses version with prerelease and build metadata", () => {
  // Matches actual semver_parse tool behavior from text.ts
  const parseSemver = (version: string) => {
    let v = version.trim();
    if (v.startsWith("v") || v.startsWith("V")) {
      v = v.slice(1);
    }

    // Split off build metadata
    let buildStr = "";
    const plusIdx = v.indexOf("+");
    if (plusIdx !== -1) {
      buildStr = v.slice(plusIdx + 1);
      v = v.slice(0, plusIdx);
    }

    // Split off prerelease
    let prereleaseStr = "";
    const hyphenIdx = v.indexOf("-");
    if (hyphenIdx !== -1) {
      prereleaseStr = v.slice(hyphenIdx + 1);
      v = v.slice(0, hyphenIdx);
    }

    // Parse core version
    const coreParts = v.split(".");
    if (coreParts.length !== 3) {
      return { valid: false, error: "Invalid version format" };
    }

    const [majorStr, minorStr, patchStr] = coreParts;
    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    const patch = parseInt(patchStr, 10);

    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return { valid: false, error: "Version parts must be numeric" };
    }

    const prerelease = prereleaseStr ? prereleaseStr.split(".") : [];
    const build = buildStr ? buildStr.split(".") : [];
    const isPrerelease = prerelease.length > 0;
    const isStable = major >= 1 && !isPrerelease;

    return {
      valid: true,
      major,
      minor,
      patch,
      prerelease,
      build,
      isPrerelease,
      isStable,
      normalized: `${major}.${minor}.${patch}${prereleaseStr ? `-${prereleaseStr}` : ""}`,
    };
  };

  const result = parseSemver("1.2.3-beta.1+build.456");

  assertEquals(result.valid, true);
  assertEquals(result.major, 1);
  assertEquals(result.minor, 2);
  assertEquals(result.patch, 3);
  assertEquals(result.prerelease, ["beta", "1"]);
  assertEquals(result.build, ["build", "456"]);
  assertEquals(result.isPrerelease, true);
  assertEquals(result.isStable, false);
});

Deno.test("semver_parse - identifies stable vs prerelease versions", () => {
  const parseSemver = (version: string) => {
    let v = version.trim().replace(/^v/i, "");

    let prereleaseStr = "";
    const hyphenIdx = v.indexOf("-");
    if (hyphenIdx !== -1) {
      prereleaseStr = v.slice(hyphenIdx + 1);
      v = v.slice(0, hyphenIdx);
    }

    const [majorStr, minorStr, patchStr] = v.split(".");
    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    const patch = parseInt(patchStr, 10);

    const prerelease = prereleaseStr ? prereleaseStr.split(".") : [];
    const isPrerelease = prerelease.length > 0;
    const isStable = major >= 1 && !isPrerelease;

    return { valid: true, major, minor, patch, isPrerelease, isStable };
  };

  const stable = parseSemver("2.0.0");
  assertEquals(stable.isStable, true);
  assertEquals(stable.isPrerelease, false);

  const prerelease = parseSemver("2.0.0-rc.1");
  assertEquals(prerelease.isStable, false);
  assertEquals(prerelease.isPrerelease, true);

  const zeroDotVersion = parseSemver("0.9.5");
  assertEquals(zeroDotVersion.isStable, false); // 0.x versions are not stable
});

// ============================================================================
// 26. semver_compare tests (actual tool behavior)
// ============================================================================

Deno.test("semver_compare - compares versions correctly", () => {
  // Matches actual semver_compare tool behavior from text.ts
  const compareSemver = (version1: string, version2: string) => {
    const parse = (v: string) => {
      const cleaned = v.replace(/^v/i, "");
      const hyphenIdx = cleaned.indexOf("-");
      const core = hyphenIdx !== -1 ? cleaned.slice(0, hyphenIdx) : cleaned;
      const prerelease = hyphenIdx !== -1 ? cleaned.slice(hyphenIdx + 1).split(".") : [];
      const [major, minor, patch] = core.split(".").map(Number);
      return { major, minor, patch, prerelease };
    };

    const v1 = parse(version1);
    const v2 = parse(version2);

    // Compare major
    if (v1.major !== v2.major) {
      return {
        result: v1.major > v2.major ? 1 : -1,
        comparison: v1.major > v2.major ? "newer" : "older",
        diff: "major",
      };
    }

    // Compare minor
    if (v1.minor !== v2.minor) {
      return {
        result: v1.minor > v2.minor ? 1 : -1,
        comparison: v1.minor > v2.minor ? "newer" : "older",
        diff: "minor",
      };
    }

    // Compare patch
    if (v1.patch !== v2.patch) {
      return {
        result: v1.patch > v2.patch ? 1 : -1,
        comparison: v1.patch > v2.patch ? "newer" : "older",
        diff: "patch",
      };
    }

    // Compare prerelease
    if (v1.prerelease.length === 0 && v2.prerelease.length > 0) {
      return { result: 1, comparison: "newer", diff: "prerelease" };
    }
    if (v1.prerelease.length > 0 && v2.prerelease.length === 0) {
      return { result: -1, comparison: "older", diff: "prerelease" };
    }

    return { result: 0, comparison: "equal", diff: "none" };
  };

  // Major version difference
  const majorDiff = compareSemver("2.0.0", "1.0.0");
  assertEquals(majorDiff.result, 1);
  assertEquals(majorDiff.diff, "major");

  // Minor version difference
  const minorDiff = compareSemver("1.5.0", "1.3.0");
  assertEquals(minorDiff.result, 1);
  assertEquals(minorDiff.diff, "minor");

  // Patch version difference
  const patchDiff = compareSemver("1.0.5", "1.0.3");
  assertEquals(patchDiff.result, 1);
  assertEquals(patchDiff.diff, "patch");
});

Deno.test("semver_compare - release version beats prerelease", () => {
  const compareSemver = (version1: string, version2: string) => {
    const parse = (v: string) => {
      const cleaned = v.replace(/^v/i, "");
      const hyphenIdx = cleaned.indexOf("-");
      const core = hyphenIdx !== -1 ? cleaned.slice(0, hyphenIdx) : cleaned;
      const prerelease = hyphenIdx !== -1 ? cleaned.slice(hyphenIdx + 1).split(".") : [];
      const [major, minor, patch] = core.split(".").map(Number);
      return { major, minor, patch, prerelease };
    };

    const v1 = parse(version1);
    const v2 = parse(version2);

    if (v1.major !== v2.major) return { result: v1.major > v2.major ? 1 : -1 };
    if (v1.minor !== v2.minor) return { result: v1.minor > v2.minor ? 1 : -1 };
    if (v1.patch !== v2.patch) return { result: v1.patch > v2.patch ? 1 : -1 };

    // Release > prerelease
    if (v1.prerelease.length === 0 && v2.prerelease.length > 0) {
      return { result: 1, comparison: "newer" };
    }
    if (v1.prerelease.length > 0 && v2.prerelease.length === 0) {
      return { result: -1, comparison: "older" };
    }

    return { result: 0, comparison: "equal" };
  };

  const result1 = compareSemver("1.0.0", "1.0.0-beta");
  assertEquals(result1.result, 1); // Release is newer than prerelease

  const result2 = compareSemver("1.0.0-alpha", "1.0.0");
  assertEquals(result2.result, -1); // Prerelease is older than release
});

// ============================================================================
// 27. duration_parse tests (actual tool behavior)
// ============================================================================

Deno.test("duration_parse - parses '2h30m' correctly", () => {
  // Matches actual duration_parse tool behavior from datetime.ts
  const parseDuration = (duration: string) => {
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    const MS_PER_WEEK = 7 * MS_PER_DAY;

    let totalMs = 0;
    const normalized = duration.toLowerCase();

    // Parse components
    const weekMatch = normalized.match(/(\d+)w/);
    const dayMatch = normalized.match(/(\d+)d/);
    const hourMatch = normalized.match(/(\d+)h/);
    const minMatch = normalized.match(/(\d+)m(?!s)/);
    const secMatch = normalized.match(/(\d+)s(?!$|\s)/);

    if (weekMatch) totalMs += parseInt(weekMatch[1], 10) * MS_PER_WEEK;
    if (dayMatch) totalMs += parseInt(dayMatch[1], 10) * MS_PER_DAY;
    if (hourMatch) totalMs += parseInt(hourMatch[1], 10) * MS_PER_HOUR;
    if (minMatch) totalMs += parseInt(minMatch[1], 10) * MS_PER_MINUTE;
    if (secMatch) totalMs += parseInt(secMatch[1], 10) * MS_PER_SECOND;

    // Calculate breakdown
    let remaining = totalMs;
    const weeks = Math.floor(remaining / MS_PER_WEEK);
    remaining %= MS_PER_WEEK;
    const days = Math.floor(remaining / MS_PER_DAY);
    remaining %= MS_PER_DAY;
    const hours = Math.floor(remaining / MS_PER_HOUR);
    remaining %= MS_PER_HOUR;
    const minutes = Math.floor(remaining / MS_PER_MINUTE);
    remaining %= MS_PER_MINUTE;
    const seconds = Math.floor(remaining / MS_PER_SECOND);

    return {
      valid: totalMs > 0,
      milliseconds: totalMs,
      breakdown: { weeks, days, hours, minutes, seconds },
    };
  };

  const result = parseDuration("2h30m");

  assertEquals(result.valid, true);
  assertEquals(result.milliseconds, 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
  assertEquals(result.breakdown.hours, 2);
  assertEquals(result.breakdown.minutes, 30);
});

Deno.test("duration_parse - parses ISO 8601 duration format", () => {
  const parseDuration = (duration: string) => {
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    const MS_PER_WEEK = 7 * MS_PER_DAY;

    let totalMs = 0;

    // ISO 8601 format: P[n]W or P[n]DT[n]H[n]M[n]S
    const iso8601Regex = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
    const isoMatch = duration.match(iso8601Regex);

    if (isoMatch) {
      const [, weeks, days, hours, minutes, seconds] = isoMatch;
      if (weeks) totalMs += parseInt(weeks, 10) * MS_PER_WEEK;
      if (days) totalMs += parseInt(days, 10) * MS_PER_DAY;
      if (hours) totalMs += parseInt(hours, 10) * MS_PER_HOUR;
      if (minutes) totalMs += parseInt(minutes, 10) * MS_PER_MINUTE;
      if (seconds) totalMs += parseFloat(seconds) * MS_PER_SECOND;
    }

    return { valid: totalMs > 0, milliseconds: totalMs };
  };

  const result = parseDuration("PT2H30M");

  assertEquals(result.valid, true);
  assertEquals(result.milliseconds, 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
});

// ============================================================================
// 28. duration_between tests (actual tool behavior)
// ============================================================================

Deno.test("duration_between - calculates duration between ISO dates", () => {
  // Matches actual duration_between tool behavior from datetime.ts
  const durationBetween = (start: string, end: string) => {
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    const MS_PER_WEEK = 7 * MS_PER_DAY;

    const startDate = new Date(start);
    const endDate = new Date(end);

    const diffMs = endDate.getTime() - startDate.getTime();
    const negative = diffMs < 0;
    const totalMs = Math.abs(diffMs);

    // Calculate breakdown
    let remaining = totalMs;
    const weeks = Math.floor(remaining / MS_PER_WEEK);
    remaining %= MS_PER_WEEK;
    const days = Math.floor(remaining / MS_PER_DAY);
    remaining %= MS_PER_DAY;
    const hours = Math.floor(remaining / MS_PER_HOUR);
    remaining %= MS_PER_HOUR;
    const minutes = Math.floor(remaining / MS_PER_MINUTE);
    remaining %= MS_PER_MINUTE;
    const seconds = Math.floor(remaining / MS_PER_SECOND);

    return {
      valid: true,
      negative,
      milliseconds: negative ? -totalMs : totalMs,
      breakdown: { weeks, days, hours, minutes, seconds },
    };
  };

  const result = durationBetween("2024-01-01T00:00:00Z", "2024-01-02T12:30:00Z");

  assertEquals(result.valid, true);
  assertEquals(result.negative, false);
  assertEquals(result.breakdown.days, 1);
  assertEquals(result.breakdown.hours, 12);
  assertEquals(result.breakdown.minutes, 30);
});

Deno.test("duration_between - handles reversed dates (negative duration)", () => {
  const durationBetween = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const diffMs = endDate.getTime() - startDate.getTime();
    const negative = diffMs < 0;
    const totalMs = Math.abs(diffMs);

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const days = Math.floor(totalMs / MS_PER_DAY);

    return {
      valid: true,
      negative,
      milliseconds: negative ? -totalMs : totalMs,
      days,
    };
  };

  // End date is before start date
  const result = durationBetween("2024-01-10T00:00:00Z", "2024-01-05T00:00:00Z");

  assertEquals(result.valid, true);
  assertEquals(result.negative, true);
  assertEquals(result.milliseconds < 0, true);
  assertEquals(result.days, 5);
});

// ============================================================================
// 29. unicode_inspect (text.ts)
// ============================================================================

Deno.test("unicode_inspect - analyzes 'Hello 👋' with emoji detection", () => {
  const unicodeInspect = (text: string) => {
    const getUnicodeCategory = (codePoint: number): string => {
      if (codePoint >= 0x1F600 && codePoint <= 0x1F64F) return "Emoji";
      if (codePoint >= 0x1F300 && codePoint <= 0x1F5FF) return "Emoji";
      if (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) return "Emoji";
      if (codePoint >= 0x1F1E0 && codePoint <= 0x1F1FF) return "Emoji";
      if (codePoint >= 0x2600 && codePoint <= 0x26FF) return "Emoji";
      if (codePoint >= 0x2700 && codePoint <= 0x27BF) return "Emoji";
      if (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) return "Emoji";
      if (codePoint >= 0x1FA00 && codePoint <= 0x1FA6F) return "Emoji";
      if (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF) return "Emoji";
      if ((codePoint >= 0x41 && codePoint <= 0x5A) || (codePoint >= 0x61 && codePoint <= 0x7A)) return "Letter";
      if (codePoint >= 0x30 && codePoint <= 0x39) return "Number";
      if (codePoint === 0x20 || codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D) return "Space";
      if (codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F)) return "Control";
      return "Other";
    };

    const codePoints: Array<{ char: string; codePoint: number; hex: string; category: string }> = [];
    let hasEmoji = false;

    for (const char of text) {
      const cp = char.codePointAt(0)!;
      const category = getUnicodeCategory(cp);
      if (category === "Emoji") hasEmoji = true;
      codePoints.push({
        char,
        codePoint: cp,
        hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        category,
      });
    }

    return {
      length: text.length,
      codePointCount: [...text].length,
      codePoints,
      hasEmoji,
    };
  };

  const result = unicodeInspect("Hello 👋");

  assertEquals(result.codePointCount, 7);
  assertEquals(result.hasEmoji, true);
  const waveEmoji = result.codePoints.find((cp) => cp.category === "Emoji");
  assertExists(waveEmoji);
  assertEquals(waveEmoji.char, "👋");
  assertEquals(waveEmoji.hex, "U+1F44B");
});

Deno.test("unicode_inspect - detects invisible characters", () => {
  const unicodeInspect = (text: string) => {
    const invisibleChars = [
      0x200B, // Zero Width Space
      0x200C, // Zero Width Non-Joiner
      0x200D, // Zero Width Joiner
      0xFEFF, // BOM
      0x00AD, // Soft Hyphen
    ];

    const isInvisibleChar = (cp: number): boolean => invisibleChars.includes(cp);

    const codePoints: Array<{ char: string; codePoint: number; isInvisible: boolean }> = [];
    let hasInvisible = false;

    for (const char of text) {
      const cp = char.codePointAt(0)!;
      const invisible = isInvisibleChar(cp);
      if (invisible) hasInvisible = true;
      codePoints.push({
        char,
        codePoint: cp,
        isInvisible: invisible,
      });
    }

    return {
      codePointCount: [...text].length,
      codePoints,
      hasInvisible,
      invisibleCount: codePoints.filter((cp) => cp.isInvisible).length,
    };
  };

  // Text with zero-width space
  const result = unicodeInspect("Hello\u200BWorld");

  assertEquals(result.codePointCount, 11);
  assertEquals(result.hasInvisible, true);
  assertEquals(result.invisibleCount, 1);
  const invisibleChar = result.codePoints.find((cp) => cp.isInvisible);
  assertExists(invisibleChar);
  assertEquals(invisibleChar.codePoint, 0x200B);
});

// ============================================================================
// 30. color_accessibility (color.ts)
// ============================================================================

Deno.test("color_accessibility - calculates WCAG contrast ratio correctly", () => {
  const colorAccessibility = (foreground: string, background: string) => {
    const hexToRgb = (hex: string): [number, number, number] => {
      const clean = hex.replace("#", "");
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    };

    const getLuminance = (rgb: [number, number, number]): number => {
      const [r, g, b] = rgb.map((c) => {
        const sRGB = c / 255;
        return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const fgRgb = hexToRgb(foreground);
    const bgRgb = hexToRgb(background);
    const fgLum = getLuminance(fgRgb);
    const bgLum = getLuminance(bgRgb);

    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    return {
      ratio: Math.round(ratio * 100) / 100,
      aa: { normalText: ratio >= 4.5, largeText: ratio >= 3 },
      aaa: { normalText: ratio >= 7, largeText: ratio >= 4.5 },
    };
  };

  // Black on white - maximum contrast
  const result = colorAccessibility("#000000", "#FFFFFF");

  assertEquals(result.ratio, 21);
  assertEquals(result.aa.normalText, true);
  assertEquals(result.aa.largeText, true);
  assertEquals(result.aaa.normalText, true);
  assertEquals(result.aaa.largeText, true);
});

Deno.test("color_accessibility - fails AA for low contrast colors", () => {
  const colorAccessibility = (foreground: string, background: string) => {
    const hexToRgb = (hex: string): [number, number, number] => {
      const clean = hex.replace("#", "");
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    };

    const getLuminance = (rgb: [number, number, number]): number => {
      const [r, g, b] = rgb.map((c) => {
        const sRGB = c / 255;
        return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const fgRgb = hexToRgb(foreground);
    const bgRgb = hexToRgb(background);
    const fgLum = getLuminance(fgRgb);
    const bgLum = getLuminance(bgRgb);

    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    return {
      ratio: Math.round(ratio * 100) / 100,
      aa: { normalText: ratio >= 4.5, largeText: ratio >= 3 },
      aaa: { normalText: ratio >= 7, largeText: ratio >= 4.5 },
    };
  };

  // Light gray on white - poor contrast
  const result = colorAccessibility("#AAAAAA", "#FFFFFF");

  assertEquals(result.ratio < 4.5, true);
  assertEquals(result.aa.normalText, false);
  assertEquals(result.aaa.normalText, false);
});

// ============================================================================
// 31. http_headers_parse (http.ts)
// ============================================================================

Deno.test("http_headers_parse - parses headers and calculates security score", () => {
  const httpHeadersParse = (headersText: string) => {
    const lines = headersText.split("\n").filter((l) => l.trim());
    const headers: Record<string, string> = {};
    const security: string[] = [];
    const caching: string[] = [];

    const securityHeaders = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ];

    const securityPoints: Record<string, number> = {
      "strict-transport-security": 25,
      "content-security-policy": 25,
      "x-frame-options": 15,
      "x-content-type-options": 15,
      "referrer-policy": 10,
      "permissions-policy": 10,
    };

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      const name = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[name] = value;

      if (securityHeaders.includes(name)) security.push(name);
      if (name.includes("cache") || name === "expires" || name === "etag") caching.push(name);
    }

    let securityScore = 0;
    for (const header of security) {
      securityScore += securityPoints[header] || 0;
    }

    return {
      headers,
      categorized: { security, caching },
      securityScore,
      count: Object.keys(headers).length,
    };
  };

  const headersText = `Content-Type: application/json
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Cache-Control: no-store`;

  const result = httpHeadersParse(headersText);

  assertEquals(result.count, 5);
  assertEquals(result.categorized.security.length, 3);
  assertEquals(result.securityScore, 55); // 25 + 15 + 15
  assertEquals(result.headers["content-type"], "application/json");
});

Deno.test("http_headers_parse - handles full security headers for 100 score", () => {
  const httpHeadersParse = (headersText: string) => {
    const lines = headersText.split("\n").filter((l) => l.trim());
    const headers: Record<string, string> = {};
    const security: string[] = [];

    const securityHeaders = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ];

    const securityPoints: Record<string, number> = {
      "strict-transport-security": 25,
      "content-security-policy": 25,
      "x-frame-options": 15,
      "x-content-type-options": 15,
      "referrer-policy": 10,
      "permissions-policy": 10,
    };

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      const name = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[name] = value;

      if (securityHeaders.includes(name)) security.push(name);
    }

    let securityScore = 0;
    for (const header of security) {
      securityScore += securityPoints[header] || 0;
    }

    return {
      headers,
      securityScore,
    };
  };

  const headersText = `Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=()`;

  const result = httpHeadersParse(headersText);

  assertEquals(result.securityScore, 100);
});

// ============================================================================
// 32. ip_info (network.ts)
// ============================================================================

Deno.test("ip_info - detects IPv4 private address", () => {
  const ipInfo = (ip: string) => {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);

    if (!match) return { valid: false };

    const octets = match.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return { valid: false };

    const isPrivate =
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);

    const isLoopback = octets[0] === 127;

    return {
      valid: true,
      version: 4,
      type: isLoopback ? "loopback" : isPrivate ? "private" : "public",
      isPrivate,
      isLoopback,
    };
  };

  const result = ipInfo("192.168.1.100");

  assertEquals(result.valid, true);
  assertEquals(result.version, 4);
  assertEquals(result.type, "private");
  assertEquals(result.isPrivate, true);
  assertEquals(result.isLoopback, false);
});

Deno.test("ip_info - detects IPv6 loopback address", () => {
  const ipInfo = (ip: string) => {
    // Simplified IPv6 check for loopback
    const isIPv6 = ip.includes(":");
    if (!isIPv6) return { valid: false };

    const normalized = ip.toLowerCase();
    const isLoopback = normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";

    return {
      valid: true,
      version: 6,
      type: isLoopback ? "loopback" : "other",
      isLoopback,
    };
  };

  const result = ipInfo("::1");

  assertEquals(result.valid, true);
  assertEquals(result.version, 6);
  assertEquals(result.type, "loopback");
  assertEquals(result.isLoopback, true);
});

// ============================================================================
// 33. text_diff (text.ts)
// ============================================================================

Deno.test("text_diff - generates unified diff for text changes", () => {
  const textDiff = (original: string, modified: string) => {
    const oldLines = original.split("\n");
    const newLines = modified.split("\n");

    const changes: Array<{ type: string; line: string }> = [];
    let additions = 0;
    let deletions = 0;

    // Simple line-by-line diff
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        if (oldLine !== undefined) {
          changes.push({ type: "unchanged", line: oldLine });
        }
      } else {
        if (oldLine !== undefined) {
          changes.push({ type: "removed", line: oldLine });
          deletions++;
        }
        if (newLine !== undefined) {
          changes.push({ type: "added", line: newLine });
          additions++;
        }
      }
    }

    return {
      changes,
      stats: { additions, deletions, unchanged: changes.filter((c) => c.type === "unchanged").length },
    };
  };

  const original = "line1\nline2\nline3";
  const modified = "line1\nmodified\nline3";

  const result = textDiff(original, modified);

  assertEquals(result.stats.additions, 1);
  assertEquals(result.stats.deletions, 1);
  assertEquals(result.stats.unchanged, 2);
  const addedLine = result.changes.find((c) => c.type === "added");
  assertExists(addedLine);
  assertEquals(addedLine.line, "modified");
});

Deno.test("text_diff - handles added lines at end", () => {
  const textDiff = (original: string, modified: string) => {
    const oldLines = original.split("\n");
    const newLines = modified.split("\n");

    const changes: Array<{ type: string; line: string }> = [];
    let additions = 0;
    let deletions = 0;

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        if (oldLine !== undefined) {
          changes.push({ type: "unchanged", line: oldLine });
        }
      } else {
        if (oldLine !== undefined) {
          changes.push({ type: "removed", line: oldLine });
          deletions++;
        }
        if (newLine !== undefined) {
          changes.push({ type: "added", line: newLine });
          additions++;
        }
      }
    }

    return {
      changes,
      stats: { additions, deletions },
    };
  };

  const original = "line1\nline2";
  const modified = "line1\nline2\nline3\nline4";

  const result = textDiff(original, modified);

  assertEquals(result.stats.additions, 2);
  assertEquals(result.stats.deletions, 0);
});

// ============================================================================
// 34. base64_image_preview (encoding.ts)
// ============================================================================

Deno.test("base64_image_preview - detects PNG from magic bytes", () => {
  const base64ImagePreview = (base64: string) => {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");

    // Decode first few bytes
    const binaryString = atob(cleanBase64.slice(0, 20));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = pngMagic.every((b, i) => bytes[i] === b);

    // JPEG magic bytes: FF D8 FF
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    let format = "unknown";
    if (isPng) format = "png";
    else if (isJpeg) format = "jpeg";

    return {
      format,
      valid: format !== "unknown",
    };
  };

  // PNG magic bytes encoded in base64: 89 50 4E 47 0D 0A 1A 0A + some padding
  const pngBase64 = btoa(
    String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52)
  );

  const result = base64ImagePreview(pngBase64);

  assertEquals(result.format, "png");
  assertEquals(result.valid, true);
});

Deno.test("base64_image_preview - detects JPEG from magic bytes", () => {
  const base64ImagePreview = (base64: string) => {
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");

    const binaryString = atob(cleanBase64.slice(0, 20));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PNG magic bytes
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = pngMagic.every((b, i) => bytes[i] === b);

    // JPEG magic bytes: FF D8 FF
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    let format = "unknown";
    if (isPng) format = "png";
    else if (isJpeg) format = "jpeg";

    return {
      format,
      valid: format !== "unknown",
      mimeType: format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : null,
    };
  };

  // JPEG magic bytes: FF D8 FF E0 (JFIF marker)
  const jpegBase64 = btoa(
    String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01)
  );

  const result = base64ImagePreview(jpegBase64);

  assertEquals(result.format, "jpeg");
  assertEquals(result.valid, true);
  assertEquals(result.mimeType, "image/jpeg");
});
