/**
 * Backpressure controller with max buffered bytes limit
 */

export class BackpressureController {
  constructor(socket, maxBufferedBytes = 8 * 1024 * 1024) {
    this.socket = socket;
    this.maxBufferedBytes = maxBufferedBytes;
    this.bufferedBytes = 0;
    this.paused = false;
    this.drainCallbacks = [];

    socket.on('drain', () => {
      this.bufferedBytes = 0;
      this.paused = false;
      const cbs = this.drainCallbacks.splice(0);
      for (const cb of cbs) cb();
    });
  }

  write(data) {
    if (this.socket.destroyed) return false;

    const writable = this.socket.write(data);
    if (!writable) {
      this.bufferedBytes += data.length;
      if (this.bufferedBytes > this.maxBufferedBytes) {
        this.paused = true;
        return false;
      }
    }
    return true;
  }

  async waitForDrain() {
    if (!this.paused) return;
    return new Promise(resolve => this.drainCallbacks.push(resolve));
  }

  isPaused() {
    return this.paused;
  }
}
