import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: "#0a84ff",
          colorInfo: "#0a84ff",
          colorSuccess: "#1fb6a6",
          colorWarning: "#ff9500",
          colorError: "#ff3b30",
          colorText: "#172026",
          colorTextSecondary: "#69757f",
          colorBgLayout: "#eef3f6",
          colorBgContainer: "rgba(255, 255, 255, 0.88)",
          colorBorder: "rgba(47, 67, 80, 0.16)",
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          controlHeight: 34,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.06)"
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 34,
            primaryShadow: "none"
          },
          Card: {
            borderRadiusLG: 8
          },
          Input: {
            borderRadius: 8,
            activeShadow: "0 0 0 3px rgba(10, 132, 255, 0.14)"
          },
          InputNumber: {
            borderRadius: 8,
            activeShadow: "0 0 0 3px rgba(10, 132, 255, 0.14)"
          },
          Select: {
            borderRadius: 8,
            optionSelectedBg: "rgba(10, 132, 255, 0.12)"
          },
          Table: {
            headerBg: "rgba(248, 248, 250, 0.92)",
            headerColor: "#6e6e73",
            rowHoverBg: "rgba(31, 182, 166, 0.07)"
          },
          Modal: {
            borderRadiusLG: 8
          }
        }
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
