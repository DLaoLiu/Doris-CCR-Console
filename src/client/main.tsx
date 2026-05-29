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
      theme={{
        token: {
          colorPrimary: "#007aff",
          colorInfo: "#007aff",
          colorSuccess: "#34c759",
          colorWarning: "#ff9500",
          colorError: "#ff3b30",
          colorText: "#1d1d1f",
          colorTextSecondary: "#6e6e73",
          colorBgLayout: "#f5f5f7",
          colorBgContainer: "rgba(255, 255, 255, 0.82)",
          colorBorder: "rgba(60, 60, 67, 0.18)",
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          controlHeight: 34,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)"
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
            activeShadow: "0 0 0 3px rgba(0, 122, 255, 0.14)"
          },
          InputNumber: {
            borderRadius: 8,
            activeShadow: "0 0 0 3px rgba(0, 122, 255, 0.14)"
          },
          Select: {
            borderRadius: 8,
            optionSelectedBg: "rgba(0, 122, 255, 0.12)"
          },
          Table: {
            headerBg: "rgba(242, 242, 247, 0.86)",
            headerColor: "#6e6e73",
            rowHoverBg: "rgba(0, 122, 255, 0.06)"
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
