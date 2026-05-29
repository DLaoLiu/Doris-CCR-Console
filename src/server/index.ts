import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp(config);

if (config.host === "0.0.0.0") {
  app.log.warn("当前服务监听 0.0.0.0，MVP 未内置登录，请仅在可信网络中使用。");
}

app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
