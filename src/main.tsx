import React, { Component, ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // "removeChild / insertBefore … not a child of this node" means the DOM was
      // changed outside React (hot reload, browser translation, an extension).
      // The app state is fine; a reload restores a consistent page.
      const isDomDesync =
        this.state.error?.name === "NotFoundError" &&
        /removeChild|insertBefore/.test(this.state.error.message);
      return (
        <div style={{ padding: "30px", color: "#851414", backgroundColor: "#fdf2f2", border: "2px solid #f8b4b4", borderRadius: "12px", fontFamily: "monospace", margin: "20px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "20px" }}>React Render Crash Caught</h2>
          <p style={{ fontWeight: "bold", fontSize: "16px", margin: "0 0 12px 0" }}>{this.state.error?.toString()}</p>
          {isDomDesync && (
            <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", color: "#7f1d1d", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              The page was modified outside the app (a hot reload while editing, browser “Translate this page”, or an
              extension). Your data is safe — reload to continue. If it keeps happening, turn off page translation for
              this site or try a private window without extensions.
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", fontWeight: 600, padding: "10px 16px", borderRadius: "10px", border: "none", background: "#111", color: "#fff", cursor: "pointer", marginBottom: "20px" }}
          >
            Reload page
          </button>
          <h3 style={{ fontSize: "14px", margin: "10px 0 5px 0" }}>Stack Trace:</h3>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f9fafb", padding: "12px", borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "12px" }}>{this.state.error?.stack}</pre>
          {this.state.errorInfo && (
            <>
              <h3 style={{ fontSize: "14px", margin: "10px 0 5px 0" }}>Component Stack:</h3>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f9fafb", padding: "12px", borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "12px" }}>{this.state.errorInfo.componentStack}</pre>
            </>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// In production or cross-origin deployment, route relative /api fetches to VITE_API_URL
const remoteBackendUrl = import.meta.env.VITE_API_URL;
if (remoteBackendUrl && typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string" && input.startsWith("/api")) {
      input = `${remoteBackendUrl.replace(/\/$/, "")}${input}`;
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);