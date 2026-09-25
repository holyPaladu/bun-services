const DEFAULT_TIMEOUT_MS = 10_000
const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

type ShutdownSignal = (typeof shutdownSignals)[number]

type GracefulShutdownOptions = Readonly<{
  onShutdown: () => Promise<void>
  timeoutMs?: number
}>

export const registerGracefulShutdown = ({
  onShutdown,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: GracefulShutdownOptions): void => {
  let isShuttingDown = false

  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    if (isShuttingDown) {
      console.error(`Received ${signal} during shutdown. Forcing exit.`)
      process.exit(1)
    }

    isShuttingDown = true
    console.log(`Received ${signal}. Shutting down...`)

    const forceShutdownTimer = setTimeout(() => {
      console.error('Graceful shutdown timed out. Forcing exit.')
      process.exit(1)
    }, timeoutMs)

    try {
      await onShutdown()
      clearTimeout(forceShutdownTimer)
      console.log('Server stopped gracefully.')
    } catch (error: unknown) {
      clearTimeout(forceShutdownTimer)
      console.error('Failed to stop the server gracefully:', error)
      process.exit(1)
    }
  }

  for (const signal of shutdownSignals) {
    process.once(signal, () => {
      void shutdown(signal)
    })
  }
}
