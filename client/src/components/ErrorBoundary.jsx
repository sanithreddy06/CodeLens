import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="card" role="alert">
      <h3>This view could not load</h3>
      <p>Your saved analyses are still available. Reload to try again.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
    </div>
    return this.props.children
  }
}
