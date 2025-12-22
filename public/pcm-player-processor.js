/**
 * PCM Player AudioWorklet Processor
 *
 * Runs in the audio rendering thread for real-time, low-latency audio playback.
 * Receives PCM samples from the main thread via MessagePort and plays them continuously.
 *
 * Usage:
 *   - Send PCM data: port.postMessage({ type: 'pcm', samples: Float32Array })
 *   - Stop playback: port.postMessage({ type: 'stop' })
 */

class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // PCM sample queue (FIFO)
    this.pcmQueue = []

    // Statistics
    this.samplesReceived = 0
    this.samplesPlayed = 0

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      const { type, samples } = event.data

      if (type === 'pcm') {
        // Add PCM samples to queue
        if (samples && samples.length > 0) {
          // Use safer method for large arrays to avoid stack overflow
          // Instead of push(...samples), use a loop for better performance
          for (let i = 0; i < samples.length; i++) {
            this.pcmQueue.push(samples[i])
          }
          this.samplesReceived += samples.length

          // Send queue status back to main thread
          this.port.postMessage({
            type: 'status',
            queueLength: this.pcmQueue.length,
            samplesReceived: this.samplesReceived,
            samplesPlayed: this.samplesPlayed
          })
        }
      } else if (type === 'stop') {
        // Clear queue and reset statistics
        this.pcmQueue = []
        this.samplesReceived = 0
        this.samplesPlayed = 0

        this.port.postMessage({
          type: 'stopped'
        })
      }
    }
  }

  /**
   * Audio processing callback - called by the browser for each audio quantum (128 samples)
   *
   * @param {Float32Array[][]} inputs - Input audio buffers (not used)
   * @param {Float32Array[][]} outputs - Output audio buffers to fill
   * @param {Object} parameters - Audio parameters (not used)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const output = outputs[0]

    if (!output || output.length === 0) {
      return true
    }

    const channel = output[0]  // Mono output

    // Fill output buffer with samples from queue
    for (let i = 0; i < channel.length; i++) {
      if (this.pcmQueue.length > 0) {
        // Play next sample from queue
        channel[i] = this.pcmQueue.shift()
        this.samplesPlayed++
      } else {
        // Queue empty - output silence
        channel[i] = 0
      }
    }

    // Keep processor running
    return true
  }
}

// Register the processor
registerProcessor('pcm-player-processor', PCMPlayerProcessor)
