import net from "node:net";
import type { Cluster } from "../shared/types.js";

function testPort(host: string, port: number, timeoutMs = 3000) {
  return new Promise<{ port: number; ok: boolean; message: string }>((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ port, ok: false, message: `连接 ${host}:${port} 超时` });
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve({ port, ok: true, message: `连接 ${host}:${port} 成功` });
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve({ port, ok: false, message: `连接 ${host}:${port} 失败：${error.message}` });
    });
  });
}

export async function testClusterConnectivity(cluster: Cluster) {
  const results = await Promise.all([
    testPort(cluster.host, cluster.queryPort),
    testPort(cluster.host, cluster.thriftPort)
  ]);
  return {
    ok: results.every((item) => item.ok),
    results
  };
}
