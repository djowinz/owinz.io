"use client";

// Keeps a chart that throws while drawing (or whose code fails to load) from
// taking the page or editor down with it: it shows the same "couldn't be
// drawn" note as an invalid block instead. Changing `resetKey` (the spec)
// tries again.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey?: unknown;
  onError?(): void;
}

interface State {
  message: string | null;
  resetKey: unknown;
}

export class ChartBoundary extends Component<Props, State> {
  state: State = { message: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { message: error instanceof Error && error.message ? error.message : "something went wrong" };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { message: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return <p className="chart-failed">Chart couldn&apos;t be drawn: {this.state.message}</p>;
  }
}
