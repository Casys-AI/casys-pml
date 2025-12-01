interface LegendProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  serverColors: Record<string, string>;
  onToggleServer: (server: string) => void;
}

export default function Legend({ servers, hiddenServers, serverColors, onToggleServer }: LegendProps) {
  const serverArray = Array.from(servers).sort();

  return (
    <div class="absolute top-5 right-5 bg-black/80 p-4 rounded-lg border border-gray-700 max-h-[80vh] overflow-y-auto backdrop-blur">
      <h3 class="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wide">
        MCP Servers
      </h3>
      <div class="space-y-2">
        {serverArray.map((server) => {
          const isHidden = hiddenServers.has(server);
          const color = serverColors[server] || serverColors.unknown;

          return (
            <div
              key={server}
              onClick={() => onToggleServer(server)}
              class={`flex items-center cursor-pointer transition-opacity hover:opacity-70 ${
                isHidden ? "opacity-40" : ""
              }`}
            >
              <div
                class="w-4 h-4 rounded-full mr-2"
                style={{ backgroundColor: color }}
              />
              <span class="text-sm text-gray-200">{server}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
