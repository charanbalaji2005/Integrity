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
      return (
        <div style={{ padding: "30px", color: "#851414", backgroundColor: "#fdf2f2", border: "2px solid #f8b4b4", borderRadius: "12px", fontFamily: "monospace", margin: "20px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "20px" }}>React Render Crash Caught</h2>
          <p style={{ fontWeight: "bold", fontSize: "16px", margin: "0 0 20px 0" }}>{this.state.error?.toString()}</p>
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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);