/**
 * Prometheus-style metrics collector
 */

class Metrics {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.startTime = Date.now();
  }

  inc(name, labels = {}, value = 1) {
    const key = this._key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  set(name, labels = {}, value) {
    const key = this._key(name, labels);
    this.gauges.set(key, value);
  }

  observe(name, labels = {}, value) {
    const key = this._key(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }

  _key(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  format() {
    const lines = [];
    lines.push('# HELP apex_uptime_seconds Total uptime in seconds');
    lines.push('# TYPE apex_uptime_seconds counter');
    lines.push(`apex_uptime_seconds ${(Date.now() - this.startTime) / 1000}`);

    for (const [key, val] of this.counters) {
      lines.push(`# TYPE ${key.split('{')[0]} counter`);
      lines.push(`${key} ${val}`);
    }

    for (const [key, val] of this.gauges) {
      lines.push(`# TYPE ${key.split('{')[0]} gauge`);
      lines.push(`${key} ${val}`);
    }

    for (const [key, vals] of this.histograms) {
      const sorted = vals.slice().sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const count = sorted.length;
      const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
      const base = key.split('{')[0];
      lines.push(`# TYPE ${base} histogram`);
      for (const b of buckets) {
        const leCount = sorted.filter(v => v <= b).length;
        lines.push(`${base}_bucket{le="${b}"${key.includes('{') ? ',' + key.split('{')[1].replace('}', '') : ''}} ${leCount}`);
      }
      lines.push(`${base}_bucket{le="+Inf"${key.includes('{') ? ',' + key.split('{')[1].replace('}', '') : ''}} ${count}`);
      lines.push(`${base}_sum ${sum}`);
      lines.push(`${base}_count ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const metrics = new Metrics();
